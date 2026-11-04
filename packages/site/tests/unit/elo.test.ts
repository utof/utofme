/**
 * Elo helpers (AC4.4): the project's own detectable-effect numbers.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.4)
 */
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { binomialEloSd, eloForWinProbability, mde, winProbability } from "../../src/lib/elo";

describe("elo (AC4.4)", () => {
	it("pins the anchor values", () => {
		expect(winProbability(0)).toBe(0.5);
		expect(winProbability(96)).toBeCloseTo(0.6347, 4);
		expect(Math.round(winProbability(96) * 100)).toBe(63);
		expect(binomialEloSd(8000)).toBeCloseTo(3.88, 2);
		expect(mde(2.5, 2)).toBeCloseTo(4.4, 1);
		expect(mde(5.3, 2)).toBeCloseTo(9.3, 1);
	});
	it("mde uses the factor and the seed count", () => {
		expect(mde(4, 4, 2)).toBe(4);
		expect(mde(1, 1)).toBe(2.49);
	});
	it("binomialEloSd shrinks with rounds and depends on p", () => {
		expect(binomialEloSd(32000)).toBeCloseTo(binomialEloSd(8000) / 2, 10);
		expect(binomialEloSd(8000, 0.7)).toBeGreaterThan(binomialEloSd(8000, 0.5));
	});
	const d = fc.double({ min: -2000, max: 2000, noNaN: true });
	test.prop([d])("winProbability(d) + winProbability(-d) = 1", (x) => {
		expect(winProbability(x) + winProbability(-x)).toBeCloseTo(1, 12);
	});
	test.prop([d, d])("winProbability is monotone", (a, b) => {
		expect(winProbability(Math.min(a, b))).toBeLessThanOrEqual(winProbability(Math.max(a, b)));
	});
	test.prop([fc.double({ min: -600, max: 600, noNaN: true })])(
		"eloForWinProbability inverts it",
		(x) => {
			expect(eloForWinProbability(winProbability(x))).toBeCloseTo(x, 6);
		},
	);
});
