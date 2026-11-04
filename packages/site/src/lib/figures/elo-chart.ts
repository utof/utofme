/**
 * Pure logic of figure F3 (Elo over training, with its uncertainty): the three map sets, the
 * point-to-pixel path builders, the intervals, the focus-cursor readouts, the marker cards, the
 * after-block-28 strip and the 3v3 panel.
 *
 * Constants cited here: a training block is 2e8 environment steps and about 32 minutes of
 * compute per run (fact `compute.block.minutes`); every recipe is trained from two seeds; the
 * 2-block-per-checkpoint main line starts at block 2, so the GPU-hours axis is
 * `(block − 2) × 2 seeds × 32 min / 60`, approximate and labelled so.
 *
 * Why: keeping the geometry out of the Svelte island makes it unit-testable (AC7.1) and keeps the
 * SSR keyframe and the island pixel-identical in the default view.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
import type { EloData } from "../article-data/elo";
import { formatInterval, formatNumber, formatSigned, linear } from "../figure-scale";

/**
 * The three selectable map sets.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export type MapSet = "hand" | "generated" | "compiled";

/**
 * The toggle's options, in display order (hand-made is the default).
 *
 * Why: labels are the public names of the three evaluation map sets.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (map-set toggle)
 */
export const MAP_SETS: readonly { id: MapSet; label: string }[] = [
	{ id: "hand", label: "Hand-made CS maps" },
	{ id: "generated", label: "Generated test maps" },
	{ id: "compiled", label: "Compiled CS maps" },
];

/**
 * Compute per run and block, in minutes (fact `compute.block.minutes`), and runs per recipe.
 *
 * Why: the GPU-hours axis must state its constants (spec P10-7).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
const COMPUTE = { minutesPerBlock: 32, seeds: 2, firstBlock: 2 } as const;

/**
 * One plotted point.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface PlotPoint {
	block: number;
	v: number;
	lo?: number;
	hi?: number;
	/** Chained from two readouts: drawn hollow, no interval. */
	chained: boolean;
	/** Per-seed values (blocks 24 and 28 of the hand-made set only). */
	perSeed?: { s1: number; s2: number };
}

/**
 * The points of one map set.
 *
 * Why: generated maps have no intervals in the data; compiled maps have only three readouts.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function plotPoints(data: EloData, set: MapSet): PlotPoint[] {
	if (set === "compiled")
		return data.compiled.map((c) => ({
			block: c.block,
			v: c.v,
			...(c.block === COMPUTE.firstBlock ? {} : { lo: c.lo, hi: c.hi }),
			chained: false,
		}));
	return data.main.map((m) => ({
		block: m.block,
		v: set === "hand" ? m.hand.v : m.gen,
		...(set === "hand" && m.hand.lo !== undefined && m.hand.hi !== undefined
			? { lo: m.hand.lo, hi: m.hand.hi }
			: {}),
		chained: m.chained,
		...(set === "hand" && m.perSeed ? { perSeed: m.perSeed } : {}),
	}));
}

/**
 * Layout of the main chart, in viewBox units (the viewBox is `w × h`).
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface Layout {
	w: number;
	h: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
	/** Whether this is the narrow (4:3) layout. */
	narrow: boolean;
}

/**
 * The two layouts: wide 640 × 360 (16:9) and narrow 480 × 360 (4:3, below 700 px), so labels stay
 * near their CSS size on a phone.
 *
 * Why: the spec asks for 16:9 and 4:3 below 700 px; a fixed viewBox would shrink the text with the
 * width.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export const LAYOUTS: { wide: Layout; narrow: Layout } = {
	wide: { w: 640, h: 360, left: 52, right: 28, top: 22, bottom: 74, narrow: false },
	narrow: { w: 480, h: 360, left: 46, right: 20, top: 22, bottom: 78, narrow: true },
};

/**
 * The two scales of the main chart.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface Scales {
	x: (block: number) => number;
	y: (elo: number) => number;
	yTicks: number[];
	xTicks: number[];
	yMax: number;
}

/**
 * Builds the shared scales: x = training block 2 to 28, y = Elo over block 2, 0 to 100.
 *
 * Why: one fixed domain keeps the three map sets comparable when the toggle switches.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function scales(l: Layout = LAYOUTS.wide): Scales {
	const yMax = 100;
	return {
		x: linear([2, 28], [l.left, l.w - l.right]),
		y: linear([0, yMax], [l.h - l.bottom, l.top]),
		yTicks: [0, 25, 50, 75, 100],
		xTicks: l.narrow ? [2, 14, 26] : [2, 8, 14, 20, 26],
		yMax,
	};
}

const f = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The line's SVG path through every point of a set ("M x,y L x,y …").
 *
 * Why: golden-tested (AC7.1); chained points stay on the line, only their markers and bands differ.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (AC7.1)
 */
