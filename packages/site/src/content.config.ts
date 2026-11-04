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

/** Kebab-case key into `src/data/loops.json` (P9-4). Why: loop slugs double as file names. */
const loopSlug = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	.max(64);

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
	const media = z.object({
		src: image(),
		alt: z.string().min(1).max(200),
		loop: loopSlug.optional(),
		focus: z.number().int().min(0).max(100).default(50),
	});
	const baseFields = {
		title: z.string(),
		slug: z.string().optional(),
		date: z.coerce.date(),
		updated: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		summary: z.string().max(240).optional(),
		cover: media.optional(),
		gallery: z
			.array(media.extend({ caption: z.string().min(1).max(100) }))
			.max(5)
			.default([]),
		lede: z.string().min(1).max(120).optional(),
		status: z.enum(["shipped", "prototype", "research", "archived"]).optional(),
		started: z.coerce.date().optional(),
		links: z
			.array(
				z
					.object({
						label: z.string().min(1).max(24),
						href: z.url().optional(),
						private: z.boolean().default(false),
					})
					.superRefine((l, ctx) => {
						if (!l.private && l.href === undefined) {
							ctx.addIssue({
								code: "custom",
								path: ["href"],
								message: "href is required unless the link is private",
							});
						}
					}),
			)
			.max(5)
			.default([]),
		fixture: z.boolean().default(false),
		/**
		 * Research-article variant (P10-1). Presence selects `_ArticleLayout`.
		 * Why: the article page needs its own headline/dek/contents list without a second collection.
		 */
		article: z
			.object({
				headline: z.string().min(1).max(80),
				dek: z.string().min(1).max(120),
				sections: z
					.array(
						z.object({
							id: z
								.string()
								.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
								.max(40),
							title: z.string().min(1).max(60),
						}),
					)
					.min(3)
					.max(12),
				math: z.boolean().default(false),
			})
			.optional(),
	};
	const stack = z.array(z.string().min(1)).max(8).optional();

	return z
		.discriminatedUnion("type", [
			z.object({
				type: z.literal("code"),
				repo: z.url().optional(),
				stack: z.array(z.string()),
				...baseFields,
			}),
			z.object({
				type: z.literal("video"),
				stack,
				duration: z.number(),
				youtube: z.string().optional(),
				...baseFields,
			}),
			z.object({
				type: z.literal("music"),
				stack,
				bpm: z.number().optional(),
				listen: z.url().optional(),
				...baseFields,
			}),
			z.object({
				type: z.literal("math"),
				stack,
				pdf: z.string().optional(),
				arxiv: z.string().optional(),
				...baseFields,
			}),
			z.object({
				type: z.literal("writing"),
				stack,
				wordCount: z.number().optional(),
				readingTime: z.number().optional(),
				...baseFields,
			}),
		])
		.superRefine((d, ctx) => {
			if (d.started && d.started.getTime() > d.date.getTime()) {
				ctx.addIssue({
					code: "custom",
					path: ["started"],
					message: "started must be on or before date",
				});
			}
		});
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
	lastSuccessAt: z.iso.datetime().nullable(),
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
	generatedAt: z.iso.datetime(),
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
