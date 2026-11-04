/**
 * Deploy guard: fails when any fixture work leaked into the built site.
 *
 * Scans every text file under `dist/` (HTML, XML feeds, sitemap, JS, pagefind
 * fragments) for a fixture slug as a path segment (`/works/<slug>/`) or a
 * `data-fixture` attribute. Fixture slugs come from `fixture: true` frontmatter
 * in `src/content/works/`.
 *
 * Why: P9-3 hides mock entries via `UTOFME_FIXTURES=false`; a filter bug or a
 * direct asset reference would otherwise ship them silently.
 *
 * Usage: `bun run scripts/check-no-fixtures.ts [--dist dist] [--content src/content/works]`
 * Exit 0 = clean, 1 = leak(s) printed to stderr.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3 (AC3.5)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/** Lab routes that must not exist in a deploy build (spec P10 "Lab pages"). */
const LAB_DIRS = ["lab/figures", "lab/article-layout"] as const;

/** Plain-text extensions scanned; pagefind `.pf_*` files are gzip and handled in {@link readScannable}. */
const TEXT_EXT = /\.(html|xml|txt|json|js|mjs|css|svg|webmanifest)$/;

/**
 * Reads `fixture: true` from MDX/MD frontmatter and returns the entry ids (file basenames).
 *
 * Why: plain-text frontmatter sniffing keeps the guard free of Astro/Zod imports.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export function fixtureSlugs(files: ReadonlyArray<{ name: string; text: string }>): string[] {
	return files
		.filter(({ text }) => {
			const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
			return /^fixture:\s*true\s*$/m.test(fm);
		})
		.map(({ name }) => name.replace(/\.(md|mdx)$/, ""));
}

/**
 * Returns one human-readable hit per fixture marker found in `text`.
 *
 * Why: pure so the unit test can seed leaks without touching the filesystem.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3 (AC3.5)
 */
export function findLeaks(text: string, slugs: readonly string[]): string[] {
	const hits: string[] = [];
	if (/\bdata-fixture\b/.test(text)) hits.push("[data-fixture]");
	for (const slug of slugs) {
		const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// Why: `works/<slug>` followed by a non-slug char, so `code-1` does not match `code-10`.
		if (new RegExp(`works/${esc}(?![A-Za-z0-9_-])`).test(text)) hits.push(`works/${slug}`);
	}
	return hits;
}

/** Why: pagefind index/fragment/meta files are gzip; decompress so their embedded URLs are scanned. */
function readScannable(file: string): string | undefined {
	if (/\.pf_(fragment|index|meta)$/.test(file)) {
		try {
			return gunzipSync(readFileSync(file)).toString("latin1");
		} catch {
			return readFileSync(file).toString("latin1");
		}
	}
	return TEXT_EXT.test(file) ? readFileSync(file, "utf8") : undefined;
}

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

function arg(flag: string, fallback: string): string {
	const i = process.argv.indexOf(flag);
	return (i >= 0 ? process.argv[i + 1] : undefined) || fallback;
}

/**
 * CLI entry: scans `dist/` and returns the process exit code.
 *
 * Why: exported (and import.meta.main-guarded) so tests can run it on a temp tree.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3 (AC3.5)
 * @see packages/specs/specs/10-tactical-arena-article.md § "Lab pages" (`check:no-fixtures`)
 */
export function run(distDir: string, contentDir: string): number {
	const slugs = fixtureSlugs(
		readdirSync(contentDir)
			.filter((n) => /\.(md|mdx)$/.test(n))
			.map((name) => ({ name, text: readFileSync(join(contentDir, name), "utf8") })),
	);
	const problems: string[] = [];
	// Why: the article lab pages exist only in fixture builds (P10-16); any file under these means a deploy-build leak.
	for (const lab of LAB_DIRS)
		if (existsSync(join(distDir, lab))) problems.push(`${lab}/ (lab page in deploy build)`);
	for (const file of walk(distDir)) {
		const rel = file.slice(distDir.length + 1);
		// Why: every fixture slug is also a path segment, so file/dir names leak too (e.g. dist/works/code-1/).
		for (const hit of findLeaks(`/${rel}`, slugs)) problems.push(`${rel} (path): ${hit}`);
		const text = readScannable(file);
		if (text !== undefined)
			for (const hit of findLeaks(text, slugs)) problems.push(`${rel}: ${hit}`);
	}
	if (problems.length > 0) {
		console.error(`check-no-fixtures: ${problems.length} fixture leak(s) in ${distDir}`);
		for (const p of problems) console.error(`  ${p}`);
		return 1;
	}
	console.log(`check-no-fixtures: clean (${slugs.length} fixture slugs, ${distDir})`);
	return 0;
}

if (import.meta.main) {
	process.exit(run(resolve(arg("--dist", "dist")), resolve(arg("--content", "src/content/works"))));
}
