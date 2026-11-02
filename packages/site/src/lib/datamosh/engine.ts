/**
 * Datamosh hover: the pure, DOM-free block-feedback kernel.
 *
 * Simulates what a codec does when its keyframe is dropped: every frame each
 * macroblock either refreshes from the source picture or copies the block of the
 * PREVIOUS OUTPUT displaced along a motion vector, so stale pixels are dragged
 * along and never cleaned up. The pointer writes the vector field (velocity times a
 * smoothstep falloff), vectors decay and snap to whole internal pixels, blocks
 * under `skip` freeze, and a few rectangles ("lost sectors") stop updating.
 *
 * Whole-pixel vectors and unfiltered block copies mean none of the GPU feedback
 * traps (8-bit history collapsing to black, bilinear history melting to mush)
 * exist here. All pixel maths is integer work on `Uint32Array` views, with no
 * allocation per frame. Channel maths assumes little-endian RGBA words (R in the
 * low byte), true of every browser target.
 *
 * Accessibility: every high-contrast event (hover-entry cut, lost-sector toggle,
 * forced full refresh) must win a slot from a {@link FlashLimiter} first, which
 * allows at most `flashCap` events in any 1000 ms window (WCAG 2.3.1).
 *
 * Ported in spirit from (MIT / Unlicense, attribution here per ADR 0041):
 * - Fanton, data-mosh: skip blocks, lost sectors, mismatch, heal timing.
 *   https://github.com/niccolofanton/data-mosh
 * - Keijiro Takahashi, Kino/Datamosh: per-block vectors, diffusion, DCT-style noise.
 *   https://github.com/keijiro/KinoDatamosh
 * No code is copied; the kernel is written for typed-array Canvas 2D.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 * @see https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
 */
import type { MoshConfig } from "./config";

/**
 * Everything the kernel needs to know about the pointer and the gesture for one frame.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface MoshStepInput {
	/** Monotonic clock, ms (`performance.now()`). */
	nowMs: number;
	/** Time since the previous step, ms. */
	dtMs: number;
	/** Pointer in internal px, or `null` when it is not over the card. */
	pointer: { x: number; y: number } | null;
	/** Smoothed pointer velocity in internal px per frame. */
	velocity: { x: number; y: number };
	/** 0 while hovered; ramps to 1 over `recoverMs` after the pointer leaves. */
	leaveProgress: number;
	/** Time since the gesture began, ms (gates the lost sectors). */
	msSinceEnter: number;
}

/**
 * What one {@link MoshEngine.step} did.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface MoshStepResult {
	/** Nothing stale, nothing moving, no lost sectors: the output equals the source. */
	settled: boolean;
	/** Blocks whose pixels may have changed this frame. */
	activeBlocks: number;
	/** The presented bytes differ from the previous frame (skip `putImageData` when false). */
	changed: boolean;
}

/**
 * Read-only per-block state, for the debug overlay.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface MoshBlockView {
	/** Block edge in internal px. */
	size: number;
	cols: number;
	rows: number;
	mvx: Float32Array;
	mvy: Float32Array;
	stale: Uint8Array;
	lost: Uint8Array;
}

/**
 * Rate limiter for high-contrast events: at most `cap` grants in any 1000 ms window.
 *
 * Why: WCAG 2.3.1 allows three general flashes per second, and a hover effect is
 * the kind of thing that can blink a card. A sliding window is stricter than a
 * refilling token bucket (which would allow a burst of `cap` plus a refill).
 *
 * @see https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
 */
export interface FlashLimiter {
	/** Claim a slot at `nowMs`; false means "skip or defer the event". */
	take(nowMs: number, cap: number): boolean;
}

/**
 * Datamosh block kernel; see the module header.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface MoshEngine {
	readonly width: number;
	readonly height: number;
	/** Block edge in internal px for the config last stepped (starts at 0). */
	readonly blockSize: number;
	/** The presented RGBA bytes; the instance changes between frames (ping-pong), so re-wrap it each time. */
	readonly output: Uint8ClampedArray<ArrayBuffer>;
	/** Per-block state for the debug overlay (allocates; call only when drawing it). */
	readonly blocks: MoshBlockView;
	/** Replace the source plane. Does NOT touch the feedback plane. */
	setSource(rgba: Uint8ClampedArray): void;
	/**
	 * Set the feedback plane: `null` = a copy of the source, else the given picture.
	 * The picture is a high-contrast "cut"; with `gate` it must win a flash slot, and
	 * when it does not the engine falls back to the source and returns false.
	 */
	seed(rgba: Uint8ClampedArray | null, gate?: { nowMs: number; flashCap: number }): boolean;
	/** Forget vectors, stale flags, lost sectors and counters (planes are kept). */
	reset(): void;
	/** Advance one frame. */
	step(input: MoshStepInput, config: MoshConfig): MoshStepResult;
}

