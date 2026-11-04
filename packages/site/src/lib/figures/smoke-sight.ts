/**
 * F2 "Place a smoke, watch the sightlines change": the literal scene, the board state and every
 * pure rule the island and the SSR keyframe share (counts, moves, smokes, sample dots, line
 * geometry). All sight maths is `src/lib/sight.ts`; nothing here re-implements it except the
 * "first blocking sample", which a unit test ties back to `canSee`.
 *
 * Why: the island stays a thin view over this module, so the figure's claims (the start count,
 * the suggested smoke's cut) are unit-tested without a browser and the build-time keyframe prints
 * the same numbers the island computes (AC6.1, AC6.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 * @see packages/specs/adrs/0058-sight-rule-ts-port.md
 */
import { type GridMap, isWall } from "../grid";
import {
	canSee,
	inVisionCone,
	type Player,
	samplePoints,
	smokeTiles,
	type Tile,
	visiblePairs,
} from "../sight";

/**
 * The map the scene is set on (the dataset `maps_cs` holds five).
 *
 * Why: the scene's tile coordinates are literals for this map's canonical frame (T west, CT east,
 * A north); a re-synced `maps_cs` with a different Mirage fails the unit test, not the page.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export const MAP_NAME = "de_mirage";

/**
 * Most smoke discs on the board.
 *
 * Why: a round has three smoke grenades per team side in the story; three keeps the board legible.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export const MAX_SMOKES = 3;

/**
 * Team of a token.
 *
 * Why: CT = circle, T = triangle (colour is never the only channel, P10-2).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2
 */
export type Side = "ct" | "t";

/**
 * A player token: a sight `Player` (tile, 8-way facing, alive) with its team and number.
 *
 * Why: `visiblePairs` and `canSee` take it unchanged; `side` and `n` only name it.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export interface Token extends Player {
	readonly side: Side;
	/** One-based number within its team, for names ("CT 3"). */
	readonly n: number;
}

/**
 * The board state: ten tokens and up to {@link MAX_SMOKES} smoke landing tiles.
 *
 * Why: plain immutable data, so every rule below is a pure function from board to board.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export interface Board {
	readonly tokens: readonly Token[];
	readonly smokes: readonly Tile[];
}

const tok = (side: Side, n: number, r: number, c: number, facing: number): Token => ({
	side,
	n,
	r,
	c,
	facing,
	alive: true,
});

/**
 * The fixed mid-round position: five defenders around the A site and the CT lane, five attackers
 * in the middle and on the A ramp's flank. Facing is 0 = north, clockwise in 45° steps.
 *
 * Why: found with a seeded search over plausible positions and then fixed as a literal, so the
 * start has many enemy sightlines (it needs at least 8) and one smoke on the A ramp cuts well over
 * 30 % of them (AC6.1) while two duels in the CT lane survive it. The unit test recomputes both
 * numbers with `sight.ts`; the literal is never trusted.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (AC6.1)
 */
export const START_TOKENS: readonly Token[] = [
	tok("ct", 1, 7, 13, 4),
	tok("ct", 2, 8, 14, 4),
	tok("ct", 3, 8, 10, 4),
	tok("ct", 4, 8, 20, 5),
	tok("ct", 5, 14, 17, 6),
	tok("t", 1, 15, 7, 1),
	tok("t", 2, 15, 14, 0),
	tok("t", 3, 14, 12, 0),
	tok("t", 4, 10, 15, 7),
	tok("t", 5, 16, 15, 0),
];

/**
 * The ghosted suggested smoke: on the ramp that leads up to the A site.
 *
 * Why: the default state teaches by showing where one smoke does the most work; "Drop a smoke on
 * the ghost and count the lines" is the Try line.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export const SUGGESTED_SMOKE: Tile = [12, 14];

/**
 * Where "Add smoke" drops the next smoke: the suggestion first, then two other useful spots.
 * None of them covers a starting token.
 *
 * Why: one press lands a smoke somewhere meaningful that the reader can then drag away.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export const SMOKE_SPOTS: readonly Tile[] = [SUGGESTED_SMOKE, [9, 8], [13, 9]];

/**
 * The starting board: the literal tokens and no smoke.
 *
 * Why: the default state shows every enemy sightline (the caption's claim).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export function startBoard(): Board {
	return { tokens: START_TOKENS, smokes: [] };
}

/**
 * Flat tile indices covered by the smokes (the union of the discs).
 *
 * Why: `sight.ts` takes a set of flat indices (`r * w + c`).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 2)
 */
