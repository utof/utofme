/**
 * Pure logic of figure F11 ("Agents vs pros, side by side"): the eleven row definitions
 * (hand-written), the relative-gap sort, value formatting and the track geometry shared by the
 * SSR keyframe and the island.
 *
 * Why: the sort order, the printed values and the definitions are claims about the data; one
 * DOM-free module lets unit tests pin them (AC15.1) and keeps the dataset free of prose.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
import type { AgentsVsProsData } from "../article-data/agents_vs_pros";
import { formatInterval, formatNumber, formatPercent } from "../figure-scale";

/** One shipped row.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type AvpRow = AgentsVsProsData["rows"][number];
/** A row id.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type AvpId = AvpRow["id"];

/** Hand-written copy and display rules of one row.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export interface RowDef {
	readonly label: string;
	/** What the number counts, in a sentence. */
	readonly definition: string;
	/** Axis maximum of the row's track. */
	readonly axisMax: number;
	/** Decimals for the printed value. */
	readonly digits: number;
	/** Prose fact keys of the agent and pro values, for linked numbers. */
	readonly facts?: { readonly agent: string; readonly pro: string };
}

/**
 * The row table: labels, definitions (shown on open), axes and fact links.
 *
 * Why: the spec asks for hand-written definitions in this module, not in the dataset.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
export const ROW_DEFS: Readonly<Record<AvpId, RowDef>> = {
	openKill: {
		label: "Opening kills by attackers",
		definition: "How often the attacking side gets the first kill of a round.",
		axisMax: 1,
		digits: 0,
		facts: { agent: "agents.b28.openkill", pro: "pros.openkill" },
	},
	holder: {
		label: "Holder beats peeker",
		definition:
			"In a duel where one player holds an angle and the other walks into it, how often the holder wins.",
		axisMax: 1,
		digits: 0,
		facts: { agent: "agents.b28.holder", pro: "pros.holder" },
	},
	fireBack: {
		label: "Victim fired back",
		definition: "How often a player who is killed had already fired at the killer.",
		axisMax: 1,
		digits: 0,
		facts: { agent: "agents.b28.fireback", pro: "pros.fireback" },
	},
	attackWin: {
		label: "Attack win",
		definition: "How often the attackers win the round.",
		axisMax: 1,
		digits: 0,
		facts: { agent: "agents.b28.attackwin", pro: "pros.attackwin" },
	},
	plantRate: {
		label: "Plant rate",
		definition: "How often the attackers plant the bomb during a round.",
		axisMax: 1,
		digits: 0,
		facts: { agent: "agents.b28.plantrate", pro: "pros.plantrate" },
	},
	postPlant: {
		label: "Post-plant attack win",
		definition: "How often the attackers win a round once the bomb is planted.",
		axisMax: 1,
		digits: 0,
	},
	retake: {
		label: "Retake win",
		definition: "How often the defenders win a round once the bomb is planted.",
		axisMax: 1,
		digits: 0,
	},
	conversion: {
		label: "Opening-kill conversion",
		definition: "How often the side that gets the first kill of a round goes on to win it.",
		axisMax: 1,
		digits: 0,
	},
	saving: {
		label: "Lost rounds with a survivor",
		definition:
			"Of the rounds the defenders lose, the share in which a defender is still alive at the end (saving the gun).",
		axisMax: 1,
		digits: 0,
	},
	grenades: {
		label: "Grenades per player-round",
		definition:
			"Smokes, flashes, HE grenades and molotovs thrown per player per round. The agent's figure is the mean of its attacker and defender sides.",
		axisMax: 2.5,
		digits: 1,
		facts: { agent: "util.agent.grenades", pro: "util.pros.grenades" },
	},
	flashes: {
		label: "Flashes per player-round",
		definition: "Flash grenades thrown per player per round.",
		axisMax: 0.7,
		digits: 3,
		facts: { agent: "util.agent.flashes", pro: "util.pros.flashes" },
	},
};

/** Two-sided stamp text of a row ("block 28 · 5v5" or "3v3 agent · 2026-10-25").
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export function stampOf(row: AvpRow): string {
	return row.stamp.line === "5v5"
		? `block ${row.stamp.block} · 5v5`
		: `3v3 agent · ${row.stamp.date}`;
}

/**
 * Public source label of a row, shown in the opened definition.
 *
 * Why: the spec names these three labels; no file or run name appears on the page.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
export function sourceOf(row: AvpRow, prosMaps: string): string {
	const agent = row.stamp.line === "5v5" ? "self-play readout, block 28" : "3v3 agent readout";
	return `${agent}; ${prosMaps} pro maps of 2026`;
}

/**
 * Relative gap `|agent − pro| / |pro|`.
 *
 * Why: the sort puts the biggest disagreement first without letting a big unit dominate.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
export function relativeGap(row: AvpRow): number {
	return Math.abs(row.agent[0] - row.pro[0]) / Math.abs(row.pro[0]);
}

/**
 * Rows in the requested order; `gap` is descending relative gap, `data` the file's order.
 *
 * Why: "Sort by gap" is the figure's default and its Try path (AC15.1); ties keep file order.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
export function orderRows(rows: readonly AvpRow[], mode: "gap" | "data"): AvpRow[] {
	const copy = [...rows];
	if (mode === "data") return copy;
	return copy.sort((a, b) => relativeGap(b) - relativeGap(a));
}

/** A value with its row's decimals: "44 %" for shares, "0.012" for per-round counts.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export function formatValue(row: AvpRow, v: number): string {
	const { digits } = ROW_DEFS[row.id];
	return row.unit === "share" ? formatPercent(v, digits) : formatNumber(v, digits);
}

/** "no interval" or "lo to hi" for one side of a row.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export function intervalText(row: AvpRow, side: "agent" | "pro"): string {
	const s = row[side];
	if (s.length === 1) return "no interval";
	const { digits } = ROW_DEFS[row.id];
	// Why: a count's interval is narrower than its one-decimal print ("2.2 to 2.2"), so it gets one more decimal.
	return row.unit === "share"
		? `${formatNumber(s[1] * 100, digits)} to ${formatNumber(s[2] * 100, digits)} %`
		: formatInterval(s[1], s[2], digits + (digits < 3 ? 1 : 0));
}

/** Track width in viewBox units.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const TRACK = { w: 320, h: 24, pad: 6 } as const;

/** x position of a value on a row's track.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export function trackX(row: AvpRow, v: number): number {
	const max = ROW_DEFS[row.id].axisMax;
	return TRACK.pad + (Math.min(Math.max(v, 0), max) / max) * (TRACK.w - 2 * TRACK.pad);
}

/** One-sentence screen-reader summary of a row.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export function rowSummary(row: AvpRow): string {
	const d = ROW_DEFS[row.id];
	return `${d.label}, ${stampOf(row)}: agent ${formatValue(row, row.agent[0])}, pros ${formatValue(row, row.pro[0])}`;
}