/**
 * Internal-px block edge for a config: `max(2, round(block * scale))`.
 *
 * Why: the shell and the engine must agree on it, and the kernel works in whole
 * internal pixels.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function blockSizeFor(config: Pick<MoshConfig, "block" | "scale">): number {
	return Math.max(2, Math.round(config.block * config.scale));
}

/**
 * Deterministic PRNG (mulberry32) returning floats in `[0, 1)`.
 *
 * Why: the engine takes its randomness as a parameter so tests can replay a run.
 *
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export function createRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A fresh {@link FlashLimiter}.
 *
 * Why: the shell shares one across engines so hopping between cards cannot
 * reset the budget.
 *
 * @see https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
 */
export function createFlashLimiter(): FlashLimiter {
	const grants: number[] = [];
	return {
		take(nowMs, cap) {
			while (grants.length > 0 && nowMs - (grants[0] ?? 0) >= 1000) grants.shift();
			if (grants.length >= Math.max(1, Math.floor(cap))) return false;
			grants.push(nowMs);
			return true;
		},
	};
}

/** Distinct DCT stripe patterns (4 horizontal x 4 vertical frequencies). */
const PATTERNS = 16;
/** Most simultaneous lost sectors. */
const MAX_LOST = 8;
/** Per-frame spawn chance of a lost sector per unit of `lostRate`. */
const LOST_SPAWN = 0.04;

interface LostRect {
	x: number;
	y: number;
	w: number;
	h: number;
	until: number;
}

