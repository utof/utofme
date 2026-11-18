/**
 * Home page curation: the editorial choices of `/`.
 *
 * Why: which project is the hero, which ones are highlighted and which layout
 * draws the page are decisions, not code. Edit the strings here; slugs are the
 * file names in `src/content/works/` without the extension. An unknown slug fails
 * the build with a message that names it.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 * @see packages/site/src/components/home/README.md
 */
import type { HomeCuration } from "../lib/home/model";

/**
 * The curation the home page is built from.
 *
 * Why: one object so swapping the hero is a one-string change.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export const HOME = {
	layout: "catalogue",
	hero: "tactical-arena",
	highlighted: [
		"eeg-ads1299-lab",
		"enth",
		"godot-ctcs",
		"gr-demo-learn",
		"linsae",
		"modified-maxwell-taichi",
	],
	featuredLabel: "Featured",
} as const satisfies HomeCuration;
