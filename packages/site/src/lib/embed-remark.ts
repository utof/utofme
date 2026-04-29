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
 * Hand-built ESTree for `import { Picture } from "astro:assets"`. We avoid
 * pulling in acorn (already a transitive but not a direct dep — keeps the
 * inline-fix-gate "no new dep" hard gate clean) by constructing the small
 * fixed shape directly. Frozen and shared across rewrites — none of the
 * downstream consumers mutate.
 * @see node_modules/.bun/mdast-util-mdxjs-esm@2.0.1/node_modules/mdast-util-mdxjs-esm/lib/index.js (uses token.estree)
 */
const PICTURE_IMPORT_ESTREE = Object.freeze({
	type: "Program",
	body: [
		{
			type: "ImportDeclaration",
			specifiers: [
				{
					type: "ImportSpecifier",
					imported: { type: "Identifier", name: "Picture" },
					local: { type: "Identifier", name: "Picture" },
				},
			],
			source: { type: "Literal", value: "astro:assets", raw: '"astro:assets"' },
		},
	],
	sourceType: "module",
	comments: [],
});

/**
 * Hand-built ESTree for the array literal `['avif', 'webp']`. Same
 * rationale as PICTURE_IMPORT_ESTREE — direct construction avoids a new
 * acorn import while staying compatible with hast-util-to-estree's
 * `body[0].expression` lookup.
 * @see node_modules/.bun/hast-util-to-estree@3.1.3/node_modules/hast-util-to-estree/lib/handlers/mdx-jsx-element.js (reads body[0].expression)
 */