/**
 * Create the kernel for an internal resolution of `width` x `height` px.
 *
 * `random` defaults to `Math.random`; `limiter` to a private one. Block size is
 * re-derived from the config on every step, so changing `block` or `scale`
 * re-grids the blocks (every block becomes clean); only a different
 * `width`/`height` needs a new engine.
 *
 * Why: see the module header; the shell owns the DOM, the engine owns the pixels.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function createMoshEngine(
	width: number,
	height: number,
	random: () => number = Math.random,
	limiter: FlashLimiter = createFlashLimiter(),
): MoshEngine {
	const w = Math.max(1, Math.floor(width));
	const h = Math.max(1, Math.floor(height));
	const pixels = w * h;

	const source = new Uint32Array(pixels);
	const sourceBytes = new Uint8ClampedArray(source.buffer);
	const planes = [new Uint32Array(pixels), new Uint32Array(pixels)] as const;
	const views = [
		new Uint8ClampedArray(planes[0].buffer),
		new Uint8ClampedArray(planes[1].buffer),
	] as const;
	let cur = 0;
	/** Garnished copy of the current plane; allocated on first use. */
	let display: Uint32Array<ArrayBuffer> | null = null;
	let displayBytes: Uint8ClampedArray<ArrayBuffer> | null = null;
	let presentGarnished = false;

	// Per-block state, (re)allocated by `layout`.
	let size = 0;
	let cols = 0;
	let rows = 0;
	let count = 0;
	let mvx = new Float32Array(0);
	let mvy = new Float32Array(0);
	let stale = new Uint8Array(0);
	let lostMask = new Uint8Array(0);
	let pattern = new Uint8Array(0);
	let amp = new Uint8Array(0);
	let chromaReady = new Uint8Array(0);
	let chromaOff = new Int16Array(0);
	let stripes = new Int8Array(0);
	let staleCount = 0;
	/** A picture was seeded before the first layout: the blocks it covers must start stale. */
	let pendingStale = false;

	let frame = 0;
	let sourceDirty = false;
	let gopPending = false;
	let garnishKey = "";
	let presented = false;
	const lost: LostRect[] = [];

	const prevPlane = (): Uint32Array => planes[cur] ?? source;
	const nextPlane = (): Uint32Array => planes[1 - cur] ?? source;

	function layout(blockSize: number): void {
		// Re-gridding keeps "something is stale" so a seeded or smeared picture still heals.
		const carry = pendingStale || staleCount > 0;
		pendingStale = false;
		size = blockSize;
		cols = Math.ceil(w / size);
		rows = Math.ceil(h / size);
		count = cols * rows;
		mvx = new Float32Array(count);
		mvy = new Float32Array(count);
		stale = new Uint8Array(count);
		lostMask = new Uint8Array(count);
		pattern = new Uint8Array(count);
		amp = new Uint8Array(count);
		chromaReady = new Uint8Array(count);
		chromaOff = new Int16Array(count * 3);
		staleCount = 0;
		lost.length = 0;
		stripes = new Int8Array(PATTERNS * size * size);
		for (let k = 0; k < PATTERNS; k++) {
			const fu = 1 + (k & 3);
			const fv = 1 + ((k >> 2) & 3);
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					const value =
						Math.cos(((x + 0.5) * Math.PI * fu) / size) *
						Math.cos(((y + 0.5) * Math.PI * fv) / size);
					stripes[k * size * size + y * size + x] = Math.round(value * 127);
				}
			}
		}
		if (carry) staleAll();
	}

	function staleAll(): void {
		stale.fill(1);
		staleCount = count;
		for (let bi = 0; bi < count; bi++) {
			pattern[bi] = Math.floor(random() * PATTERNS);
			amp[bi] = 0;
			chromaReady[bi] = 0;
		}
	}

	function markStale(bi: number): void {
		if (stale[bi] === 1) return;
		stale[bi] = 1;
		staleCount++;
		pattern[bi] = Math.floor(random() * PATTERNS);
		amp[bi] = 0;
		chromaReady[bi] = 0;
	}

	function markClean(bi: number): void {
		if (stale[bi] === 0) return;
		stale[bi] = 0;
		staleCount--;
	}

	/** Copy block `bi` of `from` into `to` at the same position. */
	function copyBlock(
		from: Uint32Array,
		to: Uint32Array,
		x0: number,
		y0: number,
		bw: number,
		bh: number,
	): void {
		for (let r = 0; r < bh; r++) {
			const o = (y0 + r) * w + x0;
			for (let i = 0; i < bw; i++) to[o + i] = from[o + i] ?? 0;
		}
	}

	/** Copy a block from `from` displaced by `(-dx, -dy)` (pixels travel WITH the vector), clamping reads to the plane. */
	function copyDisplaced(
		from: Uint32Array,
		to: Uint32Array,
		x0: number,
		y0: number,
		bw: number,
		bh: number,
		dx: number,
		dy: number,
		leakQ: number,
	): void {
		const sx0 = x0 - dx;
		const inside = sx0 >= 0 && sx0 + bw <= w;
		for (let r = 0; r < bh; r++) {
			const y = y0 + r;
			const sy = Math.min(h - 1, Math.max(0, y - dy));
			const srow = sy * w;
			const drow = y * w + x0;
			for (let i = 0; i < bw; i++) {
				const sx = inside ? sx0 + i : Math.min(w - 1, Math.max(0, sx0 + i));
				const a = from[srow + sx] ?? 0;
				if (leakQ === 0) {
					to[drow + i] = a;
					continue;
				}
				const b = source[drow + i] ?? 0;
				const rr = (a & 255) + ((((b & 255) - (a & 255)) * leakQ) >> 8);
				const gg = ((a >>> 8) & 255) + (((((b >>> 8) & 255) - ((a >>> 8) & 255)) * leakQ) >> 8);
				const bb = ((a >>> 16) & 255) + (((((b >>> 16) & 255) - ((a >>> 16) & 255)) * leakQ) >> 8);
				const aa = (a >>> 24) + ((((b >>> 24) - (a >>> 24)) * leakQ) >> 8);
				to[drow + i] = (rr | (gg << 8) | (bb << 16) | (aa << 24)) >>> 0;
			}
		}
	}

	function paintLost(): void {
		lostMask.fill(0);
		for (const rect of lost) {
			for (let y = rect.y; y < Math.min(rows, rect.y + rect.h); y++) {
				for (let x = rect.x; x < Math.min(cols, rect.x + rect.w); x++) lostMask[y * cols + x] = 1;
			}
		}
	}

	function updateLost(input: MoshStepInput, config: MoshConfig): void {
		let changed = false;
		if (input.leaveProgress >= 1 && lost.length > 0) {
			// Fully recovered: the whole card is healing to the source this frame, so the
			// sectors go without a flash slot (they would otherwise hold the settle open).
			lost.length = 0;
			changed = true;
		}
		for (let i = lost.length - 1; i >= 0; i--) {
			const rect = lost[i];
			if (!rect || input.nowMs < rect.until) continue;
			if (limiter.take(input.nowMs, config.flashCap)) {
				lost.splice(i, 1);
				changed = true;
			}
		}
		if (
			input.pointer &&
			config.lostRate > 0 &&
			input.msSinceEnter >= config.lostDelayMs &&
			lost.length < MAX_LOST &&
			random() < config.lostRate * LOST_SPAWN &&
			limiter.take(input.nowMs, config.flashCap)
		) {
			const rw = 2 + Math.floor(random() * 3);
			const rh = 1 + Math.floor(random() * 3);
			lost.push({
				x: Math.floor(random() * Math.max(1, cols - rw + 1)),
				y: Math.floor(random() * Math.max(1, rows - rh + 1)),
				w: rw,
				h: rh,
				until: input.nowMs + 120 + random() * 380,
			});
			changed = true;
		}
		if (changed) paintLost();
	}

	/** Average chroma offset of a block, stored once per stale spell so it never flickers. */
	function prepareChroma(
		plane: Uint32Array,
		bi: number,
		x0: number,
		y0: number,
		bw: number,
		bh: number,
	): void {
		let sr = 0;
		let sg = 0;
		let sb = 0;
		for (let r = 0; r < bh; r++) {
			const o = (y0 + r) * w + x0;
			for (let i = 0; i < bw; i++) {
				const p = plane[o + i] ?? 0;
				sr += p & 255;
				sg += (p >>> 8) & 255;
				sb += (p >>> 16) & 255;
			}
		}
		const n = bw * bh;
		const ar = sr / n;
		const ag = sg / n;
		const ab = sb / n;
		const luma = (ar * 77 + ag * 150 + ab * 29) / 256;
		chromaOff[bi * 3] = Math.round(ar - luma);
		chromaOff[bi * 3 + 1] = Math.round(ag - luma);
		chromaOff[bi * 3 + 2] = Math.round(ab - luma);
		chromaReady[bi] = 1;
	}

	/** DCT stripes + chroma pull over every stale block of the (read-only) history, written into `display`. */
	function garnish(history: Uint32Array, out: Uint32Array, config: MoshConfig): void {
		out.set(history);
		const chromaQ = Math.round(config.chroma * 256);
		for (let by = 0; by < rows; by++) {
			const y0 = by * size;
			const bh = Math.min(size, h - y0);
			for (let bx = 0; bx < cols; bx++) {
				const bi = by * cols + bx;
				if (stale[bi] === 0) continue;
				const x0 = bx * size;
				const bw = Math.min(size, w - x0);
				if (chromaQ > 0 && chromaReady[bi] === 0) prepareChroma(history, bi, x0, y0, bw, bh);
				const dctK = Math.round(config.dct * ((amp[bi] ?? 0) / 255) * 64);
				if (chromaQ === 0 && dctK === 0) continue;
				const tr = chromaOff[bi * 3] ?? 0;
				const tg = chromaOff[bi * 3 + 1] ?? 0;
				const tb = chromaOff[bi * 3 + 2] ?? 0;
				const table = (pattern[bi] ?? 0) * size * size;
				for (let r = 0; r < bh; r++) {
					const o = (y0 + r) * w + x0;
					for (let i = 0; i < bw; i++) {
						const p = history[o + i] ?? 0;
						let rr = p & 255;
						let gg = (p >>> 8) & 255;
						let bb = (p >>> 16) & 255;
						if (chromaQ > 0) {
							const luma = (rr * 77 + gg * 150 + bb * 29) >> 8;
							rr += ((tr - (rr - luma)) * chromaQ) >> 8;
							gg += ((tg - (gg - luma)) * chromaQ) >> 8;
							bb += ((tb - (bb - luma)) * chromaQ) >> 8;
						}
						if (dctK > 0) {
							const d = ((stripes[table + r * size + i] ?? 0) * dctK) >> 7;
							rr += d;
							gg += d;
							bb += d;
						}
						rr = rr < 0 ? 0 : rr > 255 ? 255 : rr;
						gg = gg < 0 ? 0 : gg > 255 ? 255 : gg;
						bb = bb < 0 ? 0 : bb > 255 ? 255 : bb;
						out[o + i] = ((p & 0xff000000) | (bb << 16) | (gg << 8) | rr) >>> 0;
					}
				}
			}
		}
	}

	function step(input: MoshStepInput, config: MoshConfig): MoshStepResult {
		const wanted = blockSizeFor(config);
		const regrid = wanted !== size;
		if (regrid) layout(wanted);

		const leave = Math.min(1, Math.max(0, input.leaveProgress));
		const scale = config.scale;
		const maxV = config.maxVector * scale;
		const maxV2 = maxV * maxV;
		const stepI = Math.max(1, Math.round(config.mvStep * scale));
		const limit = Math.max(stepI, Math.floor(maxV / stepI) * stepI);
		const skip = config.skip * scale;
		const skip2 = skip * skip;
		const jitter = config.jitter * scale;
		const gain = config.gain;
		const leakQ = Math.round(Math.min(1, Math.max(0, config.leak)) * 256);
		// Vectors die faster the further the heal has progressed; at 1 they are gone.
		const decay = config.decay ** (1 + 3 * leave) * (1 - leave);
		const pointer = input.pointer;
		const radius = config.radius * w;
		const radius2 = radius * radius;
		const velX = input.velocity.x * gain;
		const velY = input.velocity.y * gain;
		const halfStep2 = (stepI / 2) * (stepI / 2);

		let active = regrid ? count : 0;
		let moving = 0;

		const history = prevPlane();
		const out = nextPlane();

		// A new source frame (GIF): clean blocks follow it, stale blocks keep their old pixels.
		if (sourceDirty) {
			if (staleCount === 0) {
				history.set(source);
				active = count;
			} else {
				for (let by = 0; by < rows; by++) {
					for (let bx = 0; bx < cols; bx++) {
						if (stale[by * cols + bx] === 1) continue;
						const x0 = bx * size;
						const y0 = by * size;
						copyBlock(source, history, x0, y0, Math.min(size, w - x0), Math.min(size, h - y0));
						active++;
					}
				}
			}
			sourceDirty = false;
		}

		out.set(history);

		updateLost(input, config);

		if (config.gop > 0 && frame > 0 && frame % config.gop === 0) gopPending = true;
		if (gopPending && staleCount === 0) gopPending = false;
		let fullRefresh = false;
		if (gopPending && limiter.take(input.nowMs, config.flashCap)) {
			out.set(source);
			stale.fill(0);
			staleCount = 0;
			gopPending = false;
			fullRefresh = true;
			active = count;
		}

		for (let by = 0; by < rows; by++) {
			const y0 = by * size;
			const bh = Math.min(size, h - y0);
			const cy = y0 + bh / 2;
			for (let bx = 0; bx < cols; bx++) {
				const bi = by * cols + bx;
				const x0 = bx * size;
				const bw = Math.min(size, w - x0);

				let vx = mvx[bi] ?? 0;
				let vy = mvy[bi] ?? 0;

				let falloff = 0;
				if (pointer) {
					const dx = x0 + bw / 2 - pointer.x;
					const dy = cy - pointer.y;
					const d2 = dx * dx + dy * dy;
					if (d2 < radius2) {
						const t = Math.sqrt(d2) / radius;
						falloff = 1 - t * t * (3 - 2 * t);
					}
				}
				if (falloff > 0) {
					vx += velX * falloff;
					vy += velY * falloff;
					if (jitter > 0) {
						vx += jitter * (random() - 0.5) * falloff;
						vy += jitter * (random() - 0.5) * falloff;
					}
				}
				if (config.mismatch > 0 && random() < config.mismatch) {
					const pick = Math.floor(random() * 4);
					const nx = Math.min(cols - 1, Math.max(0, bx + (pick === 0 ? -1 : pick === 1 ? 1 : 0)));
					const ny = Math.min(rows - 1, Math.max(0, by + (pick === 2 ? -1 : pick === 3 ? 1 : 0)));
					vx = mvx[ny * cols + nx] ?? 0;
					vy = mvy[ny * cols + nx] ?? 0;
				}
				if (vx !== 0 || vy !== 0) {
					vx *= decay;
					vy *= decay;
					let l2 = vx * vx + vy * vy;
					if (l2 > maxV2) {
						const k = maxV / Math.sqrt(l2);
						vx *= k;
						vy *= k;
						l2 = maxV2;
					}
					// Below the smallest visible step and nothing pushing: the vector is dead.
					if (l2 < 0.0004 || (falloff === 0 && l2 < halfStep2)) {
						vx = 0;
						vy = 0;
					}
				}
				mvx[bi] = vx;
				mvy[bi] = vy;
				const len2 = vx * vx + vy * vy;
				if (len2 > 0) moving++;
				if (fullRefresh) continue;

				const frozen = lostMask[bi] === 1;
				if (stale[bi] === 1 && !frozen) {
					const base = falloff > 0 ? config.healIn : config.healOut;
					const p = base + (1 - base) * leave;
					if (p > 0 && (p >= 1 || random() < p)) {
						copyBlock(source, out, x0, y0, bw, bh);
						markClean(bi);
						active++;
						continue;
					}
				}
				if (frozen || len2 === 0 || len2 < skip2) continue;

				const sx = Math.max(-limit, Math.min(limit, Math.round(vx / stepI) * stepI));
				const sy = Math.max(-limit, Math.min(limit, Math.round(vy / stepI) * stepI));
				if (sx === 0 && sy === 0) continue;
				copyDisplaced(history, out, x0, y0, bw, bh, sx, sy, leakQ);
				markStale(bi);
				const a = Math.min(255, Math.round((Math.sqrt(len2) / Math.max(maxV, 1e-6)) * 255));
				if (a > (amp[bi] ?? 0)) amp[bi] = a;
				active++;
			}
		}

		frame++;
		cur = 1 - cur;

		const wantGarnish = (config.dct > 0 || config.chroma > 0) && staleCount > 0;
		const key = `${wantGarnish ? 1 : 0}:${config.dct}:${config.chroma}`;
		if (wantGarnish) {
			if (!display || !displayBytes) {
				display = new Uint32Array(pixels);
				displayBytes = new Uint8ClampedArray(display.buffer);
			}
			garnish(prevPlane(), display, config);
		}
		presentGarnished = wantGarnish;
		const changed = active > 0 || key !== garnishKey || !presented;
		garnishKey = key;
		presented = true;

		return {
			settled: staleCount === 0 && moving === 0 && lost.length === 0 && !gopPending && !sourceDirty,
			activeBlocks: active,
			changed,
		};
	}

	return {
		width: w,
		height: h,
		get blockSize() {
			return size;
		},
		get output() {
			return presentGarnished && displayBytes ? displayBytes : (views[cur] ?? sourceBytes);
		},
		get blocks() {
			return { size, cols, rows, mvx, mvy, stale, lost: lostMask };
		},
		setSource(rgba) {
			sourceBytes.set(
				rgba.length === sourceBytes.length ? rgba : rgba.subarray(0, sourceBytes.length),
			);
			sourceDirty = true;
		},
		seed(rgba, gate) {
			const target = views[cur];
			if (!target) return false;
			let applied = false;
			if (rgba && (!gate || limiter.take(gate.nowMs, gate.flashCap))) {
				target.set(rgba.length === target.length ? rgba : rgba.subarray(0, target.length));
				pendingStale = true;
				staleAll();
				applied = true;
			} else {
				target.set(sourceBytes);
				pendingStale = false;
				stale.fill(0);
				staleCount = 0;
			}
			sourceDirty = false;
			presentGarnished = false;
			presented = false;
			return applied;
		},
		reset() {
			mvx.fill(0);
			mvy.fill(0);
			stale.fill(0);
			lostMask.fill(0);
			amp.fill(0);
			chromaReady.fill(0);
			staleCount = 0;
			pendingStale = false;
			lost.length = 0;
			frame = 0;
			gopPending = false;
			sourceDirty = false;
			presentGarnished = false;
			presented = false;
		},
		step,
	};
}
