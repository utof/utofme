/**
 * RSS feed helpers — shared between firehose, works-only, and garden-only endpoints.
 *
 * Why: one source of truth for item shape + island-stripping keeps the three
 * feed endpoint files thin and mutation-testable via Stryker.
 *
 * @see https://github.com/withastro/docs/blob/main/src/content/docs/en/recipes/rss.mdx
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
import type { CollectionEntry } from "astro:content";
import { parseHTML } from "linkedom";

const ISLAND_PLACEHOLDER = "[interactive: open the original page]";

/**
 * Replace every `<astro-island>` element with a textual placeholder.
 *
 * Why: RSS readers cannot execute Astro islands. `linkedom` (not a regex) is
 * used because `<astro-island>` attribute values may contain literal `>`
 * characters in JSON-encoded props (e.g. Phase 3 SandboxIsland props), which
 * would break a naive `<astro-island[^>]*>…</astro-island>` regex.
 *
 * @see packages/specs/specs/06-indieweb.md § Architecture (Content stripping)
 */
export function stripIslands(html: string): string {
	// parseHTML('<body>…</body>') makes the <body> element the documentElement,
	// not document.body — so we read innerHTML from documentElement, not body.
	const { document } = parseHTML(`<body>${html}</body>`);
	for (const el of document.querySelectorAll("astro-island")) {
		el.replaceWith(document.createTextNode(ISLAND_PLACEHOLDER));
	}
	return document.documentElement.innerHTML;
}

/**
 * Discriminates the two feed source collections.
 * Why: carried through `toRssItem` to guard the `date` vs `created` field branch.
 */
export type FeedKind = "works" | "notes";

/**
 * Minimal shape of an RSS item returned by `toRssItem`.
 * Why: typed return lets callers (feed endpoints) pass items directly to `rss()`.
 * @see https://github.com/withastro/docs/blob/main/src/content/docs/en/recipes/rss.mdx
 */
export type FeedItem = {
	title: string;
	link: string;
	pubDate: Date;
	description: string;
};

/**
 * Build an RSS item from a content-collection entry.
 *
 * Why: centralised here so all three feed endpoints (`/feed.xml`,
 * `/feed/works.xml`, `/feed/garden.xml`) share identical item shapes and the
 * `date` vs `created` field distinction is a single, Stryker-targetable branch.
 * Guards on `kind` so the two disjoint collection types can't be confused.
 *
 * - Works schema uses `data.date` (src/content.config.ts line 36).
 * - Notes schema uses `data.created` (src/content.config.ts line 171).
 * - Uses `entry.collection` narrowing (literal string type) to avoid unsafe casts.
 *
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
export function toRssItem(
	entry: CollectionEntry<"works"> | CollectionEntry<"notes">,
	kind: FeedKind,
	_site: string,
): FeedItem {
	const segment = kind === "works" ? "works" : "garden";
	const link = `/${segment}/${entry.id}/`;

	// Narrow via `entry.collection` (a literal type on both union members) to access
	// the correct date field without unsafe `as` casts:
	// - works: `data.date` (content.config.ts:36)
	// - notes: `data.created` (content.config.ts:171)
	let pubDate: Date;
	if (entry.collection === "works") {
		pubDate = new Date(entry.data.date);
	} else {
		pubDate = new Date(entry.data.created);
	}

	// Prefer `summary` (both schemas have `summary?: string`) over title.
	const description = entry.data.summary ?? entry.data.title;

	return {
		title: entry.data.title,
		link,
		pubDate,
		description,
	};
}
