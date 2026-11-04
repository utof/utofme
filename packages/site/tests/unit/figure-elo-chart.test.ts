import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { dataset, type EloData } from "../../src/lib/article-data/elo";
import {
	afterRows,
	bandPath,
	bandRuns,
	chartSvg,
	gpuHours,
	headLabel,
	LAYOUTS,
	linePath,
	panel,
	panelSvg,
	linePath as path,
	placeMarkers,
	plotPoints,
	pointLabel,
	scales,
	tableRows,
	valueAt,
} from "../../src/lib/figures/elo-chart";

const data: EloData = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/elo.json", "utf8")),
);
const s = scales();
const hand = plotPoints(data, "hand");

describe("elo-chart (AC7.1)", () => {
	it("hand set: ten points, block 28 reads +96 (+94 to +98)", () => {
		expect(hand.map((p) => p.block)).toEqual([2, 4, 6, 8, 10, 12, 16, 20, 24, 28]);
		const head = hand.at(-1);
		expect(head && headLabel(head)).toBe("+96 (+94 to +98)");
	});
	it("compiled set: three points with intervals, block 28 reads +86", () => {
		const c = plotPoints(data, "compiled");
		expect(c.map((p) => p.block)).toEqual([2, 10, 28]);
		const head = c.at(-1);
		expect(head && headLabel(head)).toBe("+86 (+84 to +89)");
		expect(bandRuns(c, "compiled")).toEqual([]);
	});
	it("generated set: no intervals anywhere, no bands", () => {
		const g = plotPoints(data, "generated");
		expect(g.every((p) => p.lo === undefined && p.hi === undefined)).toBe(true);
		expect(g.at(-1)?.v).toBe(81);
		expect(bandRuns(g, "generated")).toEqual([]);
	});
	it("the line path is a golden: x by block, y by Elo", () => {
		const two = hand.slice(0, 2);
		expect(linePath(two, s)).toBe(
			`M${s
				.x(2)
				.toFixed(2)
				.replace(
					/\.?0+$/,
					"",
				)},${s.y(0)}L${Math.round(s.x(4) * 100) / 100},${Math.round(s.y(17) * 100) / 100}`,
		);
		expect(linePath(hand, s).startsWith("M52,286")).toBe(true);
		expect(linePath([], s)).toBe("");
	});
	it("bands: none across chained points; runs are [8,10] and [20,24,28]", () => {
		const runs = bandRuns(hand, "hand");
		expect(runs.map((r) => r.map((p) => p.block))).toEqual([
			[8, 10],
			[20, 24, 28],
		]);
		for (const r of runs) for (const p of r) expect(p.chained).toBe(false);
		const d = bandPath(runs[0] ?? [], s);
		expect(d.startsWith("M")).toBe(true);
		expect(d.endsWith("Z")).toBe(true);
	});
	it("chained points (blocks 6, 12, 16) have no interval and read as chained", () => {
		for (const b of [6, 12, 16]) {
			const p = hand.find((x) => x.block === b);
			expect(p?.chained).toBe(true);
			expect(p?.lo).toBeUndefined();
			expect(p && pointLabel(p)).toContain("chained, no interval");
		}
	});
	it("focus readouts follow the spec wording, with per-seed values at 24 and 28", () => {
		const b20 = hand.find((p) => p.block === 20);
		expect(b20 && pointLabel(b20)).toBe("Block 20: +78 Elo (90 % interval +76 to +80)");
		const b28 = hand.find((p) => p.block === 28);
		expect(b28 && pointLabel(b28)).toContain("seeds +102 and +90");
		const b2 = hand[0];
		expect(b2 && pointLabel(b2)).toBe("Block 2: 0 Elo");
	});
	it("GPU-hours: (block − 2) × 2 seeds × 32 min, so block 28 is 27.7 h", () => {
		expect(gpuHours(2)).toBe(0);
		expect(gpuHours(28)).toBeCloseTo(27.7333, 3);
	});
	it("markers sit on the active line, the two block-6 ones are apart, each links a notebook id", () => {
		const m = placeMarkers(data, hand, s);
		expect(m.map((x) => x.notebookId)).toEqual(["p3-flash-arc", "p3-bot-roles", "p3-kick-fixed"]);
		const [a, b] = m;
		expect(Math.abs((a?.cx ?? 0) - (b?.cx ?? 0))).toBeGreaterThanOrEqual(20);
		expect(m[2]?.deciding).toBe("+4 Elo vs control (90 % interval +3 to +6)");
		const c = placeMarkers(data, plotPoints(data, "compiled"), s);
		expect(c).toHaveLength(3);
	});
	it("valueAt interpolates and clamps", () => {
		expect(valueAt([], 5)).toBe(0);
		expect(valueAt(hand, 1)).toBe(0);
		expect(valueAt(hand, 99)).toBe(96);
		expect(valueAt(hand, 3)).toBe(8.5);
		expect(valueAt(hand, 20)).toBe(78);
	});
	it("the after-28 strip names each game, e.g. +29 in the snap game, −15 in today's game", () => {
		const rows = afterRows(data);
		expect(rows.find((r) => r.id === "snap")?.text).toBe(
			"+29 in the snap game, −15 in today's game",
		);
	});
	it("the 3v3 panel has its own scale and shares no path with the main chart", () => {
		const p = panel(data);
		expect(p.series).toHaveLength(2);
		const main = linePath(hand, s);
		for (const line of p.series) expect(line.points).not.toBe(main);
		expect(p.yTicks.at(-1)).toBeGreaterThanOrEqual(150);
	});
	it("the default drawing carries the claim: +96 (+94 to +98), linked to its fact, one band per run", () => {
		const svg = chartSvg(data, "hand", LAYOUTS.wide);
		expect(svg).toContain("+96 (+94 to +98)");
		expect(svg).toContain('data-fact="elo.head.block2"');
		expect(svg.match(/data-band/g)).toHaveLength(2);
		expect(svg.match(/data-point=/g)).toHaveLength(10);
		expect(svg).toContain("Hollow: chained");
	});
	it("compiled drawing: dashed line, three points, +86, the 3 readouts note, no data-fact", () => {
		const svg = chartSvg(data, "compiled", LAYOUTS.narrow);
		expect(svg).toContain("stroke-dasharray");
		expect(svg.match(/data-point=/g)).toHaveLength(3);
		expect(svg).toContain("+86 (+84 to +89)");
		expect(svg).toContain("3 readouts");
		expect(svg).not.toContain("data-fact");
		expect(svg).not.toContain("data-band");
	});
	it("generated drawing: no whiskers, no bands, says there are no intervals", () => {
		const svg = chartSvg(data, "generated", LAYOUTS.wide);
		expect(svg).not.toContain("data-whisker");
		expect(svg).toContain("No intervals");
	});
	it("panel drawing: two paths of its own, a summary, no main-chart attributes", () => {
		const p = panelSvg(data);
		expect(p.markup.match(/data-panel-line/g)).toHaveLength(2);
		expect(p.markup).not.toContain("data-line");
		expect(p.markup).not.toContain("data-point");
		expect(p.summary).toContain("Different game");
	});
	it("table rows: one per point", () => {
		expect(tableRows(hand)).toHaveLength(hand.length);
		expect(tableRows(hand)[9]).toMatchObject({ block: 28, elo: "+96", interval: "+94 to +98" });
	});
	test.prop([
		fc.array(
			fc.record({
				block: fc.integer({ min: 2, max: 28 }),
				v: fc.integer({ min: 0, max: 100 }),
				chained: fc.boolean(),
			}),
			{ maxLength: 12 },
		),
	])("path has one command per point; a band never includes a chained point", (pts) => {
		const sorted = [...pts]
			.sort((a, b) => a.block - b.block)
			.map((p) => ({ ...p, lo: p.v - 2, hi: p.v + 2 }));
		const d = path(sorted, s);
		expect((d.match(/[ML]/g) ?? []).length).toBe(sorted.length);
		for (const run of bandRuns(sorted, "hand")) for (const p of run) expect(p.chained).toBe(false);
	});
});
