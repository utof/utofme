/**
 * Why: the flash lint is the safety gate of the loop pipeline; every branch of the appendix
 * algorithm (swing detector, dark rule, area gate by render width, seam, red) is pinned on
 * synthetic cell series, plus two fast-check properties.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3
 */

import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	analyzeFlashes,
	cellsFromGbrpf32,
	type FlashInput,
	fieldGeometry,
	maxEventsInWindow,
	zigzagEnds,
} from "../../scripts/lib/flash-lint";

const W = 768;
const H = 432;
const GW = 192; // 4 px cells
const GH = 108;

/** Builds a clip where `fn(frame)` returns [value, cellPredicate] per frame. */
function clip(
	frames: number,
	fps: number,
	rw: number,
	value: (f: number) => number,
	inRegion: (x: number, y: number) => boolean = () => true,
	channel: "lum" | "red" = "lum",
	base = 0,
): FlashInput {
	const lum: Float32Array[] = [];
	const red: Float32Array[] = [];
	for (let f = 0; f < frames; f++) {
		const l = new Float32Array(GW * GH).fill(channel === "lum" ? base : 0);
		const r = new Float32Array(GW * GH).fill(channel === "red" ? base : 0);
		const v = value(f);
		for (let y = 0; y < GH; y++)
			for (let x = 0; x < GW; x++) if (inRegion(x, y)) (channel === "lum" ? l : r)[y * GW + x] = v;
		lum.push(l);
		red.push(r);
	}
	return { width: W, height: H, gridW: GW, gridH: GH, fps, lum, red, renderWidthCss: rw };
}

/** Square wave of `hz` full cycles per second between 0 and 1. */
const square = (hz: number, fps: number) => (f: number) =>
	Math.floor((f * hz * 2) / fps) % 2 === 0 ? 0 : 1;

describe("zigzagEnds", () => {
	it("emits nothing for a constant series", () => {
		expect(zigzagEnds(() => 0.5, 10, 0.1, true)).toEqual([]);
	});
	it("ignores noise below delta", () => {
		const s = [0.5, 0.52, 0.5, 0.53, 0.5, 0.51];
		expect(zigzagEnds((t) => s[t] ?? 0, s.length, 0.1, true)).toEqual([]);
	});
	it("stamps a swing at its extremum", () => {
		const s = [0, 0, 1, 1, 0, 0];
		expect(zigzagEnds((t) => s[t] ?? 0, s.length, 0.1, true)).toEqual([2]);
	});
	it("counts a slow ramp as a single transition", () => {
		const s = [0, 0.2, 0.4, 0.6, 0.8, 0.6, 0.4, 0.2, 0];
		expect(zigzagEnds((t) => s[t] ?? 0, s.length, 0.1, true)).toEqual([4]);
	});
	it("applies the 0.8 dark-state rule only when asked", () => {
		const s = [0.85, 1, 0.85, 1, 0.85];
		expect(zigzagEnds((t) => s[t] ?? 0, s.length, 0.1, true)).toEqual([]);
		expect(zigzagEnds((t) => s[t] ?? 0, s.length, 0.1, false).length).toBe(3);
	});
});

describe("maxEventsInWindow", () => {
	it("uses a closed window", () => {
		expect(maxEventsInWindow([0, 5, 10], 10)).toBe(3);
		expect(maxEventsInWindow([0, 5, 11], 10)).toBe(2);
	});
});

describe("fieldGeometry", () => {
	it("matches the appendix table (1280x720 @ 1280 css px: 341x256, A=21824)", () => {
		const g = fieldGeometry(1280, 720, 1280);
		expect(g.fieldW).toBe(341);
		expect(g.fieldH).toBe(256);
		expect(g.area).toBeCloseTo(21824, 5);
	});
	it("shrinks the field when the render width grows", () => {
		const a = fieldGeometry(1280, 720, 1280).area;
		const b = fieldGeometry(1280, 720, 1920).area;
		expect(b).toBeLessThan(a);
	});
});

