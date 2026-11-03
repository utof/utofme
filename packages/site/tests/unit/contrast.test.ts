/**
 * Unit tests for the WCAG contrast helper and the caption-bar guarantee (P9-7).
 *
 * @see packages/specs/specs/09-project-view.md § P9-7 (Contrast)
 */
import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio, relativeLuminance } from "../../src/lib/contrast";

describe("contrast helper", () => {
	it("white on black is 21:1, white on white is 1:1", () => {
		expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
		expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
	});

	it("relative luminance endpoints", () => {
		expect(relativeLuminance([0, 0, 0])).toBe(0);
		expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
	});

	it("compositeOver blends in gamma-encoded sRGB (source-over)", () => {
		expect(compositeOver([16, 16, 16], 0.62, [255, 255, 255])).toEqual([
			16 * 0.62 + 255 * 0.38,
			16 * 0.62 + 255 * 0.38,
			16 * 0.62 + 255 * 0.38,
		]);
	});

	it("caption bar: white text on rgba(16,16,16,.62) over a pure-white frame is ≈ 5.34:1 (≥ 4.5)", () => {
		const bar = compositeOver([16, 16, 16], 0.62, [255, 255, 255]);
		const ratio = contrastRatio([255, 255, 255], bar);
		expect(ratio).toBeGreaterThanOrEqual(4.5);
		expect(ratio).toBeCloseTo(5.34, 1);
	});

	it("the reference alpha .58 only reaches ≈ 4.65:1 and the old #f5f5f5 text fails", () => {
		const bar58 = compositeOver([16, 16, 16], 0.58, [255, 255, 255]);
		expect(contrastRatio([255, 255, 255], bar58)).toBeCloseTo(4.65, 1);
		const bar62 = compositeOver([16, 16, 16], 0.62, [255, 255, 255]);
		expect(contrastRatio([245, 245, 245], bar62)).toBeLessThan(5.34);
	});
});
