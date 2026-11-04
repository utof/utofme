/**
 * WCAG 2.x contrast helpers on gamma-encoded sRGB (0–255 channels).
 *
 * Why: P9-7's card caption guarantees ≥ 4.5:1 for every glyph over any frame
 * using only the bar fill (no `backdrop-filter`); a unit test uses this to prove
 * the arithmetic instead of trusting prose.
 *
 * @see https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 * @see https://www.w3.org/TR/compositing-1/#simplealphacompositing
 * @see packages/specs/specs/09-project-view.md § P9-7 (Contrast)
 */

/** An sRGB colour as `[r, g, b]`, each 0–255. */
export type Rgb = readonly [number, number, number];

function linear(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG relative luminance (unrounded).
 *
 * Why: the contrast ratio is defined over it.
 *
 * @see https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
export function relativeLuminance([r, g, b]: Rgb): number {
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG contrast ratio between two opaque colours (order-independent).
 *
 * Why: AC7 requires ≥ 4.5:1 for caption text.
 *
 * @see https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Source-over composite of a translucent `fg` on an opaque `bg`, in gamma-encoded
 * sRGB (what browsers do for plain `rgba()` fills).
 *
 * Why: models the caption bar `rgba(16,16,16,.62)` over the worst-case white frame.
 *
 * @see https://www.w3.org/TR/compositing-1/#simplealphacompositing
 */
export function compositeOver(fg: Rgb, alpha: number, bg: Rgb): [number, number, number] {
	return [
		fg[0] * alpha + bg[0] * (1 - alpha),
		fg[1] * alpha + bg[1] * (1 - alpha),
		fg[2] * alpha + bg[2] * (1 - alpha),
	];
}

/**
 * Parses `#rgb` or `#rrggbb` (any case) into an {@link Rgb} triple.
 *
 * Why: AC2.1 computes token contrast from the CSS source with unrounded floats; the test must
 * read hex values straight out of `tokens.css`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (AC2.1)
 */
export function parseHex(hex: string): [number, number, number] {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	const digits = m?.[1];
	if (digits === undefined) throw new Error(`not a #rgb/#rrggbb colour: ${hex}`);
	const full = digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits;
	return [
		Number.parseInt(full.slice(0, 2), 16),
		Number.parseInt(full.slice(2, 4), 16),
		Number.parseInt(full.slice(4, 6), 16),
	];
}
