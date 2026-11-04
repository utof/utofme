/**
 * Schema + types for `src/data/loops.json`, the committed manifest written by
 * `scripts/encode-loops.ts` (`bun run media:encode`) and read by the site
 * (loop components, content cross-checks) and by `bun run check:media`.
 *
 * Why: this is the single contract between the offline encode pipeline and the
 * runtime. The manifest is the only place that knows the hashed output file
 * names, so consumers never glob `public/loops/`.
 * @see packages/specs/specs/09-project-view.md § P9-4
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */

import { z } from "astro/zod";

/** Loop slug: lowercase kebab-case, also the directory name under `public/loops/`. */
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

/**
 * What a loop is made of.
 *
 * Why: the card controller treats them differently: a `slideshow` (a sequence of UI screenshots) stays
 * on its poster at rest and plays only while the card is hovered or keyboard-focused, whereas a `montage`
 * or `transcode` (real motion) plays while in view (ADR 0044 addendum 3).
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export const LOOP_KINDS = ["montage", "slideshow", "transcode"] as const;

/** One of {@link LOOP_KINDS}. @see LOOP_KINDS */
export const loopKindSchema = z.enum(LOOP_KINDS);

/**
 * Card aspect ratios a loop can be encoded at (`W:H`).
 *
 * Why: the home masonry keeps every tile's natural aspect (ADR 0044 addendum 2), so the card
 * rendition is no longer always 16:9. The set is closed so the encoder can pin an even,
 * codec-friendly frame size per aspect (`CARD_FRAMES` in `scripts/lib/loops-core.ts`).
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export const CARD_ASPECTS = ["1:1", "4:5", "3:4", "4:3", "3:2", "16:10", "16:9"] as const;

/** One of {@link CARD_ASPECTS}. @see CARD_ASPECTS */
export const cardAspectSchema = z.enum(CARD_ASPECTS);

/** A card aspect ratio name. @see cardAspectSchema */
export type CardAspect = z.infer<typeof cardAspectSchema>;

/**
 * Width ÷ height of a card aspect (`"4:5"` → 0.8).
 *
 * Why: the manifest check and the tests compare real frame sizes against the named aspect.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function aspectRatio(a: CardAspect): number {
	const [w, h] = a.split(":").map(Number);
	return (w ?? 1) / (h ?? 1);
}

/** 8 lowercase hex chars: the first 8 chars of a sha256. */
const sha8Schema = z.string().regex(/^[0-9a-f]{8}$/, "expected 8 hex chars (sha256 prefix)");

/**
 * One encoded file of a size.
 *
 * `url` is site-absolute (`/loops/<slug>/<size>.<sha8>.<av1|h264>.mp4`); the
 * `sha8` in the file name is the first 8 hex chars of the sha256 of the file bytes.
 * `type` is the full `<source type>` value including the `codecs` parameter, which
 * is derived from `ffprobe`, never hard-coded.
 * @see https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter
 */
const loopSourceSchema = z.strictObject({
	url: z.string().regex(/^\/loops\/[a-z0-9-]+\/(?:card|banner)\.[0-9a-f]{8}\.(?:av1|h264)\.mp4$/),
	type: z.string().regex(/^video\/mp4; codecs="(?:av01\.[^"]+|avc1\.[0-9A-Fa-f]{6})"$/),
	bytes: z.number().int().positive(),
});

/**
 * One rendition (card/gallery or banner): frame size plus its sources in
 * `<source>` order (AV1 first, H.264 fallback second).
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
const loopSizeSchema = z.strictObject({
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	sources: z.array(loopSourceSchema).min(1),
});

/**
 * Flash-lint result recorded per loop so the claim is falsifiable.
 *
 * - `maxEventsPerWindow`: highest count of area-qualified opposing-swing events in any closed 1 s window
 *   (worst of general and red, worst of the sizes).
 * - `maxPerSecond`: highest sustained transition rate over the loop (events / second).
 * - `renderWidthCss`: the largest CSS render width the analysis assumed per size
 *   (the 10-degree field is 341x256 CSS px scaled by videoWidth / renderWidthCss).
 * - `status`: `pass` or `warn` (a `fail` is never committed).
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3
 */
