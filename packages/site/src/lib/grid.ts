/**
 * Tile grid helpers shared by the article figures (units, legends, wall path, angles).
 *
 * Why: F1, F2, F5 and F10 all draw the same 28×28 maps; one parser and one angle convention
 * keep replay (`yaw`, degrees CCW from east) and sight (`facing`, clockwise from north in 45°
 * steps) on one screen angle: degrees clockwise from north (0 = up).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.3)
 */

/**
 * Metres per tile.
 * Why: one shared value for every figure.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export const TILE_M = 4.39;
/**
 * Seconds per replay tick.
 * Why: one shared value for every figure.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export const TICK_S = 0.8;

/**
 * Cell codes stored in `GridMap.cells`.
 * Why: one shared value for every figure.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export const CELL = {
	WALL: 0,
	FLOOR: 1,
	SITE_A: 2,
	SITE_B: 3,
	SPAWN_T: 4,
	SPAWN_CT: 5,
} as const;

/**
 * A parsed map.
 *
 * Why: a flat `Uint8Array` keeps the 28×28 grid cheap to copy and to scan.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export interface GridMap {
	readonly w: number;
	readonly h: number;
	/** Row-major cell codes (`CELL`). */
	readonly cells: Uint8Array;
}

/**
 * A site's tile rectangle, inclusive on both ends.
 *
 * Why: figures box a site instead of tinting tiles.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export interface SiteRect {
	readonly r0: number;
	readonly c0: number;
	readonly r1: number;
	readonly c1: number;
}

const GLYPH: Readonly<Record<string, number>> = {
	"#": CELL.WALL,
	".": CELL.FLOOR,
	a: CELL.SITE_A,
	b: CELL.SITE_B,
	t: CELL.SPAWN_T,
	c: CELL.SPAWN_CT,
};

/**
 * Parse map rows. Accepts both legends: `maps_cs` (`A`/`B` mark a site centre and the site is
 * the 3×3 around it) and the replay (`a`/`b` mark every site tile). `#` is wall, `.` floor,
 * `t`/`c` spawns. Throws on ragged rows or an unknown glyph.
 *
 * Why: the two exports differ only in site glyph case; failing loudly beats a silent floor.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function parseRows(rows: readonly string[]): GridMap {
	const h = rows.length;
	const w = rows[0]?.length ?? 0;
	const cells = new Uint8Array(w * h).fill(CELL.FLOOR);
	const centres: Array<[number, number, number]> = [];
	rows.forEach((row, r) => {
		if (row.length !== w)
			throw new Error(`parseRows: row ${r} has length ${row.length}, want ${w}`);
		[...row].forEach((ch, c) => {
			if (ch === "A" || ch === "B") {
				centres.push([r, c, ch === "A" ? CELL.SITE_A : CELL.SITE_B]);
				return;
			}
			const code = GLYPH[ch];
			if (code === undefined) throw new Error(`parseRows: unknown glyph "${ch}" at ${r},${c}`);
			cells[r * w + c] = code;
		});
	});
	for (const [r, c, code] of centres) {
		for (let dr = -1; dr <= 1; dr++) {
			for (let dc = -1; dc <= 1; dc++) {
				const rr = r + dr;
				const cc = c + dc;
				if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
				// Only plain floor becomes site: walls and spawns inside the 3×3 stay.
				if (cells[rr * w + cc] !== CELL.FLOOR) continue;
				cells[rr * w + cc] = code;
			}
		}
	}
	return { w, h, cells };
}

/**
 * Whether a tile is a wall; out of bounds counts as wall.
 *
 * Why: sight sampling can leave the grid on edge tiles; the outside blocks.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function isWall(map: GridMap, r: number, c: number): boolean {
	if (r < 0 || c < 0 || r >= map.h || c >= map.w) return true;
	return map.cells[r * map.w + c] === CELL.WALL;
}

/**
 * Tiles to metres.
 *
 * Why: distances in captions are quoted in metres.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function tileToMetres(tiles: number): number {
	return tiles * TILE_M;
}

/**
 * Ticks to seconds.
 *
 * Why: one tick is 0.8 s on every figure axis.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function ticksToSeconds(ticks: number): number {
	return ticks * TICK_S;
}

/**
 * Seconds to the nearest whole tick.
 *
 * Why: rounding makes it an exact inverse of `ticksToSeconds` despite float error.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function secondsToTicks(seconds: number): number {
	return Math.round(seconds / TICK_S);
}

/**
 * One SVG path covering every wall cell, merging horizontal runs per row. Each run is a
 * rectangle `M x y h w v cell h -w z`, coordinates scaled by `cell`.
 *
 * Why: one `<path>` instead of up to 784 `<rect>`s keeps the SSR markup small.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.3)
 */
