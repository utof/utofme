/**
 * Unit tests for `check:budgets` (P9-2): import-graph walking for Rollup- and
 * Rolldown-style output, bucket classification, closure de-duplication, gzip
 * measurement, and one passing + one failing hand-written fixture per rule
 * (R1, R3, R4, R5, R6) plus the self-check.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2 (AC2.1, AC2.4)
 * @see packages/specs/adrs/0047-per-route-budgets.md
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { budgets } from "../../route-budgets.config.ts";
import {
	type Assets,
	analyzeRoute,
	type BudgetsConfig,
	buildChunkGraph,
	classifyRoute,
	extractJsImports,
	gzip9,
	platformChunks,
	renderMarkdown,
	resolveSpecifier,
	selfCheck,
} from "../../scripts/lib/route-budgets-core.ts";
import { measureDist, runBudgets } from "../../scripts/route-budgets.ts";

// Why: happy-dom makes import.meta.url non-file; vitest runs with cwd = packages/site.
const FIX = resolve(process.cwd(), "tests/fixtures/budgets");
const read = (p: string): string => readFileSync(join(FIX, p), "utf8");
const KB = 1024;

function assetsFrom(raw: Readonly<Record<string, number>>): Assets {
	return {
		raw: (p) => raw[p] ?? null,
		gzip: (p) => raw[p] ?? null,
	};
}

const emptyGraph = buildChunkGraph(new Map());

/** Analyze a `rules/*.html` fixture as `route` with injected media sizes. */
function rule(
	route: string,
	file: string,
	sizes: Record<string, number> = {},
	cfg: BudgetsConfig = budgets,
) {
	return analyzeRoute({ route, html: read(`rules/${file}`) }, emptyGraph, assetsFrom(sizes), cfg);
}
const errors = (r: ReturnType<typeof rule>, id: string): string[] =>
	r.findings.filter((f) => f.severity === "error" && f.rule === id).map((f) => f.message);
const warns = (r: ReturnType<typeof rule>, id: string): string[] =>
	r.findings.filter((f) => f.severity === "warn" && f.rule === id).map((f) => f.message);

describe("extractJsImports", () => {
	it("reads Rollup-style minified static, export-from and dynamic imports", () => {
		const i = extractJsImports(read("graph-rollup/dist/_astro/entry.A1.js"));
		expect(i.static).toEqual(["./shared.B2.js", "./util.C3.js", "./re.D4.js"]);
		expect(i.dynamic).toEqual(["./lazy.E5.js"]);
	});

	it("reads Rolldown-style spaced, multi-line, single-quoted and star re-exports", () => {
		const i = extractJsImports(read("graph-rolldown/dist/_astro/entry-Ab12.js"));
		expect(i.static).toEqual(["./preload-helper-Zz00.js", "./shared-Cd34.js", "./reexp-Ef56.js"]);
		expect(i.dynamic).toEqual(["./lazy-Gh78.js", "./deep-Ij90.js"]);
	});

	it("treats __vite__mapDeps lists (root-relative) as dynamic edges", () => {
		const i = extractJsImports(read("graph-rollup/dist/_astro/lazy.E5.js"));
		expect(i.dynamic).toContain("_astro/shared.B2.js");
		expect(i.dynamic).toContain("_astro/deep.F6.js");
	});

	it("ignores non-.js specifiers, bare packages and string literals that merely mention import", () => {
		const i = extractJsImports(
			'import"./a.css";import x from"react";const s="import(\'nope\')";import("https://cdn/x.js");',
		);
		expect(i.static).toEqual([]);
		expect(i.dynamic).toEqual(["https://cdn/x.js"]);
		expect(resolveSpecifier("_astro/a.js", "https://cdn/x.js")).toBeNull();
	});
});

