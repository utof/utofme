import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	formatInterval,
	formatNumber,
	formatPercent,
	formatSeconds,
	formatSigned,
	linear,
	ticks,
} from "../../src/lib/figure-scale";

const NBSP = " ";
const at = (a: readonly number[], i: number): number => a[i] ?? Number.NaN;
const MINUS = "−";

describe("formatNumber", () => {
	it("rounds once on the binary value, half away from zero", () => {
		expect(formatNumber(74.65, 1)).toBe("74.7");
		expect(formatNumber(2.5, 0)).toBe("3");
		expect(formatNumber(-2.5, 0)).toBe(`${MINUS}3`);
		expect(formatNumber(1.005, 2)).toBe("1.00");
		expect(formatNumber(0.5, 0)).toBe("1");
	});
	it("groups thousands (en-US) and keeps the digits asked for", () => {
		expect(formatNumber(9158, 0)).toBe("9,158");
		expect(formatNumber(1234567.891, 2)).toBe("1,234,567.89");
		expect(formatNumber(706080, 0)).toBe("706,080");
		expect(formatNumber(999, 0)).toBe("999");
		expect(formatNumber(22.8, 1)).toBe("22.8");
		expect(formatNumber(23, 1)).toBe("23.0");
	});
	it("prints a real minus sign and never a negative zero", () => {
		expect(formatNumber(-94, 0)).toBe(`${MINUS}94`);
		expect(formatNumber(-0.04, 1)).toBe("0.0");
		expect(formatNumber(-0, 0)).toBe("0");
	});
	it("refuses values it cannot print", () => {
		expect(() => formatNumber(Number.NaN, 0)).toThrow(RangeError);
		expect(() => formatNumber(1e21, 0)).toThrow(RangeError);
		expect(() => formatNumber(1, -1)).toThrow(RangeError);
	});
	test.prop([fc.double({ min: -1e9, max: 1e9, noNaN: true }), fc.integer({ min: 0, max: 6 })])(
		"parses back to within half a unit of the last digit",
		(v, d) => {
			const back = Number(
				formatNumber(v, d).replace(",", "").replaceAll(",", "").replace(MINUS, "-"),
			);
			expect(Math.abs(back - v)).toBeLessThanOrEqual(0.5 * 10 ** -d + 1e-9 * Math.abs(v));
		},
	);
});

describe("formatSigned", () => {
	it("prints + and U+2212; zero (also after rounding) has no sign", () => {
		expect(formatSigned(96, 0)).toBe("+96");
		expect(formatSigned(-94, 0)).toBe(`${MINUS}94`);
		expect(formatSigned(0, 0)).toBe("0");
		expect(formatSigned(0.04, 0)).toBe("0");
		expect(formatSigned(-0.04, 1)).toBe("0.0");
		expect(formatSigned(1.25, 1)).toBe("+1.3");
	});
});

describe("formatInterval", () => {
	it("joins with ' to ' at the digits given", () => {
		expect(formatInterval(22.14, 23.63, 1)).toBe("22.1 to 23.6");
	});
	it("signed prints '+94 to +98' (the Elo form) and a mixed interval", () => {
		expect(formatInterval(94, 98, 0, { signed: true })).toBe("+94 to +98");
		expect(formatInterval(-5, 3, 0, { signed: true })).toBe(`${MINUS}5 to +3`);
	});
});

describe("formatSeconds / formatPercent", () => {
	it("seconds: one decimal, joined to the unit with U+00A0", () => {
		expect(formatSeconds(7.2)).toBe(`7.2${NBSP}s`);
		expect(formatSeconds(0.8 * 3)).toBe(`2.4${NBSP}s`);
		expect(formatSeconds(74.65)).toBe(`74.7${NBSP}s`);
	});
	it("percent: from the raw value, once", () => {
		expect(formatPercent(0.6347, 0)).toBe(`63${NBSP}%`);
		expect(formatPercent(0.146, 1)).toBe(`14.6${NBSP}%`);
		expect(formatPercent(1, 0)).toBe(`100${NBSP}%`);
	});
	test.prop([fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 0, max: 3 })])(
		"percent = formatNumber(p × 100) + NBSP + %",
		(p, d) => {
			expect(formatPercent(p, d)).toBe(`${formatNumber(p * 100, d)}${NBSP}%`);
		},
	);
});

describe("linear", () => {
	it("maps the domain ends to the range ends and inverts", () => {
		const s = linear([0, 10], [100, 200]);
		expect(s(0)).toBe(100);
		expect(s(10)).toBe(200);
		expect(s(5)).toBe(150);
		expect(s.invert(150)).toBe(5);
	});
	it("supports a reversed range (screen y) and extrapolates", () => {
		const s = linear([0, 1], [50, 0]);
		expect(s(0.5)).toBe(25);
		expect(s(2)).toBe(-50);
	});
	it("a degenerate domain maps everything to the range midpoint", () => {
		const s = linear([3, 3], [0, 10]);
		expect(s(3)).toBe(5);
		expect(s(99)).toBe(5);
		expect(s.invert(7)).toBe(3);
	});
	test.prop([
		fc.double({ min: -1e3, max: 1e3, noNaN: true }),
		fc.double({ min: 1, max: 1e3, noNaN: true }),
		fc.double({ min: -1e3, max: 1e3, noNaN: true }),
		fc.double({ min: 1, max: 1e3, noNaN: true }),
		fc.double({ min: 0, max: 1, noNaN: true }),
	])("invert(scale(x)) ≈ x", (d0, dw, r0, rw, t) => {
		const s = linear([d0, d0 + dw], [r0, r0 + rw]);
		const x = d0 + t * dw;
		expect(s.invert(s(x))).toBeCloseTo(x, 6);
	});
});

describe("ticks", () => {
	it("returns round numbers inside [min, max]", () => {
		expect(ticks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
		expect(ticks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
		expect(ticks(3, 97, 4)).toEqual([20, 40, 60, 80]);
	});
	it("has no float drift on small steps", () => {
		expect(ticks(0, 0.5, 5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
	});
	it("handles degenerate and invalid input", () => {
		expect(ticks(5, 5, 3)).toEqual([5]);
		expect(ticks(0, 10, 0)).toEqual([]);
		expect(ticks(Number.NaN, 10, 3)).toEqual([]);
		expect(ticks(10, 0, 5)).toEqual(ticks(0, 10, 5));
	});
	test.prop([
		fc.double({ min: -1e4, max: 1e4, noNaN: true }),
		fc.double({ min: 0.01, max: 1e4, noNaN: true }),
		fc.integer({ min: 1, max: 12 }),
	])("ascending, inside the bounds, evenly spaced, not far from `count`", (min, span, count) => {
		const t = ticks(min, min + span, count);
		for (const v of t) {
			expect(v).toBeGreaterThanOrEqual(min - 1e-9);
			expect(v).toBeLessThanOrEqual(min + span + 1e-9);
		}
		for (let i = 1; i < t.length; i++) expect(at(t, i)).toBeGreaterThan(at(t, i - 1));
		expect(t.length).toBeLessThanOrEqual(2 * count + 2);
		if (t.length > 2) {
			const step = at(t, 1) - at(t, 0);
			for (let i = 2; i < t.length; i++) {
				expect(at(t, i) - at(t, i - 1)).toBeCloseTo(step, 6);
			}
		}
	});
});
