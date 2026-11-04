/**
 * Grid helpers (AC4.3): legends, wall path raster equality, tick/second round trip, angles.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.3)
 */
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CELL,
	facingToScreen,
	isWall,
	neighbours4,
	neighbours8,
	parseRows,
	secondsToTicks,
	siteRects,
	spawnTiles,
	TICK_S,
	TILE_M,
	ticksToSeconds,
	tileToMetres,
	wallPath,
	yawToScreen,
} from "../../src/lib/grid";

const csRows = ["#######", "#t...c#", "#.A...#", "#.....#", "#....B#", "#######"];
const replayRows = ["#####", "#aaa#", "#aaa#", "#.bb#", "#####"];

/** Rasterise a path of `M x y h w v s h -w z` rectangles back to a wall mask. */
function raster(path: string, w: number, h: number, cell: number): boolean[] {
	const out = new Array<boolean>(w * h).fill(false);
	for (const m of path.matchAll(/M(-?\d+) (-?\d+)h(\d+)v(\d+)h-\d+z/g)) {
		const x = Number(m[1]) / cell;
		const y = Number(m[2]) / cell;
		const len = Number(m[3]) / cell;
		for (let i = 0; i < len; i++) out[y * w + x + i] = true;
	}
	return out;
}

describe("constants and conversions", () => {
	it("pins the tile and tick sizes", () => {
		expect(TILE_M).toBe(4.39);
		expect(TICK_S).toBe(0.8);
		expect(tileToMetres(2)).toBeCloseTo(8.78, 10);
	});
	test.prop([fc.integer({ min: 0, max: 100000 })])("secondsToTicks inverts ticksToSeconds", (n) => {
		expect(secondsToTicks(ticksToSeconds(n))).toBe(n);
	});
});

describe("parseRows", () => {
	it("reads the maps_cs legend: A/B centres expand to 3x3, t/c are spawns", () => {
		const m = parseRows(csRows);
		expect(m.w).toBe(7);
		expect(m.h).toBe(6);
		expect(m.cells[2 * 7 + 2]).toBe(CELL.SITE_A);
		expect(m.cells[1 * 7 + 1]).toBe(CELL.SPAWN_T); // spawns survive the 3x3
		expect(m.cells[1 * 7 + 2]).toBe(CELL.SITE_A);
		expect(m.cells[3 * 7 + 3]).toBe(CELL.SITE_A);
		expect(m.cells[4 * 7 + 5]).toBe(CELL.SITE_B);
		expect(spawnTiles(m, "t")).toEqual([[1, 1]]);
		expect(spawnTiles(m, "ct")).toEqual([[1, 5]]);
		expect(siteRects(m, "a")).toEqual([{ r0: 1, c0: 1, r1: 3, c1: 3 }]);
	});
	it("reads the replay legend: every a/b tile is a site tile", () => {
		const m = parseRows(replayRows);
		expect(m.cells.filter((c) => c === CELL.SITE_A).length).toBe(6);
		expect(m.cells.filter((c) => c === CELL.SITE_B).length).toBe(2);
		expect(siteRects(m, "a")).toEqual([{ r0: 1, c0: 1, r1: 2, c1: 3 }]);
	});
	it("rejects ragged rows and unknown glyphs", () => {
		expect(() => parseRows(["##", "#"])).toThrow();
		expect(() => parseRows(["#?"])).toThrow();
	});
	it("isWall treats out-of-bounds as wall", () => {
		const m = parseRows(csRows);
		expect(isWall(m, 0, 0)).toBe(true);
		expect(isWall(m, 2, 2)).toBe(false);
		expect(isWall(m, -1, 3)).toBe(true);
		expect(isWall(m, 3, 99)).toBe(true);
	});
	it("neighbours stay in bounds", () => {
		const m = parseRows(csRows);
		expect(neighbours4(m, 0, 0)).toEqual([
			[1, 0],
			[0, 1],
		]);
		expect(neighbours8(m, 3, 3).length).toBe(8);
		expect(neighbours8(m, 0, 0).length).toBe(3);
	});
	const rowsArb = fc
		.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }))
		.chain(([w, h]) =>
			fc.array(
				fc.array(fc.constantFrom("#", "."), { minLength: w, maxLength: w }).map((r) => r.join("")),
				{ minLength: h, maxLength: h },
			),
		);
	test.prop([rowsArb])("round-trips wall/floor rows", (rows) => {
		const m = parseRows(rows);
		rows.forEach((row, r) => {
			[...row].forEach((ch, c) => {
				expect(isWall(m, r, c)).toBe(ch === "#");
			});
		});
	});
	test.prop([rowsArb, fc.integer({ min: 1, max: 20 })])(
		"wallPath covers exactly the wall cells",
		(rows, cell) => {
			const m = parseRows(rows);
			const got = raster(wallPath(m, cell), m.w, m.h, cell);
			expect(got).toEqual([...rows.join("")].map((ch) => ch === "#"));
		},
	);
	it("wallPath merges runs and is empty without walls", () => {
		expect(wallPath(parseRows(["..."]), 10)).toBe("");
		expect(wallPath(parseRows(["#.##"]), 10)).toBe("M0 0h10v10h-10zM20 0h20v10h-20z");
	});
});

describe("angles", () => {
	it("agree on the 8 directions; yaw 90 = facing 0 = north", () => {
		expect(yawToScreen(90)).toBe(0);
		expect(facingToScreen(0)).toBe(0);
		for (let f = 0; f < 8; f++) expect(yawToScreen(90 - 45 * f)).toBe(facingToScreen(f));
		expect(yawToScreen(0)).toBe(90);
		expect(facingToScreen(8)).toBe(0);
		expect(facingToScreen(-1)).toBe(315);
	});
});
