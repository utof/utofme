/**
 * Why: ![[image]] tokens must be consumed BEFORE the wikilink remark plugin
 * sees them, otherwise it tries to handle them as built-in image embeds
 * (which bypasses Astro's <Picture> pipeline). Test asserts the AST node
 * is rewritten to MDX JSX referencing the asset path, and that an
 * `import { Picture } from "astro:assets"` mdxjsEsm node is prepended on
 * any rewrite.
 *
 * Note on test approach: we inspect the mdast AST directly (via
 * `processor.runSync(processor.parse(md))`) rather than stringifying.
 * The plan-time draft suggested a `remark-stringify` / `remark-mdx`
 * round-trip; neither package is installed in this repo, and Step 5 of
 * the task plan explicitly permits AST inspection when stringify is
 * unavailable or lossy. The contract under test IS the AST shape — that's
 * what the downstream MDX renderer consumes — so this is the more direct
 * pinning anyway.
 *
 * Note on types: `MdxJsxFlowElement` / `MdxJsxAttribute` /
 * `MdxJsxAttributeValueExpression` / `MdxjsEsm` are declaration-merged
 * into mdast's `RootContentMap` by `src/lib/embed-remark.ts` (importing
 * the plugin pulls in the merge). That lets us narrow `RootContent`
 * variants by `type` string without `as unknown as` casts.
 *
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxjsEsm, Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { embedRemark } from "../../src/lib/embed-remark";

function transform(md: string): Root {
	const processor = unified().use(remarkParse).use(embedRemark);
	return processor.runSync(processor.parse(md));
}

function findPicture(tree: Root): MdxJsxFlowElement | undefined {
	for (const child of tree.children) {
		if (child.type === "mdxJsxFlowElement" && child.name === "Picture") {
			return child;
		}
	}
	return undefined;
}

function findEsmImports(tree: Root): MdxjsEsm[] {
	const out: MdxjsEsm[] = [];
	for (const child of tree.children) {
		if (child.type === "mdxjsEsm") out.push(child);
	}
	return out;
}

function attr(node: MdxJsxFlowElement, name: string): MdxJsxAttribute | undefined {
	return node.attributes.find((a) => a.name === name);
}

describe("embedRemark", () => {
	it("rewrites ![[diagram.png]] to an mdxJsxFlowElement Picture node", () => {
		// Why: `src` is an mdxJsxAttributeValueExpression referencing a synthesised
		// import binding (e.g. `_embed_diagram_png`), NOT a string literal. Astro's
		// <Picture> demands an imported ImageMetadata; passing a string filepath
		// raises LocalImageUsedWrongly at build time.
		// @see https://docs.astro.build/en/reference/errors/local-image-used-wrongly/
		const tree = transform("text\n\n![[diagram.png]]\n\ntail");
		const pic = findPicture(tree);
		expect(pic).toBeDefined();
		const src = pic === undefined ? undefined : attr(pic, "src");
		expect(src?.value).toMatchObject({
			type: "mdxJsxAttributeValueExpression",
			value: "_embed_diagram_png",
		});
	});

	it("preserves caption from ![[file.png|caption]] as the alt attribute", () => {
		const tree = transform("![[diagram.png|the diagram]]");
		const pic = findPicture(tree);
		expect(pic).toBeDefined();
		const alt = pic === undefined ? undefined : attr(pic, "alt");
		expect(alt?.value).toBe("the diagram");
	});

	it("emits a formats expression attribute carrying ['avif','webp']", () => {
		const tree = transform("![[diagram.png]]");
		const pic = findPicture(tree);
		expect(pic).toBeDefined();
		const formats = pic === undefined ? undefined : attr(pic, "formats");
		expect(formats?.value).toMatchObject({
			type: "mdxJsxAttributeValueExpression",
			value: "['avif','webp']",
		});
	});

	it("leaves non-embed wikilinks untouched and adds no Picture import", () => {
		const tree = transform("[[Welcome]]");
		expect(findPicture(tree)).toBeUndefined();
		expect(findEsmImports(tree).length).toBe(0);
	});

	it('injects `import { Picture } from "astro:assets"` when an embed is rewritten', () => {
		// Two imports are injected per embed: the named `<Picture>` symbol AND the
		// per-file default-import binding (`import _embed_diagram_png from
		// "./_assets/diagram.png"`). The image import is required because Astro's
		// asset pipeline resolves ImageMetadata at compile time from real ESM
		// imports, not from string filepaths.
		const tree = transform("![[diagram.png]]");
		const esms = findEsmImports(tree);
		expect(esms.length).toBe(2);
		const pictureImport = esms.find((e) => e.value.includes("astro:assets"));
		expect(pictureImport?.value).toBe('import { Picture } from "astro:assets";');
		const imageImport = esms.find((e) => e.value.includes("./_assets/diagram.png"));
		expect(imageImport?.value).toBe('import _embed_diagram_png from "./_assets/diagram.png";');
	});

	it("does not inject the import when no embed is rewritten", () => {
		const tree = transform("[[Welcome]]\n\nplain text");
		expect(findEsmImports(tree).length).toBe(0);
	});

	it("ignores ![[non-image.txt]] (non-image extension passes through)", () => {
		const tree = transform("![[notes.txt]]");
		expect(findPicture(tree)).toBeUndefined();
	});
});
