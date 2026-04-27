/**
 * Why: cross-link footer in _SlashLayout is the third-most-clicked surface
 * after the page title and the body. The helper that drives it must
 * round-trip cleanly: for any of the 5 slash IDs, output is exactly the
 * other 4. fast-check guards the round-trip.
 */

import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SLASH_PAGES, slashSiblings } from "../../src/lib/slash";

const ids = SLASH_PAGES.map((p) => p.id);

describe("slashSiblings", () => {
	it("returns 4 entries when given a known slash id", () => {
		const out = slashSiblings("now");
		expect(out).toHaveLength(4); // 5 total, exclude self → 4 siblings
	});

	it("returns SLASH_PAGES unchanged when given an unknown id", () => {
		const out = slashSiblings("nope");
		expect(out).toEqual(SLASH_PAGES);
	});

	test.prop([fc.constantFrom(...ids)])("round-trip — output never contains the input id", (id) => {
		const siblings = slashSiblings(id);
		return siblings.every((s) => s.id !== id);
	});

	test.prop([fc.constantFrom(...ids)])(
		"round-trip — output length is exactly SLASH_PAGES.length - 1",
		(id) => slashSiblings(id).length === SLASH_PAGES.length - 1,
	);
});
