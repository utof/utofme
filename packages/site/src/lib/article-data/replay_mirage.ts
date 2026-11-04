/**
 * Dataset `replay_mirage` (figure F1): one recorded Mirage round of the block-28 head in
 * self-play, round 0 of the notes file's `rounds`, on the project's own 28×28 grid.
 *
 * Whitelist: `map{name, rows}`, `tickS`, `nTicks`, `winner`, `endReason`, `firstContactTick`
 * (derived: the first tick with a cross-team `sees` pair), `players[]{side, r, c, yaw, hp,
 * alive, gait, blind}` (array index = player id), `events[]` as `[tick, kind, pid, pid2, r, c]`
 * for the listed kinds only, `smoke[t][]` and `fire[t][]` (flat tile indices `r × 28 + c`),
 * `sees[t][]` (`[observer, target]`, **cross-team pairs only**) and `bomb{planted, r, c}`.
 * Everything else (the brain label, seed, team ids, pids, capabilities, source text, reloads and
 * the event payload columns) is dropped; a round that is not `de_mirage` is a schema error.
 *
 * Why: the page shows how the agents play one round and nothing about how or where it was
 * recorded; a strict projected schema makes any extra field a sync error (ADR 0054), and
 * dropping same-team `sees` pairs keeps the file inside its 10 KB cap.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
import { z } from "astro/zod";
import { firstContactTick } from "../figures/replay";
import { defineDataset } from "./types";

const SOURCE_FILE = "replay_head_cs.json";
const CELLS = 28 * 28;

/** Event kinds that ship, in the order the figure's marker list uses them. */
const SHIPPED_KINDS = [
	"damage",
	"kill",
	"throw",
	"plant_start",
	"plant",
	"defuse_start",
	"defuse",
	"round_end",
] as const;

const side = z.enum(["CT", "T"]);
const bit = z.union([z.literal(0), z.literal(1)]);
const int = z.number().int();
const tile = z
	.number()
	.int()
	.min(0)
	.max(CELLS - 1);
