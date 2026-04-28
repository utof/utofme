/**
 * Why: tests the unified pipeline end-to-end (remark → rehype → html) so
 * resolved/broken/aliased links are validated by their final HTML shape,
 * not intermediate AST shape (which would be brittle to upstream changes).
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */

import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { brokenLinkRehype, wikiLinks } from "../../src/lib/wikilinks-remark";

const KNOWN = ["/garden/welcome/", "/garden/math-demo/"];

function compile(md: string): string {
	return String(
		unified()
			.use(remarkParse)
			.use(wikiLinks, { permalinks: KNOWN })
			.use(remarkRehype)
			.use(brokenLinkRehype)
			.use(rehypeStringify)
			.processSync(md),
	);
}

describe("wikiLinks remark + brokenLinkRehype", () => {
	it('resolves a known target to <a class="wikilink" href=...>', () => {
		const html = compile("[[Welcome]]");
		expect(html).toContain('class="wikilink"');
		expect(html).toContain('href="/garden/welcome/"');
		expect(html).not.toContain("wikilink-broken");
	});

	it('renders an unknown target as <span class="wikilink-broken">', () => {
		const html = compile("[[Nonexistent target]]");
		expect(html).toContain('class="wikilink-broken"');
		expect(html).toContain("<span");
		expect(html).not.toMatch(/<a[^>]*wikilink-broken/);
		expect(html).not.toContain("href=");
	});

	it("respects alias divider", () => {
		const html = compile("[[Welcome|hi friend]]");
		expect(html).toContain('href="/garden/welcome/"');
		expect(html).toContain(">hi friend<");
	});

	it("emits data-target-slug on resolved anchors", () => {
		const html = compile("[[Welcome]]");
		expect(html).toContain('data-target-slug="welcome"');
	});
});
