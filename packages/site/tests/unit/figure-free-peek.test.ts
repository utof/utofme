import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { fact } from "../../src/lib/facts";
import {
	type Action,
	AIM,
	canStep,
	checksPerTick,
	DEFAULT_ACTIONS,
	describeTick,
	inAim,
	PEEKER_MAX,
	PEEKER_START,
	realWindowMs,
	run,
	TILES,
	tickSeconds,
} from "../../src/lib/figures/free-peek";

const actions = fc.array(fc.constantFrom<Action>("out", "back"), { maxLength: 40 });

describe("F8 free peek rules", () => {
	it("default: one out-and-back leaves the miss on the vacated tile", () => {
		const r = run(DEFAULT_ACTIONS, false);
		expect(r.peeker).toBe(PEEKER_START);
		expect(r.ticks).toHaveLength(2);
		expect(r.ticks[0]?.shots).toEqual([]);
		expect(r.ticks[1]?.shots).toEqual([{ kind: "delayed", tile: 3, hit: false }]);
	});

	it("with snap, the same moves hit the peeker as it arrives, and the old shot still misses", () => {
		const r = run(DEFAULT_ACTIONS, true);
		expect(r.ticks[0]?.shots).toEqual([{ kind: "snap", tile: 3, hit: true }]);
		expect(r.ticks[1]?.shots).toEqual([{ kind: "delayed", tile: 3, hit: false }]);
	});

	test.prop([actions])(
		"AC12.1: without snap every delayed shot lands on the vacated tile and misses",
		(list) => {
			for (const t of run(list, false).ticks)
				for (const s of t.shots) {
					expect(s.kind).toBe("delayed");
					expect(s.tile).toBe(t.from);
					expect(s.hit).toBe(false);
				}
		},
	);

	test.prop([actions])(
		"AC12.1: with snap, a snap shot exists exactly when the peeker enters the aim cone",
		(list) => {
			for (const t of run(list, true).ticks) {
				const snaps = t.shots.filter((s) => s.kind === "snap");
				const enters = inAim(t.to) && !inAim(t.from);
				expect(snaps).toHaveLength(enters ? 1 : 0);
				for (const s of snaps) {
					expect(s.tile).toBe(t.to);
					expect(s.hit).toBe(true);
				}
				for (const s of t.shots.filter((x) => x.kind === "delayed")) expect(s.hit).toBe(false);
			}
		},
	);

	test.prop([actions, fc.boolean()])(
		"the peeker never leaves the corridor and every tick moves it one tile",
		(list, snap) => {
			const r = run(list, snap);
			expect(r.peeker).toBeGreaterThanOrEqual(0);
			expect(r.peeker).toBeLessThanOrEqual(PEEKER_MAX);
			expect(PEEKER_MAX).toBeLessThan(TILES - 1);
			for (const t of r.ticks) expect(Math.abs(t.to - t.from)).toBe(1);
		},
	);

	it("illegal steps are skipped and the aim cone is tiles 4 and 5 (1-based)", () => {
		expect(run(Array<Action>(10).fill("out"), false).peeker).toBe(PEEKER_MAX);
		expect(canStep(0, "back")).toBe(false);
		expect(canStep(PEEKER_MAX, "out")).toBe(false);
		expect(AIM).toEqual([3, 4]);
	});

	it("derives the real window and checks from the tick-rate fact", () => {
		const rate = fact("cs2.tickrate").v;
		expect(rate).toBe(64);
		expect(realWindowMs(rate)).toBe(15.625);
		expect(checksPerTick(rate)).toBe(51);
		expect(tickSeconds(2)).toBe(1.6);
	});

	it("describes ticks in words", () => {
		const r = run(DEFAULT_ACTIONS, false);
		expect(
			describeTick(r.ticks[1] ?? r.ticks[0] ?? { n: 0, action: "out", from: 0, to: 0, shots: [] }),
		).toBe("Tick 2: the peeker steps back to tile 3; the shot lands on tile 4, now empty.");
	});
});
