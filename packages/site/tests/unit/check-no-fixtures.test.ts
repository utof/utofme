import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";
import { findLeaks, fixtureSlugs, run } from "../../scripts/check-no-fixtures";

const slugArb = fc.stringMatching(/^[a-z][a-z0-9]{0,8}(-[a-z0-9]{1,6}){0,2}$/);

describe("fixtureSlugs", () => {
	it("returns only entries with fixture: true in frontmatter", () => {
		const out = fixtureSlugs([
			{ name: "a.mdx", text: "---\ntype: code\nfixture: true\n---\nbody fixture: true" },
			{ name: "b.md", text: "---\ntype: code\nfixture: false\n---\n" },
			{ name: "c.md", text: "---\ntype: code\n---\nfixture: true" },
		]);
		expect(out).toEqual(["a"]);
	});
});

describe("findLeaks", () => {
	test.prop([slugArb])("flags a seeded works/<slug> path", (slug) => {
		expect(findLeaks(`<a href="/works/${slug}/">x</a>`, [slug])).toEqual([`works/${slug}`]);
	});
	test.prop([slugArb, slugArb])("never flags text without the slug", (slug, other) => {
		fc.pre(!`/works/${other}`.includes(`works/${slug}`));
		expect(findLeaks(`/works/${other}/`, [slug])).toEqual([]);
	});
	it("does not match a longer slug prefix and flags data-fixture", () => {
		expect(findLeaks("/works/code-10/", ["code-1"])).toEqual([]);
		expect(findLeaks("<li data-fixture>", [])).toEqual(["[data-fixture]"]);
	});
});

describe("run", () => {
	const make = (leak: boolean) => {
		const root = mkdtempSync(join(tmpdir(), "nofix-"));
		const content = join(root, "content");
		const dist = join(root, "dist");
		mkdirSync(content);
		mkdirSync(join(dist, "works"), { recursive: true });
		writeFileSync(join(content, "mock-1.mdx"), "---\ntype: code\nfixture: true\n---\n");
		writeFileSync(join(content, "real.mdx"), "---\ntype: code\n---\n");
		writeFileSync(
			join(dist, "index.html"),
			leak ? '<a href="/works/mock-1/">' : '<a href="/works/real/">',
		);
		return { dist, content };
	};
	it("exits 0 on a clean tree and 1 on a seeded leak", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const clean = make(false);
		expect(run(clean.dist, clean.content)).toBe(0);
		const bad = make(true);
		expect(run(bad.dist, bad.content)).toBe(1);
		expect(err).toHaveBeenCalled();
		vi.restoreAllMocks();
	});
});
