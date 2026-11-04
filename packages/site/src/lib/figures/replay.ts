/**
 * Pure logic of figure F1 (replay of a real round): first contact, fog and ghosts per team,
 * event markers, interpolation, status text, keyframe ticks and the autoplay state machine.
 * DOM-free and Zod-free, so the island, the keyframe and the dataset module share it.
 *
 * Why: the island stays a thin canvas shell; everything a test can decide lives here (AC5.1,
 * AC5.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */

import { formatSeconds } from "../figure-scale";
import { parseRows, TICK_S, ticksToSeconds, yawToScreen } from "../grid";
import { smokeTiles } from "../sight";

/** A team: CT defend, T attack.
 *
 * Why: the replay's `side` values; "See as" maps Attackers to `T` and Defenders to `CT`.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export type Side = "CT" | "T";

/** The "See as" choice: everyone, or one team's knowledge.
 *
 * Why: the radio group's value type.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export type View = "all" | Side;

/** A `[observer, target]` pair from the replay's `sees` table.
 *
 * Why: one name for the pair shape used by the dataset, the fog code and the tests.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 */
export type SeesPair = readonly [number, number];

/** What the logic needs of one player: a side and one value per tick.
 *
 * Why: structural, so the shipped data (which has more fields) and small test rounds both fit.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 */
export interface ReplayPlayer {
	readonly side: Side;
	readonly r: readonly number[];
	readonly c: readonly number[];
	/** Degrees counter-clockwise from east (the replay's convention). */
	readonly yaw: readonly number[];
	readonly alive: readonly number[];
}

/** What the logic needs of the round; the shipped `ReplayMirageData` satisfies it.
 *
 * Why: the dataset module imports this file, so this file cannot import the dataset's type.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 */
export interface ReplayLike {
	readonly nTicks: number;
	readonly firstContactTick: number;
	readonly players: readonly ReplayPlayer[];
	/** `[tick, kind, pid, pid2, r, c]`; for damage and kill `pid` is the victim, `pid2` the attacker. */
	readonly events: readonly (readonly [number, string, number, number, number, number])[];
	readonly sees: readonly (readonly SeesPair[])[];
	readonly smoke: readonly (readonly number[])[];
	readonly fire: readonly (readonly number[])[];
	readonly bomb: { readonly planted: readonly number[] };
	readonly winner: Side;
	readonly endReason: string;
}

/**
 * The first tick with a cross-team `sees` pair, or `null` when no tick has one. Same-team pairs
 * are ignored, so the raw source table and the shipped (already filtered) table give one answer.
 *
 * Why: "first contact" is the figure's default view and the caption's number (AC5.1); deriving
 * it from the pairs keeps prose, dataset and figure on one value.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (AC5.1)
 */
export function firstContactTick(
	sees: readonly (readonly SeesPair[])[],
	sides: readonly string[],
): number | null {
	for (let t = 0; t < sees.length; t++) {
		const pairs = sees[t] ?? [];
		if (pairs.some(([a, b]) => sides[a] !== sides[b])) return t;
	}
	return null;
}

/** An enemy a team has lost sight of: where it was last seen and how long ago.
 *
 * Why: ghosts are drawn hollow at 50 % opacity; the age (in ticks) is what makes them honest.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export interface Ghost {
	readonly pid: number;
	readonly r: number;
	readonly c: number;
	/** Ticks since the enemy was last in the team's view; at least 1. */
	readonly age: number;
}

/** One team's knowledge at one tick.
 *
 * Why: `visible[pid]` is true for the team's own living players and the enemies it sees now.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export interface TeamFog {
	readonly visible: readonly boolean[];
	readonly ghosts: readonly Ghost[];
}

/**
 * Fog and ghosts for both teams at every tick. Fog per team = the team's living players plus
 * the union of its cross-team `sees` targets; a ghost is a living enemy that is not seen now but
 * was in that union at an earlier tick, at its last seen place.
 *
 * Why: "See as: Defenders" must hide what the defenders cannot see and show what they last saw
 * (AC5.2); precomputing once keeps the draw loop trivial.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (AC5.1)
 */
export function buildFog(data: ReplayLike): Readonly<Record<Side, readonly TeamFog[]>> {
	const sides = data.players.map((p) => p.side);
	const build = (team: Side): TeamFog[] => {
		const lastSeen: number[] = data.players.map(() => -1);
		const out: TeamFog[] = [];
		for (let t = 0; t < data.nTicks; t++) {
			const seen = new Set<number>();
			for (const [a, b] of data.sees[t] ?? []) {
				if (sides[a] === team && sides[b] !== team) seen.add(b);
			}
			for (const pid of seen) lastSeen[pid] = t;
			const visible = data.players.map((p, pid) =>
				p.side === team ? p.alive[t] === 1 : seen.has(pid),
			);
			const ghosts: Ghost[] = [];
			data.players.forEach((p, pid) => {
				const at = lastSeen[pid] ?? -1;
				if (p.side === team || seen.has(pid) || p.alive[t] !== 1 || at < 0) return;
				ghosts.push({ pid, r: p.r[at] ?? 0, c: p.c[at] ?? 0, age: t - at });
			});
			out.push({ visible, ghosts });
		}
		return out;
	};
	return { CT: build("CT"), T: build("T") };
}

