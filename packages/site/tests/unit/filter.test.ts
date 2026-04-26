/**
 * Property and unit tests for `lib/filter.ts`.
 *
 * Why: fast-check properties guard the four filter invariants (order-independence,
 * monotonicity, empty/total, idempotence) required by the Phase 2 spec.
 * Written RED before implementation; confirmed RED then GREEN.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { WorkEntry } from "../../src/content.config";
import { applyFilters, filterBySearch, filterByTag, filterByType } from "../../src/lib/filter";
import type { FilterState } from "../../src/lib/url-state";

// ---------------------------------------------------------------------------
// Test-fixture type
// ---------------------------------------------------------------------------

/**
 * Minimal data shape for test entries.
 *
 * Why: only `type` and `tags` are accessed by `applyFilters`; keeping the
 * fixture minimal avoids coupling tests to unrelated schema fields.
 */
type TestData = {
	type: WorkEntry["type"];
	tags: string[];
};

type TestEntry = { id: string; data: TestData };

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const SLUG_CHARS = [
	"a",
	"b",
	"c",
	"d",
	"e",
	"f",
	"g",
	"h",
	"i",
	"j",
	"k",
	"l",
	"m",
	"n",
	"o",
	"p",
	"q",
	"r",
	"s",
	"t",
	"u",
	"v",
	"w",
	"x",
	"y",
	"z",
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
] satisfies [string, ...string[]];

const tagArb = fc.string({ unit: fc.constantFrom(...SLUG_CHARS), minLength: 1, maxLength: 10 });

const typeArb: fc.Arbitrary<WorkEntry["type"]> = fc.constantFrom(
	"code" as const,
	"video" as const,
	"music" as const,
	"math" as const,
	"writing" as const,
);

const entryArb: fc.Arbitrary<TestEntry> = fc.record({
	id: fc.string({ minLength: 1, maxLength: 8 }),
	data: fc.record({
		type: typeArb,
		tags: fc.array(tagArb, { maxLength: 4 }),
	}),
});

/** Arbitrary FilterState — null used as sentinel (stripped in toFilterState). */
type RawFS = {
	type: WorkEntry["type"] | null;
	tags: string[];
	sort: FilterState["sort"];
};

const rawFilterStateArb: fc.Arbitrary<RawFS> = fc.record({
	type: fc.option(typeArb, { nil: null }),
	tags: fc.array(tagArb, { maxLength: 3 }),
	sort: fc.constantFrom("date" as const, "title" as const),
});

function toFS(raw: RawFS): FilterState {
	const s: FilterState = { tags: raw.tags, sort: raw.sort };
	if (raw.type !== null) s.type = raw.type;
	return s;
}

const filterStateArb: fc.Arbitrary<FilterState> = rawFilterStateArb.map(toFS);

/** Arbitrary for a single extra chip — either a type value or a tag string. */
const chipTagArb = tagArb;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Extracts IDs from an entry list, sorted, for multiset comparison. */
function ids(entries: TestEntry[]): string[] {
	return entries.map((e) => e.id).sort();
}

// ---------------------------------------------------------------------------
// Property 1: Order-independence
// ---------------------------------------------------------------------------

describe("Property 1: order-independence", () => {
	test.prop([fc.array(entryArb, { maxLength: 8 }), filterStateArb])(
		"applyFilters(shuffle(xs), s) yields same ids as applyFilters(xs, s)",
		(xs, state) => {
			// Build a reversed permutation — simple, deterministic, always different
			const shuffled = [...xs].reverse();
			const resultOriginal = applyFilters(xs, state);
			const resultShuffled = applyFilters(shuffled, state);
			expect(ids(resultOriginal)).toEqual(ids(resultShuffled));
		},
	);
});

// ---------------------------------------------------------------------------
// Property 2: Monotonicity (adding a tag chip narrows or holds)
// ---------------------------------------------------------------------------

describe("Property 2: monotonicity", () => {
	test.prop([fc.array(entryArb, { maxLength: 8 }), filterStateArb, chipTagArb])(
		"|applyFilters(xs, s + chip)| ≤ |applyFilters(xs, s)|",
		(xs, state, chip) => {
			const base = applyFilters(xs, state);
			// Add one extra tag chip
			const narrower = applyFilters(xs, { ...state, tags: [...state.tags, chip] });
			expect(narrower.length).toBeLessThanOrEqual(base.length);
		},
	);
});

// ---------------------------------------------------------------------------
// Property 3: Empty / total
// ---------------------------------------------------------------------------

