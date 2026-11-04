/**
 * Pure logic of figure F7, "Tried / kept / parked": the ten starred entries, filters and counts,
 * the timeline geometry, the roving-focus rule, the list order for phones and the card text.
 *
 * Why: everything the figure decides (what a chip hides, where a mark sits, which mark an arrow key
 * reaches, what a card says) is data and arithmetic, so it lives here, unit-tested and
 * property-tested (AC11.1), and the island only wires events to it.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 * @see packages/specs/adrs/0053-hand-rolled-figures.md
 */
import type { NotebookData } from "../article-data/notebook";
import { formatInterval, formatSigned } from "../figure-scale";

/**
 * One notebook entry as shipped.
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export type Entry = NotebookData["entries"][number];

/**
 * The five outcomes of an entry, in legend order.
 *
 * Why: one list for the dataset schema, the legend, the chips and the mark keys (the outcome names
 * are also the mark keys of `figure-marks`).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export const OUTCOMES = ["kept", "reverted", "inconclusive", "parked", "infra"] as const;

/**
 * One outcome of an entry.
 *
 * Why: derived from {@link OUTCOMES} so the type cannot drift from the schema.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Reader-facing outcome words.
 *
 * Why: `infra` is "built a tool" in the prose ("that built tools rather than tested ideas").
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export const OUTCOME_LABEL: Readonly<Record<Outcome, string>> = {
	kept: "kept",
	reverted: "reverted",
	inconclusive: "inconclusive",
	parked: "parked",
	infra: "tooling",
};

/**
 * The ten starred entries, in the order of the story, as literal ids.
 *
 * Curated by the lane from the notes' "Highlights" table (a highlight that has no entry of its own
 * maps to the nearest entry on the same date). The owner signs off on this list in the PR checklist
 * (spec P10-11); a unit test resolves every id.
 * Why: a literal list keeps the choice reviewable in one place and independent of the data.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (Highlights)
 */
export const HIGHLIGHT_IDS: readonly string[] = [
	"p1-zero-shot-cs", // 1. CS maps break agents trained on open maps (10-14)
	"p1-slide-variety", // 2. wall sliding + generated maps only (10-15)
	"p1-molotov-curriculum", // 3. molotovs: a free-throw curriculum (10-14)
	"p1-bot-only-policy", // 4. beating bots is not strength (10-13)
	"p1-noise-calibration", // 5. seed noise is the yardstick (10-17)
	"p2-lr1e4", // 6. a smaller learning rate beats bigger networks (10-20)
	"p2-exp-never", // 7. co-trained exploiters never exploited (10-21)
	"p2-kickmain", // 8. flashes: self-blinding, kicks (10-21)
	"p3-save-diagnosis", // 9. why agents never save: the discount (10-26)
	"p3-free-peek", // 10. the free one-tick peek (11-02)
];

/**
 * Fragment id of an entry's card: `nb-<id>`.
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export function cardId(id: string): string {
	return `nb-${id}`;
}

/**
 * The entry id a URL hash points at (`#nb-<id>`), or `null`.
 *
 * Why: F3's marker links and `hashchange` open the matching card; an unknown id opens nothing.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (AC11.3)
 */
export function idFromHash(hash: string, entries: readonly Entry[]): string | null {
	const m = /^#nb-(.+)$/.exec(hash);
	const id = m?.[1];
	return id !== undefined && entries.some((e) => e.id === id) ? id : null;
}

/**
 * The active chips: empty sets mean "no restriction".
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export interface Filter {
	/** Outcomes shown (empty = all). */
	outcomes: ReadonlySet<Outcome>;
	/** Areas shown (empty = all). */
	areas: ReadonlySet<string>;
}

/**
 * The entries a filter lets through.
 *
 * Why: AC11.1 — the result is a subset of the input, an empty filter returns everything, and the
 * order is preserved.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (AC11.1)
 */
export function filterEntries(entries: readonly Entry[], f: Filter): Entry[] {
	return entries.filter(
		(e) =>
			(f.outcomes.size === 0 || f.outcomes.has(e.outcome)) &&
			(f.areas.size === 0 || f.areas.has(e.area)),
	);
}

/**
 * Entries per outcome (always all five keys).
 *
 * Why: the legend shows the counts; AC11.1 requires they sum to the entry count.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export function countByOutcome(entries: readonly Entry[]): Record<Outcome, number> {
	const c: Record<Outcome, number> = { kept: 0, reverted: 0, inconclusive: 0, parked: 0, infra: 0 };
	for (const e of entries) c[e.outcome] += 1;
	return c;
}

/**
 * The areas in row order: most entries first, ties by name.
 *
 * Why: the busiest rows sit on top where the eye starts.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export function areaOrder(entries: readonly Entry[]): string[] {
	const n = new Map<string, number>();
	for (const e of entries) n.set(e.area, (n.get(e.area) ?? 0) + 1);
	return [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0) || a.localeCompare(b));
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/**
 * A mark's place on the timeline.
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export interface Mark {
	/** Entry id. */
	id: string;
	/** Centre x. */
	x: number;
	/** Centre y. */
	y: number;
	/** Row index (area). */
	row: number;
	/** Order within the row (by date, then notebook order). */
	order: number;
}

