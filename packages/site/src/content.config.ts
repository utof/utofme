/**
 * Content-collection config for the `works` collection.
 *
 * Why: Phase 1 ships a heterogeneous home grid; one collection with a
 * discriminated-union schema lets `getCollection("works")` return one sortable,
 * narrow-able list. See ADR 0007.
 *
 * Phase 3 migrates `cover.src` from `z.string()` to the Astro `image()` helper
 * so that local images in frontmatter are processed by Astro's asset pipeline.
 * The schema must use function-form (`schema: ({ image }) => …`) to access the
 * `image()` helper at collection-registration time.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md
 * @see packages/specs/adrs/0007-single-collection-discriminated-union.md
 * @see packages/specs/specs/03-content-pipeline.md § cover image migration
 */
import { defineCollection, type SchemaContext } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Discriminated-union schema factory over the five work types.
 *
 * Why: function-form is required so the Astro `image()` helper (which validates
 * an `ImageMetadata` object) can be used inside the schema. The factory is
 * exported so unit tests can call `worksSchema({ image: mockFn })` and then
 * run `.safeParse()` directly without going through Astro's build pipeline.
 *
 * @see packages/specs/specs/03-content-pipeline.md § Schema
 * @see packages/specs/adrs/0007-single-collection-discriminated-union.md
 */
export function worksSchema({ image }: SchemaContext) {
	const baseFields = {
		title: z.string(),
		slug: z.string().optional(),
		date: z.coerce.date(),
		updated: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		summary: z.string().max(240).optional(),
		cover: z.object({ src: image(), alt: z.string() }).optional(),
	};

	return z.discriminatedUnion("type", [
		z.object({
			type: z.literal("code"),
			repo: z.url().optional(),
			stack: z.array(z.string()),
			...baseFields,
		}),
		z.object({
			type: z.literal("video"),
			duration: z.number(),
			youtube: z.string().optional(),
			...baseFields,
		}),
		z.object({
			type: z.literal("music"),
			bpm: z.number().optional(),
			listen: z.url().optional(),
			...baseFields,
		}),
		z.object({
			type: z.literal("math"),
			pdf: z.string().optional(),
			arxiv: z.string().optional(),
			...baseFields,
		}),
		z.object({
			type: z.literal("writing"),
			wordCount: z.number().optional(),
			readingTime: z.number().optional(),
			...baseFields,
		}),
	]);
}

/**
 * TypeScript type for a parsed work entry's frontmatter.
 *
 * Why: `worksSchema` is now a function so `z.infer<typeof worksSchema>` would
 * infer the function type itself, not the schema output. We derive `WorkEntry`
 * from the return type of the factory instead. Re-exported so `lib/works.ts`
 * and tests can type entries without re-deriving via `ReturnType` everywhere.
 *
 * @see packages/site/src/content.config.ts § worksSchema
 */
export type WorkEntry = z.infer<ReturnType<typeof worksSchema>>;

const works = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/works" }),
	schema: worksSchema,
});

/**
 * Slash-page collection schema (frontmatter shape for /now, /uses,
 * /colophon, /tops). `updated` is required so each page surfaces a
 * trustworthy "last touched" date — the IndieWeb /now-page convention.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (Static slash pages)
 * @see packages/specs/adrs/0022-slash-collection.md
 */
export const slashSchema = z.object({
	title: z.string(),
	description: z.string().max(240).optional(),
	updated: z.coerce.date(),
	tags: z.array(z.string()).default([]),
});

const slash = defineCollection({
	loader: glob({ pattern: "*.mdx", base: "./src/content/slash" }),
	schema: slashSchema,
});

/**
 * One stats source's record. `value` is `null` and `lastSuccessAt` is
 * `null` when `error: true` — see ADR 0024 (no last-good retention).
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 */
export const StatsSourceSchema = z.object({
	id: z.string(),
	label: z.string(),
	value: z.unknown().nullable(),
	lastSuccessAt: z.string().datetime().nullable(),
	error: z.boolean().default(false),
});

/**
 * Schema applied to the single `stats/snapshot` entry — the inner value
 * of the top-level wrapping object in `snapshot.json` / `snapshot.fixture.json`.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 */
export const snapshotSchema = z.object({
	generatedAt: z.string().datetime(),
	sources: z.object({
		github: StatsSourceSchema,
		strava: StatsSourceSchema,
		lastfm: StatsSourceSchema,
		literal: StatsSourceSchema,
		wakatime: StatsSourceSchema,
	}),
});

/**
 * Stats snapshot collection. Single-entry; the JSON file's top-level key
 * `snapshot` becomes the entry id consumed by getEntry("stats", "snapshot").
 *
 * In dev / CI, `snapshot.json` does not exist (gitignored). Astro's
 * file() loader logs `File not found:` and returns without throwing
 * (verified via withastro/astro source 2026-04-27 — packages/astro/src/content/loaders/file.ts).
 * The build stays green; `loadSnapshot` falls back to fixture.
 *
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 */
const stats = defineCollection({
	loader: file("./src/content/stats/snapshot.json"),
	schema: snapshotSchema,
});

/**
 * Note frontmatter schema for the digital garden.
 * Why: `publish` deliberately absent — the sync script is the gate
 * (see ADR 0025). Title required for <h1>; created required for sort/preview.
 * @see packages/specs/specs/05-garden.md § Notes frontmatter schema
 */
export const notesSchema = z.object({
	title: z.string(),
	created: z.coerce.date(),
	updated: z.coerce.date().optional(),
	tags: z.array(z.string()).default([]),
	math: z.boolean().default(false),
	summary: z.string().max(240).optional(),
});

const notes = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
	schema: notesSchema,
});

/**
 * Astro Content Collections registry.
 *
 * Why: Astro 6 requires this exact named export at `src/content.config.ts`
 * to wire the `works`, `slash`, `stats`, and `notes` collections.
 *
 * @see https://docs.astro.build/en/guides/content-collections/
 */
export const collections = { works, slash, stats, notes };
