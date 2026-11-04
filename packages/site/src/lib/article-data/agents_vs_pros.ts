/**
 * Dataset `agents_vs_pros` (figures F11 and F8): eleven behaviour rows, agent against pros, and the
 * one-tick-peek hit rates.
 *
 * Whitelist: `rows[]{id, agent, pro, stamp{line, block?, date}, unit}` where `agent` and `pro` are
 * `[v]` or `[v, lo, hi]`, and `peek{hitNoSnap, hitSnap}` from `one_tick_peeks`. The five 5v5 rows
 * are the block-28 and pro columns of `blocks_5v5` (the source prints no intervals for them); the
 * six 3v3 rows come from `agent_3v3_genshot2` and `pros` with their 95 % intervals. Grenades per
 * player-round: the agent is the mean of its T and CT sides, each summed over the four grenade
 * types (its bounds are the means of the summed bounds); the pros are summed. Flashes likewise.
 *
 * Dropped, never shipped: the `five_v_five_test` block (its pistol-round readout bug, notes
 * FACTS § 4.3), kills per round (3v3 and 5v5 counts differ), kills through smoke, HE damage per
 * throw and the self-blind share (no per-row data), every `src`/`note`/`about` text.
 *
 * Why: F11 is only as honest as its row list; a strict projected schema makes any extra field a
 * sync error (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `agents_vs_pros`)
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const SOURCE_FILE = "agent_vs_pro.json";

/** Row ids in the order the data lists them (the figure re-sorts by gap).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const ROW_IDS = [
	"openKill",
	"holder",
	"fireBack",
	"attackWin",
	"plantRate",
	"postPlant",
	"retake",
	"conversion",
	"saving",
	"grenades",
	"flashes",
] as const;

const stat = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const gren = z.object({ smoke: stat, flash: stat, he: stat, molly: stat });
const prosGren = z.object({ smoke: stat, flash: stat, he: stat, molotov: stat });
const col = z.array(z.number()).length(5);

const source = z.object({
	pros: z.object({
		post_plant_t_win: stat,
		retake_ct_win: stat,
		opening_kill_conversion: stat,
		CT_lost_rounds_with_survivor: stat,
		utility_per_player_round: prosGren,
	}),
	agent_3v3_genshot2: z.object({
		post_plant_t_win: stat,
		retake_ct_win: stat,
		opening_kill_conversion: stat,
		CT_lost_rounds_with_survivor: stat,
		utility_per_player_round: z.object({ T: gren, CT: gren }),
	}),
	blocks_5v5: z.object({
		cols: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
		rows: z.object({
			"opening kills by attackers": col,
			"holder beats peeker": col,
			"victim fired back at the killer": col,
			"attack win": col,
			"plant rate": col,
		}),
	}),
	one_tick_peeks: z.object({
		rows: z.array(z.object({ row: z.string(), hit: z.number() })),
	}),
});

const share = z.number().min(0).max(1);
const num = z.number().nonnegative();
const interval = z.union([
	z.tuple([num]),
	z.tuple([num, num, num]).refine(([v, lo, hi]) => lo <= v && v <= hi, "v outside [lo, hi]"),
]);
const stamp = z.union([
	z.strictObject({ line: z.literal("5v5"), block: z.literal(28), date: z.literal("2026-11-02") }),
	z.strictObject({ line: z.literal("3v3"), date: z.literal("2026-10-25") }),
]);
const row = z.strictObject({
	id: z.enum(ROW_IDS),
	agent: interval,
	pro: interval,
	stamp,
	unit: z.enum(["share", "perPlayerRound"]),
});

const projected = z
	.strictObject({
		schema: z.literal("agents_vs_pros/1"),
		rows: z.array(row).length(ROW_IDS.length),
		peek: z.strictObject({ hitNoSnap: share, hitSnap: share }),
	})
	.superRefine((d, ctx) => {
		d.rows.forEach((r, i) => {
			if (r.id !== ROW_IDS[i])
				ctx.addIssue({ code: "custom", message: "row out of order", path: ["rows", i, "id"] });
		});
	});

/**
 * The shipped `agents_vs_pros.json`.
 *
 * Why: inferred from the projected schema; the island imports this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `agents_vs_pros`)
 */
