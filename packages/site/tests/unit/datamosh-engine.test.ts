/**
 * Unit + property tests for `lib/datamosh/engine.ts` (the DOM-free kernel).
 *
 * Why: the kernel is where the look and the WCAG 2.3.1 flash cap live; a seeded
 * PRNG and small synthetic pictures make every assertion exact.
 *
 * @see packages/site/src/lib/datamosh/engine.ts
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOSH_CONFIG, type MoshConfig } from "../../src/lib/datamosh/config";
import {
	blockSizeFor,
	createFlashLimiter,
	createMoshEngine,
	createRng,
	type FlashLimiter,
	type MoshEngine,
	type MoshStepInput,
} from "../../src/lib/datamosh/engine";

const W = 64;
const H = 48;

/** scale 1 / block 8 / whole-pixel vectors / no random, no healing: a transparent test bench. */
const BENCH: MoshConfig = {
	...DEFAULT_MOSH_CONFIG,
	scale: 1,
	block: 8,
	gain: 1,
	radius: 0.35,
	maxVector: 40,
	decay: 1,
	jitter: 0,
	mvStep: 1,
	skip: 0,
	mismatch: 0,
	healIn: 0,
	healOut: 0,
	leak: 0,
	gop: 0,
	lostRate: 0,
	dct: 0,
	chroma: 0,
	seed: "self",
};

/** A picture: R = 4x, G = 4y, B = `tint`, opaque. */
function picture(tint: number, w = W, h = H): Uint8ClampedArray {
	const out = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const o = (y * w + x) * 4;
			out[o] = (x * 4) & 255;
			out[o + 1] = (y * 4) & 255;
			out[o + 2] = tint;
			out[o + 3] = 255;
		}
	}
	return out;
}

function px(rgba: Uint8ClampedArray, x: number, y: number, w = W): number[] {
	const o = (y * w + x) * 4;
	return [rgba[o] ?? -1, rgba[o + 1] ?? -1, rgba[o + 2] ?? -1, rgba[o + 3] ?? -1];
}

function bench(
	config: MoshConfig = BENCH,
	options: { limiter?: FlashLimiter; seed?: number } = {},
): {
	engine: MoshEngine;
	source: Uint8ClampedArray;
	step: (input?: Partial<MoshStepInput>, cfg?: MoshConfig) => ReturnType<MoshEngine["step"]>;
} {
	const engine = createMoshEngine(W, H, createRng(options.seed ?? 7), options.limiter);
	const source = picture(10);
	engine.setSource(source);
	engine.seed(null);
	let now = 0;
	return {
		engine,
		source,
		step: (input = {}, cfg = config) => {
			now += 16;
			return engine.step(
				{
					nowMs: now,
					dtMs: 16,
					pointer: null,
					velocity: { x: 0, y: 0 },
					leaveProgress: 0,
					msSinceEnter: now,
					...input,
				},
				cfg,
			);
		},
	};
}

/** Pointer exactly on the centre of block (3, 2): x 24..31, y 16..23. */
const CENTRE = { x: 28, y: 20 };

describe("blockSizeFor", () => {
	it("is max(2, round(block * scale))", () => {
		expect(blockSizeFor({ block: 16, scale: 0.5 })).toBe(8);
		expect(blockSizeFor({ block: 8, scale: 0.25 })).toBe(2);
		expect(blockSizeFor({ block: 8, scale: 0.1 })).toBe(2);
		expect(blockSizeFor({ block: 32, scale: 1 })).toBe(32);
	});
});

describe("createRng", () => {
	it("is deterministic per seed and stays in [0, 1)", () => {
		const a = createRng(42);
		const b = createRng(42);
		const first = Array.from({ length: 50 }, () => a());
		expect(first).toEqual(Array.from({ length: 50 }, () => b()));
		for (const value of first) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
		expect(createRng(43)()).not.toBe(first[0]);
	});
});

