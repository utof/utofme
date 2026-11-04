/**
 * F2 logic: the literal scene (AC6.1), sightline counts, moves, smokes, sample dots, line geometry.
 * Expected counts are computed with `sight.ts`, never written as literals (AC6.5 note).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (AC6.1, AC6.5)
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import data from "../../src/data/article/maps_cs.json";
import {
	addSmoke,
	type Board,
	dotPath,
	dotsFor,
	facingText,
	lineSegments,
	MAP_NAME,
	MAX_SMOKES,
	moveSmoke,
	moveToken,
	placeSmoke,
	placeToken,
	readout,
	readoutText,
	removeSmoke,
	SMOKE_SPOTS,
	START_TOKENS,
	SUGGESTED_SMOKE,
	sightlines,
	smokeSet,
	startBoard,
	tilesPath,
	tileText,
	tokenLabel,
	turnToken,
	whoSees,
} from "../../src/lib/figures/smoke-sight";
import { isWall, parseRows } from "../../src/lib/grid";
import { canSee, lineOfSight, samplePoints, smokeTiles } from "../../src/lib/sight";

const mirage = data.maps.find((m) => m.name === MAP_NAME);
if (!mirage) throw new Error("maps_cs has no Mirage");
const map = parseRows(mirage.rows);
const floors: Array<[number, number]> = [];
for (let r = 0; r < map.h; r++)
	for (let c = 0; c < map.w; c++) if (!isWall(map, r, c)) floors.push([r, c]);

/** Independent brute force: every ordered cross-team pair through `canSee`. */
function brute(board: Board): number {
	const set = new Set<number>();
	for (const s of board.smokes) for (const i of smokeTiles(map, s)) set.add(i);
	let n = 0;
	board.tokens.forEach((a, i) => {
		board.tokens.forEach((b, j) => {
			if (i !== j && a.side !== b.side && canSee(map, a, b, set)) n++;
		});
	});
	return n;
}

describe("the literal scene (AC6.1)", () => {
	it("is Mirage with 5 CT and 5 T on distinct floor tiles and a legal facing each", () => {
		expect(MAP_NAME).toBe("de_mirage");
		expect(START_TOKENS).toHaveLength(10);
		expect(START_TOKENS.filter((t) => t.side === "ct")).toHaveLength(5);
		expect(START_TOKENS.filter((t) => t.side === "t")).toHaveLength(5);
		const seen = new Set<string>();
		for (const t of START_TOKENS) {
			expect(isWall(map, t.r, t.c), tokenLabel(t)).toBe(false);
			expect(Number.isInteger(t.facing) && t.facing >= 0 && t.facing < 8).toBe(true);
			expect(t.alive).toBe(true);
			seen.add(`${t.r},${t.c}`);
		}
		expect(seen.size).toBe(10);
		for (const side of ["ct", "t"] as const) {
			expect(START_TOKENS.filter((t) => t.side === side).map((t) => t.n)).toEqual([1, 2, 3, 4, 5]);
		}
	});

	it("starts with no smoke, and the initial count equals the brute-force count and is at least 8", () => {
		const b = startBoard();
		expect(b.smokes).toEqual([]);
		const r = readout(map, b);
		expect(r.count).toBe(brute(b));
		expect(r.base).toBe(r.count);
		expect(r.count).toBeGreaterThanOrEqual(8);
	});

	it("the suggested smoke is a floor tile covering no token and removes at least 30% of the lines", () => {
		const [sr, sc] = SUGGESTED_SMOKE;
		expect(isWall(map, sr, sc)).toBe(false);
		const covered = new Set(smokeTiles(map, SUGGESTED_SMOKE));
		for (const t of START_TOKENS) expect(covered.has(t.r * map.w + t.c), tokenLabel(t)).toBe(false);
		const base = readout(map, startBoard()).count;
		const withSmoke = readout(map, { ...startBoard(), smokes: [SUGGESTED_SMOKE] });
		expect(withSmoke.count).toBe(brute({ ...startBoard(), smokes: [SUGGESTED_SMOKE] }));
		expect(withSmoke.count).toBeLessThanOrEqual(base * 0.7);
		expect(withSmoke.base).toBe(base);
	});

	it("smoke spots start with the suggested smoke, are floor tiles and distinct", () => {
		expect(SMOKE_SPOTS[0]).toEqual(SUGGESTED_SMOKE);
		expect(SMOKE_SPOTS).toHaveLength(MAX_SMOKES);
		expect(new Set(SMOKE_SPOTS.map((s) => s.join(","))).size).toBe(MAX_SMOKES);
		for (const [r, c] of SMOKE_SPOTS) expect(isWall(map, r, c)).toBe(false);
	});
});