export function linePath(points: readonly PlotPoint[], s: Pick<Scales, "x" | "y">): string {
	return points.map((p, i) => `${i === 0 ? "M" : "L"}${f(s.x(p.block))},${f(s.y(p.v))}`).join("");
}

/**
 * Runs of consecutive points that all have an interval and are not chained; each run of two or
 * more is one band polygon. A lone interval point is drawn as a whisker only.
 *
 * Why: a band across a chained point would claim an interval the data does not have.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (AC7.1)
 */
export function bandRuns(points: readonly PlotPoint[], set: MapSet): PlotPoint[][] {
	if (set !== "hand") return [];
	const runs: PlotPoint[][] = [];
	let run: PlotPoint[] = [];
	for (const p of points) {
		if (!p.chained && p.lo !== undefined && p.hi !== undefined) run.push(p);
		else {
			if (run.length > 1) runs.push(run);
			run = [];
		}
	}
	if (run.length > 1) runs.push(run);
	return runs;
}

/**
 * One band's closed polygon path (upper edge left to right, lower edge back).
 *
 * Why: the 90 % band is a filled area behind the line.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function bandPath(run: readonly PlotPoint[], s: Pick<Scales, "x" | "y">): string {
	const up = run.map((p) => `${f(s.x(p.block))},${f(s.y(p.hi ?? p.v))}`);
	const down = [...run].reverse().map((p) => `${f(s.x(p.block))},${f(s.y(p.lo ?? p.v))}`);
	return `M${up.join("L")}L${down.join("L")}Z`;
}

/**
 * Cumulative GPU-hours at a block (approximate): `(block − 2) × 2 seeds × 32 min / 60`.
 *
 * Why: the secondary axis of the spec; the constants are in {@link COMPUTE}.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function gpuHours(block: number): number {
	return ((block - COMPUTE.firstBlock) * COMPUTE.seeds * COMPUTE.minutesPerBlock) / 60;
}

/**
 * The focus-cursor readout, e.g. "Block 20: +78 Elo (90 % interval +76 to +80)".
 *
 * Why: the spec's keyboard text; per-seed values are appended where the data has them.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (keyboard)
 */
export function pointLabel(p: PlotPoint): string {
	const head = `Block ${p.block}: ${formatSigned(p.v, 0)} Elo`;
	const seeds = p.perSeed
		? `; seeds ${formatSigned(p.perSeed.s1, 0)} and ${formatSigned(p.perSeed.s2, 0)}`
		: "";
	if (p.lo !== undefined && p.hi !== undefined)
		return `${head} (90 % interval ${formatInterval(p.lo, p.hi, 0, { signed: true })})${seeds}`;
	if (p.chained) return `${head} (chained, no interval)`;
	return `${head}${seeds}`;
}

/**
 * The headline label of the block-28 point: "+96 (+94 to +98)".
 *
 * Why: the default view must show the caption's claim (spec P10-7 default).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function headLabel(p: PlotPoint): string {
	const base = formatSigned(p.v, 0);
	return p.lo !== undefined && p.hi !== undefined
		? `${base} (${formatInterval(p.lo, p.hi, 0, { signed: true })})`
		: base;
}

/**
 * Hand-written copy of a marker card.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface MarkerCopy {
	title: string;
	what: string;
}

/**
 * The public copy of the three adopted changes, by A/B id.
 *
 * Why: the dataset carries only numbers and the notebook id; the words are written here.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (markers)
 */
const MARKER_COPY: Readonly<Record<string, MarkerCopy>> = {
	F1: {
		title: "Flash arc",
		what: "Lobbed and bank flashes added. Adopted for realism: it costs nothing the test can see beyond a small dip.",
	},
	F2: {
		title: "Bot roles",
		what: "Training opponents got team roles, like the pros'. Adopted: a small gain, and 5 to 7 % cheaper to train.",
	},
	F4: {
		title: "Flash kick",
		what: "A fixed, gentle kick toward using flashes. Adopted from block 7.",
	},
};

