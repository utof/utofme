/**
 * Why: slug rules are the single source of truth for wikilink resolution.
 * Drift between this and the remark plugin would break the entire garden.
 * Property test guards against regressions in unicode / punctuation handling.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */

import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { noteHref, noteSlug } from "../../src/lib/wikilinks";

describe("noteSlug", () => {
	it("matches expected cases", () => {
		expect(noteSlug("Welcome")).toBe("welcome");
		expect(noteSlug("Math Demo")).toBe("math-demo");
		expect(noteSlug("Café au lait")).toBe("café-au-lait"); // github-slugger preserves unicode lowercase
		expect(noteSlug("  spaced  ")).toBe("spaced");
	});

	it("is idempotent on already-slug inputs", () => {
		expect(noteSlug(noteSlug("Math Demo"))).toBe("math-demo");
	});
});

describe("noteHref", () => {
	it("emits the canonical /garden/<slug>/ form", () => {
		expect(noteHref("welcome")).toBe("/garden/welcome/");
	});
});

fcTest.prop([fc.string({ minLength: 1, maxLength: 50 })])(
	"noteSlug round-trip stable for printable ASCII",
	(raw) => {
		// Skip empty-after-slugification inputs (control chars, pure whitespace).
		const first = noteSlug(raw);
		if (first.length === 0) return;
		expect(noteSlug(first)).toBe(first);
	},
);