export function smokeSet(map: GridMap, smokes: readonly Tile[]): ReadonlySet<number> {
	const set = new Set<number>();
	for (const s of smokes) for (const i of smokeTiles(map, s)) set.add(i);
	return set;
}

/**
 * One enemy sightline: token `from` sees token `to` (indices into `Board.tokens`).
 *
 * Why: a sightline is directional (facing, the smoke "legs" rule), so a pair that sees each other
 * is two sightlines.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export interface Sightline {
	readonly from: number;
	readonly to: number;
}

/**
 * Every enemy sightline: each ordered cross-team pair where the viewer sees the target.
 *
 * Why: the counter, the drawn lines and the live region all read this one list.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export function sightlines(
	map: GridMap,
	tokens: readonly Token[],
	smokes: readonly Tile[],
): Sightline[] {
	const out: Sightline[] = [];
	for (const [from, to] of visiblePairs(map, tokens, smokeSet(map, smokes))) {
		if (tokens[from]?.side !== tokens[to]?.side) out.push({ from, to });
	}
	return out;
}

/**
 * The counter's two numbers: sightlines now, and sightlines with the same tokens and no smoke.
 *
 * Why: "N (was N₀ with no smoke)" needs both after every change.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export interface Readout {
	readonly count: number;
	readonly base: number;
}

/**
 * Counts for a board.
 *
 * Why: see {@link Readout}.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export function readout(map: GridMap, board: Board): Readout {
	const base = sightlines(map, board.tokens, []).length;
	const count =
		board.smokes.length === 0 ? base : sightlines(map, board.tokens, board.smokes).length;
	return { count, base };
}

/**
 * The counter sentence, as shown and as announced.
 *
 * Why: with no smoke the base is redundant; with smokes "was N₀" is the point of the figure.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Live region)
 */
export function readoutText(r: Readout, smokeCount: number): string {
	return smokeCount === 0
		? `Enemy sightlines: ${r.count}`
		: `Enemy sightlines: ${r.count} (was ${r.base} with no smoke)`;
}

/**
 * A tile in words, one-based ("row 12, column 14"), row 1 at the top.
 *
 * Why: accessible names and announcements speak in rows and columns, never in array indices.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Figures: common contract (Roles)
 */
export function tileText(t: Tile): string {
	return `row ${t[0] + 1}, column ${t[1] + 1}`;
}

/**
 * A token's accessible name ("CT 3 at row 12, column 20").
 *
 * Why: every focusable child needs its own name (common contract, roles).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Figures: common contract (Roles)
 */
export function tokenLabel(t: Token): string {
	return `${t.side === "ct" ? "CT" : "T"} ${t.n} at ${tileText([t.r, t.c])}`;
}

const occupied = (tokens: readonly Token[], r: number, c: number, except = -1): boolean =>
	tokens.some((o, j) => j !== except && o.r === r && o.c === c);

const smokeTaken = (smokes: readonly Tile[], r: number, c: number, except = -1): boolean =>
	smokes.some((s, j) => j !== except && s[0] === r && s[1] === c);

/**
 * Moves a token over free floor in a direction, up to the requested number of tiles, stopping
 * before a wall, the edge of the board or another token. Returns the same board when it cannot
 * move at all. Facing is unchanged.
 *
 * Why: arrows move one tile (Shift = 5); a blocked tile is the board's "walls block" rule.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Keyboard)
 */
export function moveToken(
	map: GridMap,
	board: Board,
	index: number,
	dr: number,
	dc: number,
): Board {
	const t = board.tokens[index];
	if (!t) return board;
	const steps = Math.max(Math.abs(dr), Math.abs(dc));
	const sr = Math.sign(dr);
	const sc = Math.sign(dc);
	let r = t.r;
	let c = t.c;
	for (let k = 0; k < steps; k++) {
		const nr = r + sr;
		const nc = c + sc;
		if (isWall(map, nr, nc) || occupied(board.tokens, nr, nc, index)) break;
		r = nr;
		c = nc;
	}
	if (r === t.r && c === t.c) return board;
	return withToken(board, index, { ...t, r, c });
}

/**
 * Puts a token on a tile (a pointer drag): only free floor is accepted, anything else returns the
 * same board so a drag over a wall keeps the last valid tile.
 *
 * Why: snapping to tiles while dragging means the pointer never leaves a token on a wall.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction)
 */
export function placeToken(map: GridMap, board: Board, index: number, r: number, c: number): Board {
	const t = board.tokens[index];
	if (!t || isWall(map, r, c) || occupied(board.tokens, r, c, index)) return board;
	if (t.r === r && t.c === c) return board;
	return withToken(board, index, { ...t, r, c });
}

