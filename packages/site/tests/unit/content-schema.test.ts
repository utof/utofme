import type { SchemaContext } from "astro:content";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import { type WorkEntry, worksSchema } from "../../src/content.config";

// Why: `worksSchema` is now a function-form factory that requires an Astro
// `SchemaContext` with an `image()` helper. In unit tests, Astro's virtual
// module is not available, so we provide a minimal mock whose Zod shape
// matches `ImageFunction`'s return type exactly (src: string, width: number,
// height: number, format: union of string literals).
// `z.union([z.literal("png"), ...])` is used instead of `z.enum([...])` to
// match the `$ZodUnion<[$ZodLiteral<...>]>` shape declared in ImageFunction.
// @see packages/site/node_modules/astro/dist/content/config.d.ts § ImageFunction
const mockImage: SchemaContext["image"] = () =>
	z.object({
		src: z.string(),
		width: z.number(),
		height: z.number(),
		format: z.union([
			z.literal("png"),
			z.literal("jpg"),
			z.literal("jpeg"),
			z.literal("tiff"),
			z.literal("webp"),
			z.literal("gif"),
			z.literal("svg"),
			z.literal("avif"),
		]),
	});

/** Resolved schema — ready for `.safeParse()` calls in every test. */
const schema = worksSchema({ image: mockImage });

// Why: ImageMetadata-shaped fixture used by the cover-image tests.
// After Phase 3 migration, cover.src must be an ImageMetadata object
// (not a plain string). The Stryker-killing test asserts on `.width`
// so it kills both the `cover: z.object({})` mutant and any mutant
// that removes the `src: image()` field.
// @see packages/specs/specs/03-content-pipeline.md § cover image migration
const validImageMetadata = {
	src: "/_astro/img.hash.png",
	width: 1280,
	height: 720,
	format: "png" as const,
};

describe("worksSchema discriminated union", () => {
	it("parses a valid code entry", () => {
		const result = schema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: ["ts"],
		});
		expect(result.success).toBe(true);
	});
	it("rejects a video entry without duration", () => {
		const result = schema.safeParse({
			type: "video",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(false);
	});
	it("rejects an unknown type literal", () => {
		const result = schema.safeParse({
			type: "podcast",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(false);
	});
	it("coerces date string to Date", () => {
		const result = schema.safeParse({
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
		const result = schema.safeParse({
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
		const result = schema.safeParse({
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
		const result = schema.safeParse({
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
		const result = schema.safeParse({
			type: "music",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(true);
	});

	it("parses a valid math entry", () => {
		// Kills: `z.literal("math")` → `z.literal("")` mutant
		const result = schema.safeParse({
			type: "math",
			title: "demo",
			date: "2026-04-25",
		});
		expect(result.success).toBe(true);
	});

	it("parses cover with ImageMetadata src and alt", () => {
		// Kills: `cover: z.object({})` mutant (would accept missing src/alt/width as valid).
		// After Phase 3 migration, cover.src is an ImageMetadata object validated by
		// Astro's `image()` helper — a plain string no longer parses successfully.
		// Asserting on cover.src.width > 0 additionally kills any mutant that removes
		// the `src: image()` field from the cover schema.
		// @see packages/specs/specs/03-content-pipeline.md § cover image migration
		const withCover = schema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: [],
			cover: { src: validImageMetadata, alt: "An image" },
		});
		expect(withCover.success).toBe(true);
		if (withCover.success) {
			expect(withCover.data.cover?.src.width).toBeGreaterThan(0);
			expect(withCover.data.cover?.alt).toBe("An image");
		}
	});

	it("rejects cover with plain string src", () => {
		// Why: verifies the Phase 3 breaking change — a plain string is no longer a
		// valid cover.src value after switching to `image()`.
		// @see packages/specs/specs/03-content-pipeline.md § cover image migration
		const result = schema.safeParse({
			type: "code",
			title: "demo",
			date: "2026-04-25",
			stack: [],
			cover: { src: "img.png", alt: "An image" },
		});
		expect(result.success).toBe(false);
	});
});
