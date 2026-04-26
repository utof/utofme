/**
 * Entry-filtering helpers for the Phase 2 FilterBar island.
 *
 * Why: decoupling filter logic from the Svelte component makes the predicates
 * Stryker-targetable and lets the no-JS fallback grid import them without
 * pulling in any Svelte runtime.  Sort is intentionally NOT done here — the
 * caller (FilterBar render path) applies `sortByDateDesc` after filtering.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
import type { WorkEntry } from "../content.config";
import type { FilterState } from "./url-state";

// ---------------------------------------------------------------------------
// EntryLike
// ---------------------------------------------------------------------------

/** Minimal data fields accessed by the filter predicates. */
type FilterData = {
	type: WorkEntry["type"];
	tags: string[];
};

/**
 * Minimal shape of a content-collection entry consumed by these helpers.
 *
 * Why: using a structural constraint instead of the full CollectionEntry type
 * keeps the helpers testable with plain objects and decoupled from Astro's
 * virtual module.  D defaults to WorkEntry for production callers.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
export interface EntryLike<D extends FilterData = WorkEntry> {
	data: D;
}

// ---------------------------------------------------------------------------
// filterByType
// ---------------------------------------------------------------------------

/**
 * Returns only entries whose `data.type` equals the given type.
 * When `type` is `undefined`, returns the input array unchanged (pass-through).
 *
 * Why: isolated predicate makes Stryker mutation targets explicit and keeps
 * `applyFilters` readable.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
export function filterByType<D extends FilterData, E extends EntryLike<D>>(
	entries: readonly E[],
	type: FilterState["type"],
): E[] {
	if (type === undefined) return [...entries];
	return entries.filter((e) => e.data.type === type);
}

// ---------------------------------------------------------------------------
// filterByTag
// ---------------------------------------------------------------------------

/**
 * Returns only entries that include **all** of the given tags (AND logic).
 * When `tags` is empty, returns the input array unchanged (pass-through).
 *
 * Why: AND-across-chips is the spec-mandated behaviour; isolated here so
 * Stryker can mutate the `every`/`includes` call independently of the rest
 * of the filter pipeline.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
export function filterByTag<D extends FilterData, E extends EntryLike<D>>(
	entries: readonly E[],
	tags: string[],
): E[] {
	if (tags.length === 0) return [...entries];
	return entries.filter((e) => tags.every((t) => e.data.tags.includes(t)));
}

// ---------------------------------------------------------------------------
// filterBySearch (stub)
// ---------------------------------------------------------------------------

/**
 * No-op stub — returns the input array unchanged.
 *
 * Why: Pagefind owns the `/search` route and full-text search at runtime.
 * The no-JS fallback grid path (not shipped in Phase 2) will wire this when
 * needed.  Exporting the stub now keeps the public API stable across phases.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
export function filterBySearch<D extends FilterData, E extends EntryLike<D>>(
	entries: readonly E[],
	_query: string,
): E[] {
	return [...entries];
}

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

/**
 * Applies all active filter dimensions from `state` to `entries` in sequence:
 * type → tags → search (no-op).  Does NOT sort — sorting is the caller's
 * responsibility.
 *
 * Why: a single composed entry-point makes the FilterBar island and the inline
 * filter script share identical predicate logic with one import, and makes the
 * full pipeline Stryker-targetable as a unit.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 3
 */
export function applyFilters<D extends FilterData, E extends EntryLike<D>>(
	entries: readonly E[],
	state: FilterState,
): E[] {
	return filterBySearch(
		filterByTag(filterByType(entries, state.type), state.tags),
		state.search ?? "",
	);
}
