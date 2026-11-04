/**
 * Pure logic for `check:budgets`: JS import-graph walking, route HTML analysis,
 * budget rules R1 / R3 / R4 / R5 / R6 and markdown rendering.
 *
 * Why: the old `size-limit` entries summed globs (`dist/_astro/*.css`,
 * `dist/_astro/*.js`), i.e. files no single route loads (ADR 0047). This module
 * measures what each route actually fetches. It does no filesystem access —
 * sources and sizes are injected — so it is fully unit-testable with fixtures.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2
 * @see packages/specs/adrs/0047-per-route-budgets.md
 */
import { gzipSync } from "node:zlib";
import { parseHTML } from "linkedom";

/**
 * Error findings fail the run; warnings are printed only.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Rules)
 */
export type Severity = "error" | "warn";

/**
 * One budget violation or notice.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Rules)
 */
export interface Finding {
	readonly rule: string;
	readonly severity: Severity;
	readonly route: string;
	readonly message: string;
}

/**
 * Limits for one route class, in bytes (gzip-9 for JS/HTML/CSS, raw for media).
 *
 * @see packages/specs/specs/09-project-view.md § "Budgets for this phase"
 */
export interface RouteClassLimits {
	readonly firstViewJs: number;
	/** Why: `/lab/*` is experimental — its budgets warn instead of failing. */
	readonly warnOnly?: boolean;
	readonly html?: number;
	readonly css?: number;
	/** CSS limit when the page contains Expressive Code blocks. */
	readonly cssEc?: number;
	/** CSS limit when the page contains KaTeX output. */
	readonly cssMath?: number;
	/** R4: total bytes of eager loop posters in the first cards. */
	readonly eagerPosterTotal?: number;
	/** R4: the `fetchpriority=high` (LCP) poster. */
	readonly lcpPoster?: number;
	/** Srcset candidate width used to size posters (nearest wins). */
	readonly posterTargetWidth?: number;
	/** R2: ceiling for the route's whole lazy JS closure. */
	readonly lazyJs?: number;
	/** R10: exclusive lazy JS per island, keyed by the island's `opts.name`; a missing name is an error. */
	readonly islandJs?: Readonly<Record<string, number>>;
}

/**
 * Maps a route path to a class name; the first matching rule wins.
 *
 * @see packages/specs/specs/09-project-view.md § "Budgets for this phase"
 */
export interface RouteRule {
	readonly match: string | RegExp;
	readonly class: string;
}

/**
 * The full typed budgets table consumed by the core.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export interface BudgetsConfig {
	/** Limit for chunks shared by the first view of every route. */
	readonly platformFirstViewJs: number;
	readonly classes: Readonly<Record<string, RouteClassLimits>>;
	readonly routes: readonly RouteRule[];
	/** Routes measured and reported but never failing, each with a reason. */
	readonly excluded: readonly { readonly route: string; readonly reason: string }[];
	/** Chunks allowed to be unreachable from any route (self-check), with a reason. */
	readonly unreferencedChunks: readonly { readonly pattern: RegExp; readonly reason: string }[];
	/** Loop file limits (R6). */
	readonly loops: {
		readonly cardMax: number;
		readonly cardWarn: number;
		readonly bannerMax: number;
		readonly bannerWarn: number;
	};
	/** R4: how many leading DOM cards form the eager candidate set. */
	readonly eagerCardCount: number;
}

/** gzip level 9, matching `@size-limit/file` (P9-2 Measurement). @see packages/specs/specs/09-project-view.md § P9-2 */
export function gzip9(data: string | Uint8Array): number {
	return gzipSync(data, { level: 9 }).length;
}

// ─────────────────────────────── JS import graph ───────────────────────────────

