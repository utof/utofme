/**
 * Pure flash detector for looped silent video: a conservative approximation of
 * WCAG 2.2 SC 2.3.1, built to over-flag. It is NOT a certification.
 *
 * Input is a per-frame grid of linear-light cells (relative luminance and an
 * IRIS-style saturated-red scalar). Per cell a zig-zag swing detector finds
 * opposing transitions; events that end within a few frames of each other are
 * area-gated with a summed-area table over field-sized rectangles; qualified
 * events are counted in closed 1 s windows over the middle of three concatenated
 * copies of the loop (so the loop seam is analysed).
 *
 * Why: the original design (whole-frame gamma YAVG) dilutes localized flashes, is
 * blind to contrast reversals and works in gamma space. This module implements the
 * appendix algorithm instead.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3
 * @see https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
 */

/** Tunable knobs. Defaults are the appendix §3.3 / §3.4 policy values. */
export interface FlashParams {
	/** Minimum peak-to-valley swing of relative luminance that counts as a transition (WCAG: 0.1). */
	readonly delta: number;
	/** Minimum swing of the red scalar (IRIS: 20/320). */
	readonly redDelta: number;
	/** Apply the "darker state < 0.8" rule to general flashes (false = over-flag more). */
	readonly dark: boolean;
	/** Fail when this many area-qualified events fit in a closed 1 s window (strictly more than 3 flashes). */
	readonly failEvents: number;
	/** Warn at this many events in a closed 1 s window. */
	readonly warnEvents: number;
	/** Fail when the loop-average rate of qualified events (per second) reaches this. */
	readonly failRate: number;
	/** Warn at this loop-average rate. */
	readonly warnRate: number;
	/** Analyse 3 concatenated copies and count windows ending in the middle one (false = single pass, all windows). */
	readonly cyclic: boolean;
}

/**
 * Default policy values.
 * Why: WCAG's 0.1 swing / 0.8 dark state; the 7-event and 4/s thresholds are policy (stricter than WCAG by one transition).
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3.4
 */
export const DEFAULT_FLASH_PARAMS: FlashParams = {
	delta: 0.1,
	redDelta: 20 / 320,
	dark: true,
	failEvents: 7,
	warnEvents: 5,
	failRate: 4,
	warnRate: 3,
	cyclic: true,
};

/** Cell data of a clip, one array per frame (`gridW * gridH` entries, row-major). */
export interface FlashInput {
	/** Video frame width in px (used for the field / area scaling). */
	readonly width: number;
	/** Video frame height in px. */
	readonly height: number;
	/** Grid columns. */
	readonly gridW: number;
	/** Grid rows. */
	readonly gridH: number;
	/** Frames per second of the clip. */
	readonly fps: number;
	/** Linear relative luminance per cell, per frame. */
	readonly lum: readonly Float32Array[];
	/** Saturated-red scalar per cell, per frame. */
	readonly red: readonly Float32Array[];
	/** Largest CSS width at which the clip may be rendered (field scale = width / renderWidthCss). */
	readonly renderWidthCss: number;
}

/** Result for one channel (general or red). */
export interface ChannelResult {
	/** Frame indices (in the analysed timeline) of area-qualified events. */
	readonly eventFrames: readonly number[];
	/** Max qualified events in any closed 1 s window ending in the counted region. */
	readonly maxEventsPerWindow: number;
	/** Qualified events per second over the counted region (the loop when cyclic). */
	readonly ratePerSecond: number;
}

/** Overall verdict. */
export interface FlashResult {
	/** General (luminance) channel. */
	readonly general: ChannelResult;
	/** Saturated-red channel. */
	readonly red: ChannelResult;
	/** Worst `maxEventsPerWindow` of both channels. */
	readonly maxEventsPerWindow: number;
	/** Worst sustained rate of both channels. */
	readonly maxPerSecond: number;
	/** `fail` > `warn` > `pass`. */
	readonly status: "pass" | "warn" | "fail";
	/** Human-readable reasons for warn/fail. */
	readonly reasons: readonly string[];
}

