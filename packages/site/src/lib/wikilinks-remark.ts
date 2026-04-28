/**
 * Wikilink resolution pipeline.
 * - `wikiLinks`: thin wrapper around @flowershow/remark-wiki-link with our
 *   resolver + class names + data-attribute hooks.
 * - `brokenLinkRehype`: post-remark rehype plugin that rewrites <a> elements
 *   carrying our broken-link class to <span> (drops href), and stamps
 *   `data-target-slug` on resolved <a class="wikilink"> nodes.
 * Why: flowershow emits <a> for both resolved and broken targets; we need
 * <span> for broken so screen readers don't announce them as navigable
 * (and so users don't click into a 404).
 *
 * Note: we use `@flowershow/remark-wiki-link@3.x` (not the older
 * `@portaljs/remark-wiki-link@1.2.0`) because portaljs crashes at runtime
 * against `mdast-util-from-markdown@2.x` (transitive via `remark-parse@11`),
 * and the upstream maintainer (rufuspollock) closed datopian/portaljs#1059
 * noting the package was rebranded to `@flowershow/remark-wiki-link` with
 * the v2 mdast fix. Same author, larger option surface.
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import remarkWikiLink from "@flowershow/remark-wiki-link";
import type { Element, Properties, Root } from "hast";
import type { Processor } from "unified";
import { visit } from "unist-util-visit";
import { noteHref, noteSlug } from "./wikilinks";

interface WikiOptions {
	/**
	 * Why: array of known target permalinks (e.g. ["/garden/foo/", ...]) — the
	 * plugin tags each `[[link]]` as resolved iff its computed href appears here;
	 * otherwise it sets `node.data.exists = false` and uses `newClassName`.
	 */
	permalinks: string[];
}

/**
 * remark plugin: resolves [[Title]] / [[Title|alias]] / [[Title#anchor]] using
 * `permalinks` for the resolved/broken split. Resolved links carry
 * class="wikilink"; broken carry class="wikilink wikilink-broken" (the
 * rehype pass below collapses broken to <span class="wikilink-broken">).
 * Why: thin wrapper that fixes our project conventions (class names, slug
 * resolver) while delegating parsing to the upstream plugin. Flowershow's
 * `files` array is the matched-against list; its `urlResolver` receives the
 * matched filePath and returns the href.
 * @see node_modules/@flowershow/remark-wiki-link/README.md
 */
export function wikiLinks(this: Processor, opts: WikiOptions) {
	// permalinks like "/garden/welcome/" → flowershow `files` entries like "welcome".
	// Trailing-slash strip + leading-segment strip so findMatchingFilePath's
	// suffix-match fires against the slug typed in [[Title]] (case-insensitive).
	const files = opts.permalinks.map((p) => p.replace(/^\/garden\//, "").replace(/\/$/, ""));
	// flowershow's attacher uses `this.data()` to register extensions on the
	// surrounding unified processor — call it with the same `this` binding
	// unified gave us (canonical wrapper pattern for unified plugin factories).
	return remarkWikiLink.call(this, {
		files,
		format: "shortestPossible",
		caseInsensitive: true,
		aliasDivider: "|",
		className: "wikilink",
		newClassName: "wikilink-broken",
		urlResolver: ({ filePath }) => noteHref(noteSlug(filePath)),
	});
}

/**
 * rehype plugin: rewrites `<a class="wikilink">` to also carry
 * `data-target-slug` (extracted from href), and rewrites
 * `<a>` containing class `wikilink-broken` to `<span class="wikilink-broken">`
 * (drops href, drops the `wikilink` class).
 * Why: see module-level docstring — broken links must not be navigable.
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
export function brokenLinkRehype() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element) => {
			const classes = readClassList(node.properties);
			if (
				node.tagName === "a" &&
				classes.includes("wikilink") &&
				!classes.includes("wikilink-broken")
			) {
				const href = readHref(node.properties);
				if (href) {
					// /garden/<slug>/ → "<slug>"
					const m = href.match(/^\/garden\/([^/#]+)\/?(?:#.*)?$/);
					if (m && node.properties) node.properties["data-target-slug"] = m[1];
				}
			}
			if (node.tagName === "a" && classes.includes("wikilink-broken")) {
				node.tagName = "span";
				if (node.properties) {
					delete node.properties.href;
					// Collapse to single broken class — the `wikilink` class only marks
					// resolvable nodes in our CSS/data-target-slug logic.
					node.properties.className = ["wikilink-broken"];
				}
			}
		});
	};
}

/**
 * Why: hast's `Properties.className` is `Array<string | number> | string | number | undefined`.
 * We treat each form as a list of class tokens (single-string forms are split on
 * whitespace, since `className: "wikilink wikilink-broken"` is the shape flowershow
 * emits). Numbers are coerced to string, `undefined` yields `[]`.
 * @see https://github.com/syntax-tree/hast#propertyname for the hast property typing.
 */
function readClassList(properties: Properties | undefined): string[] {
	const cn = properties?.className;
	if (Array.isArray(cn)) return cn.map(String);
	if (typeof cn === "string") return cn.split(/\s+/).filter(Boolean);
	if (typeof cn === "number") return [String(cn)];
	return [];
}

/**
 * Why: `properties.href` is hast `PropertyValue` (a wide union); we only care
 * about the string variant when extracting `/garden/<slug>/`. All other forms
 * are treated as absent.
 * @see https://github.com/syntax-tree/hast#propertyvalue
 */
function readHref(properties: Properties | undefined): string | undefined {
	const href = properties?.href;
	return typeof href === "string" ? href : undefined;
}