/**
 * A marker placed on the active line.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface PlacedMarker {
	abId: string;
	title: string;
	what: string;
	notebookId: string;
	/** Deciding number, signed, with its interval: "+4 Elo vs control (90 % interval +3 to +6)". */
	deciding: string;
	block: number;
	/** Position in viewBox units, on the active line. */
	cx: number;
	cy: number;
}

/**
 * Where a value sits on a set's polyline at a block (linear interpolation, clamped).
 *
 * Why: the markers stay on the plotted line whichever map set is active, also the sparse compiled one.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function valueAt(points: readonly PlotPoint[], block: number): number {
	const first = points[0];
	const last = points.at(-1);
	if (!first || !last) return 0;
	if (block <= first.block) return first.v;
	if (block >= last.block) return last.v;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (a && b && block <= b.block)
			return a.v + ((b.v - a.v) * (block - a.block)) / (b.block - a.block);
	}
	return last.v;
}

/**
 * The markers with their cards and screen positions on the active line. Markers that share a
 * block are nudged apart horizontally (12 units) so both stay clickable.
 *
 * Why: AC7.3 needs each marker's notebook link; the nudge keeps the two block-6 markers apart.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (markers)
 */
export function placeMarkers(
	data: EloData,
	points: readonly PlotPoint[],
	s: Pick<Scales, "x" | "y">,
): PlacedMarker[] {
	const seen = new Map<number, number>();
	return data.markers.map((m) => {
		const copy = MARKER_COPY[m.abId] ?? { title: m.abId, what: "" };
		const n = seen.get(m.block) ?? 0;
		seen.set(m.block, n + 1);
		const shared = data.markers.filter((o) => o.block === m.block).length;
		const dx = shared > 1 ? (n - (shared - 1) / 2) * 24 : 0;
		return {
			abId: m.abId,
			title: copy.title,
			what: copy.what,
			notebookId: m.notebookId,
			deciding: `${formatSigned(m.cs, 0)} Elo vs control (90 % interval ${formatInterval(m.lo, m.hi, 0, { signed: true })})`,
			block: m.block,
			cx: s.x(m.block) + dx,
			cy: s.y(valueAt(points, m.block)) - 16,
		};
	});
}

/**
 * One line of the "After block 28 the game changed" strip.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface AfterRow {
	id: string;
	label: string;
	text: string;
}

const AFTER_LABELS: Readonly<Record<string, string>> = {
	"b29-30": "Control of the generator test",
	"b32-33": "Control of the snap test",
	snap: "Snap fire",
	g6: "First check of the v3 line",
	crouch: "Crouch",
};

/**
 * The strip's rows: each change with the number in its own game, and the other game's number
 * where the source has one ("+29 in the snap game, −15 in today's game").
 *
 * Why: these segments are not on the block-2 scale and must say which game each belongs to.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (strip)
 */
export function afterRows(data: EloData): AfterRow[] {
	return data.after28.map((a) => {
		const inGame = (g: string): string => (g.startsWith("today") ? g : `the ${g}`);
		const own = `${formatSigned(a.v, Number.isInteger(a.v) ? 0 : 1)} in ${inGame(a.game)}`;
		const alt = a.alt ? `, ${formatSigned(a.alt.v, 0)} in ${inGame(a.alt.game)}` : "";
		return { id: a.id, label: AFTER_LABELS[a.id] ?? a.id, text: `${own}${alt}` };
	});
}

/**
 * Layout of the 3v3 panel.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export const PANEL = { w: 320, h: 180, left: 40, right: 12, top: 12, bottom: 30 } as const;

/**
 * The 3v3 panel's own axis, geometry and two series.
 *
 * Why: typed contract between the pure logic, the keyframe and the island.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export interface Panel {
	x: (block: number) => number;
	y: (elo: number) => number;
	xTicks: number[];
	yTicks: number[];
	series: { id: "seed0" | "seed1"; label: string; points: string }[];
}

/**
 * The 3v3 era panel: its own axes (blocks of an earlier game, Elo over that line's start).
 *
 * Why: a different game; sharing no scale, no path and no element with the main chart is the
 * point (AC7.2).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (3v3 panel)
 */