/**
 * Turns a token by whole 45° steps (positive = clockwise).
 *
 * Why: vision is directional; this lets a keyboard user explore it (`R` / Shift+`R`).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 3)
 */
export function turnToken(board: Board, index: number, steps: number): Board {
	const t = board.tokens[index];
	if (!t) return board;
	return withToken(board, index, { ...t, facing: (((t.facing + steps) % 8) + 8) % 8 });
}

function withToken(board: Board, index: number, next: Token): Board {
	return { ...board, tokens: board.tokens.map((o, j) => (j === index ? next : o)) };
}

/**
 * Adds a smoke at the tile if it is free floor, else at the first {@link SMOKE_SPOTS} entry that
 * is free. Returns the same board at the maximum.
 *
 * Why: "Add smoke", `S` on a focused tile and a click on the ghost all end here.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
export function addSmoke(map: GridMap, board: Board, at?: Tile): Board {
	if (board.smokes.length >= MAX_SMOKES) return board;
	const free = (t: Tile): boolean =>
		!isWall(map, t[0], t[1]) && !smokeTaken(board.smokes, t[0], t[1]);
	const spot = (at && free(at) ? at : undefined) ?? SMOKE_SPOTS.find(free);
	return spot ? { ...board, smokes: [...board.smokes, spot] } : board;
}

/**
 * Removes the smoke at an index (others keep their order).
 *
 * Why: Delete on a focused smoke and double-click.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Keyboard)
 */
export function removeSmoke(board: Board, index: number): Board {
	if (index < 0 || index >= board.smokes.length) return board;
	return { ...board, smokes: board.smokes.filter((_, j) => j !== index) };
}

/**
 * Moves a smoke over floor, up to the requested number of tiles, never onto another smoke.
 * Returns the same board when it cannot move.
 *
 * Why: smokes land on floor in the game; walls block like they do for tokens.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Keyboard)
 */
export function moveSmoke(
	map: GridMap,
	board: Board,
	index: number,
	dr: number,
	dc: number,
): Board {
	const s = board.smokes[index];
	if (!s) return board;
	const steps = Math.max(Math.abs(dr), Math.abs(dc));
	let r = s[0];
	let c = s[1];
	for (let k = 0; k < steps; k++) {
		const nr = r + Math.sign(dr);
		const nc = c + Math.sign(dc);
		if (isWall(map, nr, nc) || smokeTaken(board.smokes, nr, nc, index)) break;
		r = nr;
		c = nc;
	}
	if (r === s[0] && c === s[1]) return board;
	return withSmoke(board, index, [r, c]);
}

/**
 * Puts a smoke on a tile (a pointer drag): only free floor is accepted.
 *
 * Why: same as {@link placeToken}.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction)
 */
export function placeSmoke(map: GridMap, board: Board, index: number, r: number, c: number): Board {
	const s = board.smokes[index];
	if (!s || isWall(map, r, c) || smokeTaken(board.smokes, r, c, index)) return board;
	if (s[0] === r && s[1] === c) return board;
	return withSmoke(board, index, [r, c]);
}

function withSmoke(board: Board, index: number, next: Tile): Board {
	return { ...board, smokes: board.smokes.map((o, j) => (j === index ? next : o)) };
}

/**
 * One candidate sightline for the "Show sampled points" view: an enemy pair whose target is inside
 * the viewer's cone and range, with the 33 sample tiles and the first one that blocks it.
 *
 * Why: Red Blob-style "show the algorithm's intermediate state": the reader sees which tile cut a
 * line (a wall, or a smoke the target does not stand in).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction, sampled points)
 */
export interface SampleDots extends Sightline {
	readonly samples: Array<[number, number]>;
	/** The first blocking sample tile, or null when the line is clear (the viewer sees the target). */
	readonly blockedAt: Tile | null;
	readonly seen: boolean;
}

/**
 * Sample dots for every enemy pair in cone and range.
 *
 * Why: see {@link SampleDots}; `blockedAt` follows the line-of-sight rule exactly (wall, or smoke
 * on a sample tile other than the target's) and a unit test ties `seen` to `canSee`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction, sampled points)
 */
export function dotsFor(map: GridMap, board: Board): SampleDots[] {
	const smokes = smokeSet(map, board.smokes);
	const out: SampleDots[] = [];
	board.tokens.forEach((a, from) => {
		board.tokens.forEach((b, to) => {
			if (a.side === b.side || !inVisionCone(a, b)) return;
			const samples = samplePoints([a.r, a.c], [b.r, b.c]);
			let blockedAt: Tile | null = null;
			for (const [r, c] of samples) {
				if (isWall(map, r, c) || (smokes.has(r * map.w + c) && !(r === b.r && c === b.c))) {
					blockedAt = [r, c];
					break;
				}
			}
			out.push({
				from,
				to,
				samples,
				blockedAt,
				seen: blockedAt === null && canSee(map, a, b, smokes),
			});
		});
	});
	return out;
}

