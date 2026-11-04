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
	CARD_FRAMES,
	canonicalJson,
	codecsFromProbe,
	crfFor,
	diffManifestFiles,
	encodeArgs,
	frameFor,
	gridFor,
	planPrune,
	type Recipe,
	recipeSchema,
	renderWidthCssFor,
	SIZE_SPECS,
	serializeManifest,
	sha8,
	totalDuration,
	wantsCardPoster,
} from "../../scripts/lib/loops-core";
import {
	aspectRatio,
	CARD_ASPECTS,
	type CardAspect,
	type LoopsManifest,
	loopsManifestSchema,
} from "../../src/lib/loops/manifest";

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

describe("recipeSchema card aspect", () => {
	it.each(CARD_ASPECTS)("accepts cardAspect %s", (cardAspect) => {
		expect(recipeSchema.safeParse({ ...montage, cardAspect }).success).toBe(true);
	});
	it("defaults to no cardAspect (16:9) and rejects names outside the set", () => {
		expect(recipeSchema.parse(montage).cardAspect).toBeUndefined();
		expect(recipeSchema.safeParse({ ...montage, cardAspect: "5:4" }).success).toBe(false);
		expect(recipeSchema.safeParse({ ...montage, cardAspect: "1:2" }).success).toBe(false);
	});
	it("takes a cardCrop on shots and slides, and nothing else new on slides", () => {
		const cardCrop = { x: 0, y: 0, w: 900, h: 900 };
		expect(
			recipeSchema.safeParse({
				...montage,
				shots: [{ src: "a/one.mp4", duration: 1.5, fit: "cover", cardCrop }],
			}).success,
		).toBe(true);
		const deck = {
			slug: "deck",
			kind: "slideshow",
			aspect: "16:9",
			sizes: ["card"],
			poster: { at: 0 },
		};
		expect(
			recipeSchema.safeParse({
				...deck,
				slides: [{ src: "s/1.png", hold: 1.2, fit: "cover", cardCrop }],
			}).success,
		).toBe(true);
		expect(
			recipeSchema.safeParse({
				...deck,
				slides: [{ src: "s/1.png", hold: 1.2, fit: "cover", crop: cardCrop }],
			}).success,
		).toBe(false);
		expect(
			recipeSchema.safeParse({
				...montage,
				shots: [
					{ src: "a/one.mp4", duration: 1.5, fit: "cover", cardCrop: { x: 0, y: 0, w: 0, h: 9 } },
				],
			}).success,
		).toBe(false);
	});
});

describe("frameFor / CARD_FRAMES", () => {
	it("the 16:9 card is today's 768x432 and the banner is 1920x1080 whatever the card aspect", () => {
		expect(CARD_FRAMES["16:9"]).toEqual({
			width: SIZE_SPECS.card.width,
			height: SIZE_SPECS.card.height,
		});
		expect(frameFor({}, "card")).toEqual({ width: 768, height: 432 });
		for (const cardAspect of CARD_ASPECTS)
			expect(frameFor({ cardAspect }, "banner")).toEqual({ width: 1920, height: 1080 });
	});
	it.each(
		CARD_ASPECTS,
	)("%s frame has the named ratio, even sides on the lint grid, ~today's pixel area", (a) => {
		const f = frameFor({ cardAspect: a }, "card");
		expect(f).toBe(CARD_FRAMES[a]);
		expect(Math.abs(f.width / f.height - aspectRatio(a))).toBeLessThan(1e-9);
		// Encoders need even sides; the flash lint's 4 px cell grid needs multiples of cellPx.
		expect(f.width % SIZE_SPECS.card.cellPx).toBe(0);
		expect(f.height % SIZE_SPECS.card.cellPx).toBe(0);
		// Keeps the byte budget: within ±5 % of 768x432 (331,776 px).
		const area = f.width * f.height;
		expect(Math.abs(area / (768 * 432) - 1)).toBeLessThan(0.05);
	});
	it("the card lint keeps one magnification (1200 CSS px per 768 video px) whatever the aspect", () => {
		expect(renderWidthCssFor("card", CARD_FRAMES["16:9"])).toBe(1200);
		expect(renderWidthCssFor("banner", { width: 1920, height: 1080 })).toBe(1280);
		for (const a of CARD_ASPECTS) {
			const f = CARD_FRAMES[a];
			const w = renderWidthCssFor("card", f);
			expect(Number.isInteger(w)).toBe(true);
			expect(Math.abs(w / f.width - 1200 / 768)).toBeLessThan(1 / f.width);
		}
		expect(renderWidthCssFor("card", CARD_FRAMES["1:1"])).toBe(900);
		expect(renderWidthCssFor("card", CARD_FRAMES["4:5"])).toBe(800);
	});
	it("the flash-lint grid follows the frame", () => {
		expect(gridFor("card")).toEqual({ gridW: 192, gridH: 108 });
		expect(gridFor("card", CARD_FRAMES["1:1"])).toEqual({ gridW: 144, gridH: 144 });
		expect(gridFor("banner")).toEqual({ gridW: 160, gridH: 90 });
	});
});

