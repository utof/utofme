/**
 * Single gateway to the `works` collection (Astro-only; imports virtual modules).
 *
 * Why: P9-3 hides mock fixtures from the deployed site via the `UTOFME_FIXTURES`
 * env field. Every `getCollection("works")` caller goes through here so no route,
 * feed or search input can leak a fixture by forgetting the filter.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 * @see https://docs.astro.build/en/guides/environment-variables/
 */
import { type CollectionEntry, getCollection } from "astro:content";
import { UTOFME_FIXTURES } from "astro:env/server";

/**
 * Like `getCollection("works", filter)` but drops `fixture: true` entries when
 * `UTOFME_FIXTURES` is false.
 *
 * Why: the only sanctioned way to read works; see module doc.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export function getWorksCollection(
	filter?: (entry: CollectionEntry<"works">) => boolean,
): Promise<CollectionEntry<"works">[]> {
	return getCollection(
		"works",
		(entry) => (UTOFME_FIXTURES || entry.data.fixture !== true) && (filter?.(entry) ?? true),
	);
}