/**
 * A timeline row (one area).
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export interface Row {
	/** Area name. */
	area: string;
	/** Row top. */
	top: number;
	/** Row height. */
	h: number;
	/** Marks in order. */
	marks: Mark[];
}

/**
 * A labelled position on the date axis.
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export interface DayTick {
	/** x position. */
	x: number;
	/** "10 Oct"-style label. */
	label: string;
}

/**
 * The whole timeline geometry.
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export interface Timeline {
	/** Total width. */
	w: number;
	/** Total height. */
	h: number;
	/** Left edge of the plotting area (after the row labels). */
	left: number;
	/** Rows top to bottom. */
	rows: Row[];
	/** Axis ticks. */
	ticks: DayTick[];
	/** Marks by entry id. */
	byId: ReadonlyMap<string, Mark>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Geometry knobs.
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export interface TimelineOptions {
	/** Total width. */
	w: number;
	/** Width of the row-label column. */
	left: number;
	/** Spacing of marks inside a day. */
	slot: number;
	/** Row padding. */
	pad: number;
	/** Lane height. */
	lane: number;
}

/** The default geometry (a 1000-wide viewBox). */
const TIMELINE_OPTIONS: TimelineOptions = { w: 1000, left: 112, slot: 11, pad: 8, lane: 12 };

/**
 * Lays the entries out on a date axis: one row per area, one column per calendar day from the
 * first to the last entry, marks of the same row and day spread across the day and stacked into
 * lanes when they do not fit.
 *
 * Why: the spec asks for a horizontal timeline "from the first to the last entry date, one mark per
 * entry, one row per area". Geometry is computed from the full entry set (not the filtered one) so
 * a chip changes opacity, never position: nothing jumps under the pointer.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export function buildTimeline(
	entries: readonly Entry[],
	opts: TimelineOptions = TIMELINE_OPTIONS,
): Timeline {
	const days = entries.map((e) => dayNumber(e.date));
	const first = days.length > 0 ? Math.min(...days) : 0;
	const last = days.length > 0 ? Math.max(...days) : 0;
	const span = last - first + 1;
	const dayW = (opts.w - opts.left - 8) / span;
	const areas = areaOrder(entries);
	const rows: Row[] = [];
	const byId = new Map<string, Mark>();
	let top = 0;
	areas.forEach((area, row) => {
		const inRow = entries
			.map((e, i) => ({ e, i }))
			.filter(({ e }) => e.area === area)
			.sort((a, b) => dayNumber(a.e.date) - dayNumber(b.e.date) || a.i - b.i);
		const perDay = new Map<number, number>();
		for (const { e } of inRow)
			perDay.set(dayNumber(e.date), (perDay.get(dayNumber(e.date)) ?? 0) + 1);
		const cols = Math.max(1, Math.min(Math.floor(dayW / opts.slot), 4));
		let lanes = 1;
		for (const n of perDay.values()) lanes = Math.max(lanes, Math.ceil(n / Math.min(n, cols)));
		const h = lanes * opts.lane + opts.pad;
		const seen = new Map<number, number>();
		const marks: Mark[] = inRow.map(({ e }, order) => {
			const d = dayNumber(e.date);
			const k = seen.get(d) ?? 0;
			seen.set(d, k + 1);
			const n = perDay.get(d) ?? 1;
			const c = Math.min(n, cols);
			const x = opts.left + (d - first) * dayW + ((k % c) + 0.5) * (dayW / c);
			const y = top + opts.pad / 2 + (Math.floor(k / c) + 0.5) * opts.lane;
			const m: Mark = { id: e.id, x, y, row, order };
			byId.set(e.id, m);
			return m;
		});
		rows.push({ area, top, h, marks });
		top += h;
	});
	const ticks: DayTick[] = [];
	for (let d = first; d <= last; d += 1) {
		const dt = new Date(d * DAY_MS);
		if (d === first || dt.getUTCDay() === 1 || dt.getUTCDate() === 1) {
			const x = opts.left + (d - first) * dayW + dayW / 2;
			const prev = ticks[ticks.length - 1];
			// Why: a label closer than 3 days to the previous one would overprint it; keep the later.
			if (prev && x - prev.x < dayW * 3) ticks.pop();
			ticks.push({ x, label: `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}` });
		}
	}
	return { w: opts.w, h: top, left: opts.left, rows, ticks, byId };
}

/**
 * The mark the roving focus moves to: ←/→ previous/next in the row, ↑/↓ the nearest-x mark of the
 * adjacent row, Home/End first/last of the row. Returns the same id when there is nowhere to go.
 *
 * Why: the track is one tab stop (spec P10-11 Keyboard); `rovingTabindex` from `figure-keys`
 * would wrap, but a timeline has ends, so left of the first mark stays on the first mark.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (Keyboard)
 */
