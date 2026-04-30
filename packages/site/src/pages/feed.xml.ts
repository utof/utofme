/**
 * Firehose RSS feed: works ∪ notes, sorted by pubDate descending, top 30.
 *
 * Why: a single "firehose" feed lets subscribers follow all site activity
 * without subscribing to per-collection feeds separately. Per-collection feeds
 * (`/feed/works.xml`, `/feed/garden.xml`) are added in Task 2.
 *
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */

import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { toRssItem } from "../lib/feed.ts";

/**
 * Astro GET handler for the firehose RSS feed.
 * Why: Astro static endpoints export a named `GET` function; the route file is
 * `feed.xml.ts` so Astro emits it as `dist/feed.xml` without a trailing slash.
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
export const GET: APIRoute = async (context) => {
	const works = await getCollection("works", (e) => e.data.draft !== true);
	// Notes have no `publish` field — sync-vault gate (ADR 0025) is the publish
	// boundary. Every committed note in src/content/notes/ is publishable.
	// Same predicate as src/lib/notes.ts + src/pages/garden/[slug].astro (no filter).
	const notes = await getCollection("notes");

	const siteStr = context.site?.toString() ?? "https://utof.me/";

	const items = [
		...works.map((e) => toRssItem(e, "works", siteStr)),
		...notes.map((e) => toRssItem(e, "notes", siteStr)),
	]
		.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
		.slice(0, 30);

	return rss({
		title: "utof.me — firehose",
		description: "All works and garden notes from utof.me, newest first.",
		site: siteStr,
		items,
		customData: "<language>en</language>",
	});
};
