import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { dataset, TEMPO_RERUN_DATE, type TempoData } from "../../src/lib/article-data/tempo";
import { fact } from "../../src/lib/facts";
import {
	AGENT_BLOCKS,
	axisTicks,
	barsPath,
	boxPath,
	clipHistogram,
	earlySentence,
	guessSentence,
	maxBinShare,
	metricInfo,
	noneSentence,
	PLOT,
	prosMedianText,
	REVEAL_KEY,
	readReveal,
	shareBefore,
	snapGuess,
	stampText,
	writeReveal,
	xOf,
} from "../../src/lib/figures/tempo";

const data: TempoData = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/tempo.json", "utf8")),
);
const nb = (s: string): string => s.replaceAll(" ", " ");

describe("F4 tempo logic", () => {
	it("AC8.2: the pros' plant median prints 74.7 s and block 28 prints 34.4 s", () => {
		expect(nb(prosMedianText(data.prosCi.plant))).toBe("74.7 s (72.1 to 76.5 s)");
		expect(nb(prosMedianText(data.prosCi.contact))).toBe("22.8 s (22.1 to 23.6 s)");
		expect(data.series.b28.plant.q[2]).toBe(34.4);
		expect(metricInfo("plant").maxS).toBe(128);
		expect(metricInfo("contact").maxS).toBe(60);
	});

	it("the early sentence is computed from the series (pros 14 %, agents within a point of the prose)", () => {
		expect(shareBefore(data.series.pros.contact, 12)).toBeCloseTo(
			fact("tempo.contact.before12.pros").v / 100,
			2,
		);
		expect(
			Math.abs(
				shareBefore(data.series.b28.contact, 12) * 100 - fact("tempo.contact.before12.agents").v,
			),
		).toBeLessThan(1);
		expect(nb(earlySentence(data.series.b28.contact, data.series.pros.contact))).toBe(
			"79 % of agent rounds make contact before 12.0 s; pros 14 %.",
		);
	});

	it("guess sentence, plant none-share sentence and stamp", () => {
		expect(nb(guessSentence(12, 22.8))).toBe("You guessed 12.0 s; pros take 22.8 s.");
		expect(noneSentence(data.series.b28.contact, data.series.pros.contact)).toBeNull();
		expect(nb(noneSentence(data.series.b28.plant, data.series.pros.plant) ?? "")).toMatch(
			/^35 % of agent rounds never plant; pros 50 %\.$/,
		);
		expect(stampText(data, "b28", TEMPO_RERUN_DATE, "224")).toBe(
			"Agents as measured on block 28 (5v5), 2026-11-04 rerun, 1,710 rounds; pros: 224 pro maps of 2026, 4,825 rounds",
		);
		expect(stampText(data, "v5a2", TEMPO_RERUN_DATE, "224")).toContain("block 2 (5v5)");
		expect(AGENT_BLOCKS.map((b) => b.block)).toEqual([2, 6, 10, 28]);
	});

	it("medians agree with the facts the prose cites", () => {
		expect(data.series.b28.contact.q[2]).toBe(fact("tempo.b28.contact.median").v);
		expect(data.series.b28.firstKill.q[2]).toBe(fact("tempo.b28.firstkill.median").v);
		expect(data.series.pros.contact.q[2]).toBe(fact("tempo.pros.contact.median").v);
		expect(data.prosCi.plant[0]).toBe(fact("tempo.pros.plant.median").v);
		expect(data.botsContact).toBe(fact("tempo.bots.contact.median").v);
	});

	it("AC8.4: bars and boxes use straight segments only", () => {
		const share = maxBinShare([data.series.b28.contact, data.series.pros.contact], 0.8, 60);
		const all = [
			barsPath(data.series.pros.plant, 0.8, 128, 0.05, PLOT.pro),
			barsPath(data.series.b28.contact, 0.8, 60, share, PLOT.agent),
			boxPath(data.series.b28.contact.q, 60, PLOT.agent).whisker,
			boxPath(data.series.b28.contact.q, 60, PLOT.agent).box,
		].join("");
		expect(all).not.toMatch(/[CcQqSsTtAa]/);
		expect(all.length).toBeGreaterThan(100);
	});

	test.prop([fc.double({ min: -50, max: 200, noNaN: true })])(
		"snapGuess lands on the 0.8 s grid in 0–60",
		(s) => {
			const g = snapGuess(s);
			expect(g).toBeGreaterThanOrEqual(0);
			expect(g).toBeLessThanOrEqual(60);
			expect(Math.abs(g / 0.8 - Math.round(g / 0.8))).toBeLessThan(1e-6 * 100);
		},
	);

	test.prop([fc.array(fc.nat(50), { minLength: 160, maxLength: 160 }), fc.constantFrom(60, 128)])(
		"clipHistogram keeps every round: bins + later = total",
		(hist, maxS) => {
			const c = clipHistogram(hist, 0.8, maxS);
			expect(c.bins.length).toBe(Math.round(maxS / 0.8));
			expect(c.bins.reduce((a, b) => a + b, 0) + c.later).toBe(hist.reduce((a, b) => a + b, 0));
		},
	);

	it("xOf maps the axis ends to the plot ends and clamps", () => {
		expect(xOf(0, 60)).toBe(PLOT.x0);
		expect(xOf(60, 60)).toBe(PLOT.x1);
		expect(xOf(500, 60)).toBe(PLOT.x1);
		expect(axisTicks(60)).toEqual([0, 10, 20, 30, 40, 50, 60]);
		expect(axisTicks(128)).toEqual([0, 32, 64, 96, 128]);
	});

	it("reveal state round-trips through storage and survives a throwing one", () => {
		const m = new Map<string, string>();
		const st = {
			getItem: (k: string) => m.get(k) ?? null,
			setItem: (k: string, v: string) => void m.set(k, v),
			removeItem: (k: string) => void m.delete(k),
		};
		expect(readReveal(st)).toEqual({ revealed: false, guess: 12 });
		writeReveal(st, { revealed: true, guess: 20 });
		expect(m.get(REVEAL_KEY)).toBe("20");
		expect(readReveal(st)).toEqual({ revealed: true, guess: 20 });
		writeReveal(st, { revealed: true, guess: null });
		expect(readReveal(st)).toEqual({ revealed: true, guess: null });
		writeReveal(st, { revealed: false, guess: 20 });
		expect(m.has(REVEAL_KEY)).toBe(false);
		const bad = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
			removeItem: () => {
				throw new Error("blocked");
			},
		};
		expect(readReveal(bad).revealed).toBe(false);
		expect(() => writeReveal(bad, { revealed: true, guess: 1 })).not.toThrow();
		expect(readReveal(null).revealed).toBe(false);
	});
});
