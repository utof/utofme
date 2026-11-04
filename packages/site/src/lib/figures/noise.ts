/**
 * Pure logic of figure F9 (same experiment, twice): the tournament-noise band for a number of
 * rounds, the "smaller than ±N Elo is noise" threshold for a seed count and design, the beeswarm
 * stacking of the dots and the static drawing shared by the SSR keyframe and the island.
 *
 * Constants: the 90 % one-sided-to-two-sided z of the band is 1.645 (spec P10-13); N is the
 * project's own minimum detectable effect `mde(S, k)` = 2.49 · S / √k with S from the data.
 *
 * Why: the numbers behind the figure must be computed, not typed (AC13.1), and kept out of the
 * Svelte island so they are unit-testable.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
import type { NoiseData } from "../article-data/noise";
import { binomialEloSd, mde } from "../elo";
import { markPath } from "../figure-marks";
import { formatNumber, formatSigned, linear } from "../figure-scale";

/**
 * The design of the control: same seed as the arm, or an independent seed.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export type Design = "same_seed" | "indep_seed";

/**
 * The state the controls drive.
 *
 * Why: one value object makes the sentence, band and thresholds pure functions of it.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export interface NoiseState {
	rounds: number;
	seeds: number;
	design: Design;
}

/**
 * Slider and selector ranges: rounds per pair 1,000 to 8,000 in steps of 1,000; 1 to 4 seeds.
 *
 * Why: the spec fixes them; the e2e path "drag the rounds all the way down" ends at the minimum.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export const RANGES = {
	roundsMin: 1000,
	roundsMax: 8000,
	roundsStep: 1000,
	seedsMin: 1,
	seedsMax: 4,
} as const;

/**
 * The default (claim) state: 8,000 rounds, two independent seeds.
 *
 * Why: it reproduces the caption, "an effect smaller than ±9.3 Elo is noise".
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export const DEFAULT_STATE: NoiseState = { rounds: 8000, seeds: 2, design: "indep_seed" };

/**
 * Half-width of the 90 % tournament band around 0 for one pair: 1.645 · binomialEloSd(rounds).
 *
 * Why: AC13.1 — about ±18.1 at 1,000 rounds, ±6.4 at 8,000.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13 (AC13.1)
 */
export function bandHalf(rounds: number): number {
	return 1.645 * binomialEloSd(rounds);
}

/**
 * N of the sentence: the smallest effect distinguishable from noise with `seeds` seeds.
 *
 * Why: `mde(S, k)` with S the same-seed or independent SD from the data; at k = 2 it is 4.4 and 9.3.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13 (AC13.1)
 */
export function threshold(
	rules: NoiseData["rules"],
	state: Pick<NoiseState, "seeds" | "design">,
): number {
	const sd = state.design === "same_seed" ? rules.sameSeedSd : rules.indepSd;
	return mde(sd, state.seeds, rules.mdeFactor);
}

/**
 * The reactive sentence, split so the island can bold the numbers.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export interface Sentence {
	seeds: string;
	n: string;
	text: string;
}

/**
 * "With k seeds, an effect smaller than ±N Elo is noise."
 *
 * Why: the sentence is the figure's claim and is announced on every change.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export function sentence(rules: NoiseData["rules"], state: NoiseState): Sentence {
	const seeds = `${state.seeds} ${state.seeds === 1 ? "seed" : "seeds"}`;
	const n = `±${formatNumber(threshold(rules, state), 1)}`;
	return { seeds, n, text: `With ${seeds}, an effect smaller than ${n} Elo is noise.` };
}

/**
 * Stacks dots that would overlap: returns a vertical offset (in px, symmetric around 0) per value.
 *
 * Why: a dot plot must show every dot; deterministic placement (sorted by value) keeps the SSR
 * keyframe and the island identical.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export function swarm(values: readonly number[], x: (v: number) => number, gap: number): number[] {
	const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
	const placed: { px: number; slot: number }[] = [];
	const offsets = new Array<number>(values.length).fill(0);
	for (const { v, i } of order) {
		const px = x(v);
		let slot = 0;
		const taken = (s: number): boolean =>
			placed.some((p) => p.slot === s && Math.abs(p.px - px) < gap);
		// slots 0, +1, −1, +2, −2 …
		for (let k = 0; taken(slot); k++) slot = k % 2 === 0 ? k / 2 + 1 : -((k + 1) / 2);
		placed.push({ px, slot });
		offsets[i] = slot * gap;
	}
	return offsets;
}

/**
 * Layout of the drawing, in viewBox units.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export interface NoiseLayout {
	w: number;
	h: number;
	left: number;
	right: number;
	narrow: boolean;
}

/**
 * Wide 640 × 330 and narrow 480 × 370 (below 700 px) layouts.
 *
 * Why: keeps labels near their CSS size on a phone, as in F3.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export const NOISE_LAYOUTS: { wide: NoiseLayout; narrow: NoiseLayout } = {
	wide: { w: 640, h: 330, left: 16, right: 16, narrow: false },
	narrow: { w: 480, h: 370, left: 12, right: 12, narrow: true },
};

/** Domain of the Elo axis. */
const DOMAIN: readonly [number, number] = [-30, 40];
const DOT = 4;

const pf = (n: number): string => String(Math.round(n * 10) / 10);

const T = {
	tick: "font-size:13px;fill:var(--color-text-muted);font-variant-numeric:tabular-nums",
	row: "font-size:13px;fill:var(--color-text-body)",
	lab: "font-size:13px;font-weight:600;fill:var(--color-text);font-variant-numeric:tabular-nums",
	note: "font-size:12.5px;fill:var(--color-text-muted)",
} as const;

