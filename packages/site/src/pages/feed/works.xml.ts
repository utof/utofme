/**
 * Works-only RSS feed: all published works, sorted by pubDate descending.
 *
 * Why: subscribers who only care about projects/code/writing can follow this
 * feed without the noise of garden notes. No `.slice(0, 30)` cap — the full
 * collection is surfaced so long-running archives stay reachable.
 *
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 * @see packages/specs/plans/06-indieweb.md § Task 2
 */

import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { toRssItem } from "../../lib/feed.ts";

/**
 * Astro GET handler for the works-only RSS feed.
 * Why: mirrors `feed.xml.ts` shape but filters to the "works" collection only
 * and omits the `.slice(0, 30)` cap so the full archive is always present.
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
export const GET: APIRoute = async (context) => {
	const works = await getCollection("works", (e) => e.data.draft !== true);

	const siteStr = context.site?.toString() ?? "https://utof.me/";

	const items = works
		.map((e) => toRssItem(e, "works", siteStr))
		.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

	return rss({
		title: "utof.me — works",
		description: "Recent works from utof.me.",
		site: siteStr,
		items,
		customData: "<language>en</language>",
	});
};
