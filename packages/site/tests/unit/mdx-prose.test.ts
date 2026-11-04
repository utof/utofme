/**
 * parseMdxProse: the structural view of an article MDX file used by the content lint.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (structural content lint)
 */
import { describe, expect, it } from "vitest";
import { parseMdxProse } from "./helpers/mdx-prose";

const doc = `---
title: "T"
article:
  headline: H
---

import Replay from "../../components/article/ReplayBlock.astro";

{/* a comment with words that must not count */}

Intro paragraph with \`code\` and four words more.

## First Section

Body one has <N k="elo.gain" /> points and a <Stamp block="20" /> stamp.

<ReplayBlock number={1}>
  <span slot="caption">The replay of a round, ten players.</span>
  <span slot="try">Press play and watch.</span>
</ReplayBlock>

See Figure 1 for the round.

## Second: Part & Whole

<SmokeSightBlock number={2} />

Closing line.

$$
x^2 + y^2
$$
`;

describe("parseMdxProse", () => {
	const p = parseMdxProse(doc);

	it("returns the frontmatter", () => {
		expect(p.frontmatter["title"]).toBe("T");
	});

	it("slugs ## headings with github-slugger", () => {
		expect(p.sections.map((s) => s.id)).toEqual(["first-section", "second-part--whole"]);
		expect(p.sections.map((s) => s.title)).toEqual(["First Section", "Second: Part & Whole"]);
	});

	it("drops imports, comments and components but keeps N and Stamp tokens", () => {
		const all = p.paragraphs.join("\n");
		expect(all).not.toContain("import");
		expect(all).not.toContain("comment");
		expect(all).not.toContain("replay of a round");
		expect(all).toContain('<N k="elo.gain" />');
		expect(all).toContain('<Stamp block="20" />');
	});

	it("collects figure blocks with number, caption and try text", () => {
		expect(p.figures).toEqual([
			{
				component: "ReplayBlock",
				number: 1,
				caption: "The replay of a round, ten players.",
				try: "Press play and watch.",
			},
			{ component: "SmokeSightBlock", number: 2, caption: "", try: "" },
		]);
	});

	it("counts prose words (paragraphs + headings; tokens count as one word; math excluded)", () => {
		// intro 8 + heading 2 + body 9 + see 6 + heading 3 ("&" is no word) + closing 2
		expect(p.words).toBe(30);
	});

	it("detects a $$ math block and unescaped dollar-digit", () => {
		expect(p.hasMathBlock).toBe(true);
		expect(p.unescapedDollar).toBe(false);
		expect(parseMdxProse("It costs $40 and $50.").unescapedDollar).toBe(true);
		expect(parseMdxProse("It costs \\$40.").unescapedDollar).toBe(false);
	});
});
