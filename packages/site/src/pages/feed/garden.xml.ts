/**
 * Garden-only RSS feed: all notes, sorted by pubDate descending.
 *
 * Why: subscribers interested only in the digital garden can follow this feed
 * without works entries. No filter callback — notes have no `publish` field;
 * the sync-vault gate (ADR 0025) is the publish boundary so every committed
 * note in src/content/notes/ is publishable.
 *
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 * @see packages/specs/plans/06-indieweb.md § Task 2
 */

import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { toRssItem } from "../../lib/feed.ts";

/**
 * Astro GET handler for the garden-only RSS feed.
 * Why: mirrors `feed.xml.ts` shape but uses the "notes" collection only with
 * no filter callback (ADR 0025 sync-vault gate replaces a `published` flag).
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
export const GET: APIRoute = async (context) => {
	// No filter callback — notes have no `publish` field; ADR 0025 sync-vault
	// gate is the publish boundary. Same predicate as feed.xml.ts line 27.
	const notes = await getCollection("notes");

	const siteStr = context.site?.toString() ?? "https://utof.me/";

	const items = notes
		.map((e) => toRssItem(e, "notes", siteStr))
		.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

	return rss({
		title: "utof.me — garden",
		description: "Garden notes from utof.me.",
		site: siteStr,
		items,
		customData: "<language>en</language>",
	});
};
