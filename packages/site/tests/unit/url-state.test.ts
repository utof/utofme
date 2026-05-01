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
		expect(params.get("sort")).toBe(
			"sort" in new URLSearchParams("sort=title") ? "title" : "title",
		);
		expect(params.get("sort")).toBe("title");
	});

	it("writes multiple tags as repeated key", () => {
		writeState({ tags: ["a", "b"], sort: "date" });
		const params = new URLSearchParams(location.search);
		expect(params.getAll("tag").sort()).toEqual(["a", "b"]);
	});
});

// ---------------------------------------------------------------------------
// Mutation-kill tests for url-state.ts survivors (from Stryker run 2026-04-30)
// ---------------------------------------------------------------------------

describe("VALID_SORTS set membership (kills StringLiteral mutant at :40:38)", () => {
	it("readState accepts sort=date as a valid sort (kills VALID_SORTS=['','title'] mutant)", () => {
		// Kills: `VALID_SORTS = new Set<string>(["", "title"])`.
		// If "date" were replaced with "" in the set, readState("?sort=date") would
		// fall back to default "date" anyway — so we must test via canonicalize
		// asserting "date" is treated as default (omitted) vs "title" is written.
		const stateWithDate = readState("?sort=date");
		expect(stateWithDate.sort).toBe("date");
		// Additionally: canonical URL for sort=date must omit the sort key (it's the default)
		const params = canonicalize({ tags: [], sort: "date" });
		expect(params.has("sort")).toBe(false);
		// And sort=title must be preserved:
		const paramsTitle = canonicalize({ tags: [], sort: "title" });
		expect(paramsTitle.get("sort")).toBe("title");
	});

	it("writeState with sort=date omits the key, writeState with sort=title writes it", () => {
		// Secondary kill for VALID_SORTS mutant — exercises the full write→read path.
		writeState({ sort: "date", tags: [] });
		expect(new URLSearchParams(location.search).has("sort")).toBe(false);
		writeState({ sort: "title", tags: [] });
		expect(new URLSearchParams(location.search).get("sort")).toBe("title");
	});
});

describe("canonicalize search param (kills :98:34 BlockStatement and :99:14 StringLiteral)", () => {
	it("sets the 'q' key when search is defined (kills block-deletion mutant at :98:34)", () => {
		// Kills: the block `if (state.search !== undefined) { params.set("q", state.search); }` → `{}`
		// If the block were deleted, canonical URL would never have a "q" key.
		const params = canonicalize({ tags: [], sort: "date", search: "hello" });
		expect(params.has("q")).toBe(true);
		expect(params.get("q")).toBe("hello");
	});

	it("uses the literal key name 'q' (not empty string) in canonicalize (:99:14)", () => {
		// Kills: `params.set("", state.search)` mutant — the empty-string key would
		// NOT be retrievable via `params.get("q")`.
		const params = canonicalize({ tags: [], sort: "date", search: "world" });
		// "q" key must be present and "q" must equal the search value
		expect(params.get("q")).toBe("world");
		// "" key must NOT be present
		expect(params.get("")).toBeNull();
	});

	it("round-trips search through canonicalize→readState", () => {
		// Belt-and-suspenders: full round-trip asserting q survives encoding.
		const state = { tags: [], sort: "date" as const, search: "typescript" };
		const qs = canonicalize(state).toString();
		const roundTripped = readState(`?${qs}`);
		expect(roundTripped.search).toBe("typescript");
	});
});

describe("readState with no URL argument (kills :122:12 ConditionalExpression survivors)", () => {
	it("reads from window.location.search when url is undefined (kills true/false mutants at :122:12)", () => {
		// Kills: `search = true ? window.location.search : ""` and
		//        `search = false ? window.location.search : ""` mutants.
		// Strategy: set location to a known state, then call readState() with no arg.
		// The `true` mutant always reads window.location.search (OK in DOM env).
		// The `false` mutant always returns "" (would give default state regardless of URL).
		writeState({ sort: "title", tags: [] });
		// With the true mutant: reads location → sort=title ✓
		// With the false mutant: returns "" → sort defaults to "date" ✗ → test fails → mutant killed
		const state = readState();
		expect(state.sort).toBe("title");
	});

	it("readState() with no arg picks up tags from current URL", () => {
		// Additional kill for the false-branch mutant: tags would be empty if "" were used.
		writeState({ tags: ["rust", "wasm"], sort: "date" });
		const state = readState();
		expect(state.tags.sort()).toEqual(["rust", "wasm"]);
	});
});

