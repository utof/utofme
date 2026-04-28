/**
 * Vault → repo sync. Reads OBSIDIAN_VAULT_PATH (or first CLI arg or
 * options.vaultPath); copies publish:true notes into dest with normalised
 * frontmatter; mirrors referenced images; deletes-not-visited.
 *
 * Why: astro-loader-obsidian@0.10.0 peer-deps astro@^5.12.5 — incompatible
 * with our Astro 6 lock (ADR 0025). Hand-rolled approach is path-c from
 * the general plan, promoted to primary. The script is local-only — never
 * runs in CI; user's `git diff` review before commit is the safety net for
 * the destructive deletes-not-visited pass.
 *
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 * @see packages/specs/adrs/0025-no-symlinks-vault.md
 */
import { copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import matter from "gray-matter";
import { noteSlug } from "../src/lib/wikilinks.ts";

/**
 * Inputs to {@link runSync}. CLI builds these from env / argv; tests pass
 * a tempdir as `dest` and the in-repo fixture vault as `vaultPath`.
 *
 * Why: keeping the function pure-of-globals lets the same code run
 * locally + in unit tests without environment patching.
 *
 * @see packages/site/tests/unit/sync-vault.test.ts
 */
export interface SyncOptions {
	/** Source vault path (defaults to env OBSIDIAN_VAULT_PATH at CLI). */
	vaultPath: string;
	/** Destination notes dir (production: src/content/notes; tests: tempdir). */
	dest: string;
	/** When true: log actions but write/delete nothing. */
	dryRun: boolean;
}

/**
 * Counters returned to the caller. In dry-run mode `wouldWrite` /
 * `wouldDelete` track the actions that would have happened; in live mode
 * `written` / `deleted` / `assetsCopied` track the actions that did.
 *
 * Why: tests assert on dry-run counters without parsing log output.
 *
 * @see packages/site/tests/unit/sync-vault.test.ts
 */
export interface SyncSummary {
	written: number;
	deleted: number;
	assetsCopied: number;
	wouldWrite: number;
	wouldDelete: number;
}

const SCHEMA_KEYS = ["title", "created", "updated", "tags", "math", "summary"] as const;
type SchemaKey = (typeof SCHEMA_KEYS)[number];
const EMBED_RE = /!\[\[([^\]]+\.(?:png|jpe?g|gif|webp|avif|svg))\]\]/gi;

/**
 * Recursively walk `dir`, yielding file paths. Skips Obsidian / VCS /
 * underscore-prefixed dirs (matches spec § Vault → repo sync line 165).
 *
 * Why: a generator keeps memory bounded for large vaults and lets the
 * caller short-circuit by `extname` filtering before reading files.
 *
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 */
async function* walk(dir: string): AsyncGenerator<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
		const p = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(p);
		else yield p;
	}
}

/**
 * Narrow gray-matter's `data: { [k: string]: any }` into a typed record by
 * round-tripping through JSON. Drops functions / undefined / Symbol values
 * (none of which occur in YAML frontmatter anyway).
 *
 * Why: type-coverage 100%-strict flags every property access on the raw
 * `any` map. Casting via `unknown` here gives us a single, audited cast
 * boundary instead of dozens of `any` taints across the function body.
 *
 * @see packages/site/tests/unit/sync-vault.test.ts
 */
function frontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	const parsed = matter(raw);
	const data = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
	return { data, content: parsed.content };
}

/**
 * Build a publishable mdx body: schema-known keys only, with title +
 * created defaulted. Uses gray-matter's stringify (YAML round-trip).
 *
 * Why: extracting this keeps {@link runSync} flat — no helper closure
 * bloat in the hot loop.
 *
 * @see packages/specs/specs/05-garden.md § Vault → repo sync (line 168)
 */
function makeOutput(
	data: Record<string, unknown>,
	content: string,
	fallbackTitle: string,
): { outName: string; body: string } {
	const titleVal = data["title"];
	const title = typeof titleVal === "string" && titleVal.length > 0 ? titleVal : fallbackTitle;
	const slug = noteSlug(title);
	const cleaned: Record<string, unknown> = {};
	for (const k of SCHEMA_KEYS) {
		const v: unknown = data[k satisfies SchemaKey];
		if (v !== undefined) cleaned[k] = v;
	}
	if (typeof cleaned["title"] !== "string") cleaned["title"] = title;
	if (cleaned["created"] === undefined) cleaned["created"] = new Date().toISOString().slice(0, 10);
	const body = matter.stringify(content, cleaned);
	return { outName: `${slug}.mdx`, body };
}

/**
 * Scan content for image-embed wikilinks (`![[image.png]]`) and return
 * the unique target filenames (alias suffix `|alt` stripped).
 *
 * Why: factored out so the regex-heavy parsing is independent of the
 * file-system code path; lets {@link runSync} call sequentially with
 * a typed string[] instead of a regex iterator.
 */
