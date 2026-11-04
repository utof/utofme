/**
 * Pure helpers behind `LoopMedia.astro`'s frame: CSS aspect value, poster choice and the card poster's
 * `srcset` width ladder.
 *
 * Why: the home masonry keeps each card's natural aspect (ADR 0044 addendum 2), so the frame, its poster
 * and its video must agree on one shape. These decisions live here, out of the component, so they are
 * unit- and property-tested.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */

/**
 * CSS `aspect-ratio` value of a rendition: its own `width / height`.
 *
 * Why: a card frame is no longer always 16 / 9; taking the ratio from the rendition keeps the frame,
 * the poster and the video the same shape without a second source of truth.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function frameAspectValue(rendition: { width: number; height: number }): string {
	return `${rendition.width} / ${rendition.height}`;
}

/**
 * The poster asset for a frame size.
 *
 * Why: `posterPath` is cut from the banner master; a card framed differently from the banner (another
 * aspect or a `cardCrop`) has its own `cardPosterPath`, which cards and gallery frames use. The banner
 * always keeps `posterPath`.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function posterPathFor(
	entry: { posterPath: string; cardPosterPath?: string | undefined },
	size: "card" | "banner" | "gallery",
): string {
	return size === "banner" ? entry.posterPath : (entry.cardPosterPath ?? entry.posterPath);
}

/**
 * Card / gallery poster `srcset` steps in px.
 *
 * Why: the card renditions are at most 1024 px wide (ADR 0044 addendum 4; a slideshow card sits on its
 * poster until hovered, so the poster must be as sharp as the video), so a larger step would only upscale.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export const CARD_POSTER_WIDTHS: readonly number[] = [384, 768, 1024];

/**
 * `srcset` widths for a card poster: {@link CARD_POSTER_WIDTHS} capped at the poster's own width.
 *
 * Why: sharp never upscales, so a step above `posterWidth` would only duplicate bytes; a 576 px square
 * card poster therefore offers `[384, 576]`.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function cardPosterWidths(posterWidth: number): number[] {
	return [...new Set(CARD_POSTER_WIDTHS.map((w) => Math.min(w, posterWidth)))];
}

/**
 * How a loop frame plays: `hover` (a slideshow card stays on its poster and plays while hovered or
 * keyboard-focused) or `view` (plays while in view).
 *
 * Why: a slideshow is a sequence of UI screenshots; moving unprompted it reads as noise, on a still it is
 * legible. Real motion (montage, transcode) and every banner or gallery frame keep the in-view autoplay.
 * An entry without a kind (the component test seam) plays in view. `kind` is a plain string because the
 * component reads it from the JSON manifest, which TypeScript types as `string`.
 *
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function loopPlayMode(
	kind: string | undefined,
	size: "card" | "banner" | "gallery",
): "hover" | "view" {
	return kind === "slideshow" && size === "card" ? "hover" : "view";
}
