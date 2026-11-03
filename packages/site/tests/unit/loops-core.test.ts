/**
 * Why: pins the pure core of the loop pipeline — recipe schema, golden filtergraph, codecs strings
 * (measured with ffprobe on the real card and 1080p banner encodes), budgets, prune planning, manifest ↔ files diff and the
 * manifest schema round-trip.
 * @see packages/specs/specs/09-project-view.md § P9-4 (AC4.1, AC4.2)
 */

import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	budgetVerdict,
	buildMasterGraph,
	canonicalJson,
	codecsFromProbe,
	crfFor,
	diffManifestFiles,
	encodeArgs,
	planPrune,
	type Recipe,
	recipeSchema,
	serializeManifest,
	sha8,
	totalDuration,
} from "../../scripts/lib/loops-core";
import { type LoopsManifest, loopsManifestSchema } from "../../src/lib/loops/manifest";

const montage = {
	slug: "demo",
	kind: "montage",
	aspect: "16:9",
	sizes: ["card", "banner"],
	shots: [
		{ src: "a/one.mp4", duration: 1.5, fit: "cover" },
		{ src: "a/two.mp4", start: 2, duration: 1, fit: "contain" },
		{ src: "a/three.mp4", duration: 2, fit: "cover", crop: { x: 10, y: 20, w: 640, h: 360 } },
	],
	poster: { at: 1 },
};

describe("recipeSchema", () => {
	it("accepts a montage", () => {
		const r = recipeSchema.parse(montage);
		expect(totalDuration(r)).toBe(4.5);
	});
	it("accepts a slideshow at 10 fps default", () => {
		expect(
			recipeSchema.safeParse({
				slug: "deck",
				kind: "slideshow",
				aspect: "16:9",
				sizes: ["card"],
				slides: [
					{ src: "s/1.png", hold: 1.2, fit: "contain" },
					{ src: "s/2.png", hold: 0.8, fit: "contain" },
				],
				poster: { at: 0 },
			}).success,
		).toBe(true);
	});
	it.each([
		["absolute path", { shots: [{ src: "/home/x/a.mp4", duration: 1, fit: "cover" }] }],
		["parent traversal", { shots: [{ src: "../a.mp4", duration: 1, fit: "cover" }] }],
		["windows drive", { shots: [{ src: "C:/a.mp4", duration: 1, fit: "cover" }] }],
		["montage shot > 2 s", { shots: [{ src: "a.mp4", duration: 3, fit: "cover" }] }],
		["shot < 1 s", { shots: [{ src: "a.mp4", duration: 0.5, fit: "cover" }] }],
		["non-integer frames", { shots: [{ src: "a.mp4", duration: 1.05, fit: "cover" }] }],
		["no card size", { sizes: ["banner"] }],
		["bad aspect", { aspect: "4:3" }],
		["slug case", { slug: "Demo" }],
		["poster outside loop", { poster: { at: 99 } }],
		["unknown key", { extra: 1 }],
		["slides on a montage", { slides: [{ src: "a.png", hold: 1, fit: "cover" }] }],
	])("rejects %s", (_n, patch) => {
		expect(recipeSchema.safeParse({ ...montage, ...patch }).success).toBe(false);
	});
	it("a transcode takes exactly one shot", () => {
		const t = { ...montage, kind: "transcode" };
		expect(recipeSchema.safeParse(t).success).toBe(false);
		expect(
			recipeSchema.safeParse({
				...t,
				shots: [{ src: "a.mp4", duration: 6, fit: "cover" }],
				poster: { at: 1 },
			}).success,
		).toBe(true);
	});
});

describe("buildMasterGraph", () => {
	it("matches the golden filtergraph for a 3-shot montage (card)", () => {
		const g = buildMasterGraph(recipeSchema.parse(montage), "card");
		expect(g.inputArgs).toEqual(["-i", "a/one.mp4", "-i", "a/two.mp4", "-i", "a/three.mp4"]);
		const tail = "setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
		expect(g.filterComplex).toBe(
			[
				`[0:v]fps=30,trim=start=0:duration=1.5,setpts=PTS-STARTPTS,scale=768:432:force_original_aspect_ratio=increase,crop=768:432,${tail}[v0]`,
				`[1:v]fps=30,trim=start=2:duration=1,setpts=PTS-STARTPTS,scale=768:432:force_original_aspect_ratio=decrease,pad=768:432:(ow-iw)/2:(oh-ih)/2:color=black,${tail}[v1]`,
				`[2:v]fps=30,trim=start=0:duration=2,setpts=PTS-STARTPTS,crop=640:360:10:20,scale=768:432:force_original_aspect_ratio=increase,crop=768:432,${tail}[v2]`,
				"[v0][v1][v2]concat=n=3:v=1:a=0[v]",
			].join(";"),
		);
		expect(g.filterComplex).not.toContain("xfade");
	});
	it("loops still-image shots for their duration instead of trimming them", () => {
		const g = buildMasterGraph(
			recipeSchema.parse({
				...montage,
				shots: [{ src: "s/still.png", duration: 1.2, fit: "cover" }],
				poster: { at: 0.5 },
			}),
			"card",
		);
		expect(g.inputArgs).toEqual([
			"-loop",
			"1",
			"-framerate",
			"30",
			"-t",
			"1.2",
			"-i",
			"s/still.png",
		]);
		expect(g.filterComplex).not.toContain("trim=");
	});
	it("uses the banner frame for banner and looped stills for slideshows", () => {
		const r = recipeSchema.parse({
			slug: "deck",
			kind: "slideshow",
			aspect: "16:9",
			sizes: ["card", "banner"],
			slides: [{ src: "s/1.png", hold: 1.2, fit: "contain" }],
			poster: { at: 0 },
		});
		const g = buildMasterGraph(r, "banner", (p) => `/m/${p}`);
		expect(g.inputArgs).toEqual([
			"-loop",
			"1",
			"-framerate",
			"10",
			"-t",
			"1.2",
			"-i",
			"/m/s/1.png",
		]);
		expect(g.filterComplex).toContain("scale=1920:1080");
	});
});

