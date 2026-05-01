/**
 * Sitemap page filter — excludes non-indexable routes and non-HTML endpoints.
 *
 * Why: extracted from astro.config.mjs so the predicate can be imported by
 * unit tests without spinning up the full Astro config module. Keeps the
 * logic testable and the config readable.
 *
 * Exclusion rules:
 *   - /search or /search/ (exact) — pagefind UI, not content; regex guards
 *     against over-broad substring match that would hit /works/search-engine-design.
 *   - /garden/graph/ — canvas-only route, no crawlable content.
 *   - /stats/ — server-rendered data route, no static permalink.
 *   - *.xml / *.txt — feed, sitemap, robots — not HTML.
 *
 * @see https://github.com/utof/utofme/issues/58
 * @see packages/specs/plans/06-indieweb.md § Task 3
 */
export function sitemapFilter(page: string): boolean {
	// Why: /\/search\/?$/ matches only the exact /search or /search/ route;
	// .includes("/search") would incorrectly exclude /works/search-engine-design
	// or any future route whose path component contains "search" mid-segment.
	return (
		!/\/search\/?$/.test(page) &&
		!page.includes("/garden/graph/") &&
		!page.includes("/stats/") &&
		!page.endsWith(".xml") &&
		!page.endsWith(".txt")
	);
}
