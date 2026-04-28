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
});