export function panel(data: EloData): Panel {
	const all = [...data.era3v3.seed0, ...data.era3v3.seed1];
	const maxB = Math.max(...all.map((p) => p.block), 1);
	const maxV = Math.ceil(Math.max(...all.map((p) => p.v), 1) / 50) * 50;
	const x = linear([0, maxB], [PANEL.left, PANEL.w - PANEL.right]);
	const y = linear([0, maxV], [PANEL.h - PANEL.bottom, PANEL.top]);
	const line = (pts: EloData["era3v3"]["seed0"]): string =>
		pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(x(p.block))},${f(y(p.v))}`).join("");
	return {
		x,
		y,
		xTicks: [0, Math.round(maxB / 2), maxB],
		yTicks: Array.from({ length: maxV / 50 + 1 }, (_, i) => i * 50),
		series: [
			{ id: "seed0", label: "Seed A", points: line(data.era3v3.seed0) },
			{ id: "seed1", label: "Seed B", points: line(data.era3v3.seed1) },
		],
	};
}

/**
 * Plain-text equivalent of a set for the live summary and the no-JS table: one row per point.
 *
 * Why: AC7.4 (no-JS table has one row per point) and the screen-reader summary share one source.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (fallback)
 */
export function tableRows(
	points: readonly PlotPoint[],
): { block: number; gpu: string; elo: string; interval: string }[] {
	return points.map((p) => ({
		block: p.block,
		gpu: formatNumber(gpuHours(p.block), 1),
		elo: formatSigned(p.v, 0),
		interval:
			p.lo !== undefined && p.hi !== undefined
				? formatInterval(p.lo, p.hi, 0, { signed: true })
				: p.chained
					? "chained, no interval"
					: "none",
	}));
}

const pf = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * The static drawing of one map set as SVG inner markup: grid, both x axes, bands, whiskers, line,
 * points (hollow when chained), the "3 readouts" / "no intervals" notes and the labelled
 * block-28 point (carrying `data-fact="elo.head.block2"` for linked numbers on the hand-made set).
 * Only numbers and fixed strings are interpolated.
 *
 * Why: the SSR keyframe and the island draw the same picture from one function, so hydration
 * changes nothing visible and the default state already shows the claim (+96, +94 to +98).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export function chartSvg(data: EloData, set: MapSet, l: Layout): string {
	const s = scales(l);
	const pts = plotPoints(data, set);
	const bottom = l.h - l.bottom;
	const line = "var(--color-pro)";
	const parts: string[] = [];
	for (const t of s.yTicks)
		parts.push(
			`<line x1="${l.left}" x2="${l.w - l.right}" y1="${pf(s.y(t))}" y2="${pf(s.y(t))}" style="stroke:var(--color-border)"/><text x="${l.left - 8}" y="${pf(s.y(t) + 4)}" text-anchor="end" style="${TEXT.tick}">${formatSigned(t, 0)}</text>`,
		);
	parts.push(`<text x="6" y="14" style="${TEXT.axis}">Elo over block 2</text>`);
	for (const t of s.xTicks)
		parts.push(
			`<line x1="${pf(s.x(t))}" x2="${pf(s.x(t))}" y1="${bottom}" y2="${bottom + 4}" style="stroke:var(--color-text-muted)"/><text x="${pf(s.x(t))}" y="${bottom + 18}" text-anchor="middle" style="${TEXT.tick}">${t}</text><text x="${pf(s.x(t))}" y="${bottom + 34}" text-anchor="middle" style="${TEXT.tick}">${formatNumber(gpuHours(t), 0)}</text>`,
		);
	parts.push(
		`<text x="${l.left}" y="${bottom + 51}" style="${TEXT.axis}">Training block, then GPU-hours (approx.)</text>`,
	);
	for (const run of bandRuns(pts, set))
		parts.push(
			`<path d="${bandPath(run, s)}" style="fill:var(--color-pro);fill-opacity:var(--ci-band-alpha)" data-band/>`,
		);
	for (const p of pts)
		if (p.lo !== undefined && p.hi !== undefined && !p.chained)
			parts.push(
				`<line x1="${pf(s.x(p.block))}" x2="${pf(s.x(p.block))}" y1="${pf(s.y(p.lo))}" y2="${pf(s.y(p.hi))}" style="stroke:${line};stroke-width:1.5" data-whisker/>`,
			);
	parts.push(
		`<path d="${linePath(pts, s)}" fill="none" style="stroke:${line};stroke-width:2${set === "compiled" ? ";stroke-dasharray:6 4" : ""}" data-line/>`,
	);
	for (const p of pts) {
		const head = p.block === 28;
		parts.push(
			`<circle cx="${pf(s.x(p.block))}" cy="${pf(s.y(p.v))}" r="${head ? 5 : 4}" style="stroke:${line};stroke-width:2;fill:${p.chained ? "var(--color-bg)" : line}"${head && set === "hand" ? ' data-fact="elo.head.block2"' : ""} data-point="${p.block}"/>`,
		);
	}
	const head = pts.find((p) => p.block === 28);
	if (head)
		parts.push(
			`<text x="${pf(s.x(28) - 12)}" y="${pf(s.y(head.v) + 4)}" text-anchor="end" style="${TEXT.head}">${headLabel(head)}</text>`,
		);
	const note =
		set === "compiled"
			? "3 readouts, each with its 90 % interval"
			: set === "generated"
				? "No intervals for the generated maps in this data"
				: "Band: 90 % interval. Hollow: chained from two readouts, no interval";
	parts.push(`<text x="${l.left}" y="${l.h - 6}" style="${TEXT.note}">${note}</text>`);
	return parts.join("");
}

/**
 * The small 3v3 panel as SVG inner markup (own axes: blocks of the earlier game, Elo over that
 * line's start; seed A solid, seed B dashed), plus an accessible summary.
 *
 * Why: a different game on a different scale: it shares no element, path or axis with the main
 * chart (AC7.2).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (3v3 panel)
 */
export function panelSvg(data: EloData): { markup: string; summary: string } {
	const p = panel(data);
	const parts: string[] = [];
	for (const t of p.yTicks)
		parts.push(
			`<line x1="${PANEL.left}" x2="${PANEL.w - PANEL.right}" y1="${pf(p.y(t))}" y2="${pf(p.y(t))}" style="stroke:var(--color-border)"/><text x="${PANEL.left - 6}" y="${pf(p.y(t) + 4)}" text-anchor="end" style="${TEXT.tick}">${formatSigned(t, 0)}</text>`,
		);
	for (const t of p.xTicks)
		parts.push(
			`<text x="${pf(p.x(t))}" y="${PANEL.h - 12}" text-anchor="middle" style="${TEXT.tick}">${t}</text>`,
		);
	parts.push(
		`<text x="${PANEL.left}" y="${PANEL.h - 1}" style="${TEXT.note}">3v3 training block</text>`,
	);
	for (const sr of p.series)
		parts.push(
			`<path d="${sr.points}" fill="none" style="stroke:var(--color-pro);stroke-width:2${sr.id === "seed1" ? ";stroke-dasharray:5 3" : ""}" data-panel-line="${sr.id}"/>`,
		);
	const all = [...data.era3v3.seed0, ...data.era3v3.seed1];
	const top = Math.max(...all.map((q) => q.v));
	const last = Math.max(...all.map((q) => q.block));
	return {
		markup: parts.join(""),
		summary: `Two training seeds of the earlier 3v3 game, Elo over that line's start, blocks 1 to ${last}: both rise steadily, to about ${formatSigned(top, 0)} at the highest point. Different game, not on the main scale.`,
	};
}

/** Inline text styles of the SVG drawing (so the same markup works in the keyframe and the island). */
const TEXT = {
	tick: "font-size:13px;fill:var(--color-text-muted);font-variant-numeric:tabular-nums",
	axis: "font-size:13px;fill:var(--color-text-body)",
	head: "font-size:14px;font-weight:600;fill:var(--color-text);font-variant-numeric:tabular-nums",
	note: "font-size:12.5px;fill:var(--color-text-muted)",
} as const;

/**
 * Inline style for the focus-readout line drawn by the island.
 *
 * Why: the island draws it with the same text metrics as the static drawing.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (keyboard)
 */
export const READOUT_STYLE =
	"font-size:13px;fill:var(--color-text);font-variant-numeric:tabular-nums";