describe("analyzeFlashes (cyclic)", () => {
	const fps = 30;
	it("passes a static clip", () => {
		const r = analyzeFlashes(clip(90, fps, 1200, () => 0.3));
		expect(r.status).toBe("pass");
		expect(r.maxEventsPerWindow).toBe(0);
	});
	it("2 Hz (4 transitions/s) stays under the 7-event window gate but fails the sustained-rate rule", () => {
		// closed 1 s window holds 5 events (warn level, < 7), loop average is 4/s -> sustained fail.
		const r = analyzeFlashes(clip(90, fps, 1200, square(2, fps)));
		expect(r.maxEventsPerWindow).toBe(5);
		expect(r.status).toBe("fail");
		expect(r.reasons.join(" ")).toMatch(/sustained/);
	});
	it("passes a 1 Hz full-frame strobe", () => {
		const r = analyzeFlashes(clip(90, fps, 1200, square(1, fps)));
		expect(r.status).toBe("pass");
	});
	it("fails a 3 Hz strobe (>= 7 events per window)", () => {
		const r = analyzeFlashes(clip(90, fps, 1200, square(3, fps)));
		expect(r.status).toBe("fail");
	});
	it("fails a 5 Hz strobe", () => {
		const r = analyzeFlashes(clip(90, fps, 1200, square(5, fps)));
		expect(r.status).toBe("fail");
	});
	it("fails a contrast reversal that keeps the frame mean constant", () => {
		// left half white / right half black swapping each ~170 ms (3 Hz).
		const frames = 90;
		const lum: Float32Array[] = [];
		const red: Float32Array[] = [];
		for (let f = 0; f < frames; f++) {
			const flip = Math.floor((f * 6) / fps) % 2 === 0;
			const l = new Float32Array(GW * GH);
			for (let y = 0; y < GH; y++)
				for (let x = 0; x < GW; x++) l[y * GW + x] = x < GW / 2 === flip ? 1 : 0;
			lum.push(l);
			red.push(new Float32Array(GW * GH));
		}
		const r = analyzeFlashes({
			width: W,
			height: H,
			gridW: GW,
			gridH: GH,
			fps,
			lum,
			red,
			renderWidthCss: 1200,
		});
		expect(r.status).toBe("fail");
	});
	it("passes a small localized 3 Hz flash and fails a big one at the same render width", () => {
		const small = (x: number, y: number) => x < 20 && y < 20; // 80x80 px = 6400 px
		const big = (x: number, y: number) => x < 80 && y < 80; // 320x320 px
		const rSmall = analyzeFlashes(clip(90, fps, 1200, square(3, fps), small));
		const rBig = analyzeFlashes(clip(90, fps, 1200, square(3, fps), big));
		expect(rSmall.status).toBe("pass");
		expect(rBig.status).toBe("fail");
	});
	it("the same localized flash flips from pass to fail as the render width grows", () => {
		// 56x56 px region = 3136 px. A(1200)=21824*(768/1200)^2=8939 (pass); A(5000)=371 (fail).
		const region = (x: number, y: number) => x < 14 && y < 14;
		const narrow = analyzeFlashes(clip(90, fps, 1200, square(3, fps), region));
		const wide = analyzeFlashes(clip(90, fps, 5000, square(3, fps), region));
		expect(narrow.status).toBe("pass");
		expect(wide.status).toBe("fail");
	});
	it("catches a flash cluster that only exists across the loop seam", () => {
		// 6 Hz strobe only in the last 10 and first 10 frames of a 60-frame loop: each side alone has
		// ~4 events, only the contiguous (cyclic) burst reaches 7 in one second.
		const frames = 60;
		const f = (i: number) => {
			if (i >= 10 && i < 50) return 0;
			const k = (i + 10) % 60; // contiguous across the wrap
			return Math.floor((k * 12) / fps) % 2 === 0 ? 1 : 0;
		};
		const cyc = analyzeFlashes(clip(frames, fps, 1200, f));
		const linear = analyzeFlashes(clip(frames, fps, 1200, f), { cyclic: false });
		expect(linear.status).not.toBe("fail");
		expect(cyc.maxEventsPerWindow).toBeGreaterThan(linear.maxEventsPerWindow);
		expect(cyc.status).toBe("fail");
	});
	it("flags a saturated red flash with unchanged luminance", () => {
		// red channel strobe at 3 Hz while luminance stays constant.
		const base = clip(90, fps, 1200, square(3, fps), () => true, "red");
		const lum = base.lum.map(() => new Float32Array(GW * GH).fill(0.2));
		const r = analyzeFlashes({ ...base, lum });
		expect(r.general.maxEventsPerWindow).toBe(0);
		expect(r.red.maxEventsPerWindow).toBeGreaterThanOrEqual(7);
		expect(r.status).toBe("fail");
	});
	it("warns at 5 events in a window", () => {
		// 2.5 Hz: 5 transitions per second -> warn (and not the 7-event fail), rate 5/s -> sustained fail,
		// so assert on window count only.
		const r = analyzeFlashes(clip(90, fps, 1200, square(2.5, fps)));
		expect(r.maxEventsPerWindow).toBeGreaterThanOrEqual(5);
		expect(r.maxEventsPerWindow).toBeLessThan(7);
	});
});