describe("createFlashLimiter", () => {
	it("grants at most `cap` in any 1000 ms window", () => {
		const limiter = createFlashLimiter();
		expect([0, 10, 20, 30].map((t) => limiter.take(t, 3))).toEqual([true, true, true, false]);
		expect(limiter.take(999, 3)).toBe(false);
		expect(limiter.take(1000, 3)).toBe(true);
		expect(limiter.take(1010, 3)).toBe(true);
		expect(limiter.take(1020, 3)).toBe(true);
		expect(limiter.take(1021, 3)).toBe(false);
	});

	it("honours a smaller cap", () => {
		const limiter = createFlashLimiter();
		expect(limiter.take(0, 1)).toBe(true);
		expect(limiter.take(500, 1)).toBe(false);
		expect(limiter.take(1000, 1)).toBe(true);
	});
});

describe("createMoshEngine", () => {
	it("is settled and unchanged once presented when nothing moves", () => {
		const { engine, source, step } = bench();
		const first = step();
		expect(first.settled).toBe(true);
		expect(first.changed).toBe(true);
		expect(Array.from(engine.output)).toEqual(Array.from(source));
		const second = step();
		expect(second.settled).toBe(true);
		expect(second.changed).toBe(false);
		expect(second.activeBlocks).toBe(0);
	});

	it("healOut=1 with no pointer restores the source and settles", () => {
		const { engine, source, step } = bench({ ...BENCH, healOut: 1 });
		engine.seed(picture(200));
		const result = step();
		expect(result.settled).toBe(true);
		expect(Array.from(engine.output)).toEqual(Array.from(source));
	});

	it("drags a block's pixels along the snapped vector (pixels travel WITH the pointer)", () => {
		const { engine, source, step } = bench();
		step({ pointer: CENTRE, velocity: { x: 4, y: 0 } });
		// Block (3, 2): output(x, y) = source(x - 4, y).
		for (const [x, y] of [
			[24, 16],
			[27, 19],
			[31, 23],
		] as const) {
			expect(px(engine.output, x, y)).toEqual(px(source, x - 4, y));
		}
	});

	it("drags downward for a downward pointer", () => {
		const { engine, source, step } = bench();
		step({ pointer: CENTRE, velocity: { x: 0, y: 3 } });
		expect(px(engine.output, 26, 20)).toEqual(px(source, 26, 17));
	});

	it("clamps vectors to maxVector", () => {
		const { engine, source, step } = bench({ ...BENCH, maxVector: 5 });
		step({ pointer: CENTRE, velocity: { x: 100, y: 0 } });
		const { mvx, mvy } = engine.blocks;
		for (let i = 0; i < mvx.length; i++) {
			expect(Math.hypot(mvx[i] ?? 0, mvy[i] ?? 0)).toBeLessThanOrEqual(5 + 1e-4);
		}
		expect(px(engine.output, 28, 20)).toEqual(px(source, 23, 20));
	});

	it("snaps vectors to mvStep (internal px)", () => {
		const a = bench({ ...BENCH, mvStep: 4 });
		a.step({ pointer: CENTRE, velocity: { x: 5, y: 0 } });
		expect(px(a.engine.output, 28, 20)).toEqual(px(a.source, 24, 20)); // round(5/4)*4 = 4
		const b = bench({ ...BENCH, mvStep: 4 });
		b.step({ pointer: CENTRE, velocity: { x: 6, y: 0 } });
		expect(px(b.engine.output, 28, 20)).toEqual(px(b.source, 20, 20)); // round(6/4)*4 = 8
	});

	it("converts display-px parameters by scale (mvStep 2 at scale 0.5 is one internal px)", () => {
		const half: MoshConfig = { ...BENCH, scale: 0.5, block: 16, mvStep: 2, maxVector: 40 };
		const { engine, source, step } = bench(half);
		step({ pointer: CENTRE, velocity: { x: 3, y: 0 } });
		expect(px(engine.output, 28, 20)).toEqual(px(source, 25, 20));
	});

	it("clamps reads at the plane edge", () => {
		const { engine, source, step } = bench();
		step({ pointer: { x: 4, y: 20 }, velocity: { x: 4, y: 0 } });
		expect(px(engine.output, 1, 20)).toEqual(px(source, 0, 20));
		expect(px(engine.output, 5, 20)).toEqual(px(source, 1, 20));
	});

	it("freezes blocks whose vector is under skip", () => {
		const { engine, source, step } = bench({ ...BENCH, skip: 10 });
		step({ pointer: CENTRE, velocity: { x: 4, y: 0 } });
		expect(Array.from(engine.output)).toEqual(Array.from(source));
	});

	it("leak=1 mixes the live source fully into dragged blocks", () => {
		const { engine, source, step } = bench({ ...BENCH, leak: 1 });
		step({ pointer: CENTRE, velocity: { x: 4, y: 0 } });
		expect(px(engine.output, 28, 20)).toEqual(px(source, 28, 20));
	});

	it("leak=0.5 lands between the dragged and the source pixel", () => {
		const { engine, source, step } = bench({ ...BENCH, leak: 0.5 });
		step({ pointer: CENTRE, velocity: { x: 4, y: 0 } });
		const dragged = px(source, 24, 20)[0] ?? 0;
		const live = px(source, 28, 20)[0] ?? 0;
		expect(px(engine.output, 28, 20)[0]).toBe(Math.round((dragged + live) / 2));
	});

	it("shows seeded content where blocks are not refreshed", () => {
		const { engine, step } = bench();
		const other = picture(200);
		expect(engine.seed(other)).toBe(true);
		expect(Array.from(engine.output)).toEqual(Array.from(other));
		const result = step();
		expect(result.settled).toBe(false);
		expect(Array.from(engine.output)).toEqual(Array.from(other));
	});

	it("keeps seeded blocks stale through a re-grid", () => {
		const { engine, step } = bench();
		engine.seed(picture(200));
		step();
		step({}, { ...BENCH, block: 16 });
		const { stale } = engine.blocks;
		expect(stale.length).toBeGreaterThan(0);
		expect(Array.from(stale).every((flag) => flag === 1)).toBe(true);
	});

	it("falls back to the source when the cut cannot win a flash slot", () => {
		const denied: FlashLimiter = { take: () => false };
		const { engine, source, step } = bench(BENCH, { limiter: denied });
		expect(engine.seed(picture(200), { nowMs: 0, flashCap: 3 })).toBe(false);
		step();
		expect(Array.from(engine.output)).toEqual(Array.from(source));
	});

	it("setSource swaps clean blocks to the new frame but leaves smeared blocks alone", () => {
		const { engine, step } = bench();
		step({ pointer: CENTRE, velocity: { x: 4, y: 0 } });
		const smeared = px(engine.output, 28, 20);
		const next = picture(99);
		engine.setSource(next);
		// Vectors die (decay 0), so the stale block keeps its pixels.
		step({}, { ...BENCH, decay: 0 });
		expect(px(engine.output, 28, 20)).toEqual(smeared);
		// A block far from the pointer was never touched: it now shows the new source.
		expect(px(engine.output, 60, 44)).toEqual(px(next, 60, 44));
	});

	it("settles within a bounded number of steps once leaveProgress reaches 1", () => {
		const { engine, source, step } = bench({
			...BENCH,
			healOut: 0.02,
			lostRate: 0.3,
			lostDelayMs: 0,
		});
		for (let i = 0; i < 40; i++) {
			step({ pointer: { x: 10 + i, y: 20 }, velocity: { x: 3, y: 1 }, msSinceEnter: 1000 });
		}
		let settledAfter = -1;
		for (let i = 0; i < 6 && settledAfter < 0; i++) {
			if (step({ leaveProgress: 1, msSinceEnter: 5000 }).settled) settledAfter = i + 1;
		}
		expect(settledAfter).toBeGreaterThan(0);
		expect(Array.from(engine.output)).toEqual(Array.from(source));
	});

	it("ramps healing and damping with leaveProgress", () => {
		const { engine, step } = bench({ ...BENCH, healOut: 0 });
		for (let i = 0; i < 10; i++) step({ pointer: CENTRE, velocity: { x: 4, y: 0 } });
		const before = engine.blocks.stale.reduce((n, flag) => n + flag, 0);
		expect(before).toBeGreaterThan(0);
		step({ leaveProgress: 0.5 });
		const after = engine.blocks.stale.reduce((n, flag) => n + flag, 0);
		expect(after).toBeLessThan(before);
	});

	it("only starts lost sectors after lostDelayMs", () => {
		const config: MoshConfig = { ...BENCH, lostRate: 0.3, lostDelayMs: 500 };
		const early = bench(config);
		const late = bench(config);
		let earlyLost = 0;
		let lateLost = 0;
		for (let i = 0; i < 300; i++) {
			early.step({ pointer: CENTRE, msSinceEnter: 100 });
			late.step({ pointer: CENTRE, msSinceEnter: 900 });
			earlyLost += early.engine.blocks.lost.reduce((n, flag) => n + flag, 0);
			lateLost += late.engine.blocks.lost.reduce((n, flag) => n + flag, 0);
		}
		expect(earlyLost).toBe(0);
		expect(lateLost).toBeGreaterThan(0);
	});

	it("does not update lost-sector blocks", () => {
		const { engine, step } = bench({ ...BENCH, lostRate: 0.3, lostDelayMs: 0 });
		let checked = 0;
		for (let i = 0; i < 400 && checked < 3; i++) {
			const before = Uint8ClampedArray.from(engine.output);
			step({ pointer: CENTRE, velocity: { x: 3, y: 1 }, msSinceEnter: 1000 });
			const { lost, size, cols } = engine.blocks;
			const index = lost.indexOf(1);
			if (index < 0) continue;
			const x0 = (index % cols) * size;
			const y0 = Math.floor(index / cols) * size;
			expect(px(engine.output, x0, y0)).toEqual(px(before, x0, y0));
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	describe("flash cap (WCAG 2.3.1)", () => {
		/** Wrap a limiter so the test sees every granted slot. */
		function spy(): { limiter: FlashLimiter; grants: number[] } {
			const inner = createFlashLimiter();
			const grants: number[] = [];
			return {
				grants,
				limiter: {
					take(nowMs, cap) {
						const ok = inner.take(nowMs, cap);
						if (ok) grants.push(nowMs);
						return ok;
					},
				},
			};
		}

		function maxPerSecond(grants: readonly number[]): number {
			let most = 0;
			for (const t of grants) {
				most = Math.max(most, grants.filter((g) => g > t - 1000 && g <= t).length);
			}
			return most;
		}

		for (const cap of [1, 2, 3]) {
			it(`never grants more than ${cap} GOP / lost-sector events in any second`, () => {
				const { limiter, grants } = spy();
				const config: MoshConfig = {
					...BENCH,
					gop: 1,
					lostRate: 0.3,
					lostDelayMs: 0,
					flashCap: cap,
				};
				const { step } = bench(config, { limiter });
				// Three simulated seconds, pointer sweeping so blocks keep going stale.
				for (let i = 0; i < 180; i++) {
					step({
						pointer: { x: 8 + (i % 48), y: 24 },
						velocity: { x: 3, y: 1 },
						msSinceEnter: 1000,
					});
				}
				expect(grants.length).toBeGreaterThan(cap);
				expect(maxPerSecond(grants)).toBeLessThanOrEqual(cap);
			});
		}

		it("defers a full refresh until a slot frees up instead of dropping it", () => {
			const { limiter } = spy();
			const { engine, step } = bench({ ...BENCH, gop: 2, flashCap: 1 }, { limiter });
			let refreshes = 0;
			for (let i = 0; i < 120; i++) {
				const wasStale = engine.blocks.stale.reduce((n, flag) => n + flag, 0);
				step({ pointer: { x: 8 + (i % 48), y: 24 }, velocity: { x: 3, y: 0 } });
				const isStale = engine.blocks.stale.reduce((n, flag) => n + flag, 0);
				if (wasStale > 0 && isStale === 0) refreshes++;
			}
			expect(refreshes).toBeGreaterThan(0);
			// 120 frames at 16 ms is ~1.9 s: with a cap of 1 at most 2 full refreshes fit.
			expect(refreshes).toBeLessThanOrEqual(2);
		});
	});

	describe("garnish", () => {
		it("is presentational: the history underneath is unchanged by dct/chroma", () => {
			const plain = bench(BENCH);
			const fancy = bench({ ...BENCH, dct: 1, chroma: 1 });
			for (let i = 0; i < 10; i++) {
				const input = { pointer: { x: 10 + i * 4, y: 24 }, velocity: { x: 3, y: 0 } };
				plain.step(input);
				fancy.step(input);
			}
			// With garnish on the stripes show; with it off again the outputs match exactly.
			expect(Array.from(fancy.engine.output)).not.toEqual(Array.from(plain.engine.output));
			plain.step();
			fancy.step({}, BENCH);
			expect(Array.from(fancy.engine.output)).toEqual(Array.from(plain.engine.output));
		});

		it("only touches stale blocks", () => {
			const { engine, source, step } = bench({ ...BENCH, dct: 1, chroma: 1 });
			const result = step();
			expect(result.settled).toBe(true);
			expect(Array.from(engine.output)).toEqual(Array.from(source));
		});
	});

	test.prop(
		[
			fc.array(
				fc.record({
					px: fc.double({ min: -20, max: 90, noNaN: true }),
					py: fc.double({ min: -20, max: 70, noNaN: true }),
					vx: fc.double({ min: -60, max: 60, noNaN: true }),
					vy: fc.double({ min: -60, max: 60, noNaN: true }),
					inside: fc.boolean(),
					leave: fc.double({ min: 0, max: 1, noNaN: true }),
				}),
				{ minLength: 1, maxLength: 40 },
			),
			fc.record({
				gain: fc.double({ min: 0, max: 4, noNaN: true }),
				jitter: fc.double({ min: 0, max: 6, noNaN: true }),
				mismatch: fc.double({ min: 0, max: 0.3, noNaN: true }),
				healIn: fc.double({ min: 0, max: 0.1, noNaN: true }),
				healOut: fc.double({ min: 0, max: 0.2, noNaN: true }),
				leak: fc.double({ min: 0, max: 0.3, noNaN: true }),
				lostRate: fc.double({ min: 0, max: 0.3, noNaN: true }),
				dct: fc.double({ min: 0, max: 1, noNaN: true }),
				chroma: fc.double({ min: 0, max: 1, noNaN: true }),
				gop: fc.integer({ min: 0, max: 10 }),
				scale: fc.constantFrom(0.5, 1),
			}),
			fc.integer(),
		],
		{ numRuns: 60 },
	)(
		"keeps every vector finite and every pixel defined under random input",
		(frames, tweak, seed) => {
			const config: MoshConfig = { ...DEFAULT_MOSH_CONFIG, ...tweak, lostDelayMs: 0 };
			const engine = createMoshEngine(W, H, createRng(seed));
			engine.setSource(picture(30));
			engine.seed(picture(180));
			let now = 0;
			for (const f of frames) {
				now += 16;
				engine.step(
					{
						nowMs: now,
						dtMs: 16,
						pointer: f.inside ? { x: f.px, y: f.py } : null,
						velocity: { x: f.vx, y: f.vy },
						leaveProgress: f.leave,
						msSinceEnter: now,
					},
					config,
				);
			}
			const { mvx, mvy } = engine.blocks;
			expect(mvx.every(Number.isFinite)).toBe(true);
			expect(mvy.every(Number.isFinite)).toBe(true);
			expect(engine.output.length).toBe(W * H * 4);
			expect(engine.output.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
		},
	);
});