/** A detected opposing-swing event on one cell. */
interface CellEvent {
	readonly cell: number;
	readonly end: number;
}

/**
 * Zig-zag swing detector over one scalar series (hysteresis `delta`).
 * Each peak-to-valley (or valley-to-peak) swing of at least `delta` is one transition,
 * stamped at the frame where the swing ends. A swing is only emitted once the reversal
 * is confirmed, so appending samples can only add events (prefix-closed).
 * `darkRule`: emit only if the darker end of the swing is below 0.8.
 *
 * Why: matches WCAG Note 2 ("adjacent peaks and valleys"); a slow ramp is still one transition.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3.3 step 2
 */
export function zigzagEnds(
	series: (t: number) => number,
	length: number,
	delta: number,
	darkRule: boolean,
): number[] {
	const ends: number[] = [];
	if (length < 2) return ends;
	let dir = 0; // 0 undetermined, 1 rising, -1 falling
	let pivot = series(0);
	let ext = pivot;
	let extIdx = 0;
	let lo = pivot;
	let hi = pivot;
	for (let t = 1; t < length; t++) {
		const v = series(t);
		if (dir === 0) {
			if (v < lo) lo = v;
			if (v > hi) hi = v;
			if (v - lo >= delta) {
				dir = 1;
				pivot = lo;
				ext = v;
				extIdx = t;
			} else if (hi - v >= delta) {
				dir = -1;
				pivot = hi;
				ext = v;
				extIdx = t;
			}
			continue;
		}
		if (dir === 1) {
			if (v > ext) {
				ext = v;
				extIdx = t;
			} else if (ext - v >= delta) {
				if (!darkRule || Math.min(pivot, ext) < 0.8) ends.push(extIdx);
				pivot = ext;
				dir = -1;
				ext = v;
				extIdx = t;
			}
		} else if (v < ext) {
			ext = v;
			extIdx = t;
		} else if (v - ext >= delta) {
			if (!darkRule || Math.min(pivot, ext) < 0.8) ends.push(extIdx);
			pivot = ext;
			dir = 1;
			ext = v;
			extIdx = t;
		}
	}
	return ends;
}

/**
 * Max number of events in any closed window of `windowFrames` frames: count of
 * events `i <= j` with `frames[j] - frames[i] <= windowFrames`, maximised over `j`
 * with `frames[j] >= from` and `< to`. Input must be ascending.
 *
 * Why: "any one second period" is a sliding, closed window (WCAG G19; appendix §1.7).
 * @see packages/specs/specs/09-appendix-flash-lint.md § 1.7
 */
export function maxEventsInWindow(
	frames: readonly number[],
	windowFrames: number,
	from = Number.NEGATIVE_INFINITY,
	to = Number.POSITIVE_INFINITY,
): number {
	let best = 0;
	let i = 0;
	for (let j = 0; j < frames.length; j++) {
		const fj = frames[j];
		if (fj === undefined) continue;
		while (i < j) {
			const fi = frames[i];
			if (fi !== undefined && fj - fi > windowFrames + 1e-9) i++;
			else break;
		}
		if (fj >= from && fj < to) best = Math.max(best, j - i + 1);
	}
	return best;
}

/**
 * Field and area sizes (appendix §3.3): a 341x256 CSS-px field scaled by
 * `videoWidth / renderWidthCss`, clamped to the frame; `area` is the qualifying area in video px.
 *
 * Why: the 10-degree field is defined in CSS px, so a larger rendering shrinks it in video px and
 * makes the test stricter.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 1.6
 */
export function fieldGeometry(
	width: number,
	height: number,
	renderWidthCss: number,
): { fieldW: number; fieldH: number; area: number } {
	const s = width / renderWidthCss;
	const fieldW = Math.min(width, 341 * s);
	const fieldH = Math.min(height, 256 * s);
	const area = Math.min(fieldW * fieldH, 0.25 * 341 * 256 * s * s);
	return { fieldW, fieldH, area };
}

