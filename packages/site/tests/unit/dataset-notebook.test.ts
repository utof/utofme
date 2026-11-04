import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { buildDataset, checkDataset, serialise } from "../../scripts/lib/article-data-core";
import { dataset, type NotebookData, publicText } from "../../src/lib/article-data/notebook";
import { dataset as parkedDataset } from "../../src/lib/article-data/notebook_parked";
import { shapeOf } from "../../src/lib/article-data/types";

const dir = "tests/fixtures/article-sync/notebook/";
const source: Record<string, unknown> = {
	"notebook.json": JSON.parse(readFileSync(`${dir}notebook.json`, "utf8")),
};
const ctx = { denylist: [] as string[], today: "2026-11-04" };
const raw = readFileSync(`${dir}notebook.json`, "utf8");
function projected() {
	const r = buildDataset(dataset, source, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
function projectedParked() {
	const r = buildDataset(parkedDataset, source, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const out = (): NotebookData => dataset.projected.parse(JSON.parse(projected().output));

describe("notebook dataset (AC3.1)", () => {
	it("is named notebook with a 24 KB cap and the whitelist keys", () => {
		expect(dataset.name).toBe("notebook");
		expect(dataset.maxGzip).toBe(24576);
		expect(shapeOf(dataset)).toEqual({ schema: "notebook/1", keys: ["entries", "schema"] });
	});
	it("keeps entries{id,date,title,area,outcome,metric,delta,ci,summary} only", () => {
		const o = out();
		expect(o.entries).toHaveLength(5);
		const allowed = ["area", "ci", "date", "delta", "id", "metric", "outcome", "summary", "title"];
		for (const e of o.entries) for (const k of Object.keys(e)) expect(allowed).toContain(k);
		expect(o.entries[0]).toEqual({
			id: "p1-aaa",
			date: "2026-10-11",
			title: "Stand-in kept entry",
			area: "learner",
			outcome: "kept",
			metric: "win rate",
			delta: 0.08,
			ci: [0.05, 0.12],
			summary: "A stand-in summary.",
		});
	});
	it("omits null metric, delta and ci", () => {
		const infra = out().entries.find((e) => e.id === "p2-ccc");
		expect(infra && Object.keys(infra).sort()).toEqual([
			"area",
			"date",
			"id",
			"outcome",
			"summary",
			"title",
		]);
	});
	it("drops time and source", () => {
		const text = projected().output;
		for (const dropped of ["EXAMPLE", '"time"', '"source"', "06:50"])
			expect(text).not.toContain(dropped);
	});
	it("rejects an unknown outcome and a duplicate id", () => {
		const dup: unknown = JSON.parse(raw.replace('"id": "p1-bbb"', '"id": "p1-aaa"'));
		expect(buildDataset(dataset, { "notebook.json": dup }, ctx).ok).toBe(false);
		const weird: unknown = JSON.parse(raw.replace('"outcome": "kept"', '"outcome": "weird"'));
		expect(buildDataset(dataset, { "notebook.json": weird }, ctx).ok).toBe(false);
	});
	it("the committed-file check passes for a fresh build", () => {
		const r = projected();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});

	const entryArb = fc.record({
		id: fc.string({ minLength: 1 }),
		date: fc.constantFrom("2026-10-11", "2026-11-04"),
		title: fc.string(),
		area: fc.string({ minLength: 1 }),
		outcome: fc.constantFrom("kept", "infra", "reverted", "parked", "inconclusive"),
		summary: fc.string(),
	});
	test.prop([fc.array(entryArb, { maxLength: 8 })])(
		"generated projections parse and round-trip",
		(entries) => {
			const p = { schema: "notebook/1", entries };
			expect(dataset.projected.safeParse(p).success).toBe(true);
			expect(dataset.projected.parse(JSON.parse(serialise(p)))).toEqual(p);
		},
	);
	test.prop([entryArb])("a single-field corruption fails safeParse", (e) => {
		const cases: unknown[] = [
			{ schema: "notebook/2", entries: [e] },
			{ schema: "notebook/1", entries: [{ ...e, source: "x" }] },
			{ schema: "notebook/1", entries: [{ ...e, outcome: "weird" }] },
			{ schema: "notebook/1", entries: [{ ...e, date: "yesterday" }] },
			{ schema: "notebook/1", entries: [{ ...e, ci: [1] }] },
		];
		for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
	});
});

describe("notebook_parked dataset (AC3.1)", () => {
	it("is named notebook_parked with an 8 KB cap and the whitelist keys", () => {
		expect(parkedDataset.name).toBe("notebook_parked");
		expect(parkedDataset.maxGzip).toBe(8192);
		expect(shapeOf(parkedDataset)).toEqual({
			schema: "notebook_parked/1",
			keys: ["parked", "schema"],
		});
	});
	it("keeps parked[]{id,title,kind,why,reopenIf,area} and renames reopen_if", () => {
		const o = JSON.parse(projectedParked().output) as { parked: Record<string, unknown>[] };
		expect(o.parked).toHaveLength(2);
		for (const p of o.parked)
			expect(Object.keys(p).sort()).toEqual(["area", "id", "kind", "reopenIf", "title", "why"]);
		expect(o.parked[0]?.reopenIf).toBe("Something changes.");
		const text = projectedParked().output;
		for (const dropped of ["EXAMPLE", "stand-in number", '"number"', '"source"', "reopen_if"])
			expect(text).not.toContain(dropped);
	});
	it("rewords the one title that trips the credential rule, and fails if that title changes", () => {
		const extra = `{"entries":[],"parked":[{"id":"P19","title":"FACEIT data API key","kind":"parked","why":"x","reopen_if":"y","area":"data/pros"}]}`;
		const ok = buildDataset(parkedDataset, { "notebook.json": JSON.parse(extra) }, ctx);
		expect(ok.ok && ok.output).toContain("FACEIT data access");
		expect(ok.ok && ok.output).not.toMatch(/api key/i);
		const changed: unknown = JSON.parse(extra.replace("API key", "API key v2"));
		expect(() => parkedDataset.project({ "notebook.json": changed })).toThrow(/public wording/);
	});
});

describe("public wording of free text", () => {
	it("replaces bookkeeping file and journal names", () => {
		expect(publicText("PARKED.md and journal clock fix")).toBe(
			"the parked list and notebook clock fix",
		);
		expect(publicText("revisit after v3 (JOURNAL 11-01), JOURNAL.md:5")).toBe(
			"revisit after v3 (notebook 11-01), notebook:5",
		);
		expect(publicText("touches env.py during")).toBe("touches env code during");
	});
	it("turns the notes' run labels into words a reader can parse", () => {
		expect(publicText("Elo g5line10 - v5a2, CS maps")).toBe("Elo block 10 vs block 2, CS maps");
		expect(publicText("Elo gline6 - gline4, CS maps")).toBe(
			"Elo 3v3 block 6 vs 3v3 block 4, CS maps",
		);
		expect(publicText("Elo g6line4 - g6line2, CS maps")).toBe(
			"Elo v3-line block 4 vs v3-line block 2, CS maps",
		);
		expect(publicText("Elo head - v5a2, compiled maps")).toBe(
			"Elo newest block vs block 2, compiled maps",
		);
		expect(publicText("exploiters vs g5line28 (v5a2: +0.066)")).toBe(
			"exploiters vs block 28 (block 2: +0.066)",
		);
		expect(publicText("five action heads - each a choice")).toBe(
			"five action heads - each a choice",
		);
	});
	it("no committed dataset text carries a run label", () => {
		for (const f of ["notebook", "notebook_parked"]) {
			const text = readFileSync(`src/data/article/${f}.json`, "utf8");
			expect(text, f).not.toMatch(/\b(g\d*line\d+w?|v5a\d)\b/);
		}
	});
	it("no committed dataset text contains a file name or a journal reference", () => {
		for (const f of ["notebook", "notebook_parked"]) {
			const text = readFileSync(`src/data/article/${f}.json`, "utf8");
			expect(text, f).not.toMatch(/journal|\.md\b|\.py\b|\.pkl|\.npz|snapshot/i);
		}
	});
});
