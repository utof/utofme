/**
 * Mark shapes for figure data: one shape per team, series and outcome key that has a colour.
 *
 * Why: WCAG 1.4.1: colour is never the only channel. CT = circle, T = triangle, pros = diamond,
 * bots = square; outcomes = filled circle (kept), cross (reverted), hollow circle (inconclusive),
 * triangle-down (parked), small square (infra). Smoke and fire are areas, not marks: smoke is a
 * solid disc with a dashed edge, fire a hatched area.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (AC2.2)
 * @see https://www.w3.org/TR/WCAG22/#use-of-color
 */

/** Every keyed mark. */
export const MARK_KEYS = [
	"ct",
	"t",
	"pro",
	"bot",
	"kept",
	"reverted",
	"inconclusive",
	"parked",
	"infra",
] as const;

/** A key of {@link MARKS}.
 *
 * Why: derived from the key list so the two cannot drift.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2
 */
export type MarkKey = (typeof MARK_KEYS)[number];

/** Geometric shape of a mark.
 *
 * Why: the non-colour channel (WCAG 1.4.1).
 * @see https://www.w3.org/TR/WCAG22/#use-of-color
 */
export type MarkShape = "circle" | "triangle" | "diamond" | "square" | "cross" | "triangle-down";

/** Shape, fill and the colour token a mark pairs with.
 *
 * Why: keeps shape and colour in one record so neither is chosen alone.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2
 */
export interface MarkSpec {
	shape: MarkShape;
	/** False draws the outline only (hollow). */
	filled: boolean;
	/** Radius multiplier relative to the requested size. */
	scale: number;
	/** The CSS custom property that colours this mark. */
	token: string;
}

/**
 * The mark table.
 *
 * Why: figures import this instead of choosing shapes ad hoc, so no colour appears without a shape.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2
 */
export const MARKS: Record<MarkKey, MarkSpec> = {
	ct: { shape: "circle", filled: true, scale: 1, token: "--color-ct" },
	t: { shape: "triangle", filled: true, scale: 1, token: "--color-t" },
	pro: { shape: "diamond", filled: true, scale: 1, token: "--color-pro" },
	bot: { shape: "square", filled: true, scale: 0.85, token: "--color-bot" },
	kept: { shape: "circle", filled: true, scale: 1, token: "--color-outcome-kept" },
	reverted: { shape: "cross", filled: true, scale: 1, token: "--color-outcome-reverted" },
	inconclusive: {
		shape: "circle",
		filled: false,
		scale: 1,
		token: "--color-outcome-inconclusive",
	},
	parked: { shape: "triangle-down", filled: true, scale: 1, token: "--color-outcome-parked" },
	infra: { shape: "square", filled: true, scale: 0.6, token: "--color-outcome-infra" },
};

const f = (n: number) => String(Math.round(n * 100) / 100);

/**
 * SVG path data for a mark centred on `(cx, cy)`; `size` is the circumscribing radius.
 * The path is always closed (`Z`); hollow marks use the same outline with `fill="none"`.
 *
 * Why: one path string per mark keeps figures from importing an icon set.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (AC2.2)
 */
export function markPath(key: MarkKey, cx: number, cy: number, size: number): string {
	const { shape, scale } = MARKS[key];
	const r = size * scale;
	const poly = (pts: [number, number][]) =>
		`M${pts.map(([x, y]) => `${f(cx + x)},${f(cy + y)}`).join("L")}Z`;
	switch (shape) {
		case "circle":
			return `M${f(cx - r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx + r)},${f(cy)}A${f(r)},${f(r)} 0 1 0 ${f(cx - r)},${f(cy)}Z`;
		case "triangle":
			return poly([
				[0, -r],
				[r * 0.87, r * 0.5],
				[-r * 0.87, r * 0.5],
			]);
		case "triangle-down":
			return poly([
				[0, r],
				[r * 0.87, -r * 0.5],
				[-r * 0.87, -r * 0.5],
			]);
		case "diamond":
			return poly([
				[0, -r],
				[r, 0],
				[0, r],
				[-r, 0],
			]);
		case "square": {
			const h = r * 0.8;
			return poly([
				[-h, -h],
				[h, -h],
				[h, h],
				[-h, h],
			]);
		}
		case "cross": {
			const a = r * 0.9;
			const b = r * 0.28;
			return poly([
				[-b, -a],
				[b, -a],
				[b, -b],
				[a, -b],
				[a, b],
				[b, b],
				[b, a],
				[-b, a],
				[-b, b],
				[-a, b],
				[-a, -b],
				[-b, -b],
			]);
		}
	}
}
