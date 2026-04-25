/**
 * Typed query helpers for the `works` content collection.
 *
 * Why: `index.astro` and `works/index.astro` both consume sorted, draft-filtered
 * lists; centralizing the logic here keeps the schema's discriminated-union
 * narrowing intact and makes the helpers Stryker-targetable.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § lib/works.ts
 */
import type { WorkEntry } from "../content.config";

/**
 * Minimal shape of a content-collection entry consumed by these helpers.
 *
 * Why: using a structural constraint instead of the full CollectionEntry type
 * keeps the helpers testable with plain objects and decoupled from Astro's
 * virtual module. D defaults to WorkEntry for production callers.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § lib/works.ts
 */
export type EntryLike<D extends { date: Date; draft?: boolean } = WorkEntry> = {
	readonly id: string;
	readonly data: D;
};

/**
 * Returns a new array sorted by `data.date` descending. Stable for equal dates.
 *
 * Why: Phase 1 home grid lists work newest-first; centralized so Stryker can
 * mutation-test the comparator direction.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Property tests
 */
export function sortByDateDesc<E extends EntryLike<{ date: Date; draft?: boolean }>>(
	entries: readonly E[],
): E[] {
	return [...entries].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/**
 * Options for {@link listWorks}.
 *
 * Why: exporting this interface lets callers type their opts variable without
 * re-deriving the shape from the function signature.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Schema/draft filter
 */
export interface ListWorksOptions {
	/**
	 * When true, entries with `draft: true` are excluded.
	 *
	 * Why: lets tests mock `isProd` without touching `import.meta.env`.
	 * Defaults to `import.meta.env.PROD`.
	 */
	isProd?: boolean;
}

/**
 * Returns sorted, draft-filtered entries.
 *
 * Why: production-only draft hiding is a hard invariant (spec L18); the helper
 * shape lets tests mock `isProd` without touching `import.meta.env`.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Schema/draft filter
 */
export function listWorks<E extends EntryLike<{ date: Date; draft?: boolean }>>(
	entries: readonly E[],
	opts: ListWorksOptions = {},
): E[] {
	const isProd = opts.isProd ?? import.meta.env.PROD;
	const filtered = isProd ? entries.filter((e) => e.data.draft !== true) : [...entries];
	return sortByDateDesc(filtered);
}