export type AgentsVsProsData = z.infer<typeof projected>;

type Stat = z.infer<typeof stat>;
type Interval = z.infer<typeof interval>;
const at = (v: readonly number[], i: number): number => {
	const x = v[i];
	if (x === undefined) throw new Error(`blocks_5v5 column ${i} missing`);
	return x;
};
const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const withCi = (s: Stat): Interval => [r4(s[0]), r4(s[1]), r4(s[2])];
const plain = (v: number): Interval => [r4(v)];

function sum(parts: readonly Stat[]): Interval {
	const at = (i: 0 | 1 | 2) => parts.reduce((a, p) => a + p[i], 0);
	return [r4(at(0)), r4(at(1)), r4(at(2))];
}
function mean(a: Interval, b: Interval): Interval {
	if (a.length !== 3 || b.length !== 3) throw new Error("mean needs two intervals");
	return [r4((a[0] + b[0]) / 2), r4((a[1] + b[1]) / 2), r4((a[2] + b[2]) / 2)];
}

/**
 * The `agents_vs_pros` dataset definition.
 *
 * Why: F11 and F8 share one small file; the cap is 3 KB gzip (ADR 0054), measured in the lane report.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `agents_vs_pros`)
 */
export const dataset = defineDataset({
	name: "agents_vs_pros",
	schemaId: "agents_vs_pros/1",
	sources: { [SOURCE_FILE]: source },
	projected,
	project: (src) => {
		const s = source.parse(src[SOURCE_FILE]);
		const five = { line: "5v5" as const, block: 28 as const, date: "2026-11-02" as const };
		const three = { line: "3v3" as const, date: "2026-10-25" as const };
		const fiveRow = (id: (typeof ROW_IDS)[number], v: readonly number[]) => ({
			id,
			agent: plain(at(v, 3)),
			pro: plain(at(v, 4)),
			stamp: five,
			unit: "share" as const,
		});
		const b = s.blocks_5v5.rows;
		const a3 = s.agent_3v3_genshot2;
		const p = s.pros;
		const threeRow = (id: (typeof ROW_IDS)[number], agent: Stat, pro: Stat) => ({
			id,
			agent: withCi(agent),
			pro: withCi(pro),
			stamp: three,
			unit: "share" as const,
		});
		const u = a3.utility_per_player_round;
		const side = (x: z.infer<typeof gren>) => [x.smoke, x.flash, x.he, x.molly];
		const pu = p.utility_per_player_round;
		const peek = (needle: string): number => {
			const hit = s.one_tick_peeks.rows.find((r) => r.row.includes(needle));
			if (!hit) throw new Error(`no one_tick_peeks row containing "${needle}"`);
			return r4(hit.hit);
		};
		return {
			schema: "agents_vs_pros/1" as const,
			rows: [
				fiveRow("openKill", b["opening kills by attackers"]),
				fiveRow("holder", b["holder beats peeker"]),
				fiveRow("fireBack", b["victim fired back at the killer"]),
				fiveRow("attackWin", b["attack win"]),
				fiveRow("plantRate", b["plant rate"]),
				threeRow("postPlant", a3.post_plant_t_win, p.post_plant_t_win),
				threeRow("retake", a3.retake_ct_win, p.retake_ct_win),
				threeRow("conversion", a3.opening_kill_conversion, p.opening_kill_conversion),
				threeRow("saving", a3.CT_lost_rounds_with_survivor, p.CT_lost_rounds_with_survivor),
				{
					id: "grenades" as const,
					agent: mean(sum(side(u.T)), sum(side(u.CT))),
					pro: sum([pu.smoke, pu.flash, pu.he, pu.molotov]),
					stamp: three,
					unit: "perPlayerRound" as const,
				},
				{
					id: "flashes" as const,
					agent: mean(sum([u.T.flash]), sum([u.CT.flash])),
					pro: sum([pu.flash]),
					stamp: three,
					unit: "perPlayerRound" as const,
				},
			],
			peek: { hitNoSnap: peek("head: set pre-aimed CT"), hitSnap: peek("snap_fire") },
		};
	},
	maxGzip: 3 * 1024,
});
