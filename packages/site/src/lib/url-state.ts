/**
 * URL-state helpers for the FilterBar island.
 *
 * Why: a single source of truth for reading/writing filter params ensures that
 * FilterBar, the inline filter script, and Pagefind all agree on the URL
 * schema — changes to encoding (e.g. repeated-key tag encoding per ADR 0012)
 * flow through one module and are Stryker-targetable.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2 + ADR 0012 (pending Task 13b)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The filter state serialised into and parsed from the URL search string.
 *
 * Why: a named interface (rather than an inlined record type) lets FilterBar
 * and the inline filter script share the same type without re-declaring it,
 * and makes the Zod-free runtime parse surface explicit.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2
 */
export interface FilterState {
	/** Active type chip. Omitted from canonical URL when undefined. */
	type?: "code" | "video" | "music" | "math" | "writing";
	/** Multi-value via repeated `tag` key. Empty array → key absent from URL. */
	tags: string[];
	/** Default `"date"` — omitted from canonical URL. */
	sort: "date" | "title";
	/** Full-text search query, stored under the `q` key. Omitted when undefined. */
	search?: string;
}

/** Valid `type` values — used to reject unknown strings from URL params. */
const VALID_TYPES = new Set<string>(["code", "video", "music", "math", "writing"]);

/** Valid `sort` values. */
const VALID_SORTS = new Set<string>(["date", "title"]);

/**
 * Type guard that narrows a `string` to a valid `FilterState["type"]` value.
 *
 * Why: avoids a `as NonNullable<FilterState["type"]>` cast in `readState`,
 * which type-coverage would flag as an untyped node.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2
 */
function isValidType(v: string): v is NonNullable<FilterState["type"]> {
	return VALID_TYPES.has(v);
}

/**
 * Type guard that narrows a `string` to a valid `FilterState["sort"]` value.
 *
 * Why: avoids a `as "date" | "title"` cast in `readState`.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2
 */
function isValidSort(v: string): v is FilterState["sort"] {
	return VALID_SORTS.has(v);
}

// ---------------------------------------------------------------------------
// canonicalize
// ---------------------------------------------------------------------------

/**
 * Converts a `FilterState` into a `URLSearchParams` with defaults omitted.
 *
 * Why: centralised here so both `writeState` and callers building hrefs use
 * identical encoding — avoids the "caller forgets to sort tags" class of
 * mutation survivors.
 *
 * Encoding rules (per ADR 0012):
 * - `type` omitted when `undefined`.
 * - `tag` entries written as repeated keys sorted alphabetically; key absent
 *   entirely when `tags` is empty.
 * - `sort` omitted when equal to the default `"date"`.
 * - `q` omitted when `search` is `undefined`.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2 + ADR 0012 (pending Task 13b)
 */
export function canonicalize(state: FilterState): URLSearchParams {
	const params = new URLSearchParams();
	if (state.type !== undefined) {
		params.set("type", state.type);
	}
	// Tags: sort alphabetically, write as repeated key
	const sortedTags = [...state.tags].sort();
	for (const tag of sortedTags) {
		params.append("tag", tag);
	}
	if (state.sort !== "date") {
		params.set("sort", state.sort);
	}
	if (state.search !== undefined) {
		params.set("q", state.search);
	}
	return params;
}

// ---------------------------------------------------------------------------
// readState
// ---------------------------------------------------------------------------

/**
 * Parses a `FilterState` from a URL (or search string).
 *
 * Why: decoupled from `window.location` so unit tests can pass any URL string
 * without DOM setup, and so server-side Astro pages (e.g. `/search`) can call
 * it with `Astro.url` at request time.
 *
 * @param url — optional URL or search string; defaults to `window.location.search`.
 * @see packages/specs/plans/02-interactivity.md § Task 2
 */
