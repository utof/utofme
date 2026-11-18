/**
 * Link and data attributes shared by every project element on the catalogue home.
 *
 * Why: the hero, the highlight cards and the rows must agree on where a project
 * links to (the same `cardHref` rule as `Card.astro`, ADR 0011) and on the
 * `data-*` hooks other code reads: `data-type` / `data-tags` (the `/?type=&tag=`
 * filter), `data-fixture` (the deploy guard) and `data-work-slug` (the card →
 * banner morph).
 *
 * @see packages/specs/adrs/0011-card-click-target-strategy.md
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import type { CollectionEntry } from "astro:content";
import type { HomeItem } from "../../../lib/home/model";
import { cardHref } from "../../../lib/works";

/**
 * A home item whose entry is a real works entry.
 *
 * Why: the one alias every catalogue part types its `item` prop with.
 *
 * @see packages/site/src/lib/home/model.ts
 */
export type WorkItem = HomeItem<CollectionEntry<"works">>;

/**
 * What {@link itemLink} returns.
 *
 * Why: named so the parts can type intermediate values.
 *
 * @see packages/specs/adrs/0011-card-click-target-strategy.md
 */
export interface ItemLink {
	/** Detail page, external URL, or `undefined` when the project has nowhere to go. */
	readonly href: string | undefined;
	/** Button text for that link. */
	readonly cta: string;
	/** Attributes for the element that represents the project. */
	readonly data: {
		readonly "data-type": string;
		readonly "data-tags": string;
		readonly "data-fixture": "" | undefined;
	};
}

/**
 * Resolves a project's link, call-to-action text and shared data attributes.
 *
 * Why: see the module doc; one function so the three parts cannot drift.
 *
 * @see packages/site/src/lib/works.ts
 */
export function itemLink(item: WorkItem): ItemLink {
	const { entry } = item;
	const href = cardHref(entry) || undefined;
	const internal = href?.startsWith("/") ?? false;
	return {
		href,
		cta: entry.data.article && internal ? "Read the article" : internal ? "Open project" : "Visit",
		data: {
			"data-type": entry.data.type,
			"data-tags": entry.data.tags.join(","),
			"data-fixture": entry.data.fixture ? "" : undefined,
		},
	};
}
