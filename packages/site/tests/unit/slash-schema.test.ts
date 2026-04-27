/**
 * Why: schema is authoritative; tests run before any fixture is added so
 * regressions surface as parse failures rather than silent shape drift.
 */
import { describe, expect, it } from "vitest";
import { slashSchema } from "../../src/content.config";

describe("slashSchema", () => {
	it("accepts a fixture frontmatter shape", () => {
		const sample = {
			title: "Now",
			description: "Currently focused on …",
			updated: new Date("2026-04-27"),
			tags: ["work"],
		};
		expect(() => slashSchema.parse(sample)).not.toThrow();
	});

	it("rejects missing updated", () => {
		const sample = { title: "Now", tags: [] };
		expect(() => slashSchema.parse(sample)).toThrow();
	});

	it("defaults tags to []", () => {
		const parsed = slashSchema.parse({ title: "x", updated: new Date() });
		expect(parsed.tags).toEqual([]);
	});

	it("coerces an ISO date string into a Date", () => {
		const parsed = slashSchema.parse({ title: "x", updated: "2026-04-27" });
		expect(parsed.updated).toBeInstanceOf(Date);
		expect(parsed.updated.toISOString().slice(0, 10)).toBe("2026-04-27");
	});
});