describe("sightlines", () => {
	it("lists cross-team directed pairs only, by token index", () => {
		const lines = sightlines(map, START_TOKENS, []);
		for (const l of lines) {
			expect(START_TOKENS[l.from]?.side).not.toBe(START_TOKENS[l.to]?.side);
		}
		expect(new Set(lines.map((l) => `${l.from}>${l.to}`)).size).toBe(lines.length);
	});

	const tokenArb = fc
		.uniqueArray(fc.constantFrom(...floors), {
			minLength: 10,
			maxLength: 10,
			selector: ([r, c]) => r * 28 + c,
		})
		.chain((tiles) =>
			fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 10, maxLength: 10 }).map((f) =>
				tiles.map(([r, c], i) => ({
					side: i < 5 ? ("ct" as const) : ("t" as const),
					n: (i % 5) + 1,
					r,
					c,
					facing: f[i] ?? 0,
					alive: true,
				})),
			),
		);
	const smokesArb = fc.array(fc.constantFrom(...floors), { maxLength: 3 });

	test.prop([tokenArb, smokesArb])(
		"equals the brute-force count for random boards",
		(tokens, smokes) => {
			const b: Board = { tokens, smokes };
			expect(sightlines(map, tokens, smokes)).toHaveLength(brute(b));
			expect(readout(map, b).count).toBe(brute(b));
			expect(readout(map, b).base).toBe(brute({ tokens, smokes: [] }));
		},
	);

	test.prop([tokenArb, smokesArb, fc.constantFrom(...floors)])(
		"adding a smoke never adds a sightline",
		(tokens, smokes, extra) => {
			const before = readout(map, { tokens, smokes }).count;
			const after = readout(map, { tokens, smokes: [...smokes, extra] }).count;
			expect(after).toBeLessThanOrEqual(before);
		},
	);

	it("legs rule: a target inside a smoke is still seen from outside it; a viewer inside sees no one (AC6.5)", () => {
		const board = startBoard();
		const lines = sightlines(map, board.tokens, []);
		const first = lines[0];
		if (!first) throw new Error("the start scene has no sightline");
		const viewer = board.tokens[first.from];
		const target = board.tokens[first.to];
		if (!viewer || !target) throw new Error("bad index");
		// Smoke landing on the target: only target-tile samples are smoked on the segment's end, so it stays seen
		// as long as no other sample tile is covered; a smoke landing on the viewer blocks all of its own lines.
		const onViewer = sightlines(map, board.tokens, [[viewer.r, viewer.c]]);
		expect(onViewer.filter((l) => l.from === first.from)).toEqual([]);
		const set = new Set(smokeTiles(map, [target.r, target.c]));
		const expected = lineOfSight(map, [viewer.r, viewer.c], [target.r, target.c], set);
		const got = sightlines(map, board.tokens, [[target.r, target.c]]).some(
			(l) => l.from === first.from && l.to === first.to,
		);
		expect(got).toBe(expected && canSee(map, viewer, target, set));
	});
});

describe("readoutText", () => {
	it("prints the plain count with no smoke and 'was' with the base once smokes exist", () => {
		expect(readoutText({ count: 11, base: 11 }, 0)).toBe("Enemy sightlines: 11");
		expect(readoutText({ count: 3, base: 11 }, 1)).toBe(
			"Enemy sightlines: 3 (was 11 with no smoke)",
		);
		expect(readoutText({ count: 11, base: 11 }, 2)).toBe(
			"Enemy sightlines: 11 (was 11 with no smoke)",
		);
	});
});

describe("labels", () => {
	it("names a token with one-based row and column", () => {
		const t = START_TOKENS.find((x) => x.side === "ct" && x.n === 1);
		if (!t) throw new Error("no CT 1");
		expect(tokenLabel(t)).toBe(`CT 1 at ${tileText([t.r, t.c])}`);
		expect(tileText([0, 0])).toBe("row 1, column 1");
		expect(tileText([11, 13])).toBe("row 12, column 14");
		const tt = START_TOKENS.find((x) => x.side === "t" && x.n === 2);
		if (!tt) throw new Error("no T 2");
		expect(tokenLabel(tt).startsWith("T 2 at ")).toBe(true);
	});
});