/**
 * The sightlines to draw at a tick: every pair for "all", else the pairs whose observer is on
 * the chosen team (a team does not know who sees it).
 *
 * Why: the first enemy sightline is the default state's evidence; under a team view only that
 * team's own lines belong on the board.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export function visiblePairs(data: ReplayLike, view: View, tick: number): SeesPair[] {
	const pairs = data.sees[tick] ?? [];
	if (view === "all") return [...pairs];
	return pairs.filter(([a]) => data.players[a]?.side === view);
}

/**
 * The pair drawn in the default state: the first `[observer, target]` at `firstContactTick`.
 *
 * Why: the default view must already show the claim (first contact), not wait for a click.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (default / claim)
 */
export function contactSight(data: ReplayLike): SeesPair | null {
	return data.sees[data.firstContactTick]?.[0] ?? null;
}

/**
 * "Attacker 3" or "Defender 2": a player's public name, numbered from 1 inside their side.
 *
 * Why: ids never appear on the page; the See-as groups already use these two words.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (text equivalent)
 */
export function playerName(sides: readonly string[], pid: number): string {
	const side = sides[pid];
	const nth = sides.slice(0, pid + 1).filter((s) => s === side).length;
	return `${side === "T" ? "Attacker" : "Defender"} ${nth}`;
}

/** Kinds of marker on the scrub bar.
 *
 * Why: first contact, kills, area onsets, plant, defuse and round end are the spec's list.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export type MarkerKind = "contact" | "kill" | "smoke" | "fire" | "plant" | "defuse" | "end";

/** One event marker: a scrub-bar button and an item of the "Events" list.
 *
 * Why: the same list feeds the canvas controls and the text equivalent.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export interface ReplayMarker {
	readonly id: string;
	readonly kind: MarkerKind;
	readonly tick: number;
	/** A sentence without ids or ticks, e.g. "Defender 2 eliminates Attacker 1". */
	readonly label: string;
}

const PRIORITY: Readonly<Record<MarkerKind, number>> = {
	contact: 0,
	smoke: 1,
	fire: 1,
	plant: 2,
	kill: 3,
	defuse: 4,
	end: 5,
};

/** Ticks where an area list gains a tile it did not have one tick earlier. */
function onsets(tiles: readonly (readonly number[])[]): number[] {
	const out: number[] = [];
	let prev = new Set<number>();
	tiles.forEach((now, t) => {
		if (now.some((i) => !prev.has(i))) out.push(t);
		prev = new Set(now);
	});
	return out;
}

const END_REASON: Readonly<Record<string, string>> = {
	bomb: "the bomb went off",
	defuse: "the bomb was defused",
	elimination: "the other team was eliminated",
	time: "time ran out",
};

/** "attackers win (the bomb went off)". */
function outcomeText(data: Pick<ReplayLike, "winner" | "endReason">): string {
	const who = data.winner === "T" ? "attackers" : "defenders";
	return `${who} win (${END_REASON[data.endReason] ?? data.endReason})`;
}

