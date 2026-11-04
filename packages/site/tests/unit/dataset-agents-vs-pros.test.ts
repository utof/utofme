import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { buildDataset, serialise } from "../../scripts/lib/article-data-core";
import { type AgentsVsProsData, dataset, ROW_IDS } from "../../src/lib/article-data/agents_vs_pros";
import { shapeOf } from "../../src/lib/article-data/types";
import { fact } from "../../src/lib/facts";

const FILE = "agent_vs_pro.json";
const source: unknown = JSON.parse(
	readFileSync(`tests/fixtures/article-sync/agents_vs_pros/${FILE}`, "utf8"),
);
const ctx = { denylist: [] as string[], today: "2026-11-04" };
function build() {
	const r = buildDataset(dataset, { [FILE]: source }, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const value = (): AgentsVsProsData => dataset.projected.parse(JSON.parse(build().output));

describe("agents_vs_pros dataset (AC3.1, AC15.3)", () => {
	it("has the spec row's key set and a 3 KB cap", () => {
		expect(dataset.maxGzip).toBe(3 * 1024);
		expect(shapeOf(dataset).keys).toEqual(["peek", "rows", "schema"]);
		expect(Object.keys(value().rows[0] ?? {}).sort()).toEqual([
			"agent",
			"id",
			"pro",
			"stamp",
			"unit",
		]);
		expect(dataset.sources[FILE]?.safeParse(source).success).toBe(true);
	});

	it("AC15.3: eleven rows; the five-vs-five-test block and the dropped rows are absent", () => {
		const v = value();
		expect(v.rows.map((r) => r.id)).toEqual([...ROW_IDS]);
		expect(v.rows).toHaveLength(11);
		const text = build().output;
		for (const bad of [
			"five_v_five_test",
			"widened",
			"kills_per_round",
			"self_blind",
			"selfblind",
			"smokekills",
			"EXAMPLE",
			"cols",
		])
			expect(text, bad).not.toContain(bad);
	});

	it("5v5 rows come from block 28 with no interval; 3v3 rows carry intervals", () => {
		const v = value();
		const by = (id: string) => v.rows.find((r) => r.id === id);
		expect(by("holder")?.agent).toEqual([0.582]);
		expect(by("holder")?.stamp).toEqual({ line: "5v5", block: 28, date: "2026-11-02" });
		expect(by("saving")?.agent).toEqual([0.162, 0.152, 0.172]);
		expect(by("saving")?.stamp).toEqual({ line: "3v3", date: "2026-10-25" });
	});

	it("agrees with the facts the prose cites", () => {
		const v = value();
		const by = (id: string) => v.rows.find((r) => r.id === id);
		const pct = (x?: readonly number[]) => Math.round((x?.[0] ?? 0) * 1000) / 10;
		expect(pct(by("openKill")?.agent)).toBe(fact("agents.b28.openkill").v);
		expect(pct(by("plantRate")?.agent)).toBe(fact("agents.b28.plantrate").v);
		expect(pct(by("fireBack")?.pro)).toBe(fact("pros.fireback").v);
		expect(by("grenades")?.agent[0]).toBe(fact("util.agent.grenades").v);
		expect(by("grenades")?.pro[0]).toBe(fact("util.pros.grenades").v);
		expect(pct([v.peek.hitSnap])).toBe(fact("peek.hit.snap").v);
		expect(pct([v.peek.hitNoSnap])).toBe(fact("peek.hit.nosnap").v);
	});

	it("is deterministic and round-trips", () => {
		expect(build().output).toBe(build().output);
		const v = value();
		expect(dataset.projected.parse(JSON.parse(serialise(v)))).toEqual(v);
	});

	test.prop([fc.integer({ min: 0, max: 10 })])("a corrupted row id fails safeParse", (i) => {
		const bad = structuredClone(value());
		const row = bad.rows[i];
		if (!row) throw new Error("row");
		row.id = ROW_IDS[(i + 1) % ROW_IDS.length] ?? "openKill";
		expect(dataset.projected.safeParse(bad).success).toBe(false);
	});
});
