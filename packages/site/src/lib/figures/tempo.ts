/**
 * Pure logic of figure F4 ("When does the first fight start?"): metric table, histogram clipping,
 * the plot geometry shared by the SSR keyframe and the island, the computed sentences, the
 * guess slider and the reveal-state storage.
 *
 * Why: the keyframe and the island must draw the same picture from the same numbers, and every
 * sentence under the figure is computed from the series on screen (never typed), so the logic
 * lives in one DOM-free module that unit tests can pin (AC8.1–AC8.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
import type { TempoData } from "../article-data/tempo";
import { formatInterval, formatNumber, formatPercent, formatSeconds } from "../figure-scale";

/** One of the shown time series (a histogram plus its quantiles).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type TempoSeries = TempoData["series"]["b28"]["contact"];

/** Metric keys, in selector order.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type MetricKey = "contact" | "firstKill" | "plant";
/** Agent block keys, in selector order.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type AgentKey = "v5a2" | "b6" | "b10" | "b28";

/** Static description of one metric.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export interface MetricInfo {
	readonly key: MetricKey;
	/** Selector label. */
	readonly label: string;
	/** Axis maximum in seconds (60 for contact and kill, 128 for plant: the round length). */
	readonly maxS: number;
	/** Prose fact key of the agents' (block 28) median, for `data-fact` marks. */
	readonly agentFact: string;
	/** Prose fact key of the pros' median. */
	readonly proFact: string;
}