describe("cellsFromGbrpf32", () => {
	it("computes luminance and the IRIS red scalar from planar G,B,R", () => {
		const cells = 2;
		// frame 0: cell0 white, cell1 pure red.
		const buf = new Float32Array([1, 0, /* G */ 1, 0, /* B */ 1, 1 /* R */]);
		const { lum, red } = cellsFromGbrpf32(buf, 2, 1);
		expect(cells).toBe(2);
		expect(lum[0]?.[0]).toBeCloseTo(1, 5);
		expect(lum[0]?.[1]).toBeCloseTo(0.2126, 5);
		expect(red[0]?.[0]).toBe(0); // white: R/(R+G+B)=1/3
		expect(red[0]?.[1]).toBeCloseTo(1, 5);
	});
});

describe("properties", () => {
	const seriesArb = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
		minLength: 2,
		maxLength: 60,
	});
	/** 1x1 grid; huge render width makes A tiny so the single cell always qualifies. */
	const single = (s: readonly number[], fps: number): FlashInput => ({
		width: 16,
		height: 9,
		gridW: 1,
		gridH: 1,
		fps,
		lum: s.map((v) => new Float32Array([v])),
		red: s.map(() => new Float32Array([0])),
		renderWidthCss: 1e7,
	});
	fcTest.prop([
		seriesArb,
		fc.double({ min: 0, max: 1, noNaN: true }),
		fc.integer({ min: 5, max: 30 }),
	])("adding a frame never decreases max events per window (non-cyclic)", (s, extra, fps) => {
		const a = analyzeFlashes(single(s, fps), { cyclic: false, dark: false });
		const b = analyzeFlashes(single([...s, extra], fps), { cyclic: false, dark: false });
		expect(b.general.maxEventsPerWindow).toBeGreaterThanOrEqual(a.general.maxEventsPerWindow);
	});
	fcTest.prop([
		seriesArb,
		fc.double({ min: 0, max: 0.999, noNaN: true }),
		fc.integer({ min: 5, max: 30 }),
	])("scaling all luminances by c < 1 never creates events (dark rule off)", (s, c, fps) => {
		const a = analyzeFlashes(single(s, fps), { cyclic: false, dark: false });
		const b = analyzeFlashes(
			single(
				s.map((v) => v * c),
				fps,
			),
			{ cyclic: false, dark: false },
		);
		expect(b.general.eventFrames.length).toBeLessThanOrEqual(a.general.eventFrames.length);
		expect(b.general.maxEventsPerWindow).toBeLessThanOrEqual(a.general.maxEventsPerWindow);
	});
	it("documents why the scaling property needs the dark rule off: dimming can move a swing below 0.8", () => {
		const s = [0.85, 1, 0.85, 1, 0.85];
		const dim = s.map((v) => v * 0.9);
		const base = zigzagEnds((t) => s[t] ?? 0, s.length, 0.1, true).length;
		const dimmed = zigzagEnds((t) => dim[t] ?? 0, dim.length, 0.1, true).length;
		expect(dimmed).toBeGreaterThan(base);
	});
});
