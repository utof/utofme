/**
 * Keyboard helpers (AC4.5 support): arrow deltas and roving tabindex.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
import { describe, expect, it } from "vitest";
import { arrowDelta, rovingTabindex } from "../../src/lib/figure-keys";

const ev = (key: string, shiftKey = false) => new KeyboardEvent("keydown", { key, shiftKey });

describe("arrowDelta", () => {
	it("maps arrows to [dx, dy] with y down, and Shift to 5 tiles", () => {
		expect(arrowDelta(ev("ArrowUp"))).toEqual([0, -1]);
		expect(arrowDelta(ev("ArrowDown"))).toEqual([0, 1]);
		expect(arrowDelta(ev("ArrowLeft"))).toEqual([-1, 0]);
		expect(arrowDelta(ev("ArrowRight"))).toEqual([1, 0]);
		expect(arrowDelta(ev("ArrowRight", true))).toEqual([5, 0]);
		expect(arrowDelta(ev("ArrowUp", true))).toEqual([0, -5]);
	});
	it("returns null for other keys", () => {
		expect(arrowDelta(ev("a"))).toBeNull();
		expect(arrowDelta(ev("Enter"))).toBeNull();
	});
});

describe("rovingTabindex", () => {
	it("steps with wrap, Home and End, and ignores other keys", () => {
		expect(rovingTabindex(4, 0, "ArrowRight")).toBe(1);
		expect(rovingTabindex(4, 3, "ArrowRight")).toBe(0);
		expect(rovingTabindex(4, 0, "ArrowLeft")).toBe(3);
		expect(rovingTabindex(4, 2, "ArrowDown")).toBe(3);
		expect(rovingTabindex(4, 2, "ArrowUp")).toBe(1);
		expect(rovingTabindex(4, 2, "Home")).toBe(0);
		expect(rovingTabindex(4, 1, "End")).toBe(3);
		expect(rovingTabindex(4, 1, "x")).toBe(1);
		expect(rovingTabindex(0, 0, "ArrowRight")).toBe(0);
	});
});