/**
 * The three metrics.
 *
 * Why: the spec fixes the axes (0–60 s, plant 0–128 s) and the facts they link to.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export const METRICS: readonly MetricInfo[] = [
	{
		key: "contact",
		label: "First contact",
		maxS: 60,
		agentFact: "tempo.b28.contact.median",
		proFact: "tempo.pros.contact.median",
	},
	{
		key: "firstKill",
		label: "First kill",
		maxS: 60,
		agentFact: "tempo.b28.firstkill.median",
		proFact: "tempo.pros.firstkill.median",
	},
	{
		key: "plant",
		label: "Plant",
		maxS: 128,
		agentFact: "tempo.b28.plant.median",
		proFact: "tempo.pros.plant.median",
	},
];

/**
 * The agent checkpoints the selector offers; `block` is the number the stamp prints.
 *
 * Why: the first checkpoint is "v5a2" in the data and block 2 in prose.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export const AGENT_BLOCKS: readonly { readonly key: AgentKey; readonly block: number }[] = [
	{ key: "v5a2", block: 2 },
	{ key: "b6", block: 6 },
	{ key: "b10", block: 10 },
	{ key: "b28", block: 28 },
];

/** The guess slider's range and step, in seconds.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const GUESS = { min: 0, max: 60, step: 0.8 } as const;

/**
 * Look a metric up.
 *
 * Why: callers hold a key; the table is the one place the axes live.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function metricInfo(key: MetricKey): MetricInfo {
	const m = METRICS.find((x) => x.key === key);
	if (!m) throw new Error(`unknown metric ${key}`);
	return m;
}

/**
 * Clamp a guess to the slider and snap it to the 0.8 s grid.
 *
 * Why: the game's clock is 0.8 s ticks; a guess between ticks has no meaning.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function snapGuess(s: number): number {
	const clamped = Math.min(Math.max(Number.isFinite(s) ? s : 0, GUESS.min), GUESS.max);
	return Math.round(Math.round(clamped / GUESS.step) * GUESS.step * 10) / 10;
}

/**
 * Histogram bins below `maxS`, plus the count of rounds in later bins.
 *
 * Why: the 60 s axes would otherwise hide the pros' long tail; the count feeds an "N % later"
 * note so nothing is silently cut.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function clipHistogram(
	hist: readonly number[],
	binS: number,
	maxS: number,
): { bins: number[]; later: number } {
	const n = Math.round(maxS / binS);
	return {
		bins: hist.slice(0, n),
		later: hist.slice(n).reduce((a, b) => a + b, 0),
	};
}

/**
 * Share of all rounds whose event happens before `seconds` (whole bins strictly below it).
 *
 * Why: "X % of agent rounds make contact before 12 s" is computed from the histogram, with rounds
 * that never have the event counted in the denominator.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function shareBefore(s: TempoSeries, seconds: number, binS = 0.8): number {
	const k = Math.floor(seconds / binS + 1e-9);
	return s.hist.slice(0, k).reduce((a, b) => a + b, 0) / s.n;
}

/** SVG geometry of the plot (viewBox units).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const PLOT = {
	w: 640,
	h: 392,
	x0: 16,
	x1: 624,
	agent: { label: 20, top: 28, base: 112, box: 134 },
	pro: { label: 200, top: 208, base: 292, box: 314 },
	axis: 356,
} as const;

/** A strip's vertical placement.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export type Strip = typeof PLOT.agent | typeof PLOT.pro;

/**
 * x position (viewBox units) of a time in seconds on a metric's axis.
 *
 * Why: one linear map for bars, quantile boxes, the guess line and the ticks.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function xOf(seconds: number, maxS: number): number {
	return PLOT.x0 + (Math.min(Math.max(seconds, 0), maxS) / maxS) * (PLOT.x1 - PLOT.x0);
}

/**
 * One SVG path (straight segments only) drawing a series' histogram as bars.
 * `maxShare` scales both strips alike so their areas compare honestly.
 *
 * Why: AC8.4 forbids curve commands; a single path per strip keeps the DOM small and never
 * smooths the 0.8 s bins.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function barsPath(
	s: TempoSeries,
	binS: number,
	maxS: number,
	maxShare: number,
	strip: Strip,
): string {
	const { bins } = clipHistogram(s.hist, binS, maxS);
	const w = (PLOT.x1 - PLOT.x0) / bins.length;
	const height = strip.base - strip.top;
	const parts: string[] = [];
	bins.forEach((count, i) => {
		if (count === 0) return;
		const h = Math.max(1, (count / s.n / maxShare) * height);
		parts.push(`M${r2(PLOT.x0 + i * w)},${r2(strip.base)}v${r2(-h)}h${r2(w)}v${r2(h)}z`);
	});
	return parts.join("");
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * The largest per-bin share of rounds among the given series on a metric's axis.
 *
 * Why: both strips use one vertical scale.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function maxBinShare(list: readonly TempoSeries[], binS: number, maxS: number): number {
	let m = 0;
	for (const s of list)
		for (const c of clipHistogram(s.hist, binS, maxS).bins) m = Math.max(m, c / s.n);
	return m || 1;
}

/**
 * Path of a quantile box: q10–q90 whisker, q25–q75 box (straight segments only).
 *
 * Why: the spec's box is q10/q90 whiskers, q25–q75 box, q50 dot.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function boxPath(
	q: TempoSeries["q"],
	maxS: number,
	strip: Strip,
): { whisker: string; box: string } {
	const mid = strip.box;
	const [q10, q25, , q75, q90] = q;
	const [a, b, d, e] = [q10, q25, q75, q90].map((v) => xOf(v, maxS));
	if (a === undefined || b === undefined || d === undefined || e === undefined)
		throw new Error("quantiles");
	return {
		whisker: `M${r2(a)},${mid}H${r2(e)}M${r2(a)},${mid - 5}v10M${r2(e)},${mid - 5}v10`,
		box: `M${r2(b)},${mid - 7}H${r2(d)}V${mid + 7}H${r2(b)}z`,
	};
}

/**
 * Axis tick positions in seconds for a metric.
 *
 * Why: 10 s steps on the 60 s axes, 20 s on the plant axis; the last tick is the axis end.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function axisTicks(maxS: number): number[] {
	const step = maxS > 60 ? 32 : 10;
	const out: number[] = [];
	for (let t = 0; t <= maxS + 1e-9; t += step) out.push(t);
	return out;
}

/**
 * The stamp text under F4 for an agent block.
 *
 * Why: OD-4: "Agents as measured on block {N} (5v5), 2026-11-04 rerun, {rounds} rounds; pros: 224
 * pro maps of 2026, {rounds} rounds"; block, counts and the rerun date come from the dataset.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function stampText(
	data: TempoData,
	agent: AgentKey,
	rerunDate: string,
	prosMaps: string,
): string {
	const block = AGENT_BLOCKS.find((b) => b.key === agent)?.block ?? 0;
	const rounds = (n: number): string => formatNumber(n, 0);
	return `Agents as measured on block ${block} (5v5), ${rerunDate} rerun, ${rounds(data.rounds[agent])} rounds; pros: ${prosMaps} pro maps of 2026, ${rounds(data.rounds.pros)} rounds`;
}

/**
 * "X % of agent rounds make contact before 12 s; pros Y %."
 *
 * Why: the 12 s line is the one the prose cites; both numbers come from the series shown.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function earlySentence(agents: TempoSeries, pros: TempoSeries, seconds = 12): string {
	return `${formatPercent(shareBefore(agents, seconds), 0)} of agent rounds make contact before ${formatSeconds(seconds)}; pros ${formatPercent(shareBefore(pros, seconds), 0)}.`;
}

/**
 * "You guessed G s; pros take P s."
 *
 * Why: closes the guess-then-reveal loop with the guessed and the real median side by side.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function guessSentence(guess: number, prosMedian: number): string {
	return `You guessed ${formatSeconds(guess)}; pros take ${formatSeconds(prosMedian)}.`;
}

/**
 * "The pros' median is 22.8 s (22.1 to 23.6)."
 *
 * Why: the reveal states the pros' median with its interval; this is the screen-reader form of
 * the diamond.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function prosMedianText(ci: readonly [number, number, number]): string {
	return `${formatSeconds(ci[0])} (${formatInterval(ci[1], ci[2], 1)} s)`;
}

/**
 * "N % of agent rounds never plant; pros M %." or `null` when the event always happens.
 *
 * Why: a plant histogram that ignores the rounds that never plant would overstate speed.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function noneSentence(agents: TempoSeries, pros: TempoSeries): string | null {
	if (agents.noneShare < 0.005 && pros.noneShare < 0.005) return null;
	return `${formatPercent(agents.noneShare, 0)} of agent rounds never plant; pros ${formatPercent(pros.noneShare, 0)}.`;
}

/** Storage key of the reveal state.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export const REVEAL_KEY = "utofme:f4";

/** Reveal state kept in `sessionStorage`.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 */
export interface RevealState {
	readonly revealed: boolean;
	/** The guess in seconds, or `null` when the reader pressed "Just show me". */
	readonly guess: number | null;
}

/**
 * Read the persisted reveal state; a missing, blocked or malformed value is the unrevealed default.
 *
 * Why: storage can throw (private windows, blocked site data); the figure must still render.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function readReveal(storage: Pick<Storage, "getItem"> | null): RevealState {
	const none = { revealed: false, guess: 12 };
	try {
		const raw = storage?.getItem(REVEAL_KEY);
		if (raw === "skip") return { revealed: true, guess: null };
		const m = raw ? /^(\d+(?:\.\d+)?)$/.exec(raw) : null;
		return m?.[1] === undefined ? none : { revealed: true, guess: snapGuess(Number(m[1])) };
	} catch {
		return none;
	}
}

/**
 * Persist (revealed) or clear (unrevealed) the state.
 *
 * Why: "Guess again" resets by removing the key; errors are swallowed because nothing depends on it.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export function writeReveal(
	storage: Pick<Storage, "setItem" | "removeItem"> | null,
	state: RevealState,
): void {
	try {
		if (state.revealed)
			storage?.setItem(REVEAL_KEY, state.guess === null ? "skip" : String(state.guess));
		else storage?.removeItem(REVEAL_KEY);
	} catch {
		/* storage unavailable: the state just does not persist */
	}
}