const rowOrCol = z.number().min(-1).max(28);
const gridRows = z.array(z.string().regex(/^[#.ab]{28}$/)).length(28);

const sourcePlayer = z.object({
	pid: int,
	side,
	team: int,
	brain: z.string(),
	r: z.array(int),
	c: z.array(int),
	yaw: z.array(int),
	hp: z.array(int),
	alive: z.array(bit),
	gait: z.array(int),
	blind: z.array(int),
});

const sourceRound = z
	.object({
		map: z.object({
			name: z.literal("de_mirage"),
			size: z.literal(28),
			rows: gridRows,
			d4: z.number(),
		}),
		seconds_per_tick: z.literal(0.8),
		n_ticks: int.min(1),
		winner: side,
		end_reason: z.string().regex(/^[a-z_]+$/),
		seed: int,
		players: z.array(sourcePlayer).length(10),
		events: z.object({
			cols: z.array(z.string()),
			rows: z.array(z.array(z.union([z.string(), z.number()]))),
		}),
		smoke: z.array(z.array(tile)),
		fire: z.array(z.array(tile)),
		sees: z.array(z.array(z.tuple([int.min(0).max(9), int.min(0).max(9)]))),
		bomb: z.object({ planted: z.array(bit), r: z.array(z.number()), c: z.array(z.number()) }),
		schema: z.string(),
		capabilities: z.unknown(),
	})
	.superRefine((round, ctx) => {
		const n = round.n_ticks;
		const bad = (path: (string | number)[]) =>
			ctx.addIssue({ code: "custom", message: "length differs from n_ticks", path });
		round.players.forEach((p, i) => {
			if (p.pid !== i)
				ctx.addIssue({
					code: "custom",
					message: "pid is not the index",
					path: ["players", i, "pid"],
				});
			for (const k of ["r", "c", "yaw", "hp", "alive", "gait", "blind"] as const) {
				if (p[k].length !== n) bad(["players", i, k]);
			}
		});
		for (const k of ["smoke", "fire", "sees"] as const) if (round[k].length !== n) bad([k]);
		for (const k of ["planted", "r", "c"] as const)
			if (round.bomb[k].length !== n) bad(["bomb", k]);
	});

/**
 * The source is validated for round 0 only (the other recorded rounds are other maps and are
 * ignored); `tuple` with a `unknown` rest keeps zod paths on `rounds[0]`.
 */
const source = z.object({
	about: z.string(),
	source: z.string(),
	rounds: z.tuple([sourceRound], z.unknown()),
});

const event = z.tuple([
	int.min(0),
	z.enum(SHIPPED_KINDS),
	int.min(-1).max(9),
	int.min(-1).max(9),
	rowOrCol,
	rowOrCol,
]);

const projectedPlayer = z.strictObject({
	side,
	r: z.array(int),
	c: z.array(int),
	yaw: z.array(int),
	hp: z.array(int.min(0).max(4)),
	alive: z.array(bit),
	gait: z.array(int.min(0).max(2)),
	blind: z.array(int.min(0).max(4)),
});

const projected = z
	.strictObject({
		schema: z.literal("replay_mirage/1"),
		map: z.strictObject({ name: z.literal("de_mirage"), rows: gridRows }),
		tickS: z.literal(0.8),
		nTicks: int.min(1),
		winner: side,
		endReason: z.string().regex(/^[a-z_]+$/),
		firstContactTick: int.min(0),
		players: z.array(projectedPlayer).length(10),
		events: z.array(event),
		smoke: z.array(z.array(tile)),
		fire: z.array(z.array(tile)),
		sees: z.array(z.array(z.tuple([int.min(0).max(9), int.min(0).max(9)]))),
		bomb: z.strictObject({ planted: z.array(bit), r: z.array(rowOrCol), c: z.array(rowOrCol) }),
	})
	.superRefine((d, ctx) => {
		const n = d.nTicks;
		const bad = (path: (string | number)[], message = "length differs from nTicks") =>
			ctx.addIssue({ code: "custom", message, path });
		d.players.forEach((p, i) => {
			for (const k of ["r", "c", "yaw", "hp", "alive", "gait", "blind"] as const) {
				if (p[k].length !== n) bad(["players", i, k]);
			}
		});
		for (const k of ["smoke", "fire", "sees"] as const) if (d[k].length !== n) bad([k]);
		for (const k of ["planted", "r", "c"] as const) if (d.bomb[k].length !== n) bad(["bomb", k]);
		const sides = d.players.map((p) => p.side);
		d.sees.forEach((pairs, t) => {
			pairs.forEach(([a, b], j) => {
				if (sides[a] === sides[b]) bad(["sees", t, j], "same-team pair");
			});
		});
		const first = firstContactTick(d.sees, sides);
		if (first !== d.firstContactTick)
			bad(["firstContactTick"], "not the first tick with a cross-team pair");
	});

/**
 * The shipped `replay_mirage.json`.
 *
 * Why: inferred from the projected schema; the island imports this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 */
export type ReplayMirageData = z.infer<typeof projected>;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * The `replay_mirage` dataset definition.
 *
 * Why: F1 needs one real round with fog inputs (cross-team `sees`) and nothing else; the cap is
 * 10 KB gzip (ADR 0054), measured in the lane report.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 */
export const dataset = defineDataset({
	name: "replay_mirage",
	schemaId: "replay_mirage/1",
	sources: { [SOURCE_FILE]: source },
	projected,
	project: (src) => {
		const [round] = source.parse(src[SOURCE_FILE]).rounds;
		const at = (name: string): number => {
			const i = round.events.cols.indexOf(name);
			if (i < 0) throw new Error(`events has no "${name}" column`);
			return i;
		};
		const iTick = at("tick");
		const iKind = at("kind");
		const iPid = at("pid");
		const iPid2 = at("pid2");
		const iR = at("r");
		const iC = at("c");
		const shipped: ReadonlySet<string> = new Set(SHIPPED_KINDS);
		const events = round.events.rows
			.filter((row) => shipped.has(String(row[iKind])))
			.map((row) =>
				event.parse([
					row[iTick],
					row[iKind],
					row[iPid],
					row[iPid2],
					round1(Number(row[iR])),
					round1(Number(row[iC])),
				]),
			)
			.sort((a, b) => a[0] - b[0]);
		const sides = round.players.map((p) => p.side);
		const sees = round.sees.map((pairs) => pairs.filter(([a, b]) => sides[a] !== sides[b]));
		const first = firstContactTick(sees, sides);
		if (first === null) throw new Error("no tick has a cross-team sees pair");
		return {
			schema: "replay_mirage/1" as const,
			map: { name: round.map.name, rows: round.map.rows },
			tickS: round.seconds_per_tick,
			nTicks: round.n_ticks,
			winner: round.winner,
			endReason: round.end_reason,
			firstContactTick: first,
			players: round.players.map((p) => ({
				side: p.side,
				r: p.r,
				c: p.c,
				yaw: p.yaw,
				hp: p.hp,
				alive: p.alive,
				gait: p.gait,
				blind: p.blind,
			})),
			events,
			smoke: round.smoke,
			fire: round.fire,
			sees,
			bomb: {
				planted: round.bomb.planted,
				r: round.bomb.r.map(round1),
				c: round.bomb.c.map(round1),
			},
		};
	},
	maxGzip: 10 * 1024,
});
