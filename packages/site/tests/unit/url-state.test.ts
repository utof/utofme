// @vitest-environment happy-dom
/**
 * Property and unit tests for `lib/url-state.ts`.
 *
 * Why: Vitest + fast-check properties guard the round-trip invariant,
 * default-value omission, tag-encoding, and subscribe-fires-on-change.
 * Written in RED before any implementation; confirmed RED then GREEN.
 * The `@vitest-environment happy-dom` directive overrides `environment: "node"`
 * in the Stryker vitest.mutation.config so that DOM APIs (`history`,
 * `window.dispatchEvent`, `PopStateEvent`) are available during mutation runs.
 * @see packages/specs/plans/02-interactivity.md § Task 2
 */
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	canonicalize,
	type FilterState,
	readState,
	subscribe,
	writeState,
} from "../../src/lib/url-state";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Why: a restricted alphabet prevents URL-encoding edge-cases that are not
 * part of the url-state contract (e.g. `%2B` round-tripping via
 * URLSearchParams vs raw `+`).  Real tags will be ASCII-slug strings.
 * Uses `fc.string({ unit: fc.constantFrom(...) })` so fast-check generates
 * only valid slug chars directly — avoids the rejection-loop cost of
 * `.filter()` on arbitrary strings.
 * Declared as a `const` tuple literal so TypeScript infers the non-empty
 * `[string, ...string[]]` type required by `fc.constantFrom` without casting.
 */
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
	"6",
	"7",
	"8",
	"9",
	"-",
] satisfies [string, ...string[]];
const tagCharArb = fc.string({ unit: fc.constantFrom(...SLUG_CHARS), minLength: 1, maxLength: 20 });

const typeArb: fc.Arbitrary<NonNullable<FilterState["type"]> | null> = fc.option(
	fc.constantFrom(
		"code" as const,
		"video" as const,
		"music" as const,
		"math" as const,
		"writing" as const,
	),
	{ nil: null },
);

const sortArb: fc.Arbitrary<FilterState["sort"]> = fc.constantFrom(
	"date" as const,
	"title" as const,
);

const SEARCH_CHARS = [
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
	"6",
	"7",
	"8",
	"9",
	" ",
	"-",
] satisfies [string, ...string[]];
const searchArb: fc.Arbitrary<string | null> = fc.option(
	fc.string({ unit: fc.constantFrom(...SEARCH_CHARS), minLength: 1, maxLength: 40 }),
	{ nil: null },
);

/**
 * Why: we use `null` (not `undefined`) as the `nil` sentinel so that
 * `fc.record` can store the field value without violating TypeScript's
 * `exactOptionalPropertyTypes` constraint — `undefined` assigned to an
 * optional property is rejected by the type checker, but `null` is not.
 * The generator helper `toFilterState` strips `null` back to absent fields.
 */
type RawFilterState = {
	type: NonNullable<FilterState["type"]> | null;
	tags: string[];
	sort: FilterState["sort"];
	search: string | null;
};

const rawFilterStateArb: fc.Arbitrary<RawFilterState> = fc.record({
	type: typeArb,
	tags: fc.array(tagCharArb, { maxLength: 6 }),
	sort: sortArb,
	search: searchArb,
});

/**
 * Converts a `RawFilterState` (with `null` sentinels) into a proper
 * `FilterState` (with absent optional properties).
 *
 * Why: `exactOptionalPropertyTypes` disallows assigning `undefined` to
 * optional property slots; using `null` as the sentinel then stripping it
 * here is the type-safe way to build test fixtures without casts.
 */
function toFilterState(raw: RawFilterState): FilterState {
	const state: FilterState = { tags: raw.tags, sort: raw.sort };
	if (raw.type !== null) state.type = raw.type;
	if (raw.search !== null) state.search = raw.search;
	return state;
}

const filterStateArb: fc.Arbitrary<FilterState> = rawFilterStateArb.map(toFilterState);

