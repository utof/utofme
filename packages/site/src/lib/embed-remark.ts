/**
 * remark plugin: rewrites Obsidian-style ![[image.png]] /
 * ![[image.png|caption]] tokens into MDX JSX <Picture> elements that
 * consume Astro's astro:assets pipeline. Runs BEFORE the wikilink remark
 * plugin so the wiki-link plugin never sees the embed token (the leading
 * `!` would otherwise drive flowershow's image-embed branch and bypass
 * Astro's <Picture>).
 *
 * Why: keeps image embeds on the same Sharp-driven AVIF/WebP variant
 * pipeline used for /works/ covers (Phase 3). Filenames resolve against
 * `src/content/notes/_assets/` (the sync-vault script copies vault images
 * there).
 *
 * Why an `mdxjsEsm` import node: Astro's MDX integration does not
 * auto-import `<Picture>`; without an `mdxjsEsm` import node the build
 * errors with "Picture is not defined". The import is prepended on the
 * first rewrite and deduplicated against any pre-existing import the
 * note already carries.
 *
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import type { Paragraph, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

const EMBED = /^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const PICTURE_IMPORT_VALUE = 'import { Picture } from "astro:assets";';

/**
 * Local declaration-merge: the `mdast` types in `@types/mdast` don't
 * include the MDX node variants by default — those live in
 * `mdast-util-mdx-jsx` / `mdast-util-mdxjs-esm` (neither installed as
 * a direct dep). Declaration-merging the two node kinds into mdast's
 * `RootContentMap` lets us assign them to `tree.children` slots without
 * `as unknown as` casts, so type-coverage stays 100%. Shapes match the
 * upstream definitions verbatim (verified at index.d.ts of both
 * packages, see file paths in `@see` below).
 * Why: see module docstring.
 * @see node_modules/.bun/mdast-util-mdx-jsx@3.2.0/node_modules/mdast-util-mdx-jsx/index.d.ts
 * @see node_modules/.bun/mdast-util-mdxjs-esm@2.0.1/node_modules/mdast-util-mdxjs-esm/index.d.ts
 */
declare module "mdast" {
	interface MdxJsxAttributeValueExpression {
		type: "mdxJsxAttributeValueExpression";
		value: string;
	}
	interface MdxJsxAttribute {
		type: "mdxJsxAttribute";
		name: string;
		value: MdxJsxAttributeValueExpression | string;
	}
	interface MdxJsxFlowElement {
		type: "mdxJsxFlowElement";
		name: string;
		attributes: MdxJsxAttribute[];
		children: never[];
	}
	interface MdxjsEsm {
		type: "mdxjsEsm";
		value: string;
	}
	interface RootContentMap {
		mdxJsxFlowElement: MdxJsxFlowElement;
		mdxjsEsm: MdxjsEsm;
	}
}

/**
 * True iff the document already carries an `import { Picture } from
 * "astro:assets"` mdxjsEsm node — the user may have written it manually,
 * in which case we must not duplicate it.
 * Why: see module docstring.
 */
function hasPictureImport(root: Root): boolean {
	for (const child of root.children) {
		if (
			child.type === "mdxjsEsm" &&
			child.value.includes('from "astro:assets"') &&
			child.value.includes("Picture")
		) {
			return true;
		}
	}
	return false;
}

/**
 * remark plugin factory. Walks the mdast tree, replaces any paragraph
 * that is a single-line `![[file.ext]]` (or `![[file.ext|caption]]`)
 * embed token with an `mdxJsxFlowElement` named `Picture`, and prepends
 * an `mdxjsEsm` import node on the first rewrite (deduplicated).
 * Why: see module docstring.
 * @see packages/specs/specs/05-garden.md § Architecture (Image embeds)
 */
export const embedRemark: Plugin<[], Root> = function embedRemark() {
	return (tree: Root) => {
		let touchedAny = false;
		visit(tree, "paragraph", (node: Paragraph, index, parent) => {
			if (parent === undefined || parent === null || index === undefined) return;
			if (node.children.length !== 1) return;
			const child = node.children[0];
			if (!child || child.type !== "text") return;
			const text: Text = child;
			const m = text.value.trim().match(EMBED);
			if (!m) return;
			const rawFile = m[1];
			if (rawFile === undefined) return;
			const file = rawFile.trim();
			if (!IMG_EXT.test(file)) return;
			const caption = (m[2] ?? "").trim();
			touchedAny = true;
			parent.children[index] = {
				type: "mdxJsxFlowElement",
				name: "Picture",
				attributes: [
					{ type: "mdxJsxAttribute", name: "src", value: `./_assets/${file}` },
					{ type: "mdxJsxAttribute", name: "alt", value: caption },
					{
						type: "mdxJsxAttribute",
						name: "formats",
						value: { type: "mdxJsxAttributeValueExpression", value: "['avif','webp']" },
					},
				],
				children: [],
			};
		});
		if (touchedAny && !hasPictureImport(tree)) {
			tree.children.unshift({ type: "mdxjsEsm", value: PICTURE_IMPORT_VALUE });
		}
	};
};
