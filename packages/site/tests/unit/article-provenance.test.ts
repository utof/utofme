/**
 * Provenance and claims lint (P10-17): every number through a keyed fact, no claim of
 * professional or human play, stamps, captions, try lines.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17 (AC17.1)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fact, formatFact } from "../../src/lib/facts";
import { DIGIT_EXEMPTIONS, lintProvenance } from "./helpers/mdx-prose";

const facts = { fact, formatFact };
const fixtures = join(import.meta.dirname, "../fixtures/article-provenance");
const read = (name: string) => readFileSync(join(fixtures, name), "utf8");
const rulesOf = (text: string) => [...new Set(lintProvenance(text, facts).map((f) => f.rule))];

describe("provenance lint fixtures (AC17.1)", () => {
	it("the passing fixture has no failures", () => {
		expect(lintProvenance(read("pass.mdx"), facts)).toEqual([]);
	});

	it.each(
		DIGIT_EXEMPTIONS.map((re) => [re.source, re] as const),
	)("the passing fixture uses the exemption %s", (_source, re) => {
		expect(new RegExp(re.source).test(read("pass.mdx"))).toBe(true);
	});

	const negatives = readdirSync(fixtures)
		.filter((f) => f.startsWith("fail-"))
		.map((f) => [f, f.slice("fail-".length, -".mdx".length).split("--")[0] ?? ""] as const);

	it("has one negative fixture per required case", () => {
		const names = negatives.map(([f]) => f);
		const groups = [
			"beat",
			"defeat",
			"outperform",
			"outplay",
			"surpass",
			"rival",
			"on-par-with",
			"as-good-as",
			"better-than",
			"stronger-than",
			"superior-to",
			"plays-like",
		];
		const required = [
			"fail-bare-digit.mdx",
			...groups.map((g) => `fail-banned-claim--${g}.mdx`),
			"fail-banned-claim--superhuman.mdx",
			"fail-banned-claim--pros-first.mdx",
			"fail-banned-claim--window.mdx",
			"fail-banned-literal--starting-point.mdx",
			"fail-chained-elo.mdx",
			"fail-missing-stamp.mdx",
			"fail-caption-length.mdx",
		];
		expect(names).toEqual(expect.arrayContaining(required));
	});

	it.each(negatives)("%s fails with exactly the rule %s", (file, rule) => {
		expect(rulesOf(read(file))).toEqual([rule]);
	});

	it("an unknown fact key fails the build (through facts.ts)", () => {
		expect(() => fact("no.such.key")).toThrow(/unknown fact key/);
		expect(() => formatFact("no.such.key")).toThrow(/unknown fact key/);
	});
});

const site = join(import.meta.dirname, "../..");
const entry = readFileSync(join(site, "src/content/works/tactical-arena.mdx"), "utf8");

describe("the real article entry (AC17.1, AC17.3)", () => {
	it("passes the provenance and claims lint", () => {
		expect(lintProvenance(entry, facts)).toEqual([]);
	});
});

describe("cleanup (AC17.4, AC17.5)", () => {
	const stills = ["radar-dust2", "mesh-inferno"];

	function walk(dir: string): string[] {
		return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
			d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
		);
	}

	it("no Valve still is left in the source tree, by file name or by reference", () => {
		const files = ["src", "media", "public"].flatMap((d) => walk(join(site, d)));
		for (const name of stills) {
			expect(files.filter((f) => f.endsWith(`/${name}.png`))).toEqual([]);
		}
		const text = files.filter((f) => /\.(?:astro|mdx?|json|ts|svelte|css)$/.test(f));
		for (const f of text) {
			const body = readFileSync(f, "utf8");
			for (const name of stills) expect(body.includes(name), `${f} names ${name}`).toBe(false);
		}
	});

	it("the loop recipe has no stills", () => {
		const recipe = JSON.parse(
			readFileSync(join(site, "media/recipes/tactical-arena.json"), "utf8"),
		) as Record<string, unknown>;
		expect(Object.hasOwn(recipe, "stills")).toBe(false);
	});

	it("the MDX has no YAML comments, no MDX comments and no link URL", () => {
		const fm = /^---\n([\s\S]*?)\n---\n/.exec(entry)?.[1] ?? "";
		expect(fm).not.toBe("");
		expect(fm.split("\n").filter((l) => /(?:^|\s)#/.test(l))).toEqual([]);
		expect(entry).not.toMatch(/\{\/\*/);
		const links = /^links:\n((?: {2}.*\n)+)/m.exec(`${fm}\n`)?.[1] ?? "";
		expect(links).toMatch(/label: "Code"/);
		expect(links).not.toMatch(/href|https?:/);
	});
});