export function readState(url?: URL | string): FilterState {
	let search: string;
	if (url === undefined) {
		// In a DOM environment, fall back to the live location.
		search = typeof window !== "undefined" ? window.location.search : "";
	} else if (typeof url === "string") {
		// Accept bare `?key=val` or a full URL string.
		const q = url.indexOf("?");
		search = q === -1 ? url : url.slice(q);
	} else {
		search = url.search;
	}

	const params = new URLSearchParams(search);

	const rawType = params.get("type");
	const resolvedType = rawType !== null && isValidType(rawType) ? rawType : undefined;

	const rawSort = params.get("sort");
	const sort: FilterState["sort"] = rawSort !== null && isValidSort(rawSort) ? rawSort : "date";

	const tags = params.getAll("tag").filter((t) => t.length > 0);

	const rawSearch = params.get("q");
	const resolvedSearch = rawSearch !== null && rawSearch.length > 0 ? rawSearch : undefined;

	// Why: construct the result without optional keys set to `undefined` so that
	// TypeScript's `exactOptionalPropertyTypes` constraint is satisfied — the
	// type `FilterState` declares `type?` and `search?` as absent-or-value, not
	// absent-or-value-or-undefined.
	const result: FilterState = { tags, sort };
	if (resolvedType !== undefined) result.type = resolvedType;
	if (resolvedSearch !== undefined) result.search = resolvedSearch;
	return result;
}

// ---------------------------------------------------------------------------
// writeState
// ---------------------------------------------------------------------------

/**
 * Serialises a partial `FilterState` into the current URL via
 * `history.replaceState`, merging with the existing state.
 *
 * **Client-only.** Throws if called from SSR or build-time code paths.
 * Why: `history.replaceState` and `location.pathname` are browser-only APIs;
 * calling them server-side throws a `ReferenceError` that is hard to diagnose.
 * Fail fast with a clear message instead.
 *
 * After updating the URL, dispatches a `urlstate:change` CustomEvent so that
 * `subscribe` listeners fire immediately — `history.replaceState` does NOT
 * natively fire `popstate` (per HTML spec).
 *
 * Internally uses `canonicalize` so default values are always omitted and
 * tags are always sorted — no duplication of encoding logic.
 *
 * Why: uses `replaceState` (not `pushState`) so filter changes do not pollute
 * the browser's back-stack — a back-button should return to the previous
 * *page*, not to a prior filter combination on the same page.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2 + ADR 0012 (pending Task 13b)
 */
export function writeState(state: Partial<FilterState>): void {
	if (typeof window === "undefined") {
		throw new Error("writeState is client-only; do not call from SSR/build-time code paths.");
	}
	// Merge with current state so partial writes don't erase unrelated params.
	const current = readState();
	// Why: use imperative assignment to avoid explicitly setting optional properties
	// to `undefined`, which TypeScript's `exactOptionalPropertyTypes` disallows.
	const merged: FilterState = {
		tags: state.tags ?? current.tags,
		sort: state.sort ?? current.sort,
	};
	// Carry the resolved `type` forward: prefer incoming (if key was explicitly
	// provided with a value), then fall back to current URL state.
	const resolvedType = "type" in state ? state.type : current.type;
	if (resolvedType !== undefined) merged.type = resolvedType;
	const resolvedSearch = "search" in state ? state.search : current.search;
	if (resolvedSearch !== undefined) merged.search = resolvedSearch;

	const qs = canonicalize(merged).toString();
	const url = qs ? `?${qs}` : location.pathname;
	history.replaceState(null, "", url);
	// Why: `history.replaceState` does not fire `popstate` per HTML spec.
	// Dispatch a synthetic event so `subscribe` listeners fire for in-page writes.
	window.dispatchEvent(new CustomEvent("urlstate:change"));
}

// ---------------------------------------------------------------------------
// subscribe
// ---------------------------------------------------------------------------

/**
 * Subscribes `listener` to URL changes from two sources:
 * - `popstate` — fired by the browser on back/forward navigation.
 * - `urlstate:change` — a synthetic CustomEvent dispatched by `writeState`
 *   after every in-page `history.replaceState` call (because `replaceState`
 *   does NOT natively fire `popstate` per the HTML spec).
 *
 * Why: a single `subscribe` call site means FilterBar and any future consumer
 * get teardown-safe subscriptions without each rolling their own
 * `addEventListener` / `removeEventListener` pairing. Listening to both
 * event sources ensures the listener fires for both navigation directions
 * (back/forward) and in-page writes.
 *
 * Returns an unsubscribe function — call it to detach the listener from both
 * event sources.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 2 + ADR 0012 (pending Task 13b)
 */
export function subscribe(listener: (s: FilterState) => void): () => void {
	const handler = () => {
		listener(readState());
	};
	window.addEventListener("popstate", handler);
	window.addEventListener("urlstate:change", handler);
	return () => {
		window.removeEventListener("popstate", handler);
		window.removeEventListener("urlstate:change", handler);
	};
}