const loopFlashSchema = z.strictObject({
	maxEventsPerWindow: z.number().int().nonnegative(),
	maxPerSecond: z.number().nonnegative(),
	renderWidthCss: z.strictObject({
		card: z.number().int().positive(),
		banner: z.number().int().positive().nullable(),
	}),
	status: z.enum(["pass", "warn"]),
});

/**
 * One manifest entry.
 * `recipe` is the sha8 of the canonical recipe JSON plus the encoder settings; an unchanged hash means the
 * encode can be skipped. `posterPath` is relative to `packages/site/` (an Astro-processed asset).
 *
 * `kind` is the recipe kind (it decides whether a card plays at rest or on hover).
 * `aspect` is the loop's master aspect (the banner, always 16:9). `cardAspect` is the card/gallery
 * rendition's aspect: the home masonry tile keeps it, so a square sim is a square tile.
 * `posterPath` is cut from the banner master when there is one; when the card is not 16:9 and a banner
 * exists, the card needs its own poster of the card's framing, `cardPosterPath` (`card-poster.png`).
 * Why: the card frame, its poster and its video must share one aspect, or the poster would jump when the
 * video fades in.
 * @see packages/specs/specs/09-project-view.md § P9-4
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export const loopEntrySchema = z
	.strictObject({
		recipe: sha8Schema,
		durationS: z.number().positive(),
		fps: z.number().positive(),
		kind: loopKindSchema,
		aspect: z.literal("16:9"),
		cardAspect: cardAspectSchema,
		card: loopSizeSchema,
		banner: loopSizeSchema.nullable(),
		posterPath: z.string().regex(/^src\/assets\/loops\/[a-z0-9-]+\/poster\.png$/),
		cardPosterPath: z
			.string()
			.regex(/^src\/assets\/loops\/[a-z0-9-]+\/card-poster\.png$/)
			.optional(),
		flash: loopFlashSchema,
	})
	.superRefine((e, ctx) => {
		const ratio = aspectRatio(e.cardAspect);
		if (Math.abs(e.card.width / e.card.height - ratio) > ratio * 0.01)
			ctx.addIssue({
				code: "custom",
				message: `card ${e.card.width}x${e.card.height} is not ${e.cardAspect}`,
				path: ["card"],
			});
		if (e.cardPosterPath !== undefined) {
			if (e.banner === null)
				ctx.addIssue({
					code: "custom",
					message: "a card-only loop has no banner, so its poster is already the card poster",
					path: ["cardPosterPath"],
				});
			if (e.cardPosterPath.replace(/card-poster\.png$/, "poster.png") !== e.posterPath)
				ctx.addIssue({
					code: "custom",
					message: "cardPosterPath must sit next to posterPath",
					path: ["cardPosterPath"],
				});
		} else if (e.banner !== null && e.cardAspect !== "16:9")
			ctx.addIssue({
				code: "custom",
				message: `a ${e.cardAspect} card with a 16:9 banner needs its own cardPosterPath`,
				path: ["cardPosterPath"],
			});
	});

/**
 * The whole `loops.json`: slug → entry. The writer emits keys sorted so diffs stay stable.
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export const loopsManifestSchema = z.record(slugSchema, loopEntrySchema);

/** One encoded file of a size. @see loopSourceSchema */
export type LoopSource = z.infer<typeof loopSourceSchema>;
/** One rendition of a loop. @see loopSizeSchema */
export type LoopSize = z.infer<typeof loopSizeSchema>;
/** Flash-lint result stored in the manifest. @see loopFlashSchema */
export type LoopFlash = z.infer<typeof loopFlashSchema>;
/** One manifest entry. @see loopEntrySchema */
export type LoopEntry = z.infer<typeof loopEntrySchema>;
/** The parsed `loops.json`. @see loopsManifestSchema */
export type LoopsManifest = z.infer<typeof loopsManifestSchema>;
