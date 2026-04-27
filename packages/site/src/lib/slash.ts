/**
 * Slash-page navigation helpers.
 *
 * Why: `/stats/` lives next to `/now /uses /colophon /tops` in the cross-link
 * footer but its content origin is the `stats` collection (JSON), not the
 * `slash` collection (MDX). To keep the footer's one source of truth, we
 * hard-list the 5 routes here rather than calling `getCollection("slash")`
 * (which would miss /stats) at every render.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (Static slash pages)
 */

/** Stable, type-checked list of slash-page identifiers in display order. */
export const SLASH_PAGES = [
	{ id: "now", title: "Now", href: "/now/" },
	{ id: "uses", title: "Uses", href: "/uses/" },
	{ id: "colophon", title: "Colophon", href: "/colophon/" },
	{ id: "tops", title: "Tops", href: "/tops/" },
	{ id: "stats", title: "Stats", href: "/stats/" },
] as const;

/**
 * Union of valid slash-page id strings, derived from `SLASH_PAGES`.
 *
 * Why: consumed by `_SlashLayout` Props to enforce id is one of the 5 known
 * slash routes at compile time.
 *
 * @public
 * @see packages/specs/plans/04-slash-pages.md § Task 3 (_SlashLayout)
 */
export type SlashPageId = (typeof SLASH_PAGES)[number]["id"];

/**
 * Returns the cross-link list to render on a given slash page — i.e. all
 * `SLASH_PAGES` *except* the current one. If the caller passes an unknown
 * id, returns `SLASH_PAGES` unchanged (there is nothing to filter).
 *
 * Why: defensive on bad input — caller is the layout, which trusts the
 * page's `entry.id`. A typo at the page level shouldn't blank the footer.
 */
export function slashSiblings(currentId: string) {
	return SLASH_PAGES.filter((p) => p.id !== currentId);
}
