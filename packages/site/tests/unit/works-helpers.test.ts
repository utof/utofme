import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { WorkEntry } from "../../src/content.config";
import {
	type BodyEntry,
	cardHref,
	detailUrl,
	hasBody,
	type IdDataEntry,
} from "../../src/lib/works";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid entry id: lowercase letters, digits and hyphens. */
const idArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z0-9-]+$/).filter((s) => s.length > 0);

/**
 * Arbitrary for a full `WorkEntry` data shape.
 * Why: we need every branch of the discriminated union reachable.
 */
const workEntryDataArb: fc.Arbitrary<WorkEntry> = fc.oneof(
	fc.record({
		type: fc.constant("code" as const),
		repo: fc.option(fc.webUrl(), { nil: undefined }),
		stack: fc.array(fc.string()),
		title: fc.string({ minLength: 1 }),
		slug: fc.option(fc.string(), { nil: undefined }),
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
			nil: undefined,
		}),
		tags: fc.array(fc.string()),
		draft: fc.boolean(),
		summary: fc.option(fc.string(), { nil: undefined }),
		cover: fc.constant(undefined),
	}),
	fc.record({
		type: fc.constant("video" as const),
		duration: fc.integer({ min: 0 }),
		youtube: fc.option(fc.string(), { nil: undefined }),
		title: fc.string({ minLength: 1 }),
		slug: fc.option(fc.string(), { nil: undefined }),
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
			nil: undefined,
		}),
		tags: fc.array(fc.string()),
		draft: fc.boolean(),
		summary: fc.option(fc.string(), { nil: undefined }),
		cover: fc.constant(undefined),
	}),
	fc.record({
		type: fc.constant("music" as const),
		bpm: fc.option(fc.integer({ min: 0 }), { nil: undefined }),
		listen: fc.option(fc.webUrl(), { nil: undefined }),
		title: fc.string({ minLength: 1 }),
		slug: fc.option(fc.string(), { nil: undefined }),
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
			nil: undefined,
		}),
		tags: fc.array(fc.string()),
		draft: fc.boolean(),
		summary: fc.option(fc.string(), { nil: undefined }),
		cover: fc.constant(undefined),
	}),
	fc.record({
		type: fc.constant("math" as const),
		pdf: fc.option(fc.string(), { nil: undefined }),
		arxiv: fc.option(fc.string(), { nil: undefined }),
		title: fc.string({ minLength: 1 }),
		slug: fc.option(fc.string(), { nil: undefined }),
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
			nil: undefined,
		}),
		tags: fc.array(fc.string()),
		draft: fc.boolean(),
		summary: fc.option(fc.string(), { nil: undefined }),
		cover: fc.constant(undefined),
	}),
	fc.record({
		type: fc.constant("writing" as const),
		wordCount: fc.option(fc.integer({ min: 0 }), { nil: undefined }),
		readingTime: fc.option(fc.integer({ min: 0 }), { nil: undefined }),
		title: fc.string({ minLength: 1 }),
		slug: fc.option(fc.string(), { nil: undefined }),
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
			nil: undefined,
		}),
		tags: fc.array(fc.string()),
		draft: fc.boolean(),
		summary: fc.option(fc.string(), { nil: undefined }),
		cover: fc.constant(undefined),
	}),
);

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("detailUrl", () => {
	// Property 1: round-trip — slice off the `/works/` prefix and trailing `/`
	// gives back the original id.
	test.prop([idArb])("round-trip: detailUrl(entry).slice(7,-1) === entry.id", (id) => {
		const entry: Pick<IdDataEntry, "id"> = { id };
		const url = detailUrl(entry);
		expect(url.slice(7, -1)).toBe(id);
	});
});

describe("hasBody", () => {
	// Property 2: for any string s, hasBody returns true iff s.trim().length > 0.
	// Why: fc.string() generates empty strings, whitespace, unicode — all covered.
	test.prop([fc.string()])("hasBody(entry) === (s.trim().length > 0)", (s) => {
		const entry: BodyEntry = { body: s };
		expect(hasBody(entry)).toBe(s.trim().length > 0);
	});
});