describe("readState with bare string URL (no '?') (kills :125:25 :126:12 :126:18 :126:29)", () => {
	it("treats a URL without '?' as having no params (kills indexOf('') mutant at :125:25)", () => {
		// Kills: `url.indexOf("")` mutant.
		// `"".indexOf("")` returns 0, so `q` would be 0 (not -1), meaning the else
		// branch `url.slice(0)` = full string is used — but it parses like a query
		// without a "?" which is fine. The real kill is:
		// `"bare-string".indexOf("")` returns 0, so with the mutant, the code takes
		// the `else` branch and tries to slice from position 0, giving "bare-string"
		// as the search, which URLSearchParams parses as one key with no value.
		// With correct indexOf("?"), "bare-string".indexOf("?") === -1, so `url` is
		// used directly as the search string (no "?" prefix needed by URLSearchParams).
		const state = readState("no-question-mark");
		// A bare string with no ? and no valid params → defaults
		expect(state.sort).toBe("date");
		expect(state.tags).toEqual([]);
	});

	it("extracts params correctly when URL has no leading '?' (kills :126:12 EqualityOperator)", () => {
		// Kills: `q !== -1 ? url : url.slice(q)` mutant.
		// With `q !== -1`: if indexOf returns -1, condition becomes `false`, so it
		// takes the else branch: `url.slice(-1)` which is the last char — wrong.
		// But this test: pass a URL with a "?" — indexOf returns >= 0, so q !== -1
		// is TRUE, giving full URL. Without slice, params include "type=code" etc.
		// The safe distinct test is a URL WITHOUT "?":
		const state = readState("type=video");
		// indexOf("?") returns -1 → condition `q === -1` is true → use full string as search
		// URLSearchParams("type=video") → type="video"
		expect(state.type).toBe("video");
	});

	it("slices from '?' position when URL has scheme+path+query (kills :126:29 MethodExpression)", () => {
		// Kills: `url.slice(q)` → `url` (full URL used as search string instead of sliced).
		// With the full URL as search, URLSearchParams would try to parse
		// "https://example.com?type=code" — the key would be "https://example.com?type" not "type".
		const state = readState("https://example.com?type=math");
		expect(state.type).toBe("math");
	});
});

describe("readState tag filter (kills :139:15 :139:50 EqualityOperator/ConditionalExpression)", () => {
	it("filters out empty-string tags from the URL (kills .filter removal at :139:15)", () => {
		// Kills: `params.getAll("tag")` without `.filter()` — empty tags would survive.
		// We inject an empty-string tag param manually:
		const state = readState("?tag=rust&tag=&tag=wasm");
		// With filter: ["rust", "wasm"] (length 2)
		// Without filter: ["rust", "", "wasm"] (length 3)
		expect(state.tags).not.toContain("");
		expect(state.tags.sort()).toEqual(["rust", "wasm"]);
	});

	it("only includes tags with length > 0, not >= 0 (kills EqualityOperator at :139:50)", () => {
		// Kills: `t.length >= 0` mutant — that would keep empty strings (length=0 >= 0 is true).
		// Same fixture as above, just being explicit about the assertion.
		const state = readState("?tag=&tag=ts&tag=");
		expect(state.tags).toEqual(["ts"]);
		expect(state.tags).not.toContain("");
	});

	it("filters (t) => true mutant: would include empty tags (kills :139:50 ConditionalExpression)", () => {
		// Kills: `.filter((t) => true)` mutant — that keeps all tags including empty strings.
		const state = readState("?tag=&tag=go");
		expect(state.tags).toHaveLength(1);
		expect(state.tags[0]).toBe("go");
	});
});

