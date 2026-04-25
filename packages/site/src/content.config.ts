/**
 * Content-collection config for the `works` collection.
 *
 * Why: Phase 1 ships a heterogeneous home grid; one collection with a
 * discriminated-union schema lets `getCollection("works")` return one sortable,
 * narrow-able list. See ADR 0007.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md
 * @see packages/specs/adrs/0007-single-collection-discriminated-union.md
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const baseFields = {
	title: z.string(),
	slug: z.string().optional(),
	date: z.coerce.date(),
	updated: z.coerce.date().optional(),
	tags: z.array(z.string()).default([]),
	draft: z.boolean().default(false),
	summary: z.string().max(240).optional(),
	cover: z.object({ src: z.string(), alt: z.string() }).optional(),
};

/**
 * Discriminated-union schema over the five Phase 1 work types.
 *
 * Why: TS narrows correctly on `entry.data.type === "code"` etc.; verified at
 * spec polish 2026-04-25 (positive probe exit 0; negative probe TS2339).
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Schema
 */
export const worksSchema = z.discriminatedUnion("type", [
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

/**
 * TypeScript type for a parsed work entry's frontmatter.
 *
 * Why: re-exported so `lib/works.ts` and tests can type entries without
 * re-deriving via `z.infer` everywhere.
 *
 * @see packages/site/src/content.config.ts § worksSchema
 */
export type WorkEntry = z.infer<typeof worksSchema>;

const works = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/works" }),
	schema: worksSchema,
});

/**
 * Astro Content Collections registry.
 *
 * Why: Astro 6 requires this exact named export at `src/content.config.ts`
 * to wire the `works` collection.
 *
 * @see https://docs.astro.build/en/guides/content-collections/
 */
export const collections = { works };