const SPEC = String.raw`(["'])([^"'\n]+?\.m?js)(?:\?[^"'\n]*)?\1`;
// `import "x.js"`, `import a, {b as c} from "x.js"`, `import * as n from 'x.js'` (no `(` so `import(` is excluded)
const STATIC_IMPORT = new RegExp(String.raw`\bimport\b\s*(?:[^"'\`;()]*?\bfrom\s*)?${SPEC}`, "g");
// `export {a} from "x.js"`, `export * from "x.js"`, `export * as ns from "x.js"`
const EXPORT_FROM = new RegExp(
	String.raw`\bexport\b\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*${SPEC}`,
	"g",
);
// `import("x.js")`, `import('x.js', {with: …})`
const DYNAMIC_IMPORT = new RegExp(String.raw`\bimport\s*\(\s*${SPEC}`, "g");
// Vite preload lists: `m.f||(m.f=[…])` (Rollup + Rolldown builds of Vite 6–8)
// and the older `__vite__mapDeps.viteFileDeps=[…]` spelling.
const MAP_DEPS = /(?:\bm\.f|\bviteFileDeps)\s*=\s*\[([^\]]*)\]/g;
const QUOTED_JS = /(["'])([^"'\n]+?\.m?js)\1/g;

/**
 * Import specifiers found in one JS source, split by edge kind.
 *
 * Why: static edges are loaded with the importer (first view); dynamic and
 * preload-list edges are loaded on demand (lazy).
 * @see packages/specs/specs/09-project-view.md § P9-2 (Measurement)
 */
export interface JsImports {
	readonly static: readonly string[];
	readonly dynamic: readonly string[];
}

/**
 * Extract import specifiers (Rollup- and Rolldown-style) from a JS chunk.
 *
 * Why: regexes, not a parser, because they matched size-limit's totals to
 * rounding on Astro 6 output (research Q4) and must tolerate Vite 8 / Rolldown
 * output (spaces, single quotes, `export * from`, relative preload lists).
 * @see https://github.com/vitejs/vite/blob/main/packages/vite/src/node/plugins/importAnalysisBuild.ts
 */
export function extractJsImports(src: string): JsImports {
	const stat = new Set<string>();
	const dyn = new Set<string>();
	for (const m of src.matchAll(STATIC_IMPORT)) if (m[2]) stat.add(m[2]);
	for (const m of src.matchAll(EXPORT_FROM)) if (m[2]) stat.add(m[2]);
	for (const m of src.matchAll(DYNAMIC_IMPORT)) if (m[2]) dyn.add(m[2]);
	for (const list of src.matchAll(MAP_DEPS)) {
		for (const m of (list[1] ?? "").matchAll(QUOTED_JS)) if (m[2]) dyn.add(m[2]);
	}
	return { static: [...stat], dynamic: [...dyn] };
}

/**
 * Resolve an import specifier to a dist-relative POSIX path, or `null` for
 * externals (URLs, bare specifiers).
 *
 * Why: Rollup writes `./x.js` relative to the importer; Vite preload lists are
 * `outDir`-relative (`_astro/x.js`) unless the base is relative; a leading `/`
 * is root-relative. All three must land on the same key.
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export function resolveSpecifier(importer: string, spec: string): string | null {
	if (/^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith("//")) return null;
	const clean = spec.replace(/[?#].*$/, "");
	const parts: string[] = [];
	const base =
		clean.startsWith("./") || clean.startsWith("../") ? importer.split("/").slice(0, -1) : [];
	for (const seg of [...base, ...clean.split("/")]) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return parts.join("/");
}

/**
 * Directed chunk graph. Keys are dist-relative paths such as `_astro/a.js`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export interface ChunkGraph {
	readonly static: ReadonlyMap<string, readonly string[]>;
	readonly dynamic: ReadonlyMap<string, readonly string[]>;
	readonly gz: ReadonlyMap<string, number>;
	/** `importer -> specifier` pairs whose target is not a known chunk. */
	readonly unresolved: readonly { readonly importer: string; readonly spec: string }[];
	/** `chunk -> dist paths of the _astro/*.json files it names` (the lazy-data column). */
	readonly json: ReadonlyMap<string, readonly string[]>;
}

const JSON_REF = /["'`]([^"'`\n\\]*?[\w.-]+\.json)["'`]/g;

/**
 * `_astro/*.json` files a chunk names, as dist-relative paths.
 *
 * Why: figure data ships as hashed JSON assets fetched at hydration; a bare
 * `"x.json"` is relative to the chunk (`new URL(…, import.meta.url)`).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-16 (Lazy data)
 */
function jsonRefs(importer: string, src: string): string[] {
	const out = new Set<string>();
	for (const m of src.matchAll(JSON_REF)) {
		const spec = m[1] ?? "";
		const rel = spec.startsWith("/") || spec.startsWith(".") ? spec : `./${spec}`;
		const target = resolveSpecifier(importer, rel);
		if (target?.startsWith("_astro/")) out.add(target);
	}
	return [...out];
}

/**
 * Build the chunk graph from `path -> source` for every emitted chunk.
 *
 * Why: unresolved edges are collected rather than skipped so the self-check
 * can fail loudly when a build-tool upgrade changes the import shapes.
 * @see packages/specs/specs/09-project-view.md § P9-2 (Self-check)
 */
export function buildChunkGraph(sources: ReadonlyMap<string, string>): ChunkGraph {
	const stat = new Map<string, string[]>();
	const dyn = new Map<string, string[]>();
	const gz = new Map<string, number>();
	const json = new Map<string, string[]>();
	const unresolved: { importer: string; spec: string }[] = [];
	const edges = (importer: string, specs: readonly string[]): string[] => {
		const out: string[] = [];
		for (const spec of specs) {
			const target = resolveSpecifier(importer, spec);
			if (target === null) continue;
			if (sources.has(target)) out.push(target);
			else unresolved.push({ importer, spec });
		}
		return out;
	};
	for (const [path, src] of sources) {
		const imports = extractJsImports(src);
		stat.set(path, edges(path, imports.static));
		dyn.set(path, edges(path, imports.dynamic));
		gz.set(path, gzip9(src));
		json.set(path, jsonRefs(path, src));
	}
	return { static: stat, dynamic: dyn, gz, unresolved, json };
}

/**
 * Transitive closure of `roots`, optionally following dynamic edges.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Buckets)
 */
export function closure(
	graph: ChunkGraph,
	roots: readonly string[],
	followDynamic: boolean,
): Set<string> {
	const seen = new Set<string>();
	const stack = [...roots].filter((r) => graph.gz.has(r));
	while (stack.length > 0) {
		const cur = stack.pop();
		if (cur === undefined || seen.has(cur)) continue;
		seen.add(cur);
		stack.push(...(graph.static.get(cur) ?? []));
		if (followDynamic) stack.push(...(graph.dynamic.get(cur) ?? []));
	}
	return seen;
}

// ───────────────────────────────── HTML analysis ─────────────────────────────────

/** One `<img>` poster with its srcset candidates. @see packages/specs/specs/09-project-view.md § P9-6 */
export interface PosterInfo {
	readonly loading: string | null;
	readonly fetchpriority: string | null;
	/** `[distPath, widthDescriptor|null]`; the `<picture>` first `<source>` wins over `<img srcset>`. */
	readonly candidates: readonly (readonly [string, number | null])[];
}

/** A `video[data-loop]` and its sources. @see packages/specs/specs/09-project-view.md § P9-6 */
export interface LoopVideoInfo {
	readonly attrs: ReadonlySet<string>;
	readonly values: Readonly<Record<string, string>>;
	readonly sources: readonly { readonly src: string; readonly type: string }[];
}

/**
 * One `<astro-island>` on a page.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-16
 */
export interface IslandInfo {
	/** `opts.name` Astro writes on every island. */
	readonly name: string;
	readonly client: string;
	readonly componentUrl: string | null;
	readonly rendererUrl: string | null;
	/** UTF-8 length of the decoded `props` attribute. */
	readonly propsBytes: number;
}

/**
 * What the budget rules need to know about one page.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export interface RouteDoc {
	/** Chunks fetched on load (script src, modulepreload, inline module static imports, load|only|idle islands). */
	readonly firstRoots: readonly string[];
	/** Chunks fetched later (visible|media islands, inline module dynamic imports). */
	readonly lazyRoots: readonly string[];
	readonly stylesheets: readonly string[];
	readonly hasEc: boolean;
	readonly hasMath: boolean;
	readonly fetchpriorityHigh: number;
	/** First `eagerCardCount` DOM cards: their `.loop-media` poster, or `null`. */
	readonly cardPosters: readonly (PosterInfo | null)[];
	/** The element carrying `fetchpriority=high`, when it is an `<img>`. */
	readonly highPoster: PosterInfo | null;
	/** `.loop-media[data-loop-frame=banner]` present. */
	readonly hasBanner: boolean;
	readonly videos: readonly LoopVideoInfo[];
	/** Every island on the page, in document order. */
	readonly islands: readonly IslandInfo[];
}

/** Convert a URL attribute to a dist-relative path, or `null` when external. */
function urlToDist(url: string | null): string | null {
	if (url === null) return null;
	const trimmed = url.trim();
	if (trimmed === "" || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//"))
		return null;
	return resolveSpecifier("index.html", trimmed);
}

function parseSrcset(srcset: string | null): readonly (readonly [string, number | null])[] {
	if (srcset === null) return [];
	const out: (readonly [string, number | null])[] = [];
	for (const part of srcset.split(/,\s+/)) {
		const [url, desc] = part.trim().split(/\s+/);
		const path = urlToDist(url ?? null);
		if (path === null) continue;
		const w = desc?.endsWith("w") ? Number.parseInt(desc, 10) : null;
		out.push([path, w !== null && Number.isFinite(w) ? w : null]);
	}
	return out;
}

interface ImgLike {
	getAttribute(name: string): string | null;
	closest(selector: string): { querySelector(s: string): ImgLike | null } | null;
}

function posterOf(img: ImgLike): PosterInfo {
	const picture = img.closest("picture");
	const source = picture?.querySelector("source[srcset]") ?? null;
	let candidates = parseSrcset(source?.getAttribute("srcset") ?? null);
	if (candidates.length === 0) candidates = parseSrcset(img.getAttribute("srcset"));
	if (candidates.length === 0) {
		const src = urlToDist(img.getAttribute("src"));
		if (src !== null) candidates = [[src, null]];
	}
	return {
		loading: img.getAttribute("loading"),
		fetchpriority: img.getAttribute("fetchpriority"),
		candidates,
	};
}

/** `opts.name` from an island's JSON `opts` attribute; `""` when absent or malformed. */
function islandName(opts: string | null): string {
	if (opts === null) return "";
	try {
		const v: unknown = JSON.parse(opts);
		const name = typeof v === "object" && v !== null ? (v as { name?: unknown }).name : undefined;
		return typeof name === "string" ? name : "";
	} catch {
		return "";
	}
}

/**
 * Parse one page into a {@link RouteDoc}.
 *
 * Why: `linkedom` (already a dependency, `src/lib/feed.ts`) because island
 * `props` attributes contain `>` and break regex scraping.
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export function analyzeHtml(html: string, eagerCardCount: number): RouteDoc {
	const { document } = parseHTML(html);
	const first = new Set<string>();
	const lazy = new Set<string>();
	const add = (set: Set<string>, url: string | null): void => {
		const p = urlToDist(url);
		if (p !== null) set.add(p);
	};

	for (const s of document.querySelectorAll("script[type=module]")) {
		const src = s.getAttribute("src");
		if (src !== null) {
			add(first, src);
			continue;
		}
		// Inline module: resolve specifiers relative to the site root.
		const imports = extractJsImports(s.textContent ?? "");
		for (const spec of imports.static) add(first, spec);
		for (const spec of imports.dynamic) add(lazy, spec);
	}
	for (const l of document.querySelectorAll("link[rel~=modulepreload]"))
		add(first, l.getAttribute("href"));
	const islands: IslandInfo[] = [];
	for (const isl of document.querySelectorAll("astro-island")) {
		const client = isl.getAttribute("client") ?? "";
		islands.push({
			name: islandName(isl.getAttribute("opts")),
			client,
			componentUrl: urlToDist(isl.getAttribute("component-url")),
			rendererUrl: urlToDist(isl.getAttribute("renderer-url")),
			propsBytes: Buffer.byteLength(isl.getAttribute("props") ?? "", "utf8"),
		});
		const bucket = client === "load" || client === "only" || client === "idle" ? first : lazy;
		for (const attr of ["component-url", "renderer-url", "before-hydration-url"])
			add(bucket, isl.getAttribute(attr));
	}

	const stylesheets: string[] = [];
	for (const l of document.querySelectorAll("link[rel~=stylesheet]")) {
		const p = urlToDist(l.getAttribute("href"));
		if (p !== null) stylesheets.push(p);
	}

	const cardPosters = [...document.querySelectorAll(".card")]
		.slice(0, eagerCardCount)
		.map((card) => {
			const img = card.querySelector(".loop-media img");
			return img ? posterOf(img) : null;
		});
	const high = document.querySelectorAll("[fetchpriority=high]");
	const highEl = high.length === 1 ? high[0] : undefined;

	const videos: LoopVideoInfo[] = [];
	const videoEls = [...document.querySelectorAll("video[data-loop]")];
	for (const t of document.querySelectorAll("template")) {
		videoEls.push(...t.content.querySelectorAll("video[data-loop]"));
	}
	for (const v of videoEls) {
		const attrs = new Set<string>();
		const values: Record<string, string> = {};
		for (const a of v.attributes) {
			attrs.add(a.name);
			values[a.name] = a.value;
		}
		const sources = [...v.querySelectorAll("source")].map((s) => ({
			src: s.getAttribute("src") ?? "",
			type: s.getAttribute("type") ?? "",
		}));
		videos.push({ attrs, values, sources });
	}

	return {
		firstRoots: [...first],
		lazyRoots: [...lazy],
		stylesheets,
		hasEc: document.querySelector(".expressive-code") !== null,
		hasMath: document.querySelector(".katex") !== null,
		fetchpriorityHigh: high.length,
		cardPosters,
		highPoster: highEl?.tagName === "IMG" ? posterOf(highEl) : null,
		// Why: no-loop projects render a still cover inside the same `.banner[data-vt-frame]` frame (no `.loop-media`).
		hasBanner:
			document.querySelector('.loop-media[data-loop-frame="banner"], .banner[data-vt-frame]') !==
			null,
		videos,
		islands,
	};
}

// ─────────────────────────────── per-route measurement ───────────────────────────────

/**
 * Sizes of files in dist, injected so the core stays pure.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Measurement)
 */
export interface Assets {
	/** gzip-9 size of a dist-relative file, or `null` if it does not exist. */
	gzip(distPath: string): number | null;
	/** Raw byte size of a dist-relative file, or `null` if it does not exist. */
	raw(distPath: string): number | null;
}

/** First-view / lazy JS split for one route. @see packages/specs/specs/09-project-view.md § P9-2 (Buckets) */
export interface JsBuckets {
	readonly first: ReadonlySet<string>;
	readonly lazy: ReadonlySet<string>;
}

/**
 * Bucket a page's JS: first = static closure of first-view roots; lazy = full
 * closure of lazy roots plus dynamic edges of the first set, minus first.
 *
 * Why: each bucket is the closure minus earlier buckets, so a chunk shared by
 * both counts once (P9-2 Buckets).
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export function bucketJs(graph: ChunkGraph, doc: RouteDoc): JsBuckets {
	const first = closure(graph, doc.firstRoots, false);
	const lazyRoots = [...doc.lazyRoots];
	for (const c of first) lazyRoots.push(...(graph.dynamic.get(c) ?? []));
	const lazyAll = closure(graph, lazyRoots, true);
	const lazy = new Set([...lazyAll].filter((c) => !first.has(c)));
	return { first, lazy };
}

/** Sum of chunk gzip sizes. @see packages/specs/specs/09-project-view.md § P9-2 */
export function sumGz(graph: ChunkGraph, chunks: ReadonlySet<string>): number {
	let total = 0;
	for (const c of chunks) total += graph.gz.get(c) ?? 0;
	return total;
}

/**
 * Chunks present in every route's first-view set.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Platform)
 */
export function platformChunks(firstSets: readonly ReadonlySet<string>[]): Set<string> {
	const [head, ...rest] = firstSets;
	if (head === undefined) return new Set();
	return new Set([...head].filter((c) => rest.every((s) => s.has(c))));
}

/** Everything the CLI prints for one route. @see packages/specs/specs/09-project-view.md § P9-2 (Output) */
export interface RouteReport {
	readonly route: string;
	readonly className: string;
	readonly excludedReason: string | null;
	readonly firstJs: number;
	readonly lazyJs: number;
	readonly html: number;
	readonly css: number;
	readonly buckets: JsBuckets;
	/** R10 measurements, one per island. */
	readonly islands: readonly IslandReport[];
	/** Report-only: JSON assets the route's chunks name (raw / gzip bytes). */
	readonly lazyData: { readonly raw: number; readonly gz: number };
	readonly findings: readonly Finding[];
}

/** One island's exclusive lazy JS against its R10 limit. @see packages/specs/specs/10-tactical-arena-article.md § P10-16 */
export interface IslandReport {
	readonly name: string;
	readonly client: string;
	/** Closure of the component, minus first view, minus every other island's closure (gzip bytes). */
	readonly exclusiveJs: number;
	/** Full closure of the component (gzip bytes), the R9 measure. */
	readonly closureJs: number;
	readonly limit: number | null;
}

/** Input for one page. @see packages/specs/specs/09-project-view.md § P9-2 */
export interface RouteInput {
	readonly route: string;
	readonly html: string;
}

const KB = 1024;
const kbStr = (n: number): string => `${(n / KB).toFixed(1)} KB`;

/** Pick the srcset candidate nearest `target` width (or the only/first one). */
function candidateBytes(
	poster: PosterInfo,
	target: number,
	assets: Assets,
): { path: string; bytes: number | null } | null {
	let best: readonly [string, number | null] | undefined;
	for (const cand of poster.candidates) {
		if (best === undefined) best = cand;
		else if (
			cand[1] !== null &&
			(best[1] === null || Math.abs(cand[1] - target) < Math.abs(best[1] - target))
		)
			best = cand;
	}
	return best === undefined ? null : { path: best[0], bytes: assets.raw(best[0]) };
}

/**
 * Classify a route against the config rules; `null` if unclassified.
 *
 * @see packages/specs/specs/09-project-view.md § "Budgets for this phase"
 */
export function classifyRoute(route: string, config: BudgetsConfig): string | null {
	for (const r of config.routes) {
		if (typeof r.match === "string" ? r.match === route : r.match.test(route)) return r.class;
	}
	return null;
}

function limitFinding(
	out: Finding[],
	rule: string,
	route: string,
	label: string,
	value: number,
	limit: number,
	warnOnly: boolean,
): void {
	if (value > limit)
		out.push({
			rule,
			severity: warnOnly ? "warn" : "error",
			route,
			message: `${label} ${kbStr(value)} > ${kbStr(limit)}`,
		});
	else if (value > limit * 0.85)
		out.push({
			rule,
			severity: "warn",
			route,
			message: `${label} ${kbStr(value)} is within 15% of ${kbStr(limit)}`,
		});
}

/** R4 — eager poster / fetchpriority rules. @see packages/specs/specs/09-project-view.md § P9-2 R4 */
function checkR4(
	route: string,
	doc: RouteDoc,
	limits: RouteClassLimits,
	assets: Assets,
	isHome: boolean,
	out: Finding[],
): void {
	const err = (message: string): void =>
		void out.push({ rule: "R4", severity: "error", route, message });
	if (doc.fetchpriorityHigh > 1)
		err(`${doc.fetchpriorityHigh} elements have fetchpriority=high (max 1)`);
	const hasLoopPoster = doc.cardPosters.some((p) => p !== null);
	const target = limits.posterTargetWidth ?? 640;
	if (isHome && hasLoopPoster) {
		// Why: the masonry is CSS multi-column (column-major), so the top of each
		// column is among the first N DOM cards, not just card 1 (spec review finding 5).
		let eagerBytes = 0;
		doc.cardPosters.forEach((p, i) => {
			if (p === null) return;
			if (p.loading === "lazy") {
				err(
					`card ${i + 1} poster has loading=lazy (first ${doc.cardPosters.length} cards must be eager)`,
				);
				return;
			}
			const c = candidateBytes(p, target, assets);
			if (c?.bytes) eagerBytes += c.bytes;
		});
		if (limits.eagerPosterTotal !== undefined && eagerBytes > limits.eagerPosterTotal)
			err(`eager posters ${kbStr(eagerBytes)} > ${kbStr(limits.eagerPosterTotal)}`);
		if (doc.fetchpriorityHigh !== 1)
			err(`expected exactly 1 fetchpriority=high on the home page, found ${doc.fetchpriorityHigh}`);
	} else if (doc.hasBanner) {
		if (doc.fetchpriorityHigh !== 1)
			err(
				`expected exactly 1 fetchpriority=high on a page with a banner, found ${doc.fetchpriorityHigh}`,
			);
	} else if (!isHome && doc.fetchpriorityHigh > 0) {
		err(
			`${doc.fetchpriorityHigh} fetchpriority=high on a route that has no cover/banner (expected 0)`,
		);
	}
	if (doc.highPoster !== null && limits.lcpPoster !== undefined) {
		const c = candidateBytes(doc.highPoster, target, assets);
		if (c !== null && c.bytes === null) err(`LCP poster ${c.path} not found in dist`);
		else if (c?.bytes != null && c.bytes > limits.lcpPoster)
			err(`LCP poster ${c.path} ${kbStr(c.bytes)} > ${kbStr(limits.lcpPoster)}`);
	}
}

/** R5 — `video[data-loop]` markup contract. @see packages/specs/specs/09-project-view.md § P9-2 R5 */
function checkR5(route: string, doc: RouteDoc, out: Finding[]): void {
	doc.videos.forEach((v, i) => {
		const err = (message: string): void =>
			void out.push({
				rule: "R5",
				severity: "error",
				route,
				message: `video[data-loop] #${i + 1}: ${message}`,
			});
		for (const a of ["muted", "loop", "playsinline"]) if (!v.attrs.has(a)) err(`missing \`${a}\``);
		if (v.values.preload !== "none") err('`preload` must be "none"');
		for (const a of ["width", "height"]) if (!v.attrs.has(a)) err(`missing \`${a}\``);
		if (v.values["aria-hidden"] !== "true") err('`aria-hidden` must be "true"');
		if (v.attrs.has("autoplay")) err("must not have `autoplay` (playback is started from JS)");
		if (v.attrs.has("poster"))
			err("must not have a `poster` attribute (the poster is the underlay <img>)");
		if (v.sources.length < 2) err(`needs ≥ 2 <source>, found ${v.sources.length}`);
		else {
			if (!v.sources[0]?.type.includes('codecs="av01.'))
				err('first <source> type must contain codecs="av01."');
			if (!v.sources[1]?.type.includes('codecs="avc1.'))
				err('second <source> type must contain codecs="avc1."');
		}
	});
}

/** R6 — loop file sizes. @see packages/specs/specs/09-project-view.md § P9-2 R6 */
function checkR6(
	route: string,
	doc: RouteDoc,
	config: BudgetsConfig,
	assets: Assets,
	out: Finding[],
): void {
	for (const v of doc.videos) {
		const size = v.values["data-loop-size"];
		const banner = size === "banner";
		if (size !== "card" && size !== "gallery" && !banner) {
			out.push({
				rule: "R6",
				severity: "error",
				route,
				message: `video[data-loop] has data-loop-size=${JSON.stringify(size ?? null)} (expected card|banner|gallery)`,
			});
			continue;
		}
		const max = banner ? config.loops.bannerMax : config.loops.cardMax;
		const warn = banner ? config.loops.bannerWarn : config.loops.cardWarn;
		for (const s of v.sources) {
			const path = urlToDist(s.src);
			if (path === null) continue;
			const bytes = assets.raw(path);
			if (bytes === null)
				out.push({
					rule: "R6",
					severity: "error",
					route,
					message: `loop file ${path} not found in dist`,
				});
			else if (bytes > max)
				out.push({
					rule: "R6",
					severity: "error",
					route,
					message: `loop file ${path} (${size}) ${bytes} B > ${max} B`,
				});
			else if (bytes > warn)
				out.push({
					rule: "R6",
					severity: "warn",
					route,
					message: `loop file ${path} (${size}) ${bytes} B > warn ${warn} B`,
				});
		}
	}
}

const R9_LIMIT = 20 * KB;
const DATA_WARN = 120 * KB;

/** Measure each island (R9 closure, R10 exclusive closure). */
function measureIslands(
	graph: ChunkGraph,
	doc: RouteDoc,
	buckets: JsBuckets,
	limits: RouteClassLimits | undefined,
): IslandReport[] {
	const closures = doc.islands.map((i) =>
		i.componentUrl === null ? new Set<string>() : closure(graph, [i.componentUrl], true),
	);
	return doc.islands.map((isl, idx) => {
		const own = closures[idx] ?? new Set<string>();
		const others = new Set<string>();
		doc.islands.forEach((o, j) => {
			if (j !== idx && o.componentUrl !== isl.componentUrl)
				for (const c of closures[j] ?? []) others.add(c);
		});
		const exclusive = new Set([...own].filter((c) => !buckets.first.has(c) && !others.has(c)));
		return {
			name: isl.name,
			client: isl.client,
			exclusiveJs: sumGz(graph, exclusive),
			closureJs: sumGz(graph, own),
			limit: limits?.islandJs?.[isl.name] ?? null,
		};
	});
}

/** R2 / R9 / R10 on the per-island records. @see packages/specs/specs/10-tactical-arena-article.md § P10-16 */
function checkIslandRules(
	route: string,
	limits: RouteClassLimits,
	islands: readonly IslandReport[],
	lazyJs: number,
	out: Finding[],
): void {
	const w = limits.warnOnly === true;
	if (limits.lazyJs !== undefined)
		limitFinding(out, "R2", route, "lazy JS", lazyJs, limits.lazyJs, w);
	if (!route.startsWith("/lab/")) {
		for (const i of islands) {
			if ((i.client === "load" || i.client === "only") && i.closureJs > R9_LIMIT)
				out.push({
					rule: "R9",
					severity: w ? "warn" : "error",
					route,
					message: `eager island ${i.name || "(unnamed)"} (client:${i.client}) closure ${kbStr(i.closureJs)} > ${kbStr(R9_LIMIT)}`,
				});
		}
	}
	if (limits.islandJs === undefined) return;
	for (const i of islands) {
		if (i.limit === null)
			out.push({
				rule: "R10",
				severity: w ? "warn" : "error",
				route,
				message: `island ${JSON.stringify(i.name)} has no entry in islandJs`,
			});
		else
			limitFinding(out, "R10", route, `island ${i.name} exclusive JS`, i.exclusiveJs, i.limit, w);
	}
}

/**
 * Measure one route and apply R1 (first-view JS), R2 (lazy JS), R3 (HTML +
 * linked CSS), R4, R5, R6, R9 (eager islands) and R10 (per-island JS).
 *
 * Why: rules whose markup does not exist yet (no `.loop-media`, no
 * `video[data-loop]`) pass vacuously, so the gate can land before the loop
 * components (P9-6) do.
 * @see packages/specs/specs/09-project-view.md § P9-2
 */
export function analyzeRoute(
	input: RouteInput,
	graph: ChunkGraph,
	assets: Assets,
	config: BudgetsConfig,
): RouteReport {
	const doc = analyzeHtml(input.html, config.eagerCardCount);
	const buckets = bucketJs(graph, doc);
	const className = classifyRoute(input.route, config);
	const excludedReason = config.excluded.find((e) => e.route === input.route)?.reason ?? null;
	const html = gzip9(input.html);
	let css = 0;
	const findings: Finding[] = [];
	for (const s of doc.stylesheets) {
		const g = assets.gzip(s);
		if (g === null)
			findings.push({
				rule: "R3",
				severity: "error",
				route: input.route,
				message: `linked stylesheet ${s} not found in dist`,
			});
		else css += g;
	}
	const lazyData = { raw: 0, gz: 0 };
	const seenJson = new Set<string>();
	for (const c of [...buckets.first, ...buckets.lazy])
		for (const j of graph.json.get(c) ?? []) {
			if (seenJson.has(j)) continue;
			seenJson.add(j);
			lazyData.raw += assets.raw(j) ?? 0;
			lazyData.gz += assets.gzip(j) ?? 0;
		}
	const base: Omit<RouteReport, "findings"> = {
		route: input.route,
		className: className ?? "(unclassified)",
		excludedReason,
		firstJs: sumGz(graph, buckets.first),
		lazyJs: sumGz(graph, buckets.lazy),
		html,
		css,
		buckets,
		lazyData,
		islands: [],
	};
	const limits = className === null ? undefined : config.classes[className];
	const islands = measureIslands(graph, doc, buckets, limits);
	if (lazyData.gz > DATA_WARN)
		findings.push({
			rule: "DATA",
			severity: "warn",
			route: input.route,
			message: `lazy data ${kbStr(lazyData.gz)} gzip > ${kbStr(DATA_WARN)} (report-only)`,
		});
	if (limits === undefined) {
		findings.push({
			rule: "R1",
			severity: "error",
			route: input.route,
			message: `route matches no class in route-budgets.config.ts (class: ${className ?? "none"})`,
		});
	} else {
		const w = limits.warnOnly === true;
		limitFinding(findings, "R1", input.route, "first-view JS", base.firstJs, limits.firstViewJs, w);
		if (limits.html !== undefined)
			limitFinding(findings, "R3", input.route, "HTML", html, limits.html, w);
		const cssLimit = doc.hasEc
			? (limits.cssEc ?? limits.css)
			: doc.hasMath
				? (limits.cssMath ?? limits.css)
				: limits.css;
		if (cssLimit !== undefined)
			limitFinding(findings, "R3", input.route, "linked CSS", css, cssLimit, w);
		checkR4(input.route, doc, limits, assets, input.route === "/", findings);
		checkIslandRules(input.route, limits, islands, base.lazyJs, findings);
	}
	checkR5(input.route, doc, findings);
	checkR6(input.route, doc, config, assets, findings);
	// Why: excluded routes (explicit allow-list) are measured but never fail.
	const kept =
		excludedReason === null ? findings : findings.map((f): Finding => ({ ...f, severity: "warn" }));
	return { ...base, islands, findings: kept };
}

// ─────────────────────────────── site-wide checks ───────────────────────────────

/** Result of the chunk-placement self-check. @see packages/specs/specs/09-project-view.md § P9-2 (Self-check) */
export interface SelfCheck {
	readonly findings: readonly Finding[];
	readonly uniqueJs: number;
	readonly unreferenced: readonly string[];
}

/**
 * Self-check: every chunk is reachable from a route or explicitly allow-listed;
 * every import edge resolves.
 *
 * Why: a walker that silently drops a chunk it cannot place would under-count
 * budgets after a bundler upgrade; an error here forces a regex/config fix.
 * @see packages/specs/specs/09-project-view.md § P9-2 (Self-check)
 */
export function selfCheck(
	graph: ChunkGraph,
	reports: readonly RouteReport[],
	config: BudgetsConfig,
): SelfCheck {
	const reachable = new Set<string>();
	for (const r of reports) {
		for (const c of r.buckets.first) reachable.add(c);
		for (const c of r.buckets.lazy) reachable.add(c);
	}
	const findings: Finding[] = [];
	const unreferenced: string[] = [];
	for (const chunk of graph.gz.keys()) {
		if (reachable.has(chunk)) continue;
		const allowed = config.unreferencedChunks.find((u) => u.pattern.test(chunk));
		if (allowed) unreferenced.push(chunk);
		else
			findings.push({
				rule: "SELF",
				severity: "error",
				route: "(site)",
				message: `chunk ${chunk} is not reachable from any route and not allow-listed`,
			});
	}
	for (const u of graph.unresolved) {
		findings.push({
			rule: "SELF",
			severity: "error",
			route: "(site)",
			message: `${u.importer} imports ${u.spec}, which is not an emitted chunk`,
		});
	}
	return { findings, uniqueJs: sumGz(graph, reachable), unreferenced };
}

/**
 * Render the markdown report: one table per route plus the platform and
 * report-only totals.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (Output)
 */
export function renderMarkdown(
	reports: readonly RouteReport[],
	check: SelfCheck,
	platform: { chunks: number; gz: number; limit: number },
	extra: readonly Finding[],
): string {
	const lines: string[] = ["## Per-route budgets", ""];
	lines.push(
		`Platform (chunks in every route's first view): ${platform.chunks} chunks, ${kbStr(platform.gz)} (limit ${kbStr(platform.limit)})`,
		"",
	);
	lines.push(
		"| Route | Class | First-view JS | Lazy JS | Lazy data | HTML | CSS | Status |",
		"|---|---|---:|---:|---:|---:|---:|---|",
	);
	for (const r of reports) {
		const errs = r.findings.filter((f) => f.severity === "error").length;
		const warns = r.findings.length - errs;
		const status =
			r.excludedReason !== null
				? "excluded"
				: errs > 0
					? `FAIL (${errs})`
					: warns > 0
						? `warn (${warns})`
						: "ok";
		lines.push(
			`| \`${r.route}\` | ${r.className} | ${kbStr(r.firstJs)} | ${kbStr(r.lazyJs)} | ${kbStr(r.lazyData.gz)} | ${kbStr(r.html)} | ${kbStr(r.css)} | ${status} |`,
		);
	}
	const withLimits = reports.filter((r) => r.islands.some((i) => i.limit !== null));
	if (withLimits.length > 0) {
		lines.push("", "### Per-island JS (R10, exclusive gzip)", "");
		lines.push("| Route | Island | Client | Exclusive JS | Limit |", "|---|---|---|---:|---:|");
		for (const r of withLimits)
			for (const i of r.islands)
				lines.push(
					`| \`${r.route}\` | ${i.name || "(unnamed)"} | ${i.client} | ${kbStr(i.exclusiveJs)} | ${i.limit === null ? "—" : kbStr(i.limit)} |`,
				);
		const data = withLimits.map(
			(r) => `\`${r.route}\` ${kbStr(r.lazyData.raw)} raw / ${kbStr(r.lazyData.gz)} gzip`,
		);
		lines.push("", `Lazy data (report-only): ${data.join("; ")}`);
	}
	const all = [...reports.flatMap((r) => r.findings), ...check.findings, ...extra];
	if (all.length > 0) {
		lines.push("", "### Findings", "");
		for (const f of all)
			lines.push(`- **${f.severity.toUpperCase()}** ${f.rule} \`${f.route}\`: ${f.message}`);
	}
	const ex = reports.filter((r) => r.excludedReason !== null);
	if (ex.length > 0) {
		lines.push("", "### Excluded routes", "");
		for (const r of ex) lines.push(`- \`${r.route}\`: ${r.excludedReason}`);
	}
	lines.push(
		"",
		`Site-wide unique JS (report-only, D9): ${kbStr(check.uniqueJs)}; allow-listed unreferenced chunks: ${check.unreferenced.length}`,
		"",
	);
	return lines.join("\n");
}