const FORMATS_ESTREE = Object.freeze({
	type: "Program",
	body: [
		{
			type: "ExpressionStatement",
			expression: {
				type: "ArrayExpression",
				elements: [
					{ type: "Literal", value: "avif", raw: "'avif'" },
					{ type: "Literal", value: "webp", raw: "'webp'" },
				],
			},
		},
	],
	sourceType: "module",
	comments: [],
});

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
	/**
	 * Why: hast-util-to-estree (used by @mdx-js/mdx during compile) reads
	 * `value.data.estree.body[0].expression` to materialise the JSX
	 * attribute expression at output time; without `data.estree` the
	 * compiled JSX has an empty attribute (line 30 of the compiled file
	 * reads `formats:` followed by nothing), which Rollup then fails to
	 * parse with "Expression expected". The estree shape is
	 * `Program → ExpressionStatement → ArrayExpression(Literal,Literal)`.
	 * Verified at hast-util-to-estree@3.1.3 lib/handlers/mdx-jsx-element.js:62.
	 * Untyped beyond a thin marker because we never read it back; the
	 * downstream compiler treats it as opaque ESTree.
	 */
	interface MdxJsxAttributeValueExpression {
		type: "mdxJsxAttributeValueExpression";
		value: string;
		data?: { estree?: unknown };
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
	/**
	 * Why: mdast-util-mdxjs-esm exit-handler stores the parsed ESTree of
	 * the import/export statement on `data.estree`; @mdx-js/mdx's
	 * recma-document.js reads it back during compile to emit real
	 * top-level imports. Without it, our `import { Picture } …` line is
	 * silently dropped from the compiled module — so MDX doesn't know
	 * `Picture` is in-scope and assumes it's a passed-in component prop.
	 * @see node_modules/.bun/mdast-util-mdxjs-esm@2.0.1/node_modules/mdast-util-mdxjs-esm/lib/index.js
	 */
	interface MdxjsEsm {
		type: "mdxjsEsm";
		value: string;
		data?: { estree?: unknown };
	}
	/**
	 * Why: `@flowershow/remark-wiki-link` registers a micromark extension
	 * that tokenises `![[X]]` into an mdast node `{type: "embed", value, data}`
	 * BEFORE any remark plugin (incl. embed-remark) runs. Plugin order is
	 * therefore not enough — embed-remark must also pattern-match this node
	 * shape to keep image embeds on the astro:assets <Picture> pipeline.
	 * Shape verified at:
	 * @see node_modules/@flowershow/remark-wiki-link/dist/index.js (fromMarkdown enterWikiLink: `{type: "embed", value: "", data: {}}`)
	 */
	interface Embed {
		type: "embed";
		value: string;
		data?: { alias?: string };
	}
	interface PhrasingContentMap {
		embed: Embed;
	}
	interface RootContentMap {
		mdxJsxFlowElement: MdxJsxFlowElement;
		mdxjsEsm: MdxjsEsm;
		embed: Embed;
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
 * Sanitise a filename into a JS identifier. e.g. `diagram-2.png` →
 * `_embed_diagram_2_png`. Prefixed with `_embed_` to avoid colliding
 * with any user-authored top-level binding in the same MDX module.
 * Why: Astro's <Picture src=…> demands an imported ImageMetadata,
 * not a string filepath; we synthesise a per-file import binding and
 * reference it by identifier.
 * @see https://docs.astro.build/en/reference/errors/local-image-used-wrongly/
 */
function importIdent(file: string): string {
	return `_embed_${file.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * Build a hand-rolled ESTree `Program` for `import IDENT from "./_assets/FILE"`.
 * Why: same rationale as PICTURE_IMPORT_ESTREE (no acorn dep, fixed shape).
 */
function imageImportEstree(ident: string, file: string): unknown {
	return {
		type: "Program",
		body: [
			{
				type: "ImportDeclaration",
				specifiers: [
					{
						type: "ImportDefaultSpecifier",
						local: { type: "Identifier", name: ident },
					},
				],
				source: {
					type: "Literal",
					value: `./_assets/${file}`,
					raw: `"./_assets/${file}"`,
				},
			},
		],
		sourceType: "module",
		comments: [],
	};
}

/**
 * Build the ESTree wrapper holding a single bare identifier reference
 * (used as the `src={IDENT}` attribute expression on the Picture node).
 */
function identExpressionEstree(ident: string): unknown {
	return {
		type: "Program",
		body: [
			{
				type: "ExpressionStatement",
				expression: { type: "Identifier", name: ident },
			},
		],
		sourceType: "module",
		comments: [],
	};
}

/**
 * Build the `<Picture>` mdxJsxFlowElement for a (caption, ident) pair.
 * The `src` attribute is an mdxJsxAttributeValueExpression whose estree
 * references the identifier `ident` — that identifier must be provided
 * by a sibling top-level `import IDENT from "./_assets/FILE"` mdxjsEsm
 * node (see `embedRemark` below).
 * Why: <Picture> requires ImageMetadata, not a string. See
 * https://docs.astro.build/en/reference/errors/local-image-used-wrongly/.
 * The filename itself is no longer needed here — only the binding name —
 * because the import statement that defines that binding is emitted
 * separately at the tree root.
 */
function pictureNode(caption: string, ident: string): import("mdast").MdxJsxFlowElement {
	return {
		type: "mdxJsxFlowElement",
		name: "Picture",
		attributes: [
			{
				type: "mdxJsxAttribute",
				name: "src",
				value: {
					type: "mdxJsxAttributeValueExpression",
					value: ident,
					data: { estree: identExpressionEstree(ident) },
				},
			},
			{ type: "mdxJsxAttribute", name: "alt", value: caption },
			{
				type: "mdxJsxAttribute",
				name: "formats",
				value: {
					type: "mdxJsxAttributeValueExpression",
					value: "['avif','webp']",
					data: { estree: FORMATS_ESTREE },
				},
			},
		],
		children: [],
	};
}

/**
 * remark plugin factory. Walks the mdast tree, replaces any paragraph
 * that is a single-line `![[file.ext]]` (or `![[file.ext|caption]]`)
 * embed token with an `mdxJsxFlowElement` named `Picture`, and prepends
 * an `mdxjsEsm` import node on the first rewrite (deduplicated).
 *
 * Two AST shapes are handled. The plain text-node shape is what
 * `remark-parse` alone produces (relevant for unit tests + any pipeline
 * that omits flowershow). The `embed`-node shape is what flowershow's
 * micromark extension produces inside the real Astro pipeline — that
 * tokenisation happens at `parse()` time so plugin-order alone (embed
 * before wikilinks) is insufficient; we must also match the post-parse
 * `embed` mdast node.
 * Why: see module docstring.
 * @see node_modules/@flowershow/remark-wiki-link/dist/index.js (micromarkExtensions registration via this.data())
 * @see packages/specs/specs/05-garden.md § Architecture (Image embeds)
 */
export const embedRemark: Plugin<[], Root> = function embedRemark() {
	return (tree: Root) => {
		const imports = new Map<string, string>(); // file → ident (deduped)
		visit(tree, "paragraph", (node: Paragraph, index, parent) => {
			if (parent === undefined || parent === null || index === undefined) return;
			if (node.children.length !== 1) return;
			const child = node.children[0];
			if (!child) return;
			let file = "";
			let caption = "";
			if (child.type === "text") {
				const text: Text = child;
				const m = text.value.trim().match(EMBED);
				if (!m) return;
				const rawFile = m[1];
				if (rawFile === undefined) return;
				file = rawFile.trim();
				caption = (m[2] ?? "").trim();
			} else if (child.type === "embed") {
				file = child.value.trim();
				caption = (child.data?.alias ?? "").trim();
			} else {
				return;
			}
			if (!IMG_EXT.test(file)) return;
			const ident = imports.get(file) ?? importIdent(file);
			imports.set(file, ident);
			parent.children[index] = pictureNode(caption, ident);
		});
		if (imports.size === 0) return;
		// Prepend image imports first, then Picture import on top — ordering is
		// cosmetic to MDX/Rollup, but keeping `Picture` adjacent to the JSX
		// makes the compiled module easier to read when debugging.
		for (const [file, ident] of imports) {
			tree.children.unshift({
				type: "mdxjsEsm",
				value: `import ${ident} from "./_assets/${file}";`,
				data: { estree: imageImportEstree(ident, file) },
			});
		}
		if (!hasPictureImport(tree)) {
			tree.children.unshift({
				type: "mdxjsEsm",
				value: PICTURE_IMPORT_VALUE,
				data: { estree: PICTURE_IMPORT_ESTREE },
			});
		}
	};
};