/**
 * The scrub-bar markers, sorted by tick: first contact (derived), every kill, the first tick a
 * new smoke or molotov area appears, the plant, defuse starts (and a finished defuse) and the
 * round end.
 *
 * Why: the markers are how a reader jumps to what the caption talks about; labels carry no ids
 * or ticks (those are for hover text only).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export function markers(data: ReplayLike): ReplayMarker[] {
	const sides = data.players.map((p) => p.side);
	const name = (pid: number) => playerName(sides, pid);
	const raw: Array<Omit<ReplayMarker, "id">> = [
		{ kind: "contact", tick: data.firstContactTick, label: "First contact" },
	];
	for (const t of onsets(data.smoke)) raw.push({ kind: "smoke", tick: t, label: "Smoke lands" });
	for (const t of onsets(data.fire)) {
		raw.push({ kind: "fire", tick: t, label: "Molotov fire starts" });
	}
	for (const [tick, kind, pid, pid2] of data.events) {
		if (kind === "kill") {
			raw.push({ kind: "kill", tick, label: `${name(pid2)} eliminates ${name(pid)}` });
		} else if (kind === "plant") {
			raw.push({ kind: "plant", tick, label: `${name(pid)} plants the bomb` });
		} else if (kind === "defuse_start") {
			raw.push({ kind: "defuse", tick, label: `${name(pid)} starts defusing` });
		} else if (kind === "defuse") {
			raw.push({ kind: "defuse", tick, label: "The bomb is defused" });
		} else if (kind === "round_end") {
			raw.push({ kind: "end", tick, label: `Round ends: ${outcomeText(data)}` });
		}
	}
	return raw
		.map((m, i) => ({ m, i }))
		.sort((a, b) => a.m.tick - b.m.tick || PRIORITY[a.m.kind] - PRIORITY[b.m.kind] || a.i - b.i)
		.map(({ m }, n) => ({ ...m, id: `${m.kind}-${m.tick}-${n}` }));
}

/**
 * The landing tile `[row, col]` of a smoke: the tile whose disc (`smokeTiles`) is exactly the
 * given tile set on this map, or `null` when none is (the caller then falls back to the set's
 * bounding box).
 *
 * Why: the replay lists covered tiles, not the landing point; drawing a true disc needs the
 * centre, and the game's disc rule recovers it exactly.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (Sight rule, 2)
 */
export function smokeLanding(
	rows: readonly string[],
	tiles: readonly number[],
): [number, number] | null {
	if (tiles.length === 0) return null;
	const map = parseRows(rows);
	const want = [...tiles].sort((a, b) => a - b).join(",");
	for (let r = 0; r < map.h; r++) {
		for (let c = 0; c < map.w; c++) {
			if (
				smokeTiles(map, [r, c])
					.sort((a, b) => a - b)
					.join(",") === want
			)
				return [r, c];
		}
	}
	return null;
}

/** A drawn position: tile coordinates and a screen angle.
 *
 * Why: `angle` is degrees clockwise from north (0 = up), the one convention `grid.ts` uses.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`grid.ts`)
 */
export interface Pose {
	readonly r: number;
	readonly c: number;
	readonly angle: number;
}

/**
 * A player's position at a fractional tick: linear between whole ticks, the shortest turn for
 * the facing, held in place when the player dies on the next tick, clamped to the round.
 *
 * Why: playback interpolates at 60 fps when motion is allowed and tick-steps otherwise; whole
 * ticks must reproduce the data exactly.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (interaction)
 */