describe("buildMasterGraph card aspect", () => {
	const tail = "setsar=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
	const square = recipeSchema.parse({
		...montage,
		cardAspect: "1:1",
		shots: [
			{ src: "a/sim.mp4", duration: 1.5, fit: "cover" },
			{
				src: "a/grid.mp4",
				duration: 1,
				fit: "cover",
				crop: { x: 0, y: 920, w: 2240, h: 1260 },
				cardCrop: { x: 0, y: 0, w: 2240, h: 2240 },
			},
		],
	});
	it("scales the card master to the card frame and the banner master to 1920x1080", () => {
		const card = buildMasterGraph(square, "card").filterComplex;
		expect(card).toContain("scale=576:576:force_original_aspect_ratio=increase,crop=576:576");
		expect(card).not.toContain("768:432");
		const banner = buildMasterGraph(square, "banner").filterComplex;
		expect(banner).toContain("scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080");
		expect(banner).not.toContain("576");
	});
	it("cardCrop replaces crop on the card master only", () => {
		expect(buildMasterGraph(square, "card").filterComplex).toContain(
			`[1:v]fps=30,trim=start=0:duration=1,setpts=PTS-STARTPTS,crop=2240:2240:0:0,scale=576:576:force_original_aspect_ratio=increase,crop=576:576,${tail}[v1]`,
		);
		expect(buildMasterGraph(square, "banner").filterComplex).toContain(
			`[1:v]fps=30,trim=start=0:duration=1,setpts=PTS-STARTPTS,crop=2240:1260:0:920,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,${tail}[v1]`,
		);
	});
	it("a slide's cardCrop applies to the card master only", () => {
		const deck = recipeSchema.parse({
			slug: "deck",
			kind: "slideshow",
			aspect: "16:9",
			cardAspect: "4:5",
			sizes: ["card", "banner"],
			slides: [
				{ src: "s/1.png", hold: 1.2, fit: "cover", cardCrop: { x: 360, y: 0, w: 720, h: 900 } },
			],
			poster: { at: 0 },
		});
		const card = buildMasterGraph(deck, "card").filterComplex;
		expect(card).toContain(
			"crop=720:900:360:0,scale=512:640:force_original_aspect_ratio=increase,crop=512:640",
		);
		const banner = buildMasterGraph(deck, "banner").filterComplex;
		expect(banner).not.toContain("crop=720:900");
		expect(banner).toContain("scale=1920:1080");
	});
	it("a recipe without cardAspect still builds the golden 768x432 graph", () => {
		const g = buildMasterGraph(recipeSchema.parse(montage), "card").filterComplex;
		expect(g).toContain("scale=768:432:force_original_aspect_ratio=increase,crop=768:432");
	});
});

