/**
 * CLI for `bun run check:budgets`: reads `dist/`, measures every route and
 * exits 1 on any error finding.
 *
 * Usage: `bun run scripts/route-budgets.ts [--dist <dir>]` (default `dist`).
 * Output: a markdown report on stdout, also appended to `$GITHUB_STEP_SUMMARY`.
 *
 * Why: replaces the site-wide `size-limit` globs that counted chunks no route
 * loads (ADR 0047).
 * @see packages/specs/specs/09-project-view.md § P9-2
 * @see packages/specs/adrs/0047-per-route-budgets.md
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { budgets } from "../route-budgets.config.ts";
import {
	type Assets,
	analyzeRoute,
	type BudgetsConfig,
	buildChunkGraph,
	type Finding,
	gzip9,
	platformChunks,
	type RouteReport,
	renderMarkdown,
	type SelfCheck,
	selfCheck,
	sumGz,
} from "./lib/route-budgets-core.ts";

/** Recursively list files under `dir` as POSIX paths relative to `dir`. */
function walk(root: string, dir: string = root): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(root, full));
		else out.push(relative(root, full).split(sep).join("/"));
	}
	return out;
}

/** Everything {@link measureDist} computes, before rendering. @see packages/specs/specs/09-project-view.md § P9-2 */
export interface Measurement {
	readonly reports: readonly RouteReport[];
	readonly check: SelfCheck;
	readonly platformChunks: ReadonlySet<string>;
	readonly platformGz: number;
	readonly extra: readonly Finding[];
}

/**
 * Measure a built `dist/` against `config`.
 *
 * Why: separated from rendering and `main()` so tests can assert on structured
 * reports for a fixture tree without spawning a process.
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export function measureDist(distDir: string, config: BudgetsConfig): Measurement {
	const files = walk(distDir);
	const sources = new Map<string, string>();
	for (const f of files) {
		if (f.startsWith("_astro/") && /\.m?js$/.test(f))
			sources.set(f, readFileSync(join(distDir, f), "utf8"));
	}
	const graph = buildChunkGraph(sources);
	const cache = new Map<string, { raw: number; gz: number | null }>();
	const stat = (p: string): { raw: number; gz: number | null } | null => {
		const hit = cache.get(p);
		if (hit) return hit;
		const full = join(distDir, p);
		try {
			if (!statSync(full).isFile()) return null;
			const raw = statSync(full).size;
			const entry = { raw, gz: /\.(?:css|js|html)$/.test(p) ? gzip9(readFileSync(full)) : null };
			cache.set(p, entry);
			return entry;
		} catch {
			return null;
		}
	};
	const assets: Assets = {
		raw: (p) => stat(p)?.raw ?? null,
		gzip: (p) => stat(p)?.gz ?? null,
	};
	const routes = files
		.filter((f) => /(?:^|\/)index\.html$/.test(f) && !f.startsWith("pagefind/"))
		.sort();
	const reports = routes.map((f) => {
		const route = f === "index.html" ? "/" : `/${f.slice(0, -"index.html".length)}`;
		return analyzeRoute(
			{ route, html: readFileSync(join(distDir, f), "utf8") },
			graph,
			assets,
			config,
		);
	});
	const check = selfCheck(graph, reports, config);
	const platform = platformChunks(reports.map((r) => r.buckets.first));
	const platformGz = sumGz(graph, platform);
	const extra: Finding[] = [];
	if (platformGz > config.platformFirstViewJs) {
		extra.push({
			rule: "R1",
			severity: "error",
			route: "(platform)",
			message: `platform JS ${(platformGz / 1024).toFixed(1)} KB > ${(config.platformFirstViewJs / 1024).toFixed(1)} KB`,
		});
	}
	return { reports, check, platformChunks: platform, platformGz, extra };
}

/**
 * Measure `distDir` and render the markdown report.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Output)
 */
export function runBudgets(
	distDir: string,
	config: BudgetsConfig,
): { markdown: string; failed: boolean } {
	const m = measureDist(distDir, config);
	const markdown = renderMarkdown(
		m.reports,
		m.check,
		{ chunks: m.platformChunks.size, gz: m.platformGz, limit: config.platformFirstViewJs },
		m.extra,
	);
	const failed = [...m.reports.flatMap((r) => r.findings), ...m.check.findings, ...m.extra].some(
		(f) => f.severity === "error",
	);
	return { markdown, failed };
}

function main(): void {
	const idx = process.argv.indexOf("--dist");
	const dist = idx !== -1 ? (process.argv[idx + 1] ?? "dist") : "dist";
	const { markdown, failed } = runBudgets(dist, budgets);
	console.log(markdown);
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) appendFileSync(summary, `${markdown}\n`);
	process.exit(failed ? 1 : 0);
}

if (import.meta.main) main();