export function poseAt(data: Pick<ReplayLike, "nTicks" | "players">, pid: number, t: number): Pose {
	const p = data.players[pid];
	if (!p) return { r: 0, c: 0, angle: 0 };
	const last = Math.max(0, data.nTicks - 1);
	const x = Math.min(Math.max(t, 0), last);
	const i = Math.floor(x);
	const j = Math.min(i + 1, last);
	const f = x - i;
	const angle0 = yawToScreen(p.yaw[i] ?? 0);
	if (f === 0 || (p.alive[i] === 1 && p.alive[j] !== 1)) {
		return { r: p.r[i] ?? 0, c: p.c[i] ?? 0, angle: angle0 };
	}
	const angle1 = yawToScreen(p.yaw[j] ?? 0);
	const turn = ((((angle1 - angle0) % 360) + 540) % 360) - 180;
	return {
		r: (p.r[i] ?? 0) + ((p.r[j] ?? 0) - (p.r[i] ?? 0)) * f,
		c: (p.c[i] ?? 0) + ((p.c[j] ?? 0) - (p.c[i] ?? 0)) * f,
		angle: (((angle0 + turn * f) % 360) + 360) % 360,
	};
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The status line: "7.2 s · 5 attackers, 5 defenders alive · bomb not planted"; at the last
 * tick it also says who won and how.
 *
 * Why: a text equivalent of the canvas, announced on pause or scrub end only (AC5.5, spec).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (text equivalent)
 */
export function statusLine(data: ReplayLike, tick: number): string {
	const alive = (side: Side) =>
		data.players.filter((p) => p.side === side && p.alive[tick] === 1).length;
	const parts = [
		formatSeconds(ticksToSeconds(tick)),
		`${plural(alive("T"), "attacker", "attackers")}, ${plural(alive("CT"), "defender", "defenders")} alive`,
		data.bomb.planted[tick] === 1 ? "bomb planted" : "bomb not planted",
	];
	if (tick >= data.nTicks - 1) parts.push(outcomeText(data));
	return parts.join(" · ");
}

/**
 * Position of a tick on the scrub bar, 0 to 1 (also used for the pros' dashed marker, which
 * sits at a fractional tick).
 *
 * Why: the markers are absolutely positioned by percentage so they scale with the bar.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export function scrubFraction(tick: number, nTicks: number): number {
	return nTicks > 1 ? tick / (nTicks - 1) : 0;
}

/**
 * The six frames of the no-JS strip: tick 0, first contact, the first kill, the plant (the
 * midpoint when there is none), the last kill and the last tick, in time order.
 *
 * Why: the keyframe strip must tell the round's story without JavaScript (AC5.5).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (fallback)
 */
export function keyframeTicks(data: ReplayLike): number[] {
	const last = Math.max(0, data.nTicks - 1);
	const kills = data.events.filter((e) => e[1] === "kill").map((e) => e[0]);
	const plant = data.events.find((e) => e[1] === "plant")?.[0] ?? Math.floor(data.nTicks / 2);
	return [
		0,
		data.firstContactTick,
		kills[0] ?? data.firstContactTick,
		plant,
		kills.at(-1) ?? last,
		last,
	].sort((a, b) => a - b);
}

/** Playback speeds offered by the select.
 *
 * Why: 0.5×, 1× and 2× are the spec's list.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export const SPEEDS = [0.5, 1, 2] as const;

/** One of {@link SPEEDS}.
 *
 * Why: derived from the list so the select and the reducer cannot drift.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
export type Speed = (typeof SPEEDS)[number];

/** Playback state; `pos` is a fractional tick.
 *
 * Why: `autoplay` makes "once, then never again" explicit: armed → running → spent, or cancelled.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (autoplay)
 */
export interface Playback {
	readonly pos: number;
	readonly playing: boolean;
	readonly speed: Speed;
	readonly autoplay: "armed" | "running" | "spent" | "cancelled";
}

/** Everything that can happen to {@link Playback}.
 *
 * Why: one reducer keeps the autoplay rules testable without a DOM.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (autoplay)
 */
export type PlaybackAction =
	| { readonly type: "visible"; readonly ratio: number; readonly paused: boolean }
	| { readonly type: "frame"; readonly dtMs: number }
	| { readonly type: "play" }
	| { readonly type: "pause" }
	| { readonly type: "seek"; readonly pos: number }
	| { readonly type: "speed"; readonly speed: Speed }
	| { readonly type: "interact" }
	| { readonly type: "motion"; readonly paused: boolean };

/**
 * The static default: the board at first contact, 1×, not playing, autoplay armed.
 *
 * Why: the default state already shows the caption's claim (spec, common contract).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (default / claim)
 */
export function initialPlayback(data: Pick<ReplayLike, "firstContactTick">): Playback {
	return { pos: data.firstContactTick, playing: false, speed: 1, autoplay: "armed" };
}

/** A user action ends autoplay for good, and stops it if it was running. */
function cancelAutoplay(s: Playback): Playback {
	if (s.autoplay === "armed") return { ...s, autoplay: "cancelled" };
	if (s.autoplay === "running") return { ...s, playing: false, autoplay: "cancelled" };
	return s;
}

/**
 * Applies one action. Autoplay starts once, at 1× from tick 0, when at least half of the figure
 * is in view and motion is allowed; it ends at the round's last tick, and any interaction
 * cancels it for good. Pause motion stops playback at once.
 *
 * Why: AC5.3/AC5.4: no autoplay under paused motion, and Pause motion during playback stops it
 * within one frame; WCAG 2.2.2 (pause, stop, hide).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (autoplay, AC5.4)
 * @see https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
 */
export function reducePlayback(s: Playback, a: PlaybackAction, nTicks: number): Playback {
	const last = Math.max(0, nTicks - 1);
	switch (a.type) {
		case "visible":
			if (s.autoplay !== "armed" || a.paused || a.ratio < 0.5) return s;
			return { pos: 0, playing: true, speed: 1, autoplay: "running" };
		case "frame": {
			if (!s.playing) return s;
			const pos = s.pos + (a.dtMs / (TICK_S * 1000)) * s.speed;
			if (pos < last) return { ...s, pos };
			return {
				...s,
				pos: last,
				playing: false,
				autoplay: s.autoplay === "running" ? "spent" : s.autoplay,
			};
		}
		case "play": {
			const c = cancelAutoplay(s);
			return { ...c, pos: c.pos >= last ? 0 : c.pos, playing: true };
		}
		case "pause":
			return { ...cancelAutoplay(s), playing: false };
		case "seek":
			return { ...cancelAutoplay(s), pos: Math.min(Math.max(Math.round(a.pos), 0), last) };
		case "speed":
			return { ...cancelAutoplay(s), speed: a.speed };
		case "interact":
			return cancelAutoplay(s);
		case "motion":
			if (!a.paused) return s;
			return {
				...s,
				playing: false,
				autoplay: s.autoplay === "running" ? "cancelled" : s.autoplay,
			};
	}
}