export function moveFocus(
	tl: Timeline,
	id: string,
	key: string,
	visible?: ReadonlySet<string>,
): string {
	const here = tl.byId.get(id);
	if (!here) return id;
	const ok = (m: Mark): boolean => visible === undefined || visible.has(m.id);
	const row = (tl.rows[here.row]?.marks ?? []).filter(ok);
	const at = row.findIndex((m) => m.id === id);
	switch (key) {
		case "ArrowLeft":
			return row[Math.max(0, at - 1)]?.id ?? id;
		case "ArrowRight":
			return row[Math.min(row.length - 1, at + 1)]?.id ?? id;
		case "Home":
			return row[0]?.id ?? id;
		case "End":
			return row[row.length - 1]?.id ?? id;
		case "ArrowUp":
		case "ArrowDown": {
			const step = key === "ArrowUp" ? -1 : 1;
			for (let r = here.row + step; r >= 0 && r < tl.rows.length; r += step) {
				const cand = (tl.rows[r]?.marks ?? []).filter(ok);
				if (cand.length === 0) continue;
				let best = cand[0];
				for (const m of cand)
					if (Math.abs(m.x - here.x) < Math.abs((best?.x ?? 0) - here.x)) best = m;
				return best?.id ?? id;
			}
			return id;
		}
		default:
			return id;
	}
}

/**
 * The deciding number as the card prints it: "metric: delta (ci)", e.g.
 * "Elo vs control: +9 (+6 to +12)". `null` when the entry has no metric. A missing delta prints
 * just the metric name.
 *
 * Why: spec P10-11's card shows "the deciding number as metric: delta (ci)". The unit is part of the
 * metric's name in the source ("Elo …", "win rate …"), so only the sign and digits are formatted;
 * digits follow the source's own precision (up to 3 decimals, trailing zeros dropped).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export function metricLine(e: Entry): string | null {
	if (e.metric === undefined) return null;
	if (e.delta === undefined) return e.metric;
	const d = digitsOf(e.delta, ...(e.ci ?? []));
	const num = formatSigned(e.delta, d);
	const ci = e.ci ? ` (${formatInterval(e.ci[0], e.ci[1], d, { signed: true })})` : "";
	return `${e.metric}: ${num}${ci}`;
}

function digitsOf(...vs: number[]): number {
	let d = 0;
	for (const v of vs) {
		const s = String(v);
		const dot = s.indexOf(".");
		if (dot >= 0) d = Math.max(d, Math.min(3, s.length - dot - 1));
	}
	return d;
}

/**
 * Page size of the phone list's "Show 20 more".
 *
 * Why: part of the module contract of this figure.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export const PAGE = 20;

/**
 * The phone list: starred entries first (in story order), then the rest newest first.
 *
 * Why: spec P10-11 — "highlights first, the rest paginated by 20".
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (Small screens)
 */
export function listOrder(
	entries: readonly Entry[],
	highlights: readonly string[] = HIGHLIGHT_IDS,
): Entry[] {
	const star = highlights
		.map((id) => entries.find((e) => e.id === id))
		.filter((e): e is Entry => e !== undefined);
	const starred = new Set(star.map((e) => e.id));
	const rest = entries
		.map((e, i) => ({ e, i }))
		.filter(({ e }) => !starred.has(e.id))
		.sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i))
		.map(({ e }) => e);
	return [...star, ...rest];
}

/**
 * The first `shown` rows of {@link listOrder} that pass a filter, with the rest counted.
 *
 * Why: the phone list paginates after filtering; the starred rows stay first within what passes.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (Small screens)
 */
export function listPage(
	entries: readonly Entry[],
	f: Filter,
	shown: number,
): { items: Entry[]; remaining: number } {
	const all = filterEntries(listOrder(entries), f);
	const starred = all.filter((e) => HIGHLIGHT_IDS.includes(e.id));
	const rest = all.filter((e) => !HIGHLIGHT_IDS.includes(e.id));
	const take = Math.max(starred.length, shown);
	const items = [...starred, ...rest].slice(0, take);
	return { items, remaining: all.length - items.length };
}

/**
 * Text summary of the timeline for the live description.
 *
 * Why: the SVG is a `role="group"`; this sentence is its `aria-describedby`.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
export function summary(entries: readonly Entry[], shown: number): string {
	const c = countByOutcome(entries);
	const parts = OUTCOMES.map((o) => `${c[o]} ${OUTCOME_LABEL[o]}`).join(", ");
	return `Timeline of ${entries.length} notebook entries (${parts}). ${shown} shown.`;
}
