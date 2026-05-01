/**
 * jf2 mention schema as returned by webmention.io. Single source of truth
 * shared between the build-time fetcher (`scripts/build-webmentions.ts`)
 * and the renderer (`Webmentions.astro`, T8). Keeping the schema in one
 * file prevents drift between producer and consumer.
 *
 * Why: `content.html` is deliberately omitted — accepting upstream-supplied
 * HTML is an XSS vector and would force per-render sanitisation everywhere
 * the schema is consumed. We surface only `content.text`.
 *
 * @see https://webmention.io/api/
 * @see packages/specs/specs/06-indieweb.md § Webmentions
 */
import { z } from "astro/zod";

/**
 * Zod schema for one jf2 child entry. Validates the subset of fields the
 * site renders; unknown extra keys are stripped by `safeParse`.
 *
 * The exported value (`Mention`, the schema) and the inferred type
 * (`Mention`, exported below) intentionally share a name — TS allows the
 * collision because schemas live in the value namespace and types in the
 * type namespace.
 *
 * @see https://webmention.io/api/
 */
export const Mention = z.object({
	"wm-id": z.number(),
	"wm-property": z.string(),
	"wm-target": z.url(),
	"wm-source": z.url(),
	"wm-received": z.string(), // ISO 8601 datetime as returned by webmention.io
	type: z.string().default("entry"),
	url: z.url().optional(),
	published: z.string().nullable().optional(),
	author: z
		.object({
			name: z.string().optional(),
			photo: z.url().optional(),
			url: z.url().optional(),
		})
		.optional(),
	content: z
		.object({
			text: z.string().optional(),
			// Why: never expose `html`. See file-level docblock.
		})
		.optional(),
});

/**
 * Inferred TypeScript type for one validated jf2 mention.
 * @see Mention (the Zod schema, same file)
 */
export type Mention = z.infer<typeof Mention>;
