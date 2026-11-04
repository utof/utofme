/**
 * Rules of figure F8 ("The free peek"): a one-dimensional corridor, a holder with a pre-aimed
 * angle, a peeker who can step out and back, and the two shot rules (delayed, and "snap fire").
 *
 * The rules are literals with their sources (there is no dataset):
 * - One game tick is 0.8 s (`TICK_S`, the game's clock; spec P10-4 `grid.ts`).
 * - A defender can shoot only at an enemy it has seen at the end of a tick, and that shot is
 *   resolved on the next tick, against the tiles *after* everyone has moved (the notes' game
 *   rules; spec P10-12, article text "Why so fast?").
 * - Snap fire: a defender who is set and aiming fires at whoever steps into its aim on that same
 *   tick, so the shot resolves against the post-move tiles of the tick the peeker arrives
 *   (spec P10-12; the 57 % / 17 % readout comes from facts `peek.hit.snap` / `peek.hit.nosnap`).
 * - Real Counter-Strike runs at 64 ticks/s (fact `cs2.tickrate`), a 15.6 ms window.
 *
 * Why: the figure's claim (a one-tick peek is free, until the rules change) is a property of
 * these rules, so they live in one pure module whose invariants are property-tested (AC12.1).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
import { TICK_S } from "../grid";

/** Number of tiles in the corridor.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const TILES = 8;
/** Tile the holder stands on (the right end).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const HOLDER = 7;
/** First tile the peeker can be seen on; tiles below it are behind the corner.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const VISIBLE_FROM = 3;
/** The tiles the holder is pre-aimed at.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const AIM: readonly [number, number] = [3, 4];
/** The peeker's first and last tile.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const PEEKER_START = 2;
/** Furthest tile the peeker can step out to.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const PEEKER_MAX = 6;

/** The peeker's move in one tick.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type Action = "out" | "back";
/** Which rule produced a shot.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type ShotKind = "delayed" | "snap";

/** One resolved shot.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export interface Shot {
	readonly kind: ShotKind;
	/** The tile the bullet lands on. */
	readonly tile: number;
	/** True when the peeker stands on that tile after the tick's moves. */
	readonly hit: boolean;
}

/** Everything that happened in one tick.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export interface TickRecord {
	/** 1-based tick number. */
	readonly n: number;
	readonly action: Action;
	readonly from: number;
	readonly to: number;
	readonly shots: readonly Shot[];
}

/** The state after a run of actions.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export interface Run {
	readonly peeker: number;
	readonly ticks: readonly TickRecord[];
}

/**
 * Whether a tile is in the holder's pre-aimed cone.
 *
 * Why: the snap rule fires on arrival in this cone only.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function inAim(tile: number): boolean {
	return tile >= AIM[0] && tile <= AIM[1];
}

/**
 * Whether an action can be taken from a tile (steps never leave the corridor's peek range).
 *
 * Why: every legal tick moves the peeker, which is what makes "the shot lands on the vacated
 * tile" a theorem rather than a tendency (AC12.1).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function canStep(tile: number, action: Action): boolean {
	return action === "out" ? tile < PEEKER_MAX : tile > 0;
}

/**
 * Replays actions under a rule set; illegal actions (off either end) are skipped.
 *
 * Why: toggling "Snap fire" re-resolves the whole history under the new rule, so the board
 * always shows what that rule would have done to the same moves.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function run(actions: readonly Action[], snap: boolean): Run {
	let peeker = PEEKER_START;
	// The tile the holder saw the peeker on at the end of the previous tick, if any.
	let seen: number | null = null;
	const ticks: TickRecord[] = [];
	for (const action of actions) {
		if (!canStep(peeker, action)) continue;
		const from = peeker;
		const to = action === "out" ? from + 1 : from - 1;
		const shots: Shot[] = [];
		if (seen !== null) shots.push({ kind: "delayed", tile: seen, hit: seen === to });
		if (snap && inAim(to) && !inAim(from)) shots.push({ kind: "snap", tile: to, hit: true });
		peeker = to;
		seen = to >= VISIBLE_FROM ? to : null;
		ticks.push({ n: ticks.length + 1, action, from, to, shots });
	}
	return { peeker, ticks };
}

/** The default state: one out-and-back, so the miss sits on the vacated tile.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const DEFAULT_ACTIONS: readonly Action[] = ["out", "back"];

/**
 * Seconds shown on the timeline for tick `n` (end of the tick).
 *
 * Why: the figure's unit is the second; ticks only appear as labels.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function tickSeconds(n: number): number {
	return Math.round(n * TICK_S * 10) / 10;
}

/**
 * The real-game window in milliseconds for a server tick rate (`1000 / rate`).
 *
 * Why: derived from the fact so the page never hard-codes 15.6.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function realWindowMs(tickrate: number): number {
	return 1000 / tickrate;
}

/**
 * How many real-game checks fit inside one of this game's ticks.
 *
 * Why: 0.8 s × 64/s ≈ 51; the "Real CS" toggle shows that many fine marks per tick.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function checksPerTick(tickrate: number): number {
	return Math.round(TICK_S * tickrate);
}

/**
 * A one-sentence description of a tick, used by the timeline and the live region.
 *
 * Why: the board is a picture; the same facts must exist as text.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
export function describeTick(t: TickRecord): string {
	const move = t.action === "out" ? "steps out" : "steps back";
	const shots = t.shots.map((s) =>
		s.hit
			? s.kind === "snap"
				? `snap fire hits it on tile ${s.tile + 1}`
				: `the shot hits it on tile ${s.tile + 1}`
			: `the shot lands on tile ${s.tile + 1}, now empty`,
	);
	return `Tick ${t.n}: the peeker ${move} to tile ${t.to + 1}${shots.length > 0 ? `; ${shots.join("; ")}` : ""}.`;
}