/**
 * Cluster per-cell events by end frame and gate by area: a frame `f` yields a flash event when
 * the cells with an event ending in `[f, f+tol]` cover at least `area` video px inside one
 * field-sized rectangle (summed-area table). Greedy: after an event, frames up to `f+tol` are skipped.
 *
 * Why: events in different parts of the screen only add up if they fit in one 10-degree field.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3.3 step 3
 */
function qualifyEvents(
	byFrame: ReadonlyMap<number, readonly number[]>,
	frameCount: number,
	input: FlashInput,
	tol: number,
): number[] {
	const { gridW, gridH, width, height, renderWidthCss } = input;
	const cellPx = width / gridW;
	const cellArea = cellPx * (height / gridH);
	const { fieldW, fieldH, area } = fieldGeometry(width, height, renderWidthCss);
	const need = Math.max(1, Math.ceil(area / cellArea - 1e-9));
	const fw = Math.max(1, Math.min(gridW, Math.ceil(fieldW / cellPx - 1e-9)));
	const fh = Math.max(1, Math.min(gridH, Math.ceil(fieldH / (height / gridH) - 1e-9)));
	const out: number[] = [];
	const mask = new Uint8Array(gridW * gridH);
	const sat = new Int32Array((gridW + 1) * (gridH + 1));
	let next = 0;
	const frames = [...byFrame.keys()].sort((a, b) => a - b);
	for (const f of frames) {
		if (f < next || f >= frameCount) continue;
		let count = 0;
		mask.fill(0);
		for (let g = f; g <= f + tol; g++) {
			const cells = byFrame.get(g);
			if (!cells) continue;
			for (const c of cells) {
				if (mask[c] === 0) {
					mask[c] = 1;
					count++;
				}
			}
		}
		if (count < need) continue;
		for (let y = 0; y < gridH; y++) {
			let rowSum = 0;
			for (let x = 0; x < gridW; x++) {
				rowSum += mask[y * gridW + x] ?? 0;
				sat[(y + 1) * (gridW + 1) + x + 1] = (sat[y * (gridW + 1) + x + 1] ?? 0) + rowSum;
			}
		}
		let hit = false;
		for (let y = 0; y + fh <= gridH && !hit; y++) {
			for (let x = 0; x + fw <= gridW; x++) {
				const s =
					(sat[(y + fh) * (gridW + 1) + x + fw] ?? 0) -
					(sat[y * (gridW + 1) + x + fw] ?? 0) -
					(sat[(y + fh) * (gridW + 1) + x] ?? 0) +
					(sat[y * (gridW + 1) + x] ?? 0);
				if (s >= need) {
					hit = true;
					break;
				}
			}
		}
		if (hit) {
			out.push(f);
			next = f + tol + 1;
		}
	}
	return out;
}

/**
 * Analyses one channel: zig-zag per cell over the (optionally 3x) timeline, area gate, window count.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3.3
 */
function analyzeChannel(
	frames: readonly Float32Array[],
	input: FlashInput,
	delta: number,
	darkRule: boolean,
	p: FlashParams,
): ChannelResult {
	const n = frames.length;
	const cells = input.gridW * input.gridH;
	const copies = p.cyclic ? 3 : 1;
	const total = n * copies;
	const tol = Math.max(1, Math.round(input.fps / 30));
	const byFrame = new Map<number, number[]>();
	const events: CellEvent[] = [];
	for (let c = 0; c < cells; c++) {
		const ends = zigzagEnds((t) => frames[t % n]?.[c] ?? 0, total, delta, darkRule);
		for (const end of ends) events.push({ cell: c, end });
	}
	for (const e of events) {
		const list = byFrame.get(e.end);
		if (list) list.push(e.cell);
		else byFrame.set(e.end, [e.cell]);
	}
	const eventFrames = qualifyEvents(byFrame, total, input, tol);
	const from = p.cyclic ? n : 0;
	const to = p.cyclic ? 2 * n : total;
	const windowFrames = input.fps;
	const maxEventsPerWindow = maxEventsInWindow(eventFrames, windowFrames, from, to);
	const inRegion = eventFrames.filter((f) => f >= from && f < to).length;
	const seconds = n / input.fps;
	return { eventFrames, maxEventsPerWindow, ratePerSecond: seconds > 0 ? inRegion / seconds : 0 };
}

