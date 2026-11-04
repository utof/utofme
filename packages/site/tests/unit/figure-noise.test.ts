import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { dataset, type NoiseData } from "../../src/lib/article-data/noise";
import { linear } from "../../src/lib/figure-scale";
import {
	bandHalf,
	DEFAULT_STATE,
	NOISE_LAYOUTS,
	noiseSvg,
	rows,
	sentence,
	summary,
	swarm,
	threshold,
} from "../../src/lib/figures/noise";

const data: NoiseData = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/noise.json", "utf8")),
);

describe("noise figure logic (AC13.1)", () => {
	it("at two seeds the sentence values equal AC4.4's: 4.4 same-seed, 9.3 independent", () => {
		expect(threshold(data.rules, { seeds: 2, design: "same_seed" })).toBeCloseTo(4.4, 1);
		expect(threshold(data.rules, { seeds: 2, design: "indep_seed" })).toBeCloseTo(9.3, 1);
		expect(sentence(data.rules, DEFAULT_STATE).text).toBe(
			"With 2 seeds, an effect smaller than ±9.3 Elo is noise.",
		);
		expect(sentence(data.rules, { ...DEFAULT_STATE, design: "same_seed" }).n).toBe("±4.4");
	});
	it("one seed raises N by √2 and says 'seed' in the singular", () => {
		const two = threshold(data.rules, DEFAULT_STATE);
		const one = threshold(data.rules, { ...DEFAULT_STATE, seeds: 1 });
		expect(one / two).toBeCloseTo(Math.SQRT2, 6);
		expect(sentence(data.rules, { ...DEFAULT_STATE, seeds: 1 }).text).toContain("With 1 seed,");
	});
	it("the band at 1,000 rounds is ±18.1 ± 0.1 and shrinks to ±6.4 at 8,000", () => {
		expect(bandHalf(1000)).toBeCloseTo(18.1, 1);
		expect(bandHalf(8000)).toBeCloseTo(6.4, 1);
	});
	test.prop([fc.integer({ min: 1, max: 4 }), fc.constantFrom("same_seed", "indep_seed" as const)])(
		"N falls as seeds rise and is larger for independent seeds",
		(k, design) => {
			const a = threshold(data.rules, { seeds: k, design });
			const b = threshold(data.rules, { seeds: Math.min(k + 1, 4), design });
			expect(b).toBeLessThanOrEqual(a);
			expect(threshold(data.rules, { seeds: k, design: "indep_seed" })).toBeGreaterThan(
				threshold(data.rules, { seeds: k, design: "same_seed" }),
			);
		},
	);
	test.prop([fc.integer({ min: 1, max: 7 })])("a wider tournament never narrows the band", (k) => {
		expect(bandHalf(1000 * k)).toBeGreaterThan(bandHalf(1000 * (k + 1)));
	});
	it("three rows with the data's counts, adopted effects last", () => {
		const r = rows(data);
		expect(r.map((x) => x.id)).toEqual(["same", "indep", "kept"]);
		expect(r[0]?.values).toHaveLength(10);
		expect(r[1]?.values).toHaveLength(2);
		expect(r[2]?.values).toHaveLength(data.effects.length);
	});
	test.prop([fc.array(fc.double({ min: -30, max: 40, noNaN: true }), { maxLength: 60 })])(
		"swarm never overlaps two dots and is deterministic",
		(vals) => {
			const x = linear([-30, 40], [0, 600]);
			const gap = 9;
			const off = swarm(vals, x, gap);
			expect(swarm(vals, x, gap)).toEqual(off);
			for (let i = 0; i < vals.length; i++)
				for (let j = i + 1; j < vals.length; j++) {
					const dx = Math.abs(x(vals[i] ?? 0) - x(vals[j] ?? 0));
					const dy = Math.abs((off[i] ?? 0) - (off[j] ?? 0));
					expect(dx >= gap || dy >= gap).toBe(true);
				}
		},
	);
	it("the real adopted effects fit their row in both layouts", () => {
		for (const l of [NOISE_LAYOUTS.wide, NOISE_LAYOUTS.narrow]) {
			const x = linear([-30, 40], [l.left, l.w - l.right]);
			const off = swarm(rows(data)[2]?.values ?? [], x, 9);
			expect(Math.max(...off.map(Math.abs))).toBeLessThanOrEqual((l.narrow ? 150 : 112) / 2 - 20);
		}
	});
	it("the drawing: one dot per datum, a band, two threshold lines at ±N", () => {
		const svg = noiseSvg(data, DEFAULT_STATE, NOISE_LAYOUTS.wide);
		const total = 12 + data.effects.length;
		expect(svg.match(/data-dot=/g)).toHaveLength(total);
		expect(svg.match(/data-threshold/g)).toHaveLength(2);
		expect(svg.match(/data-band/g)).toHaveLength(1);
		expect(svg).toContain("±9.3");
		expect(svg).toContain("±6.4");
		const wide = noiseSvg(data, { ...DEFAULT_STATE, rounds: 1000 }, NOISE_LAYOUTS.wide);
		expect(wide).toContain("±18.1");
	});
	it("the summary text carries counts, ranges, the band and the sentence", () => {
		const s = summary(data, DEFAULT_STATE);
		expect(s).toContain("10 with the same seed");
		expect(s).toContain("8,000 rounds is ±6.4");
		expect(s).toContain("an effect smaller than ±9.3 Elo is noise");
	});
});
