/**
 * Why: schema is authoritative for note frontmatter — drift would silently
 * mis-parse user vault content. Test runs before any fixture commits so a
 * shape regression surfaces as a parse failure.
 * @see packages/specs/specs/05-garden.md § Notes frontmatter schema
 */
import { describe, expect, it } from "vitest";
import { notesSchema } from "../../src/content.config";

describe("notesSchema", () => {
	it("accepts a fully-populated note", () => {
		const sample = {
			title: "Welcome",
			created: new Date("2026-04-27"),
			updated: new Date("2026-04-27"),
			tags: ["meta"],
			math: false,
			summary: "Site root note.",
		};
		expect(() => notesSchema.parse(sample)).not.toThrow();
	});

	it("requires title and created", () => {
		expect(() => notesSchema.parse({ created: new Date() })).toThrow();
		expect(() => notesSchema.parse({ title: "x" })).toThrow();
	});

	it("defaults tags to [] and math to false", () => {
		const parsed = notesSchema.parse({ title: "x", created: new Date() });
		expect(parsed.tags).toEqual([]);
		expect(parsed.math).toBe(false);
	});

	it("rejects summary > 240 chars", () => {
		expect(() =>
			notesSchema.parse({ title: "x", created: new Date(), summary: "x".repeat(241) }),
		).toThrow();
	});

	it("coerces YYYY-MM-DD strings (mirrors actual frontmatter input)", () => {
		// Why: YAML frontmatter feeds Zod a string, not a Date. This locks the
		// `z.coerce.date()` choice — a regression to plain `z.date()` would silently
		// break astro build by rejecting every fixture's frontmatter.
		const parsed = notesSchema.parse({ title: "x", created: "2026-04-27" });
		expect(parsed.created).toBeInstanceOf(Date);
		expect(parsed.created.toISOString().slice(0, 10)).toBe("2026-04-27");
	});
});
