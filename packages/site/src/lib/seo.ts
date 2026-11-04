/**
 * Share-metadata helpers: one `<page> · utofme` title template and absolute URLs.
 *
 * Why: titles were hand-written per page ("Garden — utofme", "search · utofme",
 * "Datamosh lab"), and the head carried no `og:*` tags; deriving both from one
 * pure module keeps them consistent and unit-testable without Astro.
 *
 * @see packages/specs/reviews/ui/polish.md (P-11)
 * @see https://ogp.me/
 */

/** Site name; also the whole title of the home page. */
const SITE_NAME = "utofme";

/**
 * Width of every `og:image`, px.
 *
 * Why: 1200x630 is the 1.91:1 size summary_large_image cards expect.
 *
 * @see https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image
 */
export const OG_IMAGE_WIDTH = 1200;
/**
 * Height of every `og:image`, px.
 *
 * Why: see {@link OG_IMAGE_WIDTH}.
 *
 * @see https://ogp.me/#structured
 */
export const OG_IMAGE_HEIGHT = 630;
/**
 * Site default share image, a path under `public/`.
 *
 * Why: pages without a banner still need an og:image; one static card keeps them consistent.
 *
 * @see https://ogp.me/#metadata
 */
export const DEFAULT_OG_IMAGE = "/og-default.png";

const SUFFIX = ` · ${SITE_NAME}`;

/**
 * Document title for a page: `<page> · utofme`, and plain `utofme` for the home page.
 *
 * Why: pages may pass a bare title or one that already carries the suffix; both
 * normalise to the same string so the template cannot double up.
 *
 * @see packages/specs/reviews/ui/polish.md (P-11)
 */
export function pageTitle(title: string): string {
	const bare = title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title;
	const trimmed = bare.trim();
	return trimmed === "" || trimmed === SITE_NAME ? SITE_NAME : `${trimmed}${SUFFIX}`;
}

/**
 * Resolve a path or URL against the site origin.
 *
 * Why: `og:url`, `og:image` and `canonical` must be absolute; `Astro.site` is the origin.
 *
 * @see https://ogp.me/#url
 */
export function absoluteUrl(pathOrUrl: string, site: URL | string): string {
	return new URL(pathOrUrl, site).href;
}