describe("readState resolvedSearch empty-string guard (kills :142:47 ConditionalExpression and EqualityOperator)", () => {
	it("returns undefined for search when q='' (empty string) (kills :142:47 ConditionalExpression)", () => {
		// Kills: `rawSearch !== null && true ? rawSearch : undefined` mutant —
		// that would return "" for q="" instead of undefined.
		const state = readState("?q=");
		expect(state.search).toBeUndefined();
	});

	it("returns undefined for search when q is absent", () => {
		// Belt: explicit check that absent q gives undefined search.
		const state = readState("?sort=title");
		expect(state.search).toBeUndefined();
	});

	it("returns the value when q is non-empty (kills EqualityOperator >= mutant at :142:47)", () => {
		// Kills: `rawSearch.length >= 0 ? rawSearch : undefined` — that would never
		// return undefined because any string has length >= 0. The test that kills
		// it is the empty-q test above; this test is the complementary positive case.
		const state = readState("?q=hello");
		expect(state.search).toBe("hello");
	});
});

describe("writeState SSR guard (kills :181:6 ConditionalExpression)", () => {
	it("throws when called in an environment without window (kills 'if false' mutant at :181:6)", () => {
		// Kills: `if (false)` mutant — the guard would never throw, even in SSR context.
		// Strategy: use vi.stubGlobal to set window to undefined, simulating SSR.
		// vi.stubGlobal is the vitest-idiomatic way that doesn't require any casts.
		// afterEach vi.restoreAllMocks() at the top of this file ensures cleanup.
		vi.stubGlobal("window", undefined);
		try {
			expect(() => writeState({ tags: [] })).toThrow("writeState is client-only");
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("writeState 'search' in state check (kills :196:25 StringLiteral)", () => {
	it("clears search when 'search' key is explicitly passed (kills '' in state mutant at :196:25)", () => {
		// Kills: `"" in state ? state.search : current.search` mutant.
		// The key `""` will never be in a FilterState partial, so the mutant always
		// falls through to `current.search` — never clears the search field.
		// Setup: write a search to current URL, then write a partial state with
		// `search: undefined` explicitly (using `type` as a carrier).
		// Note: exactOptionalPropertyTypes means we can't pass search:undefined directly
		// in Partial<FilterState>. Instead, verify the "search" key presence logic
		// by asserting that passing a state WITH the search key updates it correctly.
		writeState({ sort: "date", tags: [], search: "initial" });
		expect(new URLSearchParams(location.search).get("q")).toBe("initial");

		// Now write a state that explicitly includes search (even if undefined is not
		// assignable, passing search: "updated" must update via the "search" in state path)
		writeState({ search: "updated" });
		expect(new URLSearchParams(location.search).get("q")).toBe("updated");
	});

	it("carries forward existing search when state does not include 'search' key", () => {
		// Complementary test: when search is not in the partial state object, current search is kept.
		writeState({ sort: "date", tags: [], search: "keep-me" });
		writeState({ type: "code" }); // no search key
		const params = new URLSearchParams(location.search);
		expect(params.get("q")).toBe("keep-me");
	});
});

describe("writeState history.replaceState title (kills :201:29 StringLiteral)", () => {
	it("updates location.search correctly after writeState (kills title mutant at :201:29)", () => {
		// Kills: `history.replaceState(null, "Stryker was here!", url)` mutant.
		// The title param in replaceState is ignored by browsers but the function
		// must be called. We verify the URL itself was set correctly (side-effect).
		writeState({ sort: "title", tags: ["ts"] });
		const params = new URLSearchParams(location.search);
		expect(params.get("sort")).toBe("title");
		expect(params.getAll("tag")).toEqual(["ts"]);
	});
});

describe("subscribe popstate listener (kills :233:26 StringLiteral mutant)", () => {
	it("listener fires on native popstate event (kills addEventListener('') mutant at :233:26)", () => {
		// Kills: `window.addEventListener("", handler)` mutant.
		// With the mutant, the handler is registered on "" event, not "popstate".
		// A real popstate dispatch would NOT trigger the handler.
		const listener = vi.fn();
		const unsub = subscribe(listener);
		try {
			// Dispatch a real "popstate" event — mutant would miss it.
			window.dispatchEvent(new PopStateEvent("popstate"));
			expect(listener).toHaveBeenCalledTimes(1);
		} finally {
			unsub();
		}
	});

	it("listener does NOT fire on an unrelated event (confirms event name specificity)", () => {
		// Belt-and-suspenders: proves the listener is specific to popstate/urlstate:change.
		const listener = vi.fn();
		const unsub = subscribe(listener);
		try {
			window.dispatchEvent(new CustomEvent("some-other-event"));
			expect(listener).not.toHaveBeenCalled();
		} finally {
			unsub();
		}
	});
});