describe("resolveSpecifier", () => {
	it("resolves relative, parent-relative and root-relative specifiers to one key", () => {
		expect(resolveSpecifier("_astro/a.js", "./b.js")).toBe("_astro/b.js");
		expect(resolveSpecifier("_astro/sub/a.js", "../b.js")).toBe("_astro/b.js");
		expect(resolveSpecifier("_astro/a.js", "/_astro/b.js")).toBe("_astro/b.js");
		expect(resolveSpecifier("_astro/a.js", "_astro/b.js")).toBe("_astro/b.js");
		expect(resolveSpecifier("_astro/a.js", "./b.js?v=1")).toBe("_astro/b.js");
	});

	fcTest.prop([fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/)])(
		"./name.js lands beside the importer",
		(name) => {
			expect(resolveSpecifier("_astro/importer.js", `./${name}.js`)).toBe(`_astro/${name}.js`);
		},
	);
});

describe("gzip measurement", () => {
	it("gzip9 equals node:zlib level 9", () => {
		const s = "export const x=1;\n".repeat(500);
		expect(gzip9(s)).toBe(gzipSync(s, { level: 9 }).length);
		expect(gzip9(s)).toBeLessThan(s.length / 10);
	});
});

describe("buckets, closure de-duplication and self-check (Rollup fixture)", () => {
	const dist = join(FIX, "graph-rollup/dist");
	const cfg: BudgetsConfig = { ...budgets, excluded: [], unreferencedChunks: [] };
	const m = measureDist(dist, cfg);
	const report = m.reports[0];

	it("splits first-view from lazy and counts a shared chunk once", () => {
		expect(report).toBeDefined();
		expect([...(report?.buckets.first ?? [])].sort()).toEqual(
			[
				"_astro/entry.A1.js",
				"_astro/load.H8.js",
				"_astro/re.D4.js",
				"_astro/shared.B2.js",
				"_astro/util.C3.js",
			].sort(),
		);
		expect([...(report?.buckets.lazy ?? [])].sort()).toEqual(
			["_astro/deep.F6.js", "_astro/lazy.E5.js", "_astro/vis.G7.js"].sort(),
		);
		// shared.B2.js is reachable from lazy chunks too, but only counted in `first`.
		expect(report?.buckets.lazy.has("_astro/shared.B2.js")).toBe(false);
	});

	it("errors on a chunk no route reaches, and passes when it is allow-listed", () => {
		expect(m.check.findings.map((f) => f.message)).toEqual([
			expect.stringContaining("_astro/orphan.Z9.js"),
		]);
		const allowed = measureDist(dist, {
			...cfg,
			unreferencedChunks: [{ pattern: /orphan\./, reason: "fixture" }],
		});
		expect(allowed.check.findings).toEqual([]);
		expect(allowed.check.unreferenced).toEqual(["_astro/orphan.Z9.js"]);
	});

	it("reports platform = chunks in every route's first view", () => {
		expect([...platformChunks([new Set(["a", "b"]), new Set(["b", "c"])])]).toEqual(["b"]);
		expect(platformChunks([])).toEqual(new Set());
	});

	it("selfCheck flags an import edge to a missing chunk", () => {
		const g = buildChunkGraph(new Map([["_astro/a.js", 'import"./gone.js";']]));
		expect(
			selfCheck(g, [], { ...budgets, unreferencedChunks: [{ pattern: /./, reason: "t" }] })
				.findings[0]?.message,
		).toContain("gone.js");
	});
});

describe("Rolldown-style fixture", () => {
	const m = measureDist(join(FIX, "graph-rolldown/dist"), {
		...budgets,
		excluded: [],
		unreferencedChunks: [],
	});

	it("places every chunk (inline module import, modulepreload, relative preload lists)", () => {
		expect(m.check.findings).toEqual([]);
		const r = m.reports[0];
		expect([...(r?.buckets.first ?? [])].sort()).toEqual(
			[
				"_astro/entry-Ab12.js",
				"_astro/preload-helper-Zz00.js",
				"_astro/reexp-Ef56.js",
				"_astro/shared-Cd34.js",
			].sort(),
		);
		expect([...(r?.buckets.lazy ?? [])].sort()).toEqual([
			"_astro/deep-Ij90.js",
			"_astro/lazy-Gh78.js",
		]);
	});
});

