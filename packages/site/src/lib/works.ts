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

/**
 * Minimal structural type accepted by {@link hasBody} and {@link cardHref}.
 *
 * Why: using a structural type (not `CollectionEntry<"works">`) keeps these
 * helpers testable with plain objects and avoids binding test files to Astro's
 * virtual module. `body?: string` matches `CollectionEntry`'s own shape under
 * `exactOptionalPropertyTypes: true`.
 *
 * @see packages/specs/plans/03-content-pipeline.md § Task 3
 */
export type BodyEntry = { readonly body?: string };

/**
 * Minimal structural type accepted by {@link detailUrl} and {@link cardHref}.
 *
 * Why: same rationale as {@link BodyEntry} — structural decoupling from Astro.
 *
 * @see packages/specs/plans/03-content-pipeline.md § Task 3
 */
export type IdDataEntry = { readonly id: string; readonly body?: string; readonly data: WorkEntry };

/**
 * Returns `true` when the entry has a non-empty body (rendered Markdown/MDX).
 *
 * Why: used by `cardHref` to decide whether a detail page exists for this
 * entry; kept as a named predicate so Stryker can mutation-test the trim check
 * independently of the URL routing logic.
 *
 * @see packages/specs/plans/03-content-pipeline.md § Task 3
 */
export function hasBody(entry: BodyEntry): boolean {
	return typeof entry.body === "string" && entry.body.trim().length > 0;
}

/**
 * Returns the canonical detail-page URL for an entry: `/works/<id>/`.
 *
 * Why: centralising the URL shape here means a future slug migration only
 * touches one file; all callers (Card.astro, sitemap, breadcrumbs) stay stable.
 *
 * @see packages/specs/plans/03-content-pipeline.md § Task 3
 */
export function detailUrl(entry: Pick<IdDataEntry, "id">): string {
	return `/works/${entry.id}/`;
}

/**
 * Returns the primary navigation href for a work card.
 *
 * Priority: detail page (if body exists) → external URL (repo → youtube →
 * listen → arxiv → pdf) → `""` (no link).
 *
 * Why: mirrors the `externalUrlFor` logic in `Card.astro` (ADR 0011) so that
 * this chain is Stryker-targetable. Card.astro retains its own copy until
 * Task 6 removes the duplication.
 *
 * @see packages/specs/adrs/0011-card-click-target-strategy.md
 * @see packages/specs/plans/03-content-pipeline.md § Task 3
 */
export function cardHref(entry: IdDataEntry): string {
	if (hasBody(entry)) return detailUrl(entry);
	const d = entry.data;
	if (d.type === "code" && d.repo) return d.repo;
	if (d.type === "video" && d.youtube) return d.youtube;
	if (d.type === "music" && d.listen) return d.listen;
	if (d.type === "math") return d.arxiv ?? d.pdf ?? "";
	return "";
}
