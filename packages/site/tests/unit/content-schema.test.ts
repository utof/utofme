import { describe, expect, it } from "vitest";
import { type WorkEntry, worksSchema } from "../../src/content.config";

describe("worksSchema discriminated union", () => {
	it("parses a valid code entry", () => {
		const result = worksSchema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: ["ts"],
		});
		expect(result.success).toBe(true);
	});
	it("rejects a video entry without duration", () => {
		const result = worksSchema.safeParse({
			type: "video",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(false);
	});
	it("rejects an unknown type literal", () => {
		const result = worksSchema.safeParse({
			type: "podcast",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(false);
	});
	it("coerces date string to Date", () => {
		const result = worksSchema.safeParse({
			type: "writing",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			// WorkEntry is used here to verify the named type export is correctly inferred.
			const _entry: WorkEntry = result.data;
			expect(_entry.date).toBeInstanceOf(Date);
		}
	});
	it("defaults tags to []", () => {
		const result = worksSchema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: [],
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.tags).toEqual([]);
	});
	it("clamps summary to ≤240 chars", () => {
		const long = "x".repeat(241);
		const result = worksSchema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: [],
			summary: long,
		});
		expect(result.success).toBe(false);
	});
});