describe("moving tokens", () => {
	const board = startBoard();
	const find = (side: "ct" | "t", n: number) =>
		board.tokens.findIndex((t) => t.side === side && t.n === n);

	it("moves one tile along an open direction and leaves facing alone", () => {
		for (let i = 0; i < board.tokens.length; i++) {
			const t = board.tokens[i];
			if (!t) continue;
			for (const [dr, dc] of [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			] as const) {
				const moved = moveToken(map, board, i, dr, dc);
				const free =
					!isWall(map, t.r + dr, t.c + dc) &&
					!board.tokens.some((o) => o.r === t.r + dr && o.c === t.c + dc);
				if (free) {
					expect(moved.tokens[i]).toMatchObject({ r: t.r + dr, c: t.c + dc, facing: t.facing });
				} else {
					expect(moved).toBe(board);
				}
			}
		}
	});

	it("stops before a wall, the edge or another token, and a Shift move goes up to five tiles", () => {
		const i = find("t", 1);
		const t = board.tokens[i];
		if (!t) throw new Error("no T 1");
		const far = moveToken(map, board, i, 0, -5);
		const dc = (far.tokens[i]?.c ?? t.c) - t.c;
		expect(dc).toBeLessThanOrEqual(0);
		expect(dc).toBeGreaterThanOrEqual(-5);
		for (let c = t.c + dc; c <= t.c; c++) expect(isWall(map, t.r, c)).toBe(false);
		// A token never ends on a wall, off the grid or on another token.
		const edge = moveToken(map, board, i, -40, 0);
		const e = edge.tokens[i];
		expect(e && !isWall(map, e.r, e.c)).toBe(true);
	});

	test.prop([fc.nat(9), fc.constantFrom(...floors)])(
		"placeToken lands on free floor or does nothing",
		(i, [r, c]) => {
			const b = placeToken(map, board, i, r, c);
			const taken = board.tokens.some((o, j) => j !== i && o.r === r && o.c === c);
			if (taken) expect(b).toBe(board);
			else expect(b.tokens[i]).toMatchObject({ r, c });
			expect(b.smokes).toBe(board.smokes);
		},
	);

	it("placeToken ignores walls and off-grid tiles", () => {
		expect(placeToken(map, board, 0, 0, 0)).toBe(board);
		expect(placeToken(map, board, 0, -1, 4)).toBe(board);
		expect(placeToken(map, board, 0, 40, 4)).toBe(board);
	});

	it("turnToken rotates in 45 degree steps and wraps", () => {
		const i = 0;
		const f = board.tokens[i]?.facing ?? 0;
		expect(turnToken(board, i, 1).tokens[i]?.facing).toBe((f + 1) % 8);
		expect(turnToken(board, i, -1).tokens[i]?.facing).toBe((f + 7) % 8);
		expect(turnToken(turnToken(board, i, 4), i, 4).tokens[i]?.facing).toBe(f);
	});
});

describe("smokes", () => {
	it("addSmoke drops the first free spot, up to three, and then stops", () => {
		let b = startBoard();
		b = addSmoke(map, b);
		expect(b.smokes).toEqual([SMOKE_SPOTS[0]]);
		b = addSmoke(map, b);
		expect(b.smokes).toEqual([SMOKE_SPOTS[0], SMOKE_SPOTS[1]]);
		b = addSmoke(map, b);
		expect(b.smokes).toHaveLength(MAX_SMOKES);
		expect(addSmoke(map, b)).toBe(b);
	});

	it("addSmoke at a tile uses it when free and falls back to a spot when not", () => {
		const base = startBoard();
		const t = base.tokens[0];
		if (!t) throw new Error("no token");
		const [r, c] = floors.find(
			([fr, fc]) => !base.tokens.some((o) => o.r === fr && o.c === fc),
		) ?? [0, 0];
		expect(addSmoke(map, base, [r, c]).smokes).toEqual([[r, c]]);
		const b = addSmoke(map, base, [0, 0]);
		expect(b.smokes).toEqual([SMOKE_SPOTS[0]]);
	});

	it("moveSmoke steps over floor only and never onto another smoke; placeSmoke likewise", () => {
		const b = addSmoke(map, addSmoke(map, startBoard()));
		const [a, c] = b.smokes;
		if (!a || !c) throw new Error("two smokes expected");
		expect(placeSmoke(map, b, 0, c[0], c[1])).toBe(b);
		expect(placeSmoke(map, b, 0, 0, 0)).toBe(b);
		const moved = moveSmoke(map, b, 0, 0, 1);
		const s = moved.smokes[0];
		if (s === a) expect(moved).toBe(b);
		else expect(s && !isWall(map, s[0], s[1])).toBe(true);
	});

	it("removeSmoke drops one by index and keeps the others in order", () => {
		const b = addSmoke(map, addSmoke(map, addSmoke(map, startBoard())));
		const r = removeSmoke(b, 1);
		expect(r.smokes).toEqual([b.smokes[0], b.smokes[2]]);
		expect(removeSmoke(b, 9)).toBe(b);
	});

	it("smokeSet is the union of the discs", () => {
		const b = addSmoke(map, addSmoke(map, startBoard()));
		const set = smokeSet(map, b.smokes);
		for (const s of b.smokes) for (const i of smokeTiles(map, s)) expect(set.has(i)).toBe(true);
		expect(smokeSet(map, []).size).toBe(0);
	});
});

