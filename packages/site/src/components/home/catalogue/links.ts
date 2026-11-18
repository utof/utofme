/**
 * Navigation links of the catalogue home: the header row and the footer.
 *
 * Why: every `href` is a route that exists in `src/pages` (or an external
 * profile), listed in one place so adding a page to the nav is one line.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */

/**
 * One navigation link.
 *
 * Why: shared shape of the header and footer lists.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface NavLink {
	readonly label: string;
	readonly href: string;
}

/**
 * Header nav. Internal links end in `/` (`trailingSlash: "always"`).
 *
 * Why: only pages that exist; the mock's "Articles" and "Lab" have no index route.
 *
 * @see packages/site/src/pages
 */
export const HEADER_LINKS: readonly NavLink[] = [
	{ label: "Garden", href: "/garden/" },
	{ label: "Now", href: "/now/" },
	{ label: "Uses", href: "/uses/" },
	{ label: "Search", href: "/search/" },
	{ label: "GitHub", href: "https://github.com/utof" },
];

/**
 * Footer links.
 *
 * Why: the slash pages the header does not carry, plus the source repository.
 *
 * @see packages/site/src/pages
 */
export const FOOTER_LINKS: readonly NavLink[] = [
	{ label: "Colophon", href: "/colophon/" },
	{ label: "Tops", href: "/tops/" },
	{ label: "Stats", href: "/stats/" },
	{ label: "Source", href: "https://github.com/utof/utofme" },
];
