/**
 * Slug + href rules for the digital garden. Single source of truth — used by
 * the remark plugin (Task 4), build-garden-data script (Task 7), and the
 * GraphView island (Task 11).
 * Why: github-slugger v2 is a direct devDep — Bun's isolated install model
 * does not surface transitives via `import.meta.resolve`, so the dep can't
 * be reached transitively via Astro even though it appears in bun.lock.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
import { slug as slugify } from "github-slugger";

/**
 * Convert a free-form note title to its canonical slug.
 * Why: The named `slug` export is the stateless variant — github-slugger's
 * class form tracks dedup suffixes (foo, foo-1, foo-2) which we don't want
 * for independent title→slug mapping.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export function noteSlug(title: string): string {
	// The named `slug` export is the stateless variant — github-slugger's
	// class form tracks dedup suffixes (foo, foo-1, foo-2) which we don't want
	// for independent title→slug mapping.
	return slugify(title.trim());
}

/**
 * Canonical href for a slug.
 * Why: Trailing slash matches the site-wide trailingSlash:"always" config.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export function noteHref(slug: string): string {
	return `/garden/${slug}/`;
}