describe("sample dots", () => {
	it("cover every in-cone, in-range cross-team pair; blockedAt is null exactly when the line is clear", () => {
		const b: Board = { ...startBoard(), smokes: [SUGGESTED_SMOKE] };
		const set = smokeSet(map, b.smokes);
		const dots = dotsFor(map, b);
		expect(dots.length).toBeGreaterThanOrEqual(readout(map, b).count);
		for (const d of dots) {
			const from = b.tokens[d.from];
			const to = b.tokens[d.to];
			if (!from || !to) throw new Error("bad index");
			expect(d.samples).toEqual(samplePoints([from.r, from.c], [to.r, to.c]));
			expect(d.seen).toBe(canSee(map, from, to, set));
			if (d.seen) expect(d.blockedAt).toBeNull();
			else {
				const at = d.blockedAt;
				if (!at) throw new Error("a blocked pair needs a blocking sample");
				expect(d.samples.some(([r, c]) => r === at[0] && c === at[1])).toBe(true);
			}
		}
		expect(dots.filter((d) => d.seen)).toHaveLength(readout(map, b).count);
	});
});

describe("line geometry", () => {
	it("one segment per sightline, inside the board, centred when one-way and offset in parallel when both ways", () => {
		const b = startBoard();
		const lines = sightlines(map, b.tokens, []);
		const segs = lineSegments(lines, b.tokens);
		expect(segs).toHaveLength(lines.length);
		for (const [k, s] of segs.entries()) {
			const l = lines[k];
			if (!l) throw new Error("index");
			expect(s.side).toBe(b.tokens[l.from]?.side);
			for (const v of [s.x1, s.y1, s.x2, s.y2]) {
				expect(v).toBeGreaterThan(0);
				expect(v).toBeLessThan(28);
			}
			const both = lines.some((o) => o.from === l.to && o.to === l.from);
			expect(s.doubled).toBe(both);
		}
		const doubled = segs.filter((s) => s.doubled);
		const reverse = (s: (typeof segs)[number]) =>
			segs.find((o) => o.from === s.to && o.to === s.from);
		expect(doubled.length).toBeGreaterThan(0);
		for (const s of doubled) {
			const o = reverse(s);
			expect(o).toBeDefined();
			if (!o) continue;
			// two lines, a distinct fraction of a tile apart
			const gap = Math.hypot((s.x1 + s.x2 - o.x1 - o.x2) / 2, (s.y1 + s.y2 - o.y1 - o.y2) / 2);
			expect(gap).toBeGreaterThan(0.2);
			expect(gap).toBeLessThan(0.5);
			// parallel: direction vectors are opposite
			const cross = (s.x2 - s.x1) * (o.y2 - o.y1) - (s.y2 - s.y1) * (o.x2 - o.x1);
			expect(Math.abs(cross)).toBeLessThan(1e-9);
		}
	});
});

describe("text helpers", () => {
	it("facingText names the eight directions and wraps", () => {
		expect([0, 1, 2, 3, 4, 5, 6, 7].map(facingText)).toEqual([
			"north",
			"north-east",
			"east",
			"south-east",
			"south",
			"south-west",
			"west",
			"north-west",
		]);
		expect(facingText(8)).toBe("north");
		expect(facingText(-1)).toBe("north-west");
	});

	it("whoSees lists the targets and the viewers of a token from the sightlines", () => {
		const b = startBoard();
		const lines = sightlines(map, b.tokens, []);
		b.tokens.forEach((t, i) => {
			const text = whoSees(b.tokens, lines, i);
			const sees = lines.filter((l) => l.from === i).length;
			const seen = lines.filter((l) => l.to === i).length;
			expect(
				text.startsWith(
					`${t.side === "ct" ? "CT" : "T"} ${t.n} faces ${facingText(t.facing)}, sees `,
				),
			).toBe(true);
			expect(text.includes("sees no one")).toBe(sees === 0);
			expect(text.includes("seen by no one")).toBe(seen === 0);
		});
		expect(whoSees(b.tokens, lines, 99)).toBe("");
	});
});

describe("path helpers", () => {
	it("dotPath draws each tile once at its centre", () => {
		expect(
			dotPath([
				[1, 2],
				[1, 2],
				[3, 0],
			]),
		).toBe("M2.5 1.5h0M0.5 3.5h0");
		expect(dotPath([])).toBe("");
	});

	it("tilesPath draws one unit square per flat index", () => {
		expect(tilesPath(28, [0, 29])).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
		expect(tilesPath(28, [])).toBe("");
	});
});