/**
 * Runs the full flash lint on a clip's cell series.
 *
 * Why: see module doc; thresholds in {@link DEFAULT_FLASH_PARAMS} (overridable via `params`).
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3
 */
export function analyzeFlashes(input: FlashInput, params: Partial<FlashParams> = {}): FlashResult {
	const p: FlashParams = { ...DEFAULT_FLASH_PARAMS, ...params };
	const empty: ChannelResult = { eventFrames: [], maxEventsPerWindow: 0, ratePerSecond: 0 };
	if (input.lum.length < 2) {
		return {
			general: empty,
			red: empty,
			maxEventsPerWindow: 0,
			maxPerSecond: 0,
			status: "pass",
			reasons: [],
		};
	}
	const general = analyzeChannel(input.lum, input, p.delta, p.dark, p);
	const red = analyzeChannel(input.red, input, p.redDelta, false, p);
	const maxEventsPerWindow = Math.max(general.maxEventsPerWindow, red.maxEventsPerWindow);
	const maxPerSecond = Math.max(general.ratePerSecond, red.ratePerSecond);
	const reasons: string[] = [];
	let status: FlashResult["status"] = "pass";
	const bump = (to: "warn" | "fail", why: string): void => {
		reasons.push(why);
		if (to === "fail" || status === "pass") status = to;
	};
	for (const [name, ch] of [
		["general", general],
		["red", red],
	] as const) {
		if (ch.maxEventsPerWindow >= p.failEvents)
			bump(
				"fail",
				`${name}: ${ch.maxEventsPerWindow} qualified events in a 1 s window (>= ${p.failEvents})`,
			);
		else if (ch.maxEventsPerWindow >= p.warnEvents)
			bump(
				"warn",
				`${name}: ${ch.maxEventsPerWindow} qualified events in a 1 s window (>= ${p.warnEvents})`,
			);
		if (p.cyclic) {
			if (ch.ratePerSecond >= p.failRate)
				bump(
					"fail",
					`${name}: sustained ${ch.ratePerSecond.toFixed(2)} transitions/s (>= ${p.failRate})`,
				);
			else if (ch.ratePerSecond >= p.warnRate)
				bump(
					"warn",
					`${name}: sustained ${ch.ratePerSecond.toFixed(2)} transitions/s (>= ${p.warnRate})`,
				);
		}
	}
	return { general, red, maxEventsPerWindow, maxPerSecond, status, reasons };
}

/**
 * Splits a raw `gbrpf32le` planar stream (G, B, R planes per frame) into per-frame
 * relative luminance and the IRIS-style red scalar
 * (`r/(r+g+b) >= 0.8 ? max(0, r-g-b) : 0`).
 *
 * Why: ffmpeg does the colour conversion to linear light; this is the only per-pixel math left in TS.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 1.4, § 1.5, § 3.5
 */
export function cellsFromGbrpf32(
	buf: Float32Array,
	gridW: number,
	gridH: number,
): { lum: Float32Array[]; red: Float32Array[] } {
	const cells = gridW * gridH;
	const frames = Math.floor(buf.length / (cells * 3));
	const lum: Float32Array[] = [];
	const red: Float32Array[] = [];
	for (let f = 0; f < frames; f++) {
		const base = f * cells * 3;
		const l = new Float32Array(cells);
		const rd = new Float32Array(cells);
		for (let c = 0; c < cells; c++) {
			const g = buf[base + c] ?? 0;
			const b = buf[base + cells + c] ?? 0;
			const r = buf[base + 2 * cells + c] ?? 0;
			l[c] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			const sum = r + g + b;
			rd[c] = sum > 0 && r / sum >= 0.8 ? Math.max(0, r - g - b) : 0;
		}
		lum.push(l);
		red.push(rd);
	}
	return { lum, red };
}