describe("classifyRoute", () => {
	it("maps the spec's route classes", () => {
		const c = (r: string): string | null => classifyRoute(r, budgets);
		expect([c("/"), c("/works/x/"), c("/now/"), c("/garden/"), c("/garden/note/")]).toEqual([
			"home",
			"project",
			"text",
			"text",
			"text",
		]);
		expect([c("/search/"), c("/garden/graph/"), c("/lab/datamosh/"), c("/nope/")]).toEqual([
			"search",
			"graph",
			"lab",
			null,
		]);
	});
});

describe("R1 first-view JS", () => {
	const dist = join(FIX, "graph-rollup/dist");
	it("passes under the class limit and fails over it, naming the rule", () => {
		const ok = measureDist(dist, {
			...budgets,
			unreferencedChunks: [{ pattern: /./, reason: "t" }],
		}).reports[0];
		expect(ok?.findings.filter((f) => f.rule === "R1")).toEqual([]);
		const tight: BudgetsConfig = {
			...budgets,
			unreferencedChunks: [{ pattern: /./, reason: "t" }],
			classes: { ...budgets.classes, home: { ...budgets.classes.home, firstViewJs: 10 } },
		};
		const bad = measureDist(dist, tight).reports[0];
		expect(bad?.findings.some((f) => f.rule === "R1" && f.severity === "error")).toBe(true);
	});

	it("only warns on /lab/* and on excluded routes", () => {
		const lab = analyzeRoute({ route: "/lab/x/", html: "<p></p>" }, emptyGraph, assetsFrom({}), {
			...budgets,
			classes: { ...budgets.classes, lab: { firstViewJs: -1, warnOnly: true } },
		});
		expect(lab.findings.map((f) => f.severity)).toEqual(["warn"]);
	});

	it("flags an unclassified route", () => {
		expect(errors(rule("/nope/", "r5-vacuous.html"), "R1")[0]).toContain("no class");
	});
});

describe("R3 HTML + linked CSS", () => {
	const html =
		'<link rel="stylesheet" href="/_astro/a.css"><link rel="stylesheet" href="/_astro/gone.css"><p>x</p>';
	it("passes within limits and fails over them", () => {
		const css = 12 * KB;
		const over = analyzeRoute(
			{ route: "/now/", html },
			emptyGraph,
			assetsFrom({ "_astro/a.css": css }),
			budgets,
		);
		expect(over.findings.some((f) => f.rule === "R3" && f.message.includes("linked CSS"))).toBe(
			true,
		);
		expect(over.findings.some((f) => f.message.includes("gone.css"))).toBe(true);
		const fine = analyzeRoute(
			{ route: "/now/", html: '<link rel="stylesheet" href="/_astro/a.css">' },
			emptyGraph,
			assetsFrom({ "_astro/a.css": 2 * KB }),
			budgets,
		);
		expect(fine.findings).toEqual([]);
	});

	it("uses the EC / math CSS allowances", () => {
		const css = assetsFrom({ "_astro/a.css": 12 * KB });
		const link = '<link rel="stylesheet" href="/_astro/a.css">';
		const ec = analyzeRoute(
			{ route: "/works/x/", html: `${link}<div class="expressive-code"></div>` },
			emptyGraph,
			css,
			budgets,
		);
		const plain = analyzeRoute({ route: "/works/x/", html: link }, emptyGraph, css, budgets);
		expect(errors(ec, "R3")).toEqual([]);
		expect(errors(plain, "R3")).toHaveLength(1);
		const math = analyzeRoute(
			{ route: "/now/", html: `${link}<span class="katex"></span>` },
			emptyGraph,
			css,
			budgets,
		);
		expect(errors(math, "R3")).toEqual([]);
	});
});