export function wallPath(map: GridMap, cell: number): string {
	let d = "";
	for (let r = 0; r < map.h; r++) {
		let c = 0;
		while (c < map.w) {
			if (map.cells[r * map.w + c] !== CELL.WALL) {
				c++;
				continue;
			}
			const start = c;
			while (c < map.w && map.cells[r * map.w + c] === CELL.WALL) c++;
			const len = (c - start) * cell;
			d += `M${start * cell} ${r * cell}h${len}v${cell}h-${len}z`;
		}
	}
	return d;
}

/**
 * Bounding rectangle of each connected-by-bounds site: the tiles of one site code, as one rect
 * (the maps have one rect per site).
 *
 * Why: figures highlight a site as a box, not tile by tile.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function siteRects(map: GridMap, site: "a" | "b"): SiteRect[] {
	const code = site === "a" ? CELL.SITE_A : CELL.SITE_B;
	let r0 = Number.POSITIVE_INFINITY;
	let c0 = Number.POSITIVE_INFINITY;
	let r1 = -1;
	let c1 = -1;
	for (let r = 0; r < map.h; r++) {
		for (let c = 0; c < map.w; c++) {
			if (map.cells[r * map.w + c] !== code) continue;
			r0 = Math.min(r0, r);
			c0 = Math.min(c0, c);
			r1 = Math.max(r1, r);
			c1 = Math.max(c1, c);
		}
	}
	return r1 < 0 ? [] : [{ r0, c0, r1, c1 }];
}

/**
 * Spawn tiles `[row, col]` for a side.
 *
 * Why: tokens in F2 start on spawns.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function spawnTiles(map: GridMap, side: "t" | "ct"): Array<[number, number]> {
	const code = side === "t" ? CELL.SPAWN_T : CELL.SPAWN_CT;
	const out: Array<[number, number]> = [];
	for (let r = 0; r < map.h; r++) {
		for (let c = 0; c < map.w; c++) if (map.cells[r * map.w + c] === code) out.push([r, c]);
	}
	return out;
}

function inside(map: GridMap, r: number, c: number): boolean {
	return r >= 0 && c >= 0 && r < map.h && c < map.w;
}

/**
 * In-bounds 4-neighbours `[row, col]`, order N, W, S, E... as (−1,0),(0,−1),(1,0),(0,1) filtered.
 *
 * Why: keyboard moves and flood fills share the order.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function neighbours4(map: GridMap, r: number, c: number): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (const [dr, dc] of [
		[-1, 0],
		[0, -1],
		[1, 0],
		[0, 1],
	] as const) {
		if (inside(map, r + dr, c + dc)) out.push([r + dr, c + dc]);
	}
	return out;
}

/**
 * In-bounds 8-neighbours `[row, col]`, row-major order.
 *
 * Why: smoke discs and diagonal moves need all eight.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function neighbours8(map: GridMap, r: number, c: number): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let dr = -1; dr <= 1; dr++) {
		for (let dc = -1; dc <= 1; dc++) {
			if ((dr !== 0 || dc !== 0) && inside(map, r + dr, c + dc)) out.push([r + dr, c + dc]);
		}
	}
	return out;
}

function mod360(deg: number): number {
	return ((deg % 360) + 360) % 360;
}

/**
 * Replay yaw (degrees CCW from east) to the screen angle (degrees clockwise from north).
 *
 * Why: yaw 90 (north) must equal facing 0 (m13).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.3)
 */
export function yawToScreen(yawDeg: number): number {
	return mod360(90 - yawDeg);
}

/**
 * Sight facing (0 = north, clockwise in 45° steps) to the screen angle in degrees.
 *
 * Why: the same screen angle as `yawToScreen`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.3)
 */
export function facingToScreen(facing: number): number {
	return mod360(facing * 45);
}