describe("cardHref", () => {
	// Property 3a: hasBody=true → href starts with /works/
	test.prop([idArb, workEntryDataArb, fc.string({ minLength: 1 })])(
		"hasBody=true → href starts with /works/",
		(id, data, bodyContent) => {
			// Force body to be non-empty (not just whitespace)
			const body = `x${bodyContent.trim()}x`;
			const entry: IdDataEntry = { id, data, body };
			expect(cardHref(entry).startsWith("/works/")).toBe(true);
		},
	);

	// Property 3b: !hasBody && no externalUrl → href === ""
	test.prop([
		idArb,
		// writing type has no external url fields
		fc.record({
			type: fc.constant("writing" as const),
			wordCount: fc.option(fc.integer({ min: 0 }), { nil: undefined }),
			readingTime: fc.option(fc.integer({ min: 0 }), { nil: undefined }),
			title: fc.string({ minLength: 1 }),
			slug: fc.option(fc.string(), { nil: undefined }),
			date: fc
				.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
				.filter((d) => !Number.isNaN(d.getTime())),
			updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
				nil: undefined,
			}),
			tags: fc.array(fc.string()),
			draft: fc.boolean(),
			summary: fc.option(fc.string(), { nil: undefined }),
			cover: fc.constant(undefined),
		}) as fc.Arbitrary<WorkEntry>,
	])("!hasBody && writing (no external url) → href === ''", (id, data) => {
		const entry: IdDataEntry = { id, data, body: "" };
		expect(cardHref(entry)).toBe("");
	});

	// Property 3c: !hasBody && externalUrl exists → href === externalUrl
	// Why: using a typed local record to avoid unsafe type casts on the assertion.
	const codeWithRepoArb: fc.Arbitrary<Extract<WorkEntry, { type: "code" }>> = fc.record({
		type: fc.constant("code" as const),
		repo: fc.webUrl(),
		stack: fc.array(fc.string()),
		title: fc.string({ minLength: 1 }),
		slug: fc.option(fc.string(), { nil: undefined }),
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		updated: fc.option(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }), {
			nil: undefined,
		}),
		tags: fc.array(fc.string()),
		draft: fc.boolean(),
		summary: fc.option(fc.string(), { nil: undefined }),
		cover: fc.constant(undefined),
	});
	test.prop([idArb, codeWithRepoArb])(
		"!hasBody && code with repo → href === repo url",
		(id, data) => {
			const entry: IdDataEntry = { id, data, body: "" };
			expect(cardHref(entry)).toBe(data.repo);
		},
	);
});

// ---------------------------------------------------------------------------
// Deterministic cases
// ---------------------------------------------------------------------------

describe("cardHref (deterministic)", () => {
	const baseData = {
		title: "Test",
		date: new Date("2026-01-01"),
		tags: [],
		draft: false,
		stack: [],
	};

	// Deterministic 1: code entry with repo, empty body → repo url
	it('D1: code + repo + empty body → "https://x"', () => {
		const entry: IdDataEntry = {
			id: "test-entry",
			data: { type: "code", repo: "https://x", ...baseData },
			body: "",
		};
		expect(cardHref(entry)).toBe("https://x");
	});

	// Deterministic 2: writing entry with body → /works/<id>/
	it("D2: writing + body → /works/<id>/", () => {
		const entry: IdDataEntry = {
			id: "test-entry",
			data: { type: "writing", ...baseData },
			body: "hello",
		};
		expect(cardHref(entry)).toBe("/works/test-entry/");
	});

	// Deterministic 3: writing entry, empty body → ""
	it('D3: writing + empty body → ""', () => {
		const entry: IdDataEntry = {
			id: "test-entry",
			data: { type: "writing", ...baseData },
			body: "",
		};
		expect(cardHref(entry)).toBe("");
	});

	// Deterministic 4: code entry with repo and body → detailUrl wins
	it("D4: code + repo + body → /works/<id>/ (detailUrl wins)", () => {
		const entry: IdDataEntry = {
			id: "test-entry",
			data: { type: "code", repo: "https://x", ...baseData },
			body: "hello",
		};
		expect(cardHref(entry)).toBe("/works/test-entry/");
	});
});