describe("Property 3: empty / total", () => {
	test.prop([fc.array(entryArb, { maxLength: 8 })])(
		"applyFilters(xs, ∅) ≡ xs (pass-through with no filter active)",
		(xs) => {
			const emptyState: FilterState = { tags: [], sort: "date" };
			expect(applyFilters(xs, emptyState)).toEqual(xs);
		},
	);

	test.prop([filterStateArb])("applyFilters([], s) ≡ []", (state) => {
		expect(applyFilters([], state)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Property 4: Idempotence
// ---------------------------------------------------------------------------

describe("Property 4: idempotence", () => {
	test.prop([fc.array(entryArb, { maxLength: 8 }), filterStateArb])(
		"applyFilters(applyFilters(xs, s), s) ≡ applyFilters(xs, s)",
		(xs, state) => {
			const once = applyFilters(xs, state);
			const twice = applyFilters(once, state);
			expect(twice).toEqual(once);
		},
	);
});

// ---------------------------------------------------------------------------
// Deterministic unit tests
// ---------------------------------------------------------------------------

describe("filterByType deterministic", () => {
	const codeEntry: TestEntry = { id: "c1", data: { type: "code", tags: [] } };
	const videoEntry: TestEntry = { id: "v1", data: { type: "video", tags: [] } };

	it("filters to matching type only", () => {
		const result = filterByType([codeEntry, videoEntry], "code");
		expect(result).toEqual([codeEntry]);
	});

	it("returns all when type is undefined (pass-through)", () => {
		const result = filterByType([codeEntry, videoEntry], undefined);
		expect(result).toEqual([codeEntry, videoEntry]);
	});
});

describe("filterByTag deterministic", () => {
	const ab: TestEntry = { id: "ab", data: { type: "code", tags: ["a", "b"] } };
	const bc: TestEntry = { id: "bc", data: { type: "code", tags: ["b", "c"] } };
	const none: TestEntry = { id: "none", data: { type: "code", tags: [] } };

	it("AND logic: entry must have all selected tags", () => {
		const result = filterByTag([ab, bc, none], ["a", "b"]);
		expect(result).toEqual([ab]);
	});

	it("single tag: keeps entries that include it", () => {
		const result = filterByTag([ab, bc, none], ["b"]);
		expect(result).toEqual([ab, bc]);
	});

	it("empty tags: pass-through", () => {
		const result = filterByTag([ab, bc, none], []);
		expect(result).toEqual([ab, bc, none]);
	});
});

describe("filterBySearch deterministic", () => {
	const e1: TestEntry = { id: "e1", data: { type: "code", tags: [] } };
	const e2: TestEntry = { id: "e2", data: { type: "video", tags: [] } };

	it("is a no-op stub: returns input unchanged", () => {
		const result = filterBySearch([e1, e2], "anything");
		expect(result).toEqual([e1, e2]);
	});

	it("is a no-op stub with empty query", () => {
		const result = filterBySearch([e1, e2], "");
		expect(result).toEqual([e1, e2]);
	});
});

describe("applyFilters deterministic", () => {
	const codeA: TestEntry = { id: "cA", data: { type: "code", tags: ["a"] } };
	const codeB: TestEntry = { id: "cB", data: { type: "code", tags: ["b"] } };
	const videoA: TestEntry = { id: "vA", data: { type: "video", tags: ["a"] } };

	it("applies type filter", () => {
		const state: FilterState = { type: "code", tags: [], sort: "date" };
		expect(applyFilters([codeA, codeB, videoA], state)).toEqual([codeA, codeB]);
	});

	it("applies tag filter", () => {
		const state: FilterState = { tags: ["a"], sort: "date" };
		expect(applyFilters([codeA, codeB, videoA], state)).toEqual([codeA, videoA]);
	});

	it("applies type + tag together", () => {
		const state: FilterState = { type: "code", tags: ["a"], sort: "date" };
		expect(applyFilters([codeA, codeB, videoA], state)).toEqual([codeA]);
	});

	it("empty state: returns all entries unchanged", () => {
		const state: FilterState = { tags: [], sort: "date" };
		expect(applyFilters([codeA, codeB, videoA], state)).toEqual([codeA, codeB, videoA]);
	});

	it("does not sort — preserves input order", () => {
		const state: FilterState = { tags: [], sort: "date" };
		const result = applyFilters([videoA, codeB, codeA], state);
		expect(result).toEqual([videoA, codeB, codeA]);
	});
});
