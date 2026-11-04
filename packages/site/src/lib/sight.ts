/**
 * Tile sight rule, ported from the game and checked against its own parity table.
 *
 * Why: F1/F2 draw what the game's agents can see. The rule (33 exact-integer samples, the
 * directional "legs" smoke rule, FOV 106°, range 10, no see-behind) is the head's setting, not
 * the code's older defaults (FOV 90° with see-behind). Orientation matters: the sample rounding
 * is not rotation- or mirror-invariant, so everything works in the canonical `maps_cs` frame
 * (T west, CT east, A north). The game is the oracle; a mismatch is fixed here, never in the table.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule)
 * @see packages/site/tests/fixtures/article/sight_parity.json
 */
import { type GridMap, isWall } from "./grid";

/**
 * Constants of the sight rule.
 *
 * Why: one place for every number the rule uses, each tied to the line the page shows.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule)
 */
export const SIGHT = {
	/** Samples along the segment, endpoints included (`d = 32` steps). */
	samples: 33,
	/** Full field of view in degrees (half-angle 53°). */
	fovDeg: 106,
	/** Maximum distance in tiles. */
	rangeTiles: 10,
	/** Smoke disc radius in tiles (Euclidean, walls ignored). */
	smokeRadius: 2.0,
	/** Tolerance the game adds to every comparison. */
	eps: 1e-5,
	/** Molotov radius in tiles; only used to draw fire in F1. */
	molotovRadius: 1.0,
} as const;

/**
 * A tile as `[row, col]`.
 *
 * Why: the sight rule's call signatures share one shape.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export type Tile = readonly [number, number];

/**
 * Viewer state for `canSee`: tile plus one of 8 facings (0 = north, clockwise, 45° steps).
 *
 * Why: the sight rule's call signatures share one shape.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export interface Viewer {
	readonly r: number;
	readonly c: number;
	readonly facing: number;
}

/**
 * A player for `visiblePairs`.
 *
 * Why: the sight rule's call signatures share one shape.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export interface Player extends Viewer {
	readonly alive: boolean;
}

/**
 * The 33 sample tiles of the segment `a → b`: for `k = 0…32`, `num = a·(32−k) + b·k` (exact
 * integers) and the tile is `floor((2·num + d) / (2·d))` per axis (round half up, `d = 32`).
 *
 * Why: this exact rounding is what the game does; no sub-tile points, no Bresenham.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 1)
 */
export function samplePoints(a: Tile, b: Tile): Array<[number, number]> {
	const d = SIGHT.samples - 1;
	const out: Array<[number, number]> = [];
	for (let k = 0; k <= d; k++) {
		const nr = a[0] * (d - k) + b[0] * k;
		const nc = a[1] * (d - k) + b[1] * k;
		out.push([Math.floor((2 * nr + d) / (2 * d)), Math.floor((2 * nc + d) / (2 * d))]);
	}
	return out;
}

/**
 * Line of sight between tiles with the "legs" smoke rule: clear iff no sample tile is a wall and
 * no sample tile carries smoke unless that tile is `b`. A viewer inside smoke sees nothing; a
 * target inside smoke can still be seen from outside. `smokes` holds flat tile indices
 * (`r * map.w + c`), e.g. from `smokeTiles`.
 *
 * Why: without smoke it is symmetric bit for bit; with smoke it is directional.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 1–2, 5)
 */
export function lineOfSight(map: GridMap, a: Tile, b: Tile, smokes: ReadonlySet<number>): boolean {
	for (const [r, c] of samplePoints(a, b)) {
		if (isWall(map, r, c)) return false;
		if (smokes.size > 0 && smokes.has(r * map.w + c) && !(r === b[0] && c === b[1])) return false;
	}
	return true;
}

/**
 * Whether `target` is inside the viewer's cone and range (geometry only, no walls or smoke).
 *
 * Why: it is the map-independent half of `canSee`, so the parity test can check it without grids.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 3)
 */
export function inVisionCone(
	viewer: Viewer,
	target: { readonly r: number; readonly c: number },
): boolean {
	const dr = target.r - viewer.r;
	const dc = target.c - viewer.c;
	const dist = Math.hypot(dr, dc);
	if (dist > SIGHT.rangeTiles + SIGHT.eps) return false;
	const theta = (viewer.facing * Math.PI) / 4;
	const dot = dr * -Math.cos(theta) + dc * Math.sin(theta);
	const halfCos = Math.cos(((SIGHT.fovDeg / 2) * Math.PI) / 180);
	return dot / Math.max(dist, 1e-6) >= halfCos - SIGHT.eps;
}

/**
 * Whether the viewer sees the target: in cone, in range, and with line of sight under the smoke
 * rule. Aliveness and `i ≠ j` are checked by `visiblePairs`.
 *
 * Why: vision is not symmetric (facing, smoke direction).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 3)
 */
export function canSee(
	map: GridMap,
	viewer: Viewer,
	target: { readonly r: number; readonly c: number },
	smokes: ReadonlySet<number>,
): boolean {
	if (!inVisionCone(viewer, target)) return false;
	return lineOfSight(map, [viewer.r, viewer.c], [target.r, target.c], smokes);
}

/**
 * Flat indices of the tiles a smoke landing at `landing` covers: every non-wall tile within
 * `smokeRadius + eps` (Euclidean) of it, walls ignored, no flood fill (up to 13 tiles).
 *
 * Why: the game uses a disc, not a flood, so smoke leaks through thin walls' far side as drawn.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 2)
 */
export function smokeTiles(map: GridMap, landing: Tile): number[] {
	const reach = Math.ceil(SIGHT.smokeRadius);
	const out: number[] = [];
	for (let r = landing[0] - reach; r <= landing[0] + reach; r++) {
		for (let c = landing[1] - reach; c <= landing[1] + reach; c++) {
			if (r < 0 || c < 0 || r >= map.h || c >= map.w) continue;
			if (isWall(map, r, c)) continue;
			if (Math.hypot(r - landing[0], c - landing[1]) <= SIGHT.smokeRadius + SIGHT.eps) {
				out.push(r * map.w + c);
			}
		}
	}
	return out;
}

/**
 * Every ordered pair `[i, j]` where living player `i` sees living player `j` (`i ≠ j`), in
 * `i`-then-`j` order.
 *
 * Why: F2 draws all sightlines from one call.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.2)
 */
export function visiblePairs(
	map: GridMap,
	players: readonly Player[],
	smokes: ReadonlySet<number>,
): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	players.forEach((p, i) => {
		if (!p.alive) return;
		players.forEach((q, j) => {
			if (i !== j && q.alive && canSee(map, p, q, smokes)) out.push([i, j]);
		});
	});
	return out;
}
