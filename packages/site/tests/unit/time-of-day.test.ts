/**
 * Unit tests for hourToTod — pure function mapping an hour (0–23) to a
 * time-of-day slot ("dawn" | "day" | "dusk" | "night").
 *
 * TDD red cases written before implementation per plan §T3.
 *
 * Why: the function is inlined in MetaHead.astro's inline-script (no import
 * path); the canonical implementation lives in src/lib/time-of-day.ts and
 * is unit-tested here. Fast-check covers totality; boundary cases cover
 * every transition point in the hour mapping.
 *
 * @see packages/specs/plans/07-atmosphere.md § T3 TDD red cases
 * @see packages/specs/specs/07-atmosphere.md § Success criteria #10
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hourToTod } from "../../src/lib/time-of-day.ts";

const TOD_VALUES = ["dawn", "day", "dusk", "night"] as const;

describe("hourToTod", () => {
	it("is total over 0..23 (fast-check property)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 23 }), (h) => TOD_VALUES.includes(hourToTod(h))),
		);
	});

	it.each([
		[0, "night"],
		[4, "night"],
		[5, "dawn"],
		[7, "dawn"],
		[8, "day"],
		[16, "day"],
		[17, "dusk"],
		[19, "dusk"],
		[20, "night"],
		[23, "night"],
	] as const)("hourToTod(%i) === %s", (h, expected) => {
		expect(hourToTod(h)).toBe(expected);
	});
});