describe("encodeArgs", () => {
	const has = (a: string[], ...seq: string[]) => a.join(" ").includes(seq.join(" "));
	it("card AV1 / H.264", () => {
		const av1 = encodeArgs("montage", "card", "av1", "in.mkv", "o.mp4");
		expect(has(av1, "-c:v libsvtav1 -preset 4 -crf 38")).toBe(true);
		const h = encodeArgs("montage", "card", "h264", "in.mkv", "o.mp4");
		expect(has(h, "-c:v libx264 -preset veryslow -crf 26 -profile:v high -level:v 3.0")).toBe(true);
		expect(h).not.toContain("stillimage");
		for (const a of [av1, h]) {
			expect(a).toContain("-an");
			expect(has(a, "-pix_fmt yuv420p")).toBe(true);
			expect(has(a, "-movflags +faststart")).toBe(true);
		}
	});
	it("banner crf (montage vs slideshow), level 4.0 and slideshow tune", () => {
		expect(has(encodeArgs("montage", "banner", "av1", "i", "o"), "-crf 30")).toBe(true);
		expect(has(encodeArgs("slideshow", "banner", "av1", "i", "o"), "-crf 28")).toBe(true);
		const m = encodeArgs("montage", "banner", "h264", "i", "o");
		expect(has(m, "-crf 22 -profile:v high -level:v 4.0")).toBe(true);
		expect(m).not.toContain("stillimage");
		const h = encodeArgs("slideshow", "banner", "h264", "i", "o");
		expect(has(h, "-crf 20")).toBe(true);
		expect(has(h, "-tune stillimage")).toBe(true);
	});
	it("card crf does not depend on the loop kind", () => {
		for (const codec of ["av1", "h264"] as const)
			expect(crfFor("slideshow", "card", codec)).toBe(crfFor("montage", "card", codec));
	});
});

describe("codecsFromProbe (probe fixtures measured on the real encodes)", () => {
	it.each([
		[{ codec_name: "h264", profile: "High", level: 30, width: 768, height: 432 }, "avc1.64001E"],
		// Banner at 1920x1080 (ffprobe of the real encodes: H.264 level 40 = 4.0, AV1 seq_level_idx 8 = 4.0).
		[{ codec_name: "h264", profile: "High", level: 40, width: 1920, height: 1080 }, "avc1.640028"],
		[
			{ codec_name: "av1", profile: "Main", level: 4, width: 768, height: 432, pix_fmt: "yuv420p" },
			"av01.0.04M.08",
		],
		[
			{
				codec_name: "av1",
				profile: "Main",
				level: 8,
				width: 1920,
				height: 1080,
				pix_fmt: "yuv420p",
			},
			"av01.0.08M.08",
		],
	])("%j → %s", (probe, codec) => {
		expect(codecsFromProbe(probe)).toBe(`video/mp4; codecs="${codec}"`);
	});
	it("rejects what it cannot describe", () => {
		expect(() =>
			codecsFromProbe({ codec_name: "h264", profile: "High 10", level: 30, width: 1, height: 1 }),
		).toThrow();
		expect(() => codecsFromProbe({ codec_name: "vp9", level: 1, width: 1, height: 1 })).toThrow();
		expect(() =>
			codecsFromProbe({ codec_name: "h264", profile: "High", width: 1, height: 1 }),
		).toThrow();
	});
});

describe("budgetVerdict", () => {
	it("card/gallery: warn > 150 KB, fail > 300 KB", () => {
		expect(budgetVerdict("card", 150 * 1024)).toBe("ok");
		expect(budgetVerdict("card", 150 * 1024 + 1)).toBe("warn");
		expect(budgetVerdict("card", 300 * 1024)).toBe("warn");
		expect(budgetVerdict("card", 300 * 1024 + 1)).toBe("fail");
	});
	it("banner (1080p): warn > 1.5 MB, fail > 2.5 MB", () => {
		const MB = 1024 * 1024;
		expect(budgetVerdict("banner", 1.5 * MB)).toBe("ok");
		expect(budgetVerdict("banner", 1.5 * MB + 1)).toBe("warn");
		expect(budgetVerdict("banner", 2.5 * MB)).toBe("warn");
		expect(budgetVerdict("banner", 2.5 * MB + 1)).toBe("fail");
	});
});

