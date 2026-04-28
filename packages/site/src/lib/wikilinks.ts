/**
 * Slug + href rules for the digital garden. Single source of truth — used by
 * the remark plugin (Task 4), build-garden-data script (Task 7), and the
 * GraphView island (Task 11).
 * Why: github-slugger is already a transitive dep via Astro 6 +
 * @astrojs/markdown-remark@7 (verified bun.lock 2026-04-27).
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
import GithubSlugger from "github-slugger";

/**
 * Convert a free-form note title to its canonical slug.
 * Why: A new slugger per call is intentional — github-slugger's instance state
 * tracks dedup suffixes (foo, foo-1, foo-2). For our use case (independent
 * title→slug mapping, not collision-aware) we want a fresh instance every time.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export function noteSlug(title: string): string {
	return new GithubSlugger().slug(title.trim());
}

/**
 * Canonical href for a slug.
 * Why: Trailing slash matches the site-wide trailingSlash:"always" config.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export function noteHref(slug: string): string {
	return `/garden/${slug}/`;
}
