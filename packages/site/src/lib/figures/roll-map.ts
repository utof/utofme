/**
 * F10 "Roll a map": the three map generators, seed cycling, labels, the CS-likeness lines and the
 * shapes a map is drawn from.
 *
 * Why: the figure rolls precomputed maps (no generator runs in the browser); everything it says
 * about them comes from the dataset, and the likeness numbers are the same ones the caption prints
 * through keyed facts (a dataset test asserts they agree).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
import type { MapsGeneratedData } from "../article-data/maps_generated";
import { formatNumber } from "../figure-scale";
import { isWall, parseRows, type SiteRect, siteRects, spawnTiles } from "../grid";
import { mergedPath } from "./map-stages";

/**
 * A map generator version shipped in the dataset.
 *
 * Why: the toggle, the readout and the strip share one list.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export interface Generator {
	readonly id: "v1" | "v2" | "v3";
	readonly label: string;
	/** One public sentence on what the version added. */
	readonly blurb: string;
}

/**
 * The generators in order, with a plain-words description of each.
 *
 * Why: hand-written public copy (no digits, no file names); v3's sentence matches the page's
 * prose: narrow doors with an elbow, a site on each side, two ways into each.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export const GENERATORS: readonly Generator[] = [
	{
		id: "v1",
		label: "v1",
		blurb: "Rooms joined by corridors, tuned to look like the real maps as a family.",
	},
	{ id: "v2", label: "v2", blurb: "Adds tight, middling and open layouts." },
	{
		id: "v3",
		label: "v3",
		blurb: "Adds narrow doors with an elbow, a site on each side and two ways into each.",
	},
];

/**
 * The generator shown first.
 *
 * Why: the newest version is the figure's claim (it misses the real range least).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export const DEFAULT_GENERATOR = "v3";

/**
 * Maps shipped per generator.
 *
 * Why: the thumbnail strip has one button per map.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export const MAPS_PER_GENERATOR = 12;

/**
 * The shipped maps of one generator (28 rows each); empty for an unknown id.
 *
 * Why: one accessor keeps the island free of dataset layout.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function generatorMaps(
	data: MapsGeneratedData,
	id: string,
): ReadonlyArray<readonly string[]> {
	return data.generators.find((g) => g.id === id)?.maps ?? [];
}

/**
 * The index after `index`, wrapping at `count`.
 *
 * Why: "New seed" cycles through the twelve maps.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function nextIndex(index: number, count: number): number {
	return count <= 0 ? 0 : (index + 1) % count;
}

/**
 * "map 4 of 12" for a zero-based index.
 *
 * Why: the label the New seed button changes.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function seedLabel(index: number, count: number): string {
	return `map ${index + 1} of ${count}`;
}

/**
 * The generator's CS-likeness sentence: how many key structure metrics fall outside the real
 * maps' range, per map on average (lower is more CS-like). v1 was not measured.
 *
 * Why: the number comes from the dataset's `csLikeness`, never typed.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function likenessLine(data: MapsGeneratedData, id: string): string {
	if (id !== "v2" && id !== "v3") return "Not measured for this generator.";
	return `Misses the real maps' range on ${formatNumber(data.csLikeness[id], 1)} key metrics per map, on average.`;
}

/**
 * The yardstick sentence: the real maps measured against each other.
 *
 * Why: without it the generators' numbers have no scale.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function realLikenessLine(data: MapsGeneratedData): string {
	return `Real maps measured against each other: ${formatNumber(data.csLikeness.real, 1)}.`;
}

/**
 * What a map is drawn from: one walls path in 1-unit squares (merged rectangles), the site boxes
 * and the spawn squares.
 *
 * Why: the island and the SSR keyframe draw the same map the same way.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export interface MapShapes {
	readonly walls: string;
	readonly sites: Array<{ k: "a" | "b"; r: SiteRect }>;
	readonly ct: Array<[number, number]>;
	readonly t: Array<[number, number]>;
}

/**
 * The drawable shapes of a map's rows (legend of `maps_cs`).
 *
 * Why: see {@link MapShapes}.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function mapShapes(rows: readonly string[]): MapShapes {
	const grid = parseRows(rows);
	return {
		walls: mergedPath(grid.h, grid.w, (r, c) => isWall(grid, r, c)),
		sites: (["a", "b"] as const).flatMap((k) => siteRects(grid, k).map((r) => ({ k, r }))),
		ct: spawnTiles(grid, "ct"),
		t: spawnTiles(grid, "t"),
	};
}

/**
 * SVG path data of whole squares `[row, col]`, one unit rectangle each.
 *
 * Why: spawn areas are a handful of squares; one path keeps the keyframe small.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
export function squaresPath(squares: ReadonlyArray<readonly [number, number]>): string {
	return squares.map(([r, c]) => `M${c} ${r}h1v1h-1`).join("");
}