describe("R4 posters and fetchpriority", () => {
	const sizes = (kb: number): Record<string, number> => {
		const out: Record<string, number> = {};
		for (let i = 1; i <= 5; i++) out[`img/p${i}-640.avif`] = kb * KB;
		return out;
	};

	it("passes: first 4 cards eager, exactly one fetchpriority=high, bytes within limits", () => {
		const r = rule("/", "r4-home-pass.html", sizes(30));
		expect(errors(r, "R4")).toEqual([]);
	});

	it("fails when one of the first 4 cards is loading=lazy (column-major candidate set)", () => {
		expect(errors(rule("/", "r4-home-lazy-fail.html", sizes(30)), "R4")).toEqual([
			expect.stringContaining("card 3 poster has loading=lazy"),
		]);
	});

	it("fails with two fetchpriority=high elements, and with none on /", () => {
		expect(errors(rule("/", "r4-home-two-high-fail.html", sizes(30)), "R4")[0]).toContain(
			"2 elements have fetchpriority=high",
		);
		expect(errors(rule("/", "r4-home-no-high-fail.html", sizes(30)), "R4")[0]).toContain(
			"exactly 1",
		);
	});

	it("fails when eager posters exceed 200 KB total or the LCP poster exceeds 100 KB", () => {
		expect(errors(rule("/", "r4-home-pass.html", sizes(60)), "R4")[0]).toContain("eager posters");
		const lcp = { ...sizes(30), "img/p1-640.avif": 120 * KB };
		expect(errors(rule("/", "r4-home-pass.html", lcp), "R4").join("\n")).toContain(
			"LCP poster img/p1-640.avif",
		);
	});

	it("a still-cover banner frame (no loop) counts as a banner, not as a cover-less route", () => {
		expect(
			errors(rule("/works/x/", "r4-banner-still-pass.html", { "img/b-1280.avif": 150 * KB }), "R4"),
		).toEqual([]);
	});

	it("banner pages need exactly one high element; the banner poster is sized at 1280 w", () => {
		const big = { "img/b-1280.avif": 250 * KB };
		expect(
			errors(rule("/works/x/", "r4-banner-pass.html", { "img/b-1280.avif": 150 * KB }), "R4"),
		).toEqual([]);
		expect(errors(rule("/works/x/", "r4-banner-pass.html", big), "R4")[0]).toContain("LCP poster");
		expect(errors(rule("/works/x/", "r4-banner-no-high-fail.html"), "R4")[0]).toContain(
			"exactly 1",
		);
	});

	it("allows no fetchpriority=high on routes without a cover/banner", () => {
		expect(errors(rule("/now/", "r4-elsewhere-high-fail.html"), "R4")[0]).toContain("expected 0");
	});

	it("passes vacuously when no card carries a .loop-media poster", () => {
		expect(rule("/", "r4-vacuous.html").findings).toEqual([]);
	});
});

describe("R5 video[data-loop] markup", () => {
	it("passes a well-formed loop video", () => {
		expect(
			errors(
				rule("/works/x/", "r5-pass.html", { "loops/a.av1.mp4": 1, "loops/a.h264.mp4": 1 }),
				"R5",
			),
		).toEqual([]);
	});

	it("fails missing attrs, autoplay, poster, bad preload, aria-hidden and a missing second source", () => {
		const msg = errors(
			rule("/works/x/", "r5-fail-attrs.html", { "loops/a.av1.mp4": 1 }),
			"R5",
		).join("\n");
		for (const needle of [
			"missing `muted`",
			"missing `playsinline`",
			'`preload` must be "none"',
			"missing `width`",
			"missing `height`",
			'`aria-hidden` must be "true"',
			"autoplay",
			"poster",
			"≥ 2",
		]) {
			expect(msg).toContain(needle);
		}
	});

	it("fails when the AV1 source is not first", () => {
		const msg = errors(
			rule("/works/x/", "r5-fail-codec-order.html", {
				"loops/a.av1.mp4": 1,
				"loops/a.h264.mp4": 1,
			}),
			"R5",
		).join("\n");
		expect(msg).toContain("first <source>");
		expect(msg).toContain("second <source>");
	});

	it("passes vacuously without a data-loop video", () => {
		expect(rule("/works/x/", "r5-vacuous.html").findings).toEqual([]);
	});
});

