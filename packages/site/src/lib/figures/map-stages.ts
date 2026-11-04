/**
 * F5 "From a CS2 map to 28×28, stages 2 to 5": the stage list, the counts (always computed from
 * the stage rows and cross-checked against the dataset's own counts), per-square wall opacities
 * for the morph, layer paths for the static views and the copy helpers.
 *
 * Why: the figure's claim ("four steps turn a floor plan into the grid") is a set of numbers; they
 * are counted here, never typed in, and a unit test over the committed dataset proves the rows and
 * the dataset's counts agree (AC9.1). Stage 1 (the radar trace) does not exist anywhere (OD-5).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
import type { MapStagesData } from "../article-data/map_stages";
import { formatNumber } from "../figure-scale";

/**
 * One map of the shipped `map_stages` dataset.
 *
 * Why: every function below takes the dataset's own row type.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (`map_stages`)
 */
export type StageMap = MapStagesData["maps"][number];

/**
 * A stop of the stage slider.
 *
 * Why: title and unit are the words the readout, the live region and the strip share.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export interface Stage {
	readonly id: "frac_0_9" | "majority" | "corridors" | "final";
	readonly title: string;
	/** What the stage's count counts. */
	readonly unit: string;
}

/**
 * The four stops, in order.
 *
 * Why: floor fraction per square, a majority vote, a corridor pass, then the final grid with sites
 * and spawns; the dataset keys are the ids.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export const STAGES: readonly Stage[] = [
	{ id: "frac_0_9", title: "Floor fraction", unit: "squares with any floor" },
	{ id: "majority", title: "Majority vote", unit: "floor squares" },
	{ id: "corridors", title: "Corridor pass", unit: "floor squares" },
	{ id: "final", title: "Final grid", unit: "floor squares" },
];

/**
 * The map shown first.
 *
 * Why: Mirage is the page's running example (F2, F10 and the prose).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export const DEFAULT_MAP = "de_mirage";

/**
 * The 28 rows of a map at a stop (0 to 3).
 *
 * Why: one accessor so stop indices never meet dataset keys in the views.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function stageRows(m: StageMap, stage: number): readonly string[] {
	switch (stage) {
		case 0:
			return m.stages.frac_0_9;
		case 1:
			return m.stages.majority;
		case 2:
			return m.stages.corridors;
		default:
			return m.stages.final;
	}
}

const tally = (rows: readonly string[], test: (ch: string) => boolean): number =>
	rows.reduce((n, row) => n + [...row].filter(test).length, 0);

/**
 * The displayed count of a stop, counted from its rows: floor fraction = squares with any floor
 * (digit 1 to 9); majority and corridors = `.` squares; final = non-wall squares.
 *
 * Why: the spec forbids typed-in counts; `checkCounts` ties them to the dataset's own.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9 (AC9.1)
 */
export function stageCount(m: StageMap, stage: number): number {
	const rows = stageRows(m, stage);
	switch (stage) {
		case 0:
			return tally(rows, (ch) => ch !== "0");
		case 1:
		case 2:
			return tally(rows, (ch) => ch === ".");
		default:
			return tally(rows, (ch) => ch !== "#");
	}
}

/**
 * Cross-checks the counted values against the dataset's counts and returns one message per
 * mismatch: majority, final, and corridors = majority + tiles added.
 *
 * Why: the dataset carries the translator's own numbers; if rows and counts ever disagree, the
 * figure's claim is wrong and a test must say so.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9 (AC9.1)
 */
export function checkCounts(m: StageMap): string[] {
	const out: string[] = [];
	const want: Array<[string, number, number]> = [
		["majority", stageCount(m, 1), m.counts.majority_floor],
		["corridors", stageCount(m, 2), m.counts.majority_floor + m.counts.corridor_tiles_added],
		["final", stageCount(m, 3), m.counts.final_floor],
	];
	for (const [what, got, expected] of want) {
		if (got !== expected) out.push(`${m.name} ${what}: counted ${got}, dataset says ${expected}`);
	}
	return out;
}

const tiles = (
	a: readonly string[],
	b: readonly string[],
	pick: (x: string, y: string) => boolean,
): Array<[number, number]> => {
	const out: Array<[number, number]> = [];
	a.forEach((row, r) => {
		[...row].forEach((ch, c) => {
			if (pick(ch, b[r]?.[c] ?? "#")) out.push([r, c]);
		});
	});
	return out;
};