/** One row of the plot. */
interface Row {
	id: string;
	title: string;
	values: number[];
	mark: "inconclusive" | "kept";
	design?: Design;
}

/**
 * The three rows: nulls with a shared seed, nulls with independent seeds, adopted changes.
 *
 * Why: AC13.2 and the reader's comparison need the dots grouped by what they are.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export function rows(data: NoiseData): Row[] {
	const nulls = (k: Design): number[] => data.nulls.find((n) => n.kind === k)?.diffs ?? [];
	return [
		{
			id: "same",
			title: `Same recipe, same seed (${nulls("same_seed").length})`,
			values: nulls("same_seed"),
			mark: "inconclusive",
			design: "same_seed",
		},
		{
			id: "indep",
			title: `Same recipe, independent seeds (${nulls("indep_seed").length})`,
			values: nulls("indep_seed"),
			mark: "inconclusive",
			design: "indep_seed",
		},
		{
			id: "kept",
			title: `Changes I adopted (${data.effects.length})`,
			values: data.effects.map((e) => e.cs),
			mark: "kept",
		},
	];
}

/**
 * The drawing as SVG inner markup for a state: band, threshold lines, row titles, dots, axis.
 * Only numbers and fixed strings are interpolated.
 *
 * Why: the SSR keyframe renders the default state and the island re-renders on every change from
 * the same function, so the picture never differs between them.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export function noiseSvg(data: NoiseData, state: NoiseState, l: NoiseLayout): string {
	const x = linear(DOMAIN, [l.left, l.w - l.right]);
	const top = 40;
	const axisY = l.h - 44;
	const heights = l.narrow ? [64, 52, 150] : [64, 52, 112];
	const half = bandHalf(state.rounds);
	const n = threshold(data.rules, state);
	const out: string[] = [];
	out.push(
		`<rect x="${pf(x(-half))}" y="${top}" width="${pf(x(half) - x(-half))}" height="${axisY - top}" style="fill:var(--color-pro);fill-opacity:var(--ci-band-alpha)" data-band/>`,
		`<line x1="${pf(x(0))}" x2="${pf(x(0))}" y1="${top}" y2="${axisY}" style="stroke:var(--color-text-muted)"/>`,
	);
	for (const s of [-1, 1])
		out.push(
			`<line x1="${pf(x(s * n))}" x2="${pf(x(s * n))}" y1="${top - 6}" y2="${axisY}" style="stroke:var(--color-text);stroke-width:1.5;stroke-dasharray:5 3" data-threshold/>`,
		);
	out.push(
		`<text x="${pf(x(n) + 6)}" y="${top - 12}" style="${T.lab}">${formatSigned(n, 1).replace("+", "±")}</text>`,
		// Why: centred over the band a line higher, the label stays inside the drawing at every band
		// width; anchored to the band's left edge it ran off a phone's left edge (reader's pass).
		`<text x="${pf(x(0))}" y="${top - 26}" text-anchor="middle" style="${T.note}">tournament noise, 90 %: ±${formatNumber(half, 1)}</text>`,
	);
	let y = top;
	rows(data).forEach((row, idx) => {
		const h = heights[idx] ?? 60;
		const cy = y + 14 + (h - 14) / 2;
		const active = row.design === state.design;
		out.push(
			`<text x="${l.left}" y="${y + 12}" style="${T.row}${active ? ";font-weight:600" : ""}">${row.title}</text>`,
		);
		const off = swarm(row.values, x, DOT * 2 + 1);
		row.values.forEach((v, i) => {
			const py = cy + (off[i] ?? 0);
			const hollow = row.mark === "inconclusive";
			out.push(
				`<path d="${markPath(row.mark, x(v), py, DOT)}" style="${hollow ? "fill:var(--color-bg)" : "fill:var(--color-outcome-kept)"};stroke:var(${row.mark === "kept" ? "--color-outcome-kept" : "--color-outcome-inconclusive"});stroke-width:1.5" data-dot="${row.id}"/>`,
			);
		});
		y += h;
	});
	for (let t = DOMAIN[0]; t <= DOMAIN[1]; t += 10)
		out.push(
			`<line x1="${pf(x(t))}" x2="${pf(x(t))}" y1="${axisY}" y2="${axisY + 4}" style="stroke:var(--color-text-muted)"/><text x="${pf(x(t))}" y="${axisY + 19}" text-anchor="middle" style="${T.tick}">${formatSigned(t, 0)}</text>`,
		);
	out.push(
		`<line x1="${l.left}" x2="${l.w - l.right}" y1="${axisY}" y2="${axisY}" style="stroke:var(--color-text-muted)"/>`,
		`<text x="${l.left}" y="${l.h - 6}" style="${T.note}">Elo difference between two runs (arm minus control)</text>`,
	);
	return out.join("");
}

/**
 * Text equivalent of the plot for `aria-label` and the no-JS reader.
 *
 * Why: the dot plot is a role=img in the keyframe; its numbers must be readable as text too.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13 (fallback)
 */
export function summary(data: NoiseData, state: NoiseState): string {
	const r = rows(data);
	const range = (v: number[]): string =>
		v.length === 0
			? "none"
			: `${formatSigned(Math.min(...v), 1)} to ${formatSigned(Math.max(...v), 1)}`;
	return `Elo differences between identical recipes: ${r[0]?.values.length ?? 0} with the same seed, ${range(r[0]?.values ?? [])}; ${r[1]?.values.length ?? 0} with independent seeds, ${range(r[1]?.values ?? [])}. ${r[2]?.values.length ?? 0} adopted changes, ${range(r[2]?.values ?? [])}. The tournament band at ${formatNumber(state.rounds, 0)} rounds is ±${formatNumber(bandHalf(state.rounds), 1)}. ${sentence(data.rules, state).text}`;
}