describe("R6 loop file sizes", () => {
	it("card: ≤300 KB, warn above 150 KB", () => {
		const r = (kb: number) =>
			rule("/works/x/", "r6-card.html", {
				"loops/card.av1.mp4": kb * KB,
				"loops/card.h264.mp4": 1,
			});
		expect(r(100).findings).toEqual([]);
		expect(warns(r(200), "R6")).toHaveLength(1);
		expect(errors(r(310), "R6")[0]).toContain("loops/card.av1.mp4");
	});

	it("gallery shares the card limit", () => {
		const r = rule("/works/x/", "r6-gallery.html", {
			"loops/gal.av1.mp4": 310 * KB,
			"loops/gal.h264.mp4": 1,
		});
		expect(errors(r, "R6")).toHaveLength(1);
	});

	it("banner (1080p): ≤2.5 MB, warn above 1.5 MB", () => {
		const MAX = 2.5 * 1024 * KB;
		const r = (bytes: number) =>
			rule("/works/x/", "r6-banner.html", {
				"loops/banner.av1.mp4": bytes,
				"loops/banner.h264.mp4": 1,
			});
		expect(r(1000 * KB).findings).toEqual([]);
		expect(warns(r(1600 * KB), "R6")).toHaveLength(1);
		expect(errors(r(MAX + 1), "R6")).toHaveLength(1);
		expect(errors(r(MAX), "R6")).toEqual([]);
	});

	it("errors on a missing file and on an unknown data-loop-size", () => {
		expect(errors(rule("/works/x/", "r6-card.html", {}), "R6")[0]).toContain("not found");
		expect(errors(rule("/works/x/", "r6-missing-size.html", {}), "R6")[0]).toContain(
			"data-loop-size",
		);
	});
});

describe("end to end (AC2.4)", () => {
	function tmpDist(loopBytes: number): string {
		const dir = mkdtempSync(join(tmpdir(), "budgets-"));
		mkdirSync(join(dir, "loops"));
		writeFileSync(join(dir, "index.html"), read("rules/r6-card.html"));
		writeFileSync(join(dir, "loops/card.av1.mp4"), Buffer.alloc(loopBytes, 7));
		writeFileSync(join(dir, "loops/card.h264.mp4"), Buffer.alloc(10, 7));
		return dir;
	}

	it("an oversized loop makes the run fail, naming the file and the rule", () => {
		const { failed, markdown } = runBudgets(tmpDist(310 * KB), budgets);
		expect(failed).toBe(true);
		expect(markdown).toContain("R6");
		expect(markdown).toContain("loops/card.av1.mp4");
	});

	it("a small loop passes, and the report prints the table and the report-only total", () => {
		const { failed, markdown } = runBudgets(tmpDist(10 * KB), budgets);
		expect(failed).toBe(false);
		expect(markdown).toContain("| Route | Class |");
		expect(markdown).toContain("Site-wide unique JS (report-only");
	});

	it("renderMarkdown lists excluded routes with their reason", () => {
		const r = analyzeRoute(
			{ route: "/works/code-sandbox/", html: "<p></p>" },
			emptyGraph,
			assetsFrom({}),
			budgets,
		);
		const md = renderMarkdown(
			[r],
			{ findings: [], uniqueJs: 0, unreferenced: [] },
			{ chunks: 0, gz: 0, limit: 1 },
			[],
		);
		expect(md).toContain("excluded");
		expect(md).toContain("Sandpack");
	});
});