describe("wantsCardPoster", () => {
	it("is true only with a banner and a card that is not the banner's framing", () => {
		const base = recipeSchema.parse(montage);
		expect(wantsCardPoster(base)).toBe(false);
		expect(wantsCardPoster({ ...base, cardAspect: "16:9" })).toBe(false);
		expect(wantsCardPoster({ ...base, cardAspect: "1:1" })).toBe(true);
		const cropped = {
			...base,
			shots: [
				{
					src: "a.mp4",
					duration: 1.5,
					fit: "cover" as const,
					cardCrop: { x: 0, y: 0, w: 16, h: 9 },
				},
			],
		};
		expect(wantsCardPoster(cropped)).toBe(true);
		expect(wantsCardPoster({ ...cropped, sizes: ["card"] })).toBe(false);
		expect(wantsCardPoster({ ...base, cardAspect: "1:1", sizes: ["card"] })).toBe(false);
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
	cardAspect: "16:9",
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

/** A valid entry of any card aspect: frame from CARD_FRAMES, banner optional, card poster as the schema demands. */
const aspectEntry = (
	hash: string,
	cardAspect: CardAspect,
	banner: boolean,
): LoopsManifest[string] => {
	const base = entry(hash);
	const frame = CARD_FRAMES[cardAspect];
	return {
		...base,
		cardAspect,
		card: { ...base.card, ...frame },
		banner: banner
			? {
					width: 1920,
					height: 1080,
					sources: [
						{
							url: `/loops/demo/banner.${hash}.av1.mp4`,
							type: 'video/mp4; codecs="av01.0.08M.08"',
							bytes: 100,
						},
					],
				}
			: null,
		...(banner && cardAspect !== "16:9"
			? { cardPosterPath: "src/assets/loops/demo/card-poster.png" }
			: {}),
	};
};

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

describe("diffManifestFiles card poster", () => {
	const m: LoopsManifest = { demo: aspectEntry("11111111", "1:1", true) };
	const files = new Map([
		["/loops/demo/card.11111111.av1.mp4", { bytes: 100, sha8: "11111111" }],
		["/loops/demo/banner.11111111.av1.mp4", { bytes: 100, sha8: "11111111" }],
	]);
	it("wants both posters on disk", () => {
		const both = new Set([
			"src/assets/loops/demo/poster.png",
			"src/assets/loops/demo/card-poster.png",
		]);
		expect(diffManifestFiles(m, files, both)).toEqual([]);
		const onlyBanner = new Set(["src/assets/loops/demo/poster.png"]);
		expect(diffManifestFiles(m, files, onlyBanner)).toEqual([
			{
				kind: "poster-missing",
				path: "src/assets/loops/demo/card-poster.png",
				detail: "card poster of demo",
			},
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
	const entryArb = fc
		.tuple(hex8, fc.constantFrom(...CARD_ASPECTS), fc.boolean())
		.map(([h, a, b]) => aspectEntry(h, a, b));
	fcTest.prop([fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/), entryArb, { maxKeys: 4 })])(
		"round-trips through JSON and the sorted serialiser",
		(x) => {
			expect(loopsManifestSchema.parse(JSON.parse(JSON.stringify(x)))).toEqual(x);
			expect(loopsManifestSchema.parse(JSON.parse(serializeManifest(x)))).toEqual(x);
		},
	);
	it.each(CARD_ASPECTS)("accepts a %s card with and without a banner", (a) => {
		expect(loopsManifestSchema.safeParse({ demo: aspectEntry("11111111", a, false) }).success).toBe(
			true,
		);
		expect(loopsManifestSchema.safeParse({ demo: aspectEntry("11111111", a, true) }).success).toBe(
			true,
		);
	});
	it("rejects a card whose size is not its aspect", () => {
		const good = aspectEntry("11111111", "1:1", false);
		const bad = { ...good, card: { ...good.card, width: 768, height: 432 } };
		expect(loopsManifestSchema.safeParse({ demo: bad }).success).toBe(false);
		const tall = { ...good, cardAspect: "4:5" as const };
		expect(loopsManifestSchema.safeParse({ demo: tall }).success).toBe(false);
	});
	it("requires cardAspect", () => {
		const { cardAspect: _drop, ...rest } = entry("11111111");
		expect(loopsManifestSchema.safeParse({ demo: rest }).success).toBe(false);
	});
	it("a non-16:9 card with a banner needs cardPosterPath; a card-only loop must not have one", () => {
		const withPoster = aspectEntry("11111111", "3:4", true);
		const { cardPosterPath: _drop, ...without } = withPoster;
		expect(loopsManifestSchema.safeParse({ demo: without }).success).toBe(false);
		const cardOnly = {
			...aspectEntry("11111111", "3:4", false),
			cardPosterPath: "src/assets/loops/demo/card-poster.png",
		};
		expect(loopsManifestSchema.safeParse({ demo: cardOnly }).success).toBe(false);
		const elsewhere = { ...withPoster, cardPosterPath: "src/assets/loops/other/card-poster.png" };
		expect(loopsManifestSchema.safeParse({ demo: elsewhere }).success).toBe(false);
		const badName = { ...withPoster, cardPosterPath: "src/assets/loops/demo/poster2.png" };
		expect(loopsManifestSchema.safeParse({ demo: badName }).success).toBe(false);
	});
	it("a 16:9 card with a banner may omit cardPosterPath (the banner poster is its poster)", () => {
		expect(
			loopsManifestSchema.safeParse({ demo: aspectEntry("11111111", "16:9", true) }).success,
		).toBe(true);
	});
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
