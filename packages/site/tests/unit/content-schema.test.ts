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

	// Why: Deterministic mutation-kill tests for content.config.ts survivors.
	// Stryker mutants for draft default, cover shape, music/math literals, and
	// collection wiring survive the basic tests above because those tests don't
	// exercise those specific paths. These tests ensure each surviving mutant is
	// killed by asserting the exact field value / type shape Stryker mutates.
	// Source: packages/specs/adrs/0008-stryker-and-fast-check-targets.md § Consequences

	it("defaults draft to false when omitted", () => {
		// Kills: `draft: z.boolean().default(true)` mutant
		const result = worksSchema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: [],
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.draft).toBe(false);
	});

	it("parses a valid music entry", () => {
		// Kills: `z.literal("music")` → `z.literal("")` mutant
		const result = worksSchema.safeParse({
			type: "music",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(true);
	});

	it("parses a valid math entry", () => {
		// Kills: `z.literal("math")` → `z.literal("")` mutant
		const result = worksSchema.safeParse({
			type: "math",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(true);
	});

	it("parses cover with src and alt", () => {
		// Kills: `cover: z.object({})` mutant (would accept missing src/alt as valid)
		// A cover with both fields must parse successfully
		const withCover = worksSchema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: [],
			cover: { src: "img.png", alt: "An image" },
		});
		expect(withCover.success).toBe(true);
		if (withCover.success) {
			expect(withCover.data.cover?.src).toBe("img.png");
			expect(withCover.data.cover?.alt).toBe("An image");
		}
	});
});