describe("planPrune", () => {
	it("lists exactly the superseded output files, never unknown files", () => {
		const existing = [
			"card.aaaaaaaa.av1.mp4",
			"card.bbbbbbbb.av1.mp4",
			"card.bbbbbbbb.h264.mp4",
			"banner.cccccccc.h264.mp4",
			"notes.txt",
			".gitkeep",
		];
		const keep = new Set(["card.bbbbbbbb.av1.mp4", "card.bbbbbbbb.h264.mp4"]);
		expect(planPrune(existing, keep)).toEqual([
			"banner.cccccccc.h264.mp4",
			"card.aaaaaaaa.av1.mp4",
		]);
	});
});

const entry = (hash: string): LoopsManifest[string] => ({
	recipe: "deadbeef",
	durationS: 4,
	fps: 30,
	aspect: "16:9",
	card: {
		width: 768,
		height: 432,
		sources: [
			{
				url: `/loops/demo/card.${hash}.av1.mp4`,
				type: 'video/mp4; codecs="av01.0.04M.08"',
				bytes: 100,
			},
		],
	},
	banner: null,
	posterPath: "src/assets/loops/demo/poster.png",
	flash: {
		maxEventsPerWindow: 2,
		maxPerSecond: 1,
		renderWidthCss: { card: 1200, banner: null },
		status: "pass",
	},
});

describe("diffManifestFiles", () => {
	const m: LoopsManifest = { demo: entry("11111111") };
	const url = "/loops/demo/card.11111111.av1.mp4";
	const posters = new Set(["src/assets/loops/demo/poster.png"]);
	it("is clean for a consistent tree", () => {
		expect(
			diffManifestFiles(m, new Map([[url, { bytes: 100, sha8: "11111111" }]]), posters),
		).toEqual([]);
	});
	it("reports missing, bytes, hash, orphan and poster problems", () => {
		const kinds = (files: Map<string, { bytes: number; sha8: string }>, p = posters) =>
			diffManifestFiles(m, files, p).map((x) => x.kind);
		expect(kinds(new Map())).toEqual(["missing"]);
		expect(kinds(new Map([[url, { bytes: 99, sha8: "11111111" }]]))).toEqual(["bytes"]);
		expect(kinds(new Map([[url, { bytes: 100, sha8: "22222222" }]]))).toEqual(["hash"]);
		expect(
			kinds(
				new Map([
					[url, { bytes: 100, sha8: "11111111" }],
					["/loops/demo/card.33333333.av1.mp4", { bytes: 1, sha8: "33333333" }],
				]),
			),
		).toEqual(["orphan"]);
		expect(kinds(new Map([[url, { bytes: 100, sha8: "11111111" }]]), new Set())).toEqual([
			"poster-missing",
		]);
	});
});

describe("loopsManifestSchema", () => {
	it("accepts the empty manifest and rejects unknown keys / bad urls", () => {
		expect(loopsManifestSchema.safeParse({}).success).toBe(true);
		expect(
			loopsManifestSchema.safeParse({ demo: { ...entry("11111111"), extra: 1 } }).success,
		).toBe(false);
		const good = entry("11111111");
		const bad = {
			...good,
			card: {
				...good.card,
				sources: [
					{ url: "/loops/demo/x.mp4", type: 'video/mp4; codecs="av01.0.04M.08"', bytes: 1 },
				],
			},
		};
		expect(loopsManifestSchema.safeParse({ demo: bad }).success).toBe(false);
	});
	const hex8 = fc.stringMatching(/^[0-9a-f]{8}$/);
	const entryArb = hex8.map(entry);
	fcTest.prop([fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/), entryArb, { maxKeys: 4 })])(
		"round-trips through JSON and the sorted serialiser",
		(x) => {
			expect(loopsManifestSchema.parse(JSON.parse(JSON.stringify(x)))).toEqual(x);
			expect(loopsManifestSchema.parse(JSON.parse(serializeManifest(x)))).toEqual(x);
		},
	);
	it("serialises keys sorted", () => {
		const out = serializeManifest({ b: entry("11111111"), a: entry("22222222") });
		expect(out.indexOf('"a"')).toBeLessThan(out.indexOf('"b"'));
		expect(out.endsWith("\n")).toBe(true);
	});
});

describe("hashing helpers", () => {
	it("canonicalJson ignores key order; sha8 is 8 hex chars", () => {
		const r: Recipe = recipeSchema.parse(montage);
		const shuffled = JSON.parse(
			JSON.stringify(Object.fromEntries(Object.entries(r).reverse())),
		) as Recipe;
		expect(canonicalJson(shuffled)).toBe(canonicalJson(r));
		expect(sha8("x")).toMatch(/^[0-9a-f]{8}$/);
	});
});
