/**
 * Sight rule properties (AC4.2) and hand-checked cases.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.2)
 */
import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type GridMap, parseRows } from "../../src/lib/grid";
import {
	canSee,
	lineOfSight,
	type Player,
	SIGHT,
	samplePoints,
	smokeTiles,
	visiblePairs,
} from "../../src/lib/sight";

const W = 12;
const H = 12;
const NONE: ReadonlySet<number> = new Set();

const mapArb = fc.array(fc.boolean(), { minLength: W * H, maxLength: W * H }).map((bits) =>
	parseRows(
		Array.from({ length: H }, (_, r) =>
			bits
				.slice(r * W, r * W + W)
				.map((b) => (b ? "#" : "."))
				.join(""),
		),
	),
);
const tileArb = fc.tuple(fc.integer({ min: 0, max: H - 1 }), fc.integer({ min: 0, max: W - 1 }));
const idx = (map: GridMap, [r, c]: readonly [number, number]) => r * map.w + c;

describe("constants", () => {
	it("pins the settings of the line the page shows", () => {
		expect(SIGHT.samples).toBe(33);
		expect(SIGHT.fovDeg).toBe(106);
		expect(SIGHT.rangeTiles).toBe(10);
		expect(SIGHT.smokeRadius).toBe(2);
		expect(SIGHT.eps).toBe(1e-5);
		expect(SIGHT.molotovRadius).toBe(1);
	});
});

describe("samplePoints", () => {
	it("is 33 exact-integer samples with round-half-up, endpoints included", () => {
		const s = samplePoints([0, 0], [0, 1]);
		expect(s.length).toBe(33);
		expect(s[0]).toEqual([0, 0]);
		expect(s[32]).toEqual([0, 1]);
		// k = 16: num = 16, floor((16 + 16) / 32) = 1 (half rounds up)
		expect(s[15]).toEqual([0, 0]);
		expect(s[16]).toEqual([0, 1]);
		expect(samplePoints([3, 4], [3, 4]).every(([r, c]) => r === 3 && c === 4)).toBe(true);
	});
});

describe("lineOfSight", () => {
	const map = parseRows(["#######", "#.....#", "#..#..#", "#.....#", "#######"]);
	it("is blocked by a wall between and clear otherwise", () => {
		expect(lineOfSight(map, [2, 1], [2, 5], NONE)).toBe(false);
		expect(lineOfSight(map, [1, 1], [1, 5], NONE)).toBe(true);
	});
	it("smoke on the segment blocks unless on the target tile", () => {
		const s = new Set([1 * 7 + 3]);
		expect(lineOfSight(map, [1, 1], [1, 5], s)).toBe(false);
		expect(lineOfSight(map, [1, 1], [1, 3], s)).toBe(true);
		// viewer inside smoke sees nothing; target inside smoke can be seen from outside
		expect(lineOfSight(map, [1, 3], [1, 5], s)).toBe(false);
	});
});

describe("smokeTiles", () => {
	it("is the 13-tile disc in open ground, without walls", () => {
		const open = parseRows(Array.from({ length: 9 }, () => ".".repeat(9)));
		expect(smokeTiles(open, [4, 4]).length).toBe(13);
		const walled = parseRows(["#####", "#...#", "#...#", "#####"]);
		for (const t of smokeTiles(walled, [1, 2])) expect(walled.cells[t]).not.toBe(0);
	});
});

describe("canSee", () => {
	const open = parseRows(Array.from({ length: 24 }, () => ".".repeat(24)));
	it("respects cone, range and facing (no see-behind)", () => {
		const v = { r: 12, c: 12, facing: 0 }; // north
		expect(canSee(open, v, { r: 8, c: 12 }, NONE)).toBe(true);
		expect(canSee(open, v, { r: 16, c: 12 }, NONE)).toBe(false);
		expect(canSee(open, v, { r: 2, c: 12 }, NONE)).toBe(true); // distance 10 exactly
		expect(canSee(open, v, { r: 1, c: 12 }, NONE)).toBe(false);
		expect(canSee(open, { ...v, facing: 2 }, { r: 12, c: 16 }, NONE)).toBe(true);
		expect(canSee(open, v, { r: 12, c: 12 }, NONE)).toBe(false);
	});
});

describe("visiblePairs", () => {
	// Why: with random half-wall maps the brute-force property rarely meets a visible pair, so
	// Stryker found the loop's guards untested; this fixed scene pins them (lane I, mutation run).
	it("lists living viewer-target pairs only, in i-then-j order", () => {
		const open = parseRows(Array.from({ length: 12 }, () => ".".repeat(12)));
		const players: Player[] = [
			{ r: 5, c: 2, facing: 2, alive: true }, // east, toward 1
			{ r: 5, c: 6, facing: 6, alive: true }, // west, toward 0
			{ r: 5, c: 4, facing: 2, alive: false }, // dead, between them, facing 1
		];
		expect(visiblePairs(open, players, NONE)).toEqual([
			[0, 1],
			[1, 0],
		]);
		// A smoke whose rim covers player 0: 0 sees nobody, 1 still sees 0 (the legs rule).
		const smoked = new Set(smokeTiles(open, [5, 0]));
		expect(visiblePairs(open, players, smoked)).toEqual([[1, 0]]);
	});
});

describe("properties (AC4.2)", () => {
	test.prop([mapArb, tileArb, tileArb])("lineOfSight is symmetric without smoke", (map, a, b) => {
		expect(lineOfSight(map, a, b, NONE)).toBe(lineOfSight(map, b, a, NONE));
	});
	test.prop([mapArb, tileArb, tileArb, tileArb])("adding a smoke never reveals", (map, a, b, s) => {
		const smoked = new Set(smokeTiles(map, s));
		if (!lineOfSight(map, a, b, NONE)) expect(lineOfSight(map, a, b, smoked)).toBe(false);
	});
	test.prop([mapArb, tileArb, tileArb, tileArb])("adding a wall never reveals", (map, a, b, w) => {
		const cells = Uint8Array.from(map.cells);
		cells[idx(map, w)] = 0;
		const walled: GridMap = { ...map, cells };
		if (!lineOfSight(map, a, b, NONE)) expect(lineOfSight(walled, a, b, NONE)).toBe(false);
	});
	test.prop([tileArb, tileArb, fc.integer({ min: 0, max: 7 })])(
		"never sees beyond range",
		(a, b, f) => {
			const open = parseRows(Array.from({ length: H }, () => ".".repeat(W)));
			const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
			if (dist > SIGHT.rangeTiles + SIGHT.eps) {
				expect(canSee(open, { r: a[0], c: a[1], facing: f }, { r: b[0], c: b[1] }, NONE)).toBe(
					false,
				);
			}
		},
	);
	const playerArb: fc.Arbitrary<Player> = fc.record({
		r: fc.integer({ min: 0, max: H - 1 }),
		c: fc.integer({ min: 0, max: W - 1 }),
		facing: fc.integer({ min: 0, max: 7 }),
		alive: fc.boolean(),
	});
	test.prop([mapArb, fc.array(playerArb, { maxLength: 6 }), tileArb])(
		"visiblePairs equals the brute-force double loop",
		(map, players, s) => {
			const smoked = new Set(smokeTiles(map, s));
			const want: Array<[number, number]> = [];
			players.forEach((p, i) => {
				players.forEach((q, j) => {
					if (i !== j && p.alive && q.alive && canSee(map, p, q, smoked)) want.push([i, j]);
				});
			});
			expect(visiblePairs(map, players, smoked)).toEqual(want);
		},
	);
});