// ---------------------------------------------------------------------------
// Reset location between every test so tests are independent
// ---------------------------------------------------------------------------
beforeEach(() => {
	history.replaceState(null, "", "?");
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Property 1: round-trip — canonicalize(readState(url)) ≡ canonicalize(state)
// ---------------------------------------------------------------------------
describe("Property 1: round-trip via canonicalize", () => {
	test.prop([filterStateArb])(
		"canonicalize(readState(canonicalize(s).toString())) ≡ canonicalize(s)",
		(state) => {
			const canonical = canonicalize(state);
			const roundTripped = readState(`?${canonical.toString()}`);
			const canonical2 = canonicalize(roundTripped);
			expect(canonical2.toString()).toBe(canonical.toString());
		},
	);
});

// ---------------------------------------------------------------------------
// Property 2: no-default-leakage — defaults are omitted from the URL
// ---------------------------------------------------------------------------
describe("Property 2: no-default-leakage", () => {
	it("default sort='date' is omitted", () => {
		writeState({ sort: "date" });
		expect(new URLSearchParams(location.search).has("sort")).toBe(false);
	});

	it("empty tags are omitted", () => {
		writeState({ tags: [] });
		expect(new URLSearchParams(location.search).has("tag")).toBe(false);
	});

	it("undefined type is omitted from canonical URL", () => {
		// Don't pass type at all — with exactOptionalPropertyTypes, explicit
		// `undefined` is not assignable to optional `type?` in Partial<FilterState>.
		const params = canonicalize({ tags: [], sort: "date" });
		expect(params.has("type")).toBe(false);
	});

	it("undefined search is omitted from canonical URL", () => {
		const params = canonicalize({ tags: [], sort: "date" });
		expect(params.has("q")).toBe(false);
	});

	test.prop([filterStateArb])("fields equal to defaults produce no corresponding key", (state) => {
		const canonical = canonicalize(state);
		// sort default = "date" → key absent
		if (state.sort === "date") {
			expect(canonical.has("sort")).toBe(false);
		}
		// no type → key absent
		if (state.type === undefined) {
			expect(canonical.has("type")).toBe(false);
		}
		// empty tags → key absent
		if (state.tags.length === 0) {
			expect(canonical.has("tag")).toBe(false);
		}
		// no search → key absent
		if (state.search === undefined) {
			expect(canonical.has("q")).toBe(false);
		}
	});
});

// ---------------------------------------------------------------------------
// Property 3: tag-encoding — repeated-key multiset round-trip
// ---------------------------------------------------------------------------
describe("Property 3: tag-encoding via repeated key", () => {
	test.prop([fc.array(tagCharArb, { maxLength: 6 })])(
		"URLSearchParams.getAll('tag') returns same multiset as input tags",
		(tags) => {
			writeState({ tags });
			const params = new URLSearchParams(location.search);
			const actual = params.getAll("tag").sort();
			const expected = [...tags].sort();
			expect(actual).toEqual(expected);
		},
	);

	it("canonical form: tags are sorted alphabetically", () => {
		const params = canonicalize({ tags: ["zzz", "aaa", "mmm"], sort: "date" });
		const result = params.getAll("tag");
		expect(result).toEqual(["aaa", "mmm", "zzz"]);
	});
});

// ---------------------------------------------------------------------------
// Property 4: subscribe fires on change, NOT on same state
// ---------------------------------------------------------------------------
describe("Property 4: subscribe-fires-on-change", () => {
	it("fires when writeState produces a different URL", () => {
		const listener = vi.fn();
		const unsub = subscribe(listener);
		try {
			// writeState dispatches urlstate:change — listener fires without manual popstate
			writeState({ type: "code" });
			expect(listener).toHaveBeenCalledOnce();
		} finally {
			unsub();
		}
	});

	it("returns a teardown function that stops future fires", () => {
		const listener = vi.fn();
		const unsub = subscribe(listener);
		unsub();
		writeState({ type: "video" });
		window.dispatchEvent(new PopStateEvent("popstate"));
		expect(listener).not.toHaveBeenCalled();
	});

	it("writeState alone (no manual popstate) fires subscriber exactly once via urlstate:change", () => {
		// Why: history.replaceState does not fire popstate per HTML spec.
		// writeState must dispatch the synthetic urlstate:change event so that
		// FilterBar can react to in-page writes without a manual popstate dispatch.
		const listener = vi.fn();
		const unsub = subscribe(listener);
		try {
			writeState({ sort: "title" });
			// No manual popstate dispatch — the CustomEvent from writeState is enough
			expect(listener).toHaveBeenCalledTimes(1);
		} finally {
			unsub();
		}
	});

	it("listener receives a FilterState object with tags array", () => {
		// Why: vi.fn<(s: FilterState) => void>() — Vitest 4.x `fn` takes the full
		// function type as a single type parameter so that `lastCall[0]` is typed
		// as `FilterState` without a cast, satisfying type-coverage 100%.
		const listener = vi.fn<(s: FilterState) => void>();
		const unsub = subscribe(listener);
		try {
			// writeState dispatches urlstate:change — listener fires without manual popstate
			writeState({ tags: ["foo", "bar"] });
			expect(listener).toHaveBeenCalledOnce();
			const firstCall = listener.mock.lastCall;
			expect(firstCall).toBeDefined();
			expect(Array.isArray(firstCall?.[0].tags)).toBe(true);
		} finally {
			unsub();
		}
	});

	test.prop([filterStateArb, filterStateArb])(
		"writing any state triggers subscribe once per popstate event",
		(stateA, stateB) => {
			const canonA = canonicalize(stateA).toString();
			const canonB = canonicalize(stateB).toString();

			// Navigate to stateA first
			history.replaceState(null, "", `?${canonA}`);

			const listener = vi.fn();
			const unsub = subscribe(listener);
			try {
				// Navigate to stateB via popstate
				history.replaceState(null, "", `?${canonB}`);
				window.dispatchEvent(new PopStateEvent("popstate"));
				expect(listener).toHaveBeenCalledTimes(1);
			} finally {
				unsub();
			}
		},
	);
});

// ---------------------------------------------------------------------------
// Additional deterministic unit tests for mutation-killing coverage
// ---------------------------------------------------------------------------
describe("readState deterministic", () => {
	it("parses type from URL", () => {
		const state = readState("?type=video");
		expect(state.type).toBe("video");
	});

	it("parses multiple tags", () => {
		const state = readState("?tag=foo&tag=bar");
		expect(state.tags.sort()).toEqual(["bar", "foo"]);
	});

	it("parses sort=title", () => {
		const state = readState("?sort=title");
		expect(state.sort).toBe("title");
	});

	it("defaults sort to 'date' when absent", () => {
		const state = readState("?");
		expect(state.sort).toBe("date");
	});

	it("parses search from q param", () => {
		const state = readState("?q=hello");
		expect(state.search).toBe("hello");
	});

	it("ignores unknown type values", () => {
		const state = readState("?type=unknown-type-xyz");
		expect(state.type).toBeUndefined();
	});

	it("ignores unknown sort values — falls back to default", () => {
		const state = readState("?sort=random");
		expect(state.sort).toBe("date");
	});
});

describe("writeState deterministic", () => {
	it("writes type=code to the URL", () => {
		writeState({ tags: [], sort: "date", type: "code" });
		const params = new URLSearchParams(location.search);
		expect(params.get("type")).toBe("code");
	});

	it("writes sort=title to the URL", () => {
		writeState({ tags: [], sort: "title" });
		const params = new URLSearchParams(location.search);
		expect(params.get("sort")).toBe("title");
	});

	it("writes multiple tags as repeated key", () => {
		writeState({ tags: ["a", "b"], sort: "date" });
		const params = new URLSearchParams(location.search);
		expect(params.getAll("tag").sort()).toEqual(["a", "b"]);
	});
});
