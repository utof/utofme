/**
 * Unit tests for RSS feed helpers (stripIslands + toRssItem).
 *
 * Why: fixtures are fully-typed objects satisfying CollectionEntry<"works"> and
 * CollectionEntry<"notes"> structurally — no `as never` casts so type-coverage
 * stays at 100%.
 *
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 * @see packages/specs/plans/06-indieweb.md § Task 1 RED
 * @see packages/specs/plans/06-indieweb.md § Task 2 RED
 */
import type { CollectionEntry } from "astro:content";
import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { stripIslands, toRssItem } from "../../src/lib/feed.ts";

// ---------------------------------------------------------------------------
// stripIslands
// ---------------------------------------------------------------------------

describe("stripIslands", () => {
	it("replaces <astro-island> with placeholder", () => {
		const html = `<p>before</p><astro-island uid="abc" props='{"x":">"}'><div>fallback</div></astro-island><p>after</p>`;
		const out = stripIslands(html);
		expect(out).not.toMatch(/<astro-island/);
		expect(out).toMatch(/\[interactive: open the original page\]/);
		expect(out).toMatch(/<p>before<\/p>/);
		expect(out).toMatch(/<p>after<\/p>/);
	});

	it("handles attribute values containing literal '>'", () => {
		// The exact case a regex stripper would mishandle.
		const html = `<astro-island props='{"k":">"}'></astro-island>`;
		const out = stripIslands(html);
		expect(out).toBe("[interactive: open the original page]");
	});

	it("is idempotent", () => {
		const html = `<astro-island>x</astro-island>`;
		expect(stripIslands(stripIslands(html))).toBe(stripIslands(html));
	});
});

// ---------------------------------------------------------------------------
// stripIslands — fast-check property tests (Task 2)
// ---------------------------------------------------------------------------

/**
 * Property tests for `stripIslands` against arbitrary string inputs.
 * Why: unit fixtures cover known HTML; property tests guard against edge cases
 * in linkedom's HTML parser (e.g. null bytes, non-BMP chars, lone surrogates).
 * @see packages/specs/plans/06-indieweb.md § Task 2 RED
 */
fcTest.prop([fc.string()])("stripIslands never throws on arbitrary input", (s) => {
	expect(() => stripIslands(s)).not.toThrow();
});

fcTest.prop([fc.string()])("stripIslands output never contains <astro-island", (s) => {
	const wrapped = `<astro-island>${s}</astro-island>`;
	const out = stripIslands(wrapped);
	expect(out).not.toMatch(/<astro-island/i);
});

// ---------------------------------------------------------------------------
// toRssItem
// ---------------------------------------------------------------------------

/**
 * Minimal works fixture — structurally satisfies CollectionEntry<"works">
 * (all required fields filled; no `as never` to keep type-coverage at 100%).
 * Why: 100% type-coverage gate (CLAUDE.md precommit step 4).
 */
const fakeWork = {
	id: "code-2",
	collection: "works",
	data: {
		type: "code",
		title: "Code 2",
		date: new Date("2026-01-01"),
		updated: undefined,
		tags: [],
		draft: false,
		summary: undefined,
		cover: undefined,
		stack: ["TypeScript"],
		repo: undefined,
	},
} satisfies CollectionEntry<"works">;

/**
 * Minimal notes fixture — structurally satisfies CollectionEntry<"notes">.
 */
const fakeNote = {
	id: "welcome",
	collection: "notes",
	data: {
		title: "Welcome",
		created: new Date("2026-02-15"),
		updated: undefined,
		tags: [],
		math: false,
		summary: undefined,
	},
} satisfies CollectionEntry<"notes">;

describe("toRssItem", () => {
	it("emits required RSS fields for a works entry (uses data.date, not data.created)", () => {
		// Works schema: src/content.config.ts:36 — `date: z.coerce.date()`.
		// Notes schema: src/content.config.ts:171 — `created: z.coerce.date()`.
		const item = toRssItem(fakeWork, "works", "https://utof.me/");
		expect(item.title).toBe("Code 2");
		expect(item.link).toBe("/works/code-2/");
		expect(item.pubDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		// Regression guard: wrong field name (e.g. `created`) would yield epoch or NaN.
		expect(item.pubDate.getFullYear()).not.toBe(1970);
	});

	it("emits required RSS fields for a notes entry (uses data.created)", () => {
		const item = toRssItem(fakeNote, "notes", "https://utof.me/");
		expect(item.link).toBe("/garden/welcome/");
		expect(item.pubDate.toISOString()).toBe("2026-02-15T00:00:00.000Z");
	});
});
