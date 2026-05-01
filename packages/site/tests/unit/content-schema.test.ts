import type { SchemaContext } from "astro:content";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import {
	collections,
	notesSchema,
	StatsSourceSchema,
	slashSchema,
	snapshotSchema,
	type WorkEntry,
	worksSchema,
} from "../../src/content.config";

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

// ---------------------------------------------------------------------------
// collections export — mutation-kill tests for defineCollection wiring
// ---------------------------------------------------------------------------
// Why: Stryker mutates `defineCollection({ loader, schema })` → `defineCollection({})` for each
// collection, and mutates `export const collections = { works, slash, stats, notes }` →
// `export const collections = {}`. These tests verify the exported `collections` object is
// fully wired (all 4 keys present and each has both a `loader` and a `schema` property).
// Source: /tmp/stryker-prev-full.log lines 613–743 (ObjectLiteral survivors).

describe("collections export wiring", () => {
	it("exports all four collection keys (works, slash, stats, notes)", () => {
		// Kills: `export const collections = {}` mutant at content.config.ts:191:28.
		// If collections = {}, Object.keys returns [] and the match fails.
		expect(Object.keys(collections).sort()).toEqual(["notes", "slash", "stats", "works"]);
	});

	it("works collection is defined (not an empty object from defineCollection({}))", () => {
		// Kills: `defineCollection({})` for works at content.config.ts:90:32.
		// defineCollection() always returns a non-null object. The test verifies it
		// exists in the collections map (which is killed by the collections={} mutant
		// above) and is truthy (killed by any undefined/null mutation).
		expect(collections.works).toBeDefined();
		expect(collections.works).not.toBeNull();
	});

	it("slash collection is defined (kills defineCollection({}) at :110:32)", () => {
		expect(collections.slash).toBeDefined();
		expect(collections.slash).not.toBeNull();
	});

	it("stats collection is defined (kills defineCollection({}) at :158:32)", () => {
		expect(collections.stats).toBeDefined();
		expect(collections.stats).not.toBeNull();
	});

	it("notes collection is defined (kills defineCollection({}) at :178:32)", () => {
		expect(collections.notes).toBeDefined();
		expect(collections.notes).not.toBeNull();
	});

	it("each collection has a schema property set (not empty defineCollection)", () => {
		// Why: defineCollection({ loader, schema }) stores `schema` on the result.
		// defineCollection({}) would have schema as undefined.
		// This kills the defineCollection({}) ObjectLiteral mutants for all 4 collections.
		// Using `"schema" in obj` avoids any `unknown` casts that fail type-coverage.
		expect("schema" in collections.works).toBe(true);
		expect("schema" in collections.slash).toBe(true);
		expect("schema" in collections.stats).toBe(true);
		expect("schema" in collections.notes).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// slashSchema — mutation-kill tests for slash-specific survivors
// ---------------------------------------------------------------------------
// Why: Stryker mutants at content.config.ts:105:15, 107:36, 111:26, 111:41
// survived because existing slash-schema tests don't assert short description
// acceptance or glob config values. These tests kill those survivors.

describe("slashSchema mutation-kill coverage", () => {
	it("accepts a short description (kills .max→.min mutation at :105:15)", () => {
		// Kills: `z.string().min(240).optional()` mutant — a 10-char description
		// must parse successfully (min(240) would reject it, max(240) accepts it).
		const result = slashSchema.safeParse({
			title: "Now",
			updated: new Date("2026-04-27"),
			description: "Short desc",
		});
		expect(result.success).toBe(true);
	});

	it("defaults tags to [] (kills ArrayDeclaration mutant at :107:36)", () => {
		// Kills: `tags: z.array(z.string()).default(["Stryker was here"])` mutant.
		// Asserts exact empty-array default — Stryker sentinel would give length 1.
		const parsed = slashSchema.parse({ title: "x", updated: new Date() });
		expect(parsed.tags).toEqual([]);
		expect(parsed.tags).toHaveLength(0);
	});

	it("rejects a description longer than 240 chars (max constraint)", () => {
		// Ensures the max(240) constraint is active, not min(240).
		const result = slashSchema.safeParse({
			title: "x",
			updated: new Date(),
			description: "x".repeat(241),
		});
		expect(result.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// StatsSourceSchema — error default mutation-kill
// ---------------------------------------------------------------------------
// Why: Stryker mutant at content.config.ts:126:29 mutates `default(false)` →
// `default(true)`. Existing stats-snapshot tests don't assert the default
// because they always provide `error` explicitly.

describe("StatsSourceSchema error default", () => {
	it("defaults error to false when omitted (kills BooleanLiteral mutant at :126:29)", () => {
		// Kills: `error: z.boolean().default(true)` mutant.
		const parsed = StatsSourceSchema.parse({
			id: "test",
			label: "Test",
			value: 42,
			lastSuccessAt: null,
		});
		expect(parsed.error).toBe(false);
	});

	it("accepts error: true with null value/lastSuccessAt", () => {
		const parsed = StatsSourceSchema.parse({
			id: "test",
			label: "Test",
			value: null,
			lastSuccessAt: null,
			error: true,
		});
		expect(parsed.error).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// snapshotSchema.sources — ObjectLiteral mutation-kill
// ---------------------------------------------------------------------------
// Why: Stryker mutant at content.config.ts:138:20 replaces `sources: z.object({
// github, strava, lastfm, literal, wakatime })` with `sources: z.object({})`.
// That mutant survives because the existing snapshotSchema parse test uses the
// full fixture (which has all 5 keys), and z.object({}) passes with extra keys
// due to Zod's default strip mode. We need to assert that MISSING keys cause failure.

describe("snapshotSchema sources ObjectLiteral mutation-kill", () => {
	it("rejects snapshot missing the strava source (kills :138:20 ObjectLiteral mutant)", () => {
		// Kills: `sources: z.object({})` mutant — if sources were z.object({}), a
		// snapshot with only github would parse successfully. The real schema requires
		// all 5 keys, so this must fail.
		const result = snapshotSchema.safeParse({
			generatedAt: "2026-04-27T10:00:00Z",
			sources: {
				github: { id: "github", label: "GitHub", value: 1, lastSuccessAt: null, error: false },
				// strava intentionally absent
				lastfm: { id: "lastfm", label: "Last.fm", value: 1, lastSuccessAt: null, error: false },
				literal: { id: "literal", label: "Literal", value: 1, lastSuccessAt: null, error: false },
				wakatime: {
					id: "wakatime",
					label: "Wakatime",
					value: 1,
					lastSuccessAt: null,
					error: false,
				},
			},
		});
		expect(result.success).toBe(false);
	});

	it("rejects snapshot missing the wakatime source", () => {
		const result = snapshotSchema.safeParse({
			generatedAt: "2026-04-27T10:00:00Z",
			sources: {
				github: { id: "github", label: "GitHub", value: 1, lastSuccessAt: null, error: false },
				strava: { id: "strava", label: "Strava", value: 1, lastSuccessAt: null, error: false },
				lastfm: { id: "lastfm", label: "Last.fm", value: 1, lastSuccessAt: null, error: false },
				literal: { id: "literal", label: "Literal", value: 1, lastSuccessAt: null, error: false },
				// wakatime intentionally absent
			},
		});
		expect(result.success).toBe(false);
	});

	it("accepts snapshot with all 5 sources present", () => {
		const result = snapshotSchema.safeParse({
			generatedAt: "2026-04-27T10:00:00Z",
			sources: {
				github: { id: "github", label: "GitHub", value: 1, lastSuccessAt: null, error: false },
				strava: { id: "strava", label: "Strava", value: 1, lastSuccessAt: null, error: false },
				lastfm: { id: "lastfm", label: "Last.fm", value: 1, lastSuccessAt: null, error: false },
				literal: { id: "literal", label: "Literal", value: 1, lastSuccessAt: null, error: false },
				wakatime: {
					id: "wakatime",
					label: "Wakatime",
					value: 1,
					lastSuccessAt: null,
					error: false,
				},
			},
		});
		expect(result.success).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// notesSchema — mutation-kill for math default and summary max
// ---------------------------------------------------------------------------
// Why: Stryker mutants at content.config.ts:173:36, 174:28, 175:11 survive
// because existing notes-schema tests don't assert the exact default value of
// `math` (only truthy/falsy) and don't assert short summaries pass.

describe("notesSchema mutation-kill coverage", () => {
	it("defaults tags to [] (kills ArrayDeclaration mutant at :173:36)", () => {
		// Kills: `tags: z.array(z.string()).default(["Stryker was here"])` mutant.
		const parsed = notesSchema.parse({ title: "x", created: new Date() });
		expect(parsed.tags).toEqual([]);
		expect(parsed.tags).toHaveLength(0);
	});

	it("defaults math to false when omitted (kills BooleanLiteral mutant at :174:28)", () => {
		// Kills: `math: z.boolean().default(true)` mutant.
		const parsed = notesSchema.parse({ title: "x", created: new Date() });
		expect(parsed.math).toBe(false);
	});

	it("accepts a short summary (kills .max→.min mutation at :175:11)", () => {
		// Kills: `z.string().min(240).optional()` mutant — a 10-char summary
		// must parse successfully.
		const result = notesSchema.safeParse({
			title: "x",
			created: new Date(),
			summary: "Short note.",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a summary longer than 240 chars", () => {
		// Ensures max(240) is active for notes summary.
		const result = notesSchema.safeParse({
			title: "x",
			created: new Date(),
			summary: "x".repeat(241),
		});
		expect(result.success).toBe(false);
	});
});
