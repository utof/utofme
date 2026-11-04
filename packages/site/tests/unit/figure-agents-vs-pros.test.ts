import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { type AgentsVsProsData, dataset } from "../../src/lib/article-data/agents_vs_pros";
import { fact } from "../../src/lib/facts";
import {
	formatValue,
	intervalText,
	orderRows,
	ROW_DEFS,
	relativeGap,
	rowSummary,
	sourceOf,
	stampOf,
	trackX,
} from "../../src/lib/figures/agents-vs-pros";

const data: AgentsVsProsData = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/agents_vs_pros.json", "utf8")),
);
const nb = (s: string): string => s.replaceAll(" ", " ");
const row = (id: string) => {
	const r = data.rows.find((x) => x.id === id);
	if (!r) throw new Error(id);
	return r;
};

describe("F11 agents vs pros logic", () => {
	it("every row has a definition, and every linked fact key exists", () => {
		expect(Object.keys(ROW_DEFS).sort()).toEqual(data.rows.map((r) => r.id).sort());
		for (const d of Object.values(ROW_DEFS)) {
			expect(d.definition.length).toBeGreaterThan(20);
			if (d.facts) {
				expect(() => fact(d.facts?.agent ?? "")).not.toThrow();
				expect(() => fact(d.facts?.pro ?? "")).not.toThrow();
			}
		}
	});

	it("AC15.1: sorting orders by relative gap, descending; flashes then grenades lead", () => {
		const sorted = orderRows(data.rows, "gap");
		const gaps = sorted.map(relativeGap);
		expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
		expect(sorted.slice(0, 2).map((r) => r.id)).toEqual(["flashes", "grenades"]);
		expect(orderRows(data.rows, "data").map((r) => r.id)).toEqual(data.rows.map((r) => r.id));
		expect(sorted).toHaveLength(11);
	});

	it("every row shows its stamp; 5v5 rows name block 28, 3v3 rows the date", () => {
		expect(stampOf(row("holder"))).toBe("block 28 · 5v5");
		expect(stampOf(row("saving"))).toBe("3v3 agent · 2026-10-25");
		expect(sourceOf(row("holder"), "224")).toBe(
			"self-play readout, block 28; 224 pro maps of 2026",
		);
		expect(sourceOf(row("retake"), "224")).toBe("3v3 agent readout; 224 pro maps of 2026");
	});

	it("values print like the prose: shares in whole percent, counts at the fact's digits", () => {
		expect(nb(formatValue(row("holder"), row("holder").agent[0]))).toBe("58 %");
		expect(nb(formatValue(row("grenades"), row("grenades").pro[0]))).toBe("2.2");
		expect(nb(formatValue(row("flashes"), row("flashes").agent[0]))).toBe("0.012");
		expect(intervalText(row("holder"), "agent")).toBe("no interval");
		expect(nb(intervalText(row("saving"), "agent"))).toBe("15 to 17 %");
		expect(intervalText(row("grenades"), "pro")).toBe("2.15 to 2.24");
	});

	it("a row summary names both sides", () => {
		expect(nb(rowSummary(row("grenades")))).toBe(
			"Grenades per player-round, 3v3 agent · 2026-10-25: agent 0.9, pros 2.2",
		);
	});

	test.prop([fc.double({ min: -5, max: 5, noNaN: true })])("trackX stays inside the track", (v) => {
		for (const r of data.rows) {
			const x = trackX(r, v);
			expect(x).toBeGreaterThanOrEqual(6);
			expect(x).toBeLessThanOrEqual(194);
		}
	});
});