/**
 * A sightline as a drawable segment in tile units (x = column, y = row; a tile centre is +0.5).
 *
 * Why: the keyframe and the island draw the same lines; endpoints stop short of the tokens and a
 * pair that sees each other both ways is drawn as two parallel lines.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction)
 */
export interface LineSegment {
	/** The viewer's side: it colours the line. */
	readonly side: Side;
	readonly from: number;
	readonly to: number;
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
	/** True when the target also sees the viewer. */
	readonly doubled: boolean;
}

const END_PAD = 0.55;
const PARALLEL_OFFSET = 0.17;

/**
 * Segments for a list of sightlines (same order).
 *
 * Why: see {@link LineSegment}.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction)
 */
export function lineSegments(lines: readonly Sightline[], tokens: readonly Token[]): LineSegment[] {
	const has = new Set(lines.map((l) => `${l.from}>${l.to}`));
	return lines.flatMap((l) => {
		const a = tokens[l.from];
		const b = tokens[l.to];
		if (!a || !b) return [];
		const ax = a.c + 0.5;
		const ay = a.r + 0.5;
		const dx = b.c + 0.5 - ax;
		const dy = b.r + 0.5 - ay;
		const len = Math.hypot(dx, dy) || 1;
		const ux = dx / len;
		const uy = dy / len;
		const doubled = has.has(`${l.to}>${l.from}`);
		const off = doubled ? PARALLEL_OFFSET : 0;
		const nx = -uy * off;
		const ny = ux * off;
		const pad = Math.min(END_PAD, len / 2.5);
		return [
			{
				side: a.side,
				from: l.from,
				to: l.to,
				x1: ax + ux * pad + nx,
				y1: ay + uy * pad + ny,
				x2: b.c + 0.5 - ux * pad + nx,
				y2: b.r + 0.5 - uy * pad + ny,
				doubled,
			},
		];
	});
}

const FACING_NAMES = [
	"north",
	"north-east",
	"east",
	"south-east",
	"south",
	"south-west",
	"west",
	"north-west",
] as const;

/**
 * The compass word for a facing (0 = north, clockwise in 45° steps).
 *
 * Why: announcements say where a token looks, never a number.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 3)
 */
export function facingText(facing: number): string {
	return FACING_NAMES[((facing % 8) + 8) % 8] ?? "north";
}

/**
 * One token's view of the board in a sentence: whom it sees and who sees it.
 *
 * Why: Enter on a focused token reads this out, so a keyboard or screen-reader user gets what the
 * drawn lines show.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Figures: common contract (Screen readers)
 */
export function whoSees(
	tokens: readonly Token[],
	lines: readonly Sightline[],
	index: number,
): string {
	const me = tokens[index];
	if (!me) return "";
	const name = (i: number): string => {
		const t = tokens[i];
		return t ? `${t.side === "ct" ? "CT" : "T"} ${t.n}` : "";
	};
	const list = (xs: string[]): string => (xs.length > 0 ? xs.join(", ") : "no one");
	const sees = lines.filter((l) => l.from === index).map((l) => name(l.to));
	const seen = lines.filter((l) => l.to === index).map((l) => name(l.from));
	return `${name(index)} faces ${facingText(me.facing)}, sees ${list(sees)}; seen by ${list(seen)}.`;
}

/**
 * SVG path data (a `M x y h0` per tile, to be drawn with round caps) at the centres of the tiles.
 *
 * Why: the sampled-points view draws each sample tile once, as one path per colour.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction, sampled points)
 */
export function dotPath(tiles: readonly Tile[]): string {
	const seen = new Set<string>();
	let d = "";
	for (const [r, c] of tiles) {
		const key = `${r},${c}`;
		if (seen.has(key)) continue;
		seen.add(key);
		d += `M${c + 0.5} ${r + 0.5}h0`;
	}
	return d;
}

/**
 * SVG path data of whole tiles (a unit square each) from flat tile indices.
 *
 * Why: smoke discs tint exactly the tiles the rule covers, and spawns are tinted the same way.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6 (Interaction)
 */
export function tilesPath(width: number, tiles: readonly number[]): string {
	let d = "";
	for (const i of tiles) d += `M${i % width} ${Math.floor(i / width)}h1v1h-1z`;
	return d;
}
