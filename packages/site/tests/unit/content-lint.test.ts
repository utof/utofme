/**
 * Structural content lint for research-article works (P10-1, AC1.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (structural content lint)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintArticle } from "./helpers/mdx-prose";

const fixtures = join(import.meta.dirname, "../fixtures/content-lint");
const read = (dir: string, name: string) => readFileSync(join(dir, name), "utf8");

describe("content lint fixtures (AC1.4)", () => {
	it("the passing fixture has no failures", () => {
		expect(lintArticle(read(fixtures, "pass.mdx"))).toEqual([]);
	});

	const negatives: [string, string][] = [
		["fail-words.mdx", "body-words"],
		["fail-gallery.mdx", "gallery-empty"],
		["fail-section-id.mdx", "sections-match"],
		["fail-figure-order.mdx", "figure-order"],
		["fail-dollar.mdx", "dollar-escape"],
	];
	it.each(negatives)("%s fails with rule %s", (file, rule) => {
		const rules = lintArticle(read(fixtures, file)).map((f) => f.rule);
		expect(rules).toContain(rule);
	});

	it("a rule failure only names the rules it breaks", () => {
		expect(lintArticle(read(fixtures, "fail-dollar.mdx")).map((f) => f.rule)).toEqual([
			"dollar-escape",
		]);
	});
});

describe("real article entries pass the lint", () => {
	const dir = join(import.meta.dirname, "../../src/content/works");
	const articles = readdirSync(dir)
		.filter((f) => /\.mdx?$/.test(f))
		.map((f) => ({ f, text: read(dir, f) }))
		.filter(({ text }) => /^article:/m.test(text) && !/^draft:\s*true/m.test(text))
		.filter(({ text }) => !/^fixture:\s*true/m.test(text));

	it("every non-draft, non-fixture entry with `article` has no lint failures", () => {
		for (const { f, text } of articles) {
			expect({ f, failures: lintArticle(text) }).toEqual({ f, failures: [] });
		}
	});
});
