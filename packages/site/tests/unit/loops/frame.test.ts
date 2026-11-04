/**
 * Why: pins the pure helpers `LoopMedia.astro` uses to turn a manifest entry into a frame aspect,
 * a poster and a poster `srcset` width ladder, so a non-16:9 card never gets a 16:9 frame or a
 * poster of the wrong framing.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	CARD_POSTER_WIDTHS,
	cardPosterWidths,
	frameAspectValue,
	loopPlayMode,
	posterPathFor,
} from "../../../src/lib/loops/frame";

describe("frameAspectValue", () => {
	it("is the rendition's own width / height, so the frame matches its video", () => {
		expect(frameAspectValue({ width: 768, height: 432 })).toBe("768 / 432");
		expect(frameAspectValue({ width: 576, height: 576 })).toBe("576 / 576");
		expect(frameAspectValue({ width: 512, height: 640 })).toBe("512 / 640");
	});
});

describe("posterPathFor", () => {
	const both = {
		posterPath: "src/assets/loops/demo/poster.png",
		cardPosterPath: "src/assets/loops/demo/card-poster.png",
	};
	it("cards and gallery frames use the card poster when there is one; the banner never does", () => {
		expect(posterPathFor(both, "card")).toBe(both.cardPosterPath);
		expect(posterPathFor(both, "gallery")).toBe(both.cardPosterPath);
		expect(posterPathFor(both, "banner")).toBe(both.posterPath);
	});
	it("falls back to the one poster when the card shares the banner's framing", () => {
		const one = { posterPath: both.posterPath };
		for (const size of ["card", "gallery", "banner"] as const)
			expect(posterPathFor(one, size)).toBe(both.posterPath);
	});
});

describe("cardPosterWidths", () => {
	it("keeps today's [384, 768] ladder for a poster at least 768 px wide", () => {
		expect(CARD_POSTER_WIDTHS).toEqual([384, 768]);
		expect(cardPosterWidths(768)).toEqual([384, 768]);
		expect(cardPosterWidths(1920)).toEqual([384, 768]);
	});
	it("caps the top step at a narrower card poster instead of asking sharp to upscale", () => {
		expect(cardPosterWidths(576)).toEqual([384, 576]);
		expect(cardPosterWidths(512)).toEqual([384, 512]);
		expect(cardPosterWidths(696)).toEqual([384, 696]);
	});
	it("never repeats a width when the poster is narrower than the first step", () => {
		expect(cardPosterWidths(300)).toEqual([300]);
	});
	fcTest.prop([fc.integer({ min: 64, max: 4000 })])(
		"ascending, unique, never above the poster width, ends at min(768, width)",
		(w) => {
			const out = cardPosterWidths(w);
			expect(out).toEqual([...new Set(out)].sort((a, b) => a - b));
			expect(Math.max(...out)).toBe(Math.min(768, w));
			expect(out.every((x) => x <= w)).toBe(true);
		},
	);
});

describe("loopPlayMode", () => {
	it("a slideshow card plays on hover only; everything else plays in view", () => {
		expect(loopPlayMode("slideshow", "card")).toBe("hover");
		expect(loopPlayMode("montage", "card")).toBe("view");
		expect(loopPlayMode("transcode", "card")).toBe("view");
	});
	it("the banner and gallery frames of a slideshow keep autoplaying in view", () => {
		expect(loopPlayMode("slideshow", "banner")).toBe("view");
		expect(loopPlayMode("slideshow", "gallery")).toBe("view");
	});
	it("an entry without a kind (test seam) plays in view", () => {
		expect(loopPlayMode(undefined, "card")).toBe("view");
	});
});