function extractEmbedNames(content: string): string[] {
	const names = new Set<string>();
	const matches = content.matchAll(EMBED_RE);
	for (const m of matches) {
		const inner: string = m[1] ?? "";
		const stripped: string = inner.split("|")[0] ?? "";
		const trimmed = stripped.trim();
		if (trimmed.length > 0) names.add(trimmed);
	}
	return [...names];
}

/**
 * Vault → repo sync entry point. Idempotent + dry-run-aware.
 *
 * Why: see file-level docblock. Returns a {@link SyncSummary} so unit
 * tests can assert on counters without log parsing.
 *
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 * @see packages/site/tests/unit/sync-vault.test.ts
 */
export async function runSync(opts: SyncOptions): Promise<SyncSummary> {
	const summary: SyncSummary = {
		written: 0,
		deleted: 0,
		assetsCopied: 0,
		wouldWrite: 0,
		wouldDelete: 0,
	};
	const visited = new Set<string>();
	const visitedAssets = new Set<string>();
	await mkdir(opts.dest, { recursive: true });
	const assetsDir = join(opts.dest, "_assets");
	await mkdir(assetsDir, { recursive: true });

	// Pass 1: copy / dry-log every publish:true note + mirror its embeds.
	for await (const filePath of walk(opts.vaultPath)) {
		const ext = extname(filePath);
		if (ext !== ".md" && ext !== ".mdx") continue;
		const raw = await readFile(filePath, "utf8");
		const { data, content } = frontmatter(raw);
		if (data["publish"] !== true) continue;

		const fallbackTitle = basename(filePath, ext);
		const { outName, body } = makeOutput(data, content, fallbackTitle);
		const outPath = join(opts.dest, outName);
		visited.add(outName);

		if (opts.dryRun) {
			summary.wouldWrite += 1;
			console.log(`[dry-run] WOULD WRITE ${outName}`);
		} else {
			await writeFile(outPath, body, "utf8");
			summary.written += 1;
		}

		for (const imgName of extractEmbedNames(content)) {
			const srcImg = join(opts.vaultPath, imgName);
			const dstImg = join(assetsDir, basename(imgName));
			if (visitedAssets.has(basename(imgName))) {
				// Collision detection: a later note may also embed this name.
				// The first copy wins (idempotent); subsequent embeds become no-ops.
				continue;
			}
			visitedAssets.add(basename(imgName));
			try {
				await stat(srcImg);
			} catch {
				console.warn(`[warn] embed asset not found in vault: ${imgName}`);
				continue;
			}
			if (opts.dryRun) {
				console.log(`[dry-run] WOULD COPY asset ${imgName}`);
			} else {
				await copyFile(srcImg, dstImg);
				summary.assetsCopied += 1;
			}
		}
	}

	// Pass 2: delete-not-visited in notes/ + _assets/.
	const destEntries = await readdir(opts.dest);
	for (const f of destEntries) {
		if (f === "_assets") continue;
		if (visited.has(f)) continue;
		if (opts.dryRun) {
			summary.wouldDelete += 1;
			console.log(`D ${f}`);
		} else {
			await unlink(join(opts.dest, f));
			summary.deleted += 1;
		}
	}
	const assetEntries = await readdir(assetsDir);
	for (const f of assetEntries) {
		if (visitedAssets.has(f)) continue;
		if (opts.dryRun) {
			summary.wouldDelete += 1;
			console.log(`D _assets/${f}`);
		} else {
			await unlink(join(assetsDir, f));
			summary.deleted += 1;
		}
	}

	if (opts.dryRun) {
		console.log(
			`[dry-run] would write ${summary.wouldWrite}, would delete ${summary.wouldDelete} (run without --dry-run to apply; review with git diff)`,
		);
	} else {
		console.log(
			`synced ${summary.written}, deleted ${summary.deleted}, assets ${summary.assetsCopied}`,
		);
	}
	return summary;
}

/**
 * CLI entry — invoked by `bun run sync:vault`.
 *
 * Why: split out so unit tests can import `runSync` without firing the
 * CLI side effect. The `import.meta.main` guard below restricts this to
 * direct invocation.
 *
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 */
async function main(): Promise<void> {
	const dryRun = process.argv.includes("--dry-run");
	const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
	const vaultPath = positional ?? process.env["OBSIDIAN_VAULT_PATH"];
	if (vaultPath === undefined || vaultPath === "") {
		console.error("set OBSIDIAN_VAULT_PATH or pass vault path as first arg");
		process.exit(1);
	}
	await runSync({
		vaultPath,
		dest: join(process.cwd(), "src", "content", "notes"),
		dryRun,
	});
}

if (import.meta.main) await main();