/**
 * Squares the corridor pass turned from wall into floor.
 *
 * Why: the readout says "N reopened" and the board rings them at that stop.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function reopenedTiles(m: StageMap): Array<[number, number]> {
	return tiles(m.stages.majority, m.stages.corridors, (a, b) => a === "#" && b === ".");
}

/**
 * Squares that are floor after the corridor pass but wall in the final grid.
 *
 * Why: the readout says "N closed" at the last stop; the count is derived, not a dataset field.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function closedTiles(m: StageMap): Array<[number, number]> {
	return tiles(m.stages.corridors, m.stages.final, (a, b) => a === "." && b === "#");
}

/**
 * The readout sentence of a stop: title, counted value and what the step changed.
 *
 * Why: the same sentence is the visible label, the live-region announcement and the strip text.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function stageSummary(m: StageMap, stage: number): string {
	const s = STAGES[stage] ?? STAGES[0];
	const n = stage === 2 ? reopenedTiles(m).length : stage === 3 ? closedTiles(m).length : 0;
	const note = n === 0 ? "" : ` (${formatNumber(n, 0)} ${stage === 2 ? "reopened" : "closed"})`;
	return `${s?.title}: ${formatNumber(stageCount(m, stage), 0)} ${s?.unit}${note}`;
}

/**
 * A map's display name: `de_mirage` becomes "Mirage".
 *
 * Why: the selector and the labels speak map names, not file names.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function mapTitle(name: string): string {
	const bare = name.replace(/^de_/, "");
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/**
 * Wall opacity of every square (row-major, 784 values) at a stop: floor fraction draws a square
 * darker the less floor it holds (`1 - digit / 9`); the other stops are wall (1) or not (0).
 *
 * Why: one opacity per square lets the slider cross-fade each square between stops; sites and
 * spawns are drawn as separate overlays.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function wallness(m: StageMap, stage: number): number[] {
	const out: number[] = [];
	for (const row of stageRows(m, stage)) {
		for (const ch of row) {
			out.push(stage === 0 ? 1 - Number(ch) / 9 : ch === "#" ? 1 : 0);
		}
	}
	return out;
}

/**
 * A group of squares drawn with one fill opacity, as one SVG path of merged horizontal runs.
 *
 * Why: static views (strip thumbnails, the no-JS multiples) need a handful of paths, not 784
 * rectangles.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export interface Layer {
	readonly opacity: number;
	readonly d: string;
}

/**
 * SVG path data covering the squares for which `on(row, col)` holds, as rectangles `M x y h w v h
 * h-w` (the fill closes each one): horizontal runs per row, merged with the identical run in the
 * row above into one taller rectangle. Every square is covered exactly once.
 *
 * Why: the SSR keyframes carry walls for up to a dozen maps; merging vertically roughly halves
 * the path data compared with one rectangle per run (spec Risk 3: HTML size).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Risks (3)
 */
export function mergedPath(
	rows: number,
	cols: number,
	on: (row: number, col: number) => boolean,
): string {
	type Open = { c: number; len: number; r0: number };
	let open = new Map<string, Open>();
	let d = "";
	for (let r = 0; r <= rows; r++) {
		const next = new Map<string, Open>();
		let c = 0;
		while (r < rows && c < cols) {
			if (!on(r, c)) {
				c++;
				continue;
			}
			const start = c;
			while (c < cols && on(r, c)) c++;
			const key = `${start}:${c - start}`;
			const prev = open.get(key);
			if (prev) open.delete(key);
			next.set(key, prev ?? { c: start, len: c - start, r0: r });
		}
		// Runs still open that did not continue into this row end here.
		for (const o of open.values()) d += `M${o.c} ${o.r0}h${o.len}v${r - o.r0}h-${o.len}`;
		open = next;
	}
	return d;
}

/**
 * Layer paths of a stop in 1-unit squares, grouped by opacity (see {@link mergedPath}).
 *
 * Why: see {@link Layer}; binary stops give one layer, floor fraction one per digit.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
export function stageLayers(m: StageMap, stage: number): Layer[] {
	const w = wallness(m, stage);
	const height = stageRows(m, stage).length;
	const width = stageRows(m, stage)[0]?.length ?? 0;
	const levels = [...new Set(w.filter((v) => v > 0))].sort((a, b) => b - a);
	return levels.map((opacity) => ({
		opacity,
		d: mergedPath(height, width, (r, c) => w[r * width + c] === opacity),
	}));
}

/**
 * The centre of a set of squares, in square units (x = column, y = row), for a label on a spawn
 * area.
 *
 * Why: spawns are tinted squares labelled "T" or "CT" so the meaning never rests on colour alone.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (colour plus shape)
 */
export function centroid(squares: ReadonlyArray<readonly [number, number]>): [number, number] {
	if (squares.length === 0) return [0, 0];
	const r = squares.reduce((a, [row]) => a + row, 0) / squares.length;
	const c = squares.reduce((a, [, col]) => a + col, 0) / squares.length;
	return [c + 0.5, r + 0.5];
}
