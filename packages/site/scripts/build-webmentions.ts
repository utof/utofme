#!/usr/bin/env bun
/**
 * Build-time webmention fetcher. Runs ad-hoc (or in CI), NEVER during
 * `astro dev` / `astro build` — it issues N network calls per content URL
 * and would slow every build. Output JSON is committed; the renderer
 * (Webmentions.astro, T8) reads from disk only.
 *
 * Pagination: webmention.io exposes offset pagination via the `page=N`
 * query parameter (0-indexed). The legacy `before=<cursor>` form is NOT
 * used — see § Critical pins of the plan.
 *
 * Determinism: tab-indented JSON, trailing newline, sorted by `wm-id` asc.
 * Two consecutive runs against an unchanged remote return byte-identical
 * files (load-bearing for git hygiene + CI freshness diff).
 *
 * @see packages/specs/specs/06-indieweb.md § Webmentions
 * @see packages/specs/plans/06-indieweb.md § Task 7
 * @see https://github.com/aaronpk/webmention.io
 */
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import matter from "gray-matter";
import { Mention, type Mention as MentionType } from "../src/lib/webmentions-types.ts";

const JF2_ENDPOINT = "https://webmention.io/api/mentions.jf2";
const PER_PAGE = 100;
const MAX_RETRIES = 3;
const MAX_PAGES = 50; // 50 × 100 = 5000 mentions/url ceiling
const SITE = "https://utof.me/";

/**
 * Fetch one page of mentions for a single target URL. Returns the
 * validated children. Returns `[]` for both legitimate empty pages AND
 * skipped/exhausted pages — the outer loop's `prevLen >= PER_PAGE`
 * sentinel disambiguates by treating any short/empty page as the end of
 * pagination.
 *
 * Why: a transient 5xx or a 429 retry-budget exhaustion drops the page
 * silently rather than aborting the whole target. The trade-off is that a
 * 429 storm can hide later pages — acceptable because the script is
 * idempotent: the next CI run picks up missing mentions.
 *
 * @see packages/specs/plans/06-indieweb.md § Task 7 (failure modes)
 */
async function fetchPage(target: string, page: number): Promise<MentionType[]> {
	const url = `${JF2_ENDPOINT}?target=${encodeURIComponent(target)}&page=${page}&per-page=${PER_PAGE}`;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const r = await fetch(url);
		if (r.status === 429) {
			await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
			continue;
		}
		if (!r.ok) {
			console.warn(`[webmentions] ${target} page=${page} HTTP ${r.status} — skipping page`);
			return [];
		}
		const body = (await r.json()) as { children?: unknown[] };
		const out: MentionType[] = [];
		for (const child of body.children ?? []) {
			const parsed = Mention.safeParse(child);
			if (parsed.success) out.push(parsed.data);
			else console.warn("[webmentions] schema reject:", parsed.error.issues[0]?.path);
		}
		return out;
	}
	console.warn(`[webmentions] ${target} page=${page} 429 retry budget exhausted — skipping page`);
	return [];
}

/**
 * Derive the on-disk slug from a canonical content URL. Mirrors the
 * routing scheme in `src/pages/{works,garden}/[slug].astro`.
 *
 * Why: webmention.io stores the target URL verbatim (`wm-target`); we
 * rebucket per-slug so the renderer can `import default` a deterministic
 * filename without parsing URLs at request time.
 */
function slugFromUrl(url: string): string {
	const m = url.match(/\/(works|garden)\/([^/]+)\/?$/);
	return m?.[2] ?? url;
}

/**
 * Pure orchestrator: fetch every target, validate, sort, return a slug-
 * keyed map. Side-effect-free (no disk I/O); `main()` wraps it for the
 * write step. This split keeps the unit tests trivially mockable — they
 * just stub `globalThis.fetch` and assert on the returned record.
 *
 * @see packages/specs/plans/06-indieweb.md § Task 7
 */
export async function buildWebmentions(targets: string[]): Promise<Record<string, MentionType[]>> {
	const result: Record<string, MentionType[]> = {};
	for (const target of targets) {
		const all: MentionType[] = [];
		// Why: bound the page loop to MAX_PAGES so an always-full-page upstream
		// bug can't loop forever; a short or empty page (`prevLen < PER_PAGE`)
		// terminates pagination naturally.
		let prevLen = PER_PAGE;
		for (let page = 0; page < MAX_PAGES && prevLen >= PER_PAGE; page++) {
			const items = await fetchPage(target, page);
			all.push(...items);
			prevLen = items.length;
		}
		if (all.length > 0) {
			all.sort((a, b) => a["wm-id"] - b["wm-id"]);
			result[slugFromUrl(target)] = all;
		}
	}
	return result;
}

/**
 * Enumerate every published work + every note as canonical site URLs.
 * Why: we read the filesystem directly (mirroring `build-garden-data.ts`)
 * rather than calling Astro's `getCollection()` — `getCollection` requires
 * the Astro runtime context, which is not available in a stand-alone
 * `bun run` script. Frontmatter `draft: true` is filtered for `works`
 * (notes have no `draft` field per the notesSchema).
 * @see packages/site/scripts/build-garden-data.ts (same enumeration pattern)
 * @see packages/site/src/content.config.ts § worksSchema, notesSchema
 */
async function enumerateTargets(): Promise<string[]> {
	const targets: string[] = [];
	const worksDir = join(process.cwd(), "src", "content", "works");
	for (const f of await readdir(worksDir)) {
		const ext = extname(f);
		if (ext !== ".md" && ext !== ".mdx") continue;
		const raw = await Bun.file(join(worksDir, f)).text();
		const fm = matter(raw).data as { draft?: boolean };
		if (fm.draft === true) continue;
		targets.push(`${SITE}works/${basename(f, ext)}/`);
	}
	const notesDir = join(process.cwd(), "src", "content", "notes");
	for (const f of await readdir(notesDir)) {
		const ext = extname(f);
		if (ext !== ".md" && ext !== ".mdx") continue;
		targets.push(`${SITE}garden/${basename(f, ext)}/`);
	}
	return targets;
}

/**
 * I/O wrapper. Walks content collections, calls `buildWebmentions`,
 * writes per-slug JSON files, and deletes orphaned files for slugs that
 * no longer exist in the result set. Preserves `.gitkeep`.
 */
async function main(): Promise<void> {
	const outDir = join(process.cwd(), "src", "data", "webmentions");
	await mkdir(outDir, { recursive: true });
	const targets = await enumerateTargets();
	const result = await buildWebmentions(targets);
	const wantedSlugs = new Set(Object.keys(result));
	for (const [slug, mentions] of Object.entries(result)) {
		const json = `${JSON.stringify(mentions, null, "\t")}\n`;
		await writeFile(join(outDir, `${slug}.json`), json, "utf8");
	}
	for (const f of await readdir(outDir)) {
		if (f === ".gitkeep") continue;
		if (extname(f) !== ".json") continue;
		const slug = basename(f, ".json");
		if (!wantedSlugs.has(slug)) await unlink(join(outDir, f));
	}
	console.log(`[webmentions] ${targets.length} targets → ${wantedSlugs.size} slugs with mentions`);
}

if (import.meta.main) await main();
