import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import { buildDataset, checkDataset, serialise } from "../../scripts/lib/article-data-core";
import { dataset, type NoiseData, parseRules } from "../../src/lib/article-data/noise";
import { shapeOf } from "../../src/lib/article-data/types";

const dir = "tests/fixtures/article-sync/noise/";
const source: Record<string, unknown> = {
	"noise.json": JSON.parse(readFileSync(`${dir}noise.json`, "utf8")),
	"ab_results.json": JSON.parse(readFileSync(`${dir}ab_results.json`, "utf8")),
};
const ctx = { denylist: [] as string[], today: "2026-11-04" };
function projected() {
	const r = buildDataset(dataset, source, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const out = (): NoiseData => dataset.projected.parse(JSON.parse(projected().output));
const rulesOf = () =>
	z
		.object({
			rules: z.object({
				same_seed_keeps_sampling: z.object({ sd_per_difference: z.string() }),
				sampling_changing_or_independent: z.object({ sd_per_difference: z.string() }),
				mde: z.string(),
			}),
		})
		.parse(source["noise.json"]).rules;

describe("noise dataset (AC3.1)", () => {
	it("is named noise with a 3 KB cap and the whitelist keys", () => {
		expect(dataset.name).toBe("noise");
		expect(dataset.maxGzip).toBe(3072);
		expect(shapeOf(dataset)).toEqual({
			schema: "noise/1",
			keys: ["effects", "nulls", "rules", "schema"],
		});
	});
	it("the source schemas accept the fixtures", () => {
		for (const f of ["noise.json", "ab_results.json"])
			expect(dataset.sources[f]?.safeParse(source[f]).success, f).toBe(true);
	});
	it("rules are parsed from the source strings, which contain 2.5, 5.3 and 2.49", () => {
		const r = rulesOf();
		expect(r.same_seed_keeps_sampling.sd_per_difference).toContain("2.5");
		expect(r.sampling_changing_or_independent.sd_per_difference).toContain("5.3");
		expect(r.mde).toContain("2.49");
		expect(out().rules).toEqual({ sameSeedSd: 2.5, indepSd: 5.3, mdeFactor: 2.49 });
	});
	it("a reworded rule string fails instead of drifting", () => {
		const r = rulesOf();
		expect(() => parseRules({ ...r, mde: "about two and a half" })).toThrow(/mdeFactor/);
		expect(() =>
			parseRules({ ...r, same_seed_keeps_sampling: { sd_per_difference: "roughly 2.5" } }),
		).toThrow(/sameSeedSd/);
	});
	it("nulls: CS maps, K = 1, grouped by design", () => {
		const o = out();
		expect(o.nulls.map((n) => n.kind)).toEqual(["same_seed", "indep_seed"]);
		expect(o.nulls[0]?.diffs).toEqual([-1.4, 3.3, 2.3, 4.2, -3.7, 3.3, 2.3, -1.8, -1.4, 1.5]);
		expect(o.nulls[1]?.diffs).toEqual([-4.6, 2.8]);
	});
	it("effects: exactly the kept A/B rows, three keys each", () => {
		const o = out();
		const rows = z
			.object({ rows: z.array(z.object({ id: z.string(), kept: z.boolean() })) })
			.parse(source["ab_results.json"]).rows;
		expect(o.effects.map((e) => e.abId)).toEqual(rows.filter((r) => r.kept).map((r) => r.id));
		for (const e of o.effects) expect(Object.keys(e).sort()).toEqual(["abId", "cs", "era"]);
		expect(o.effects.find((e) => e.abId === "F6")).toEqual({ abId: "F6", era: "5v5", cs: 29 });
	});
	it("drops by_K statistics, mirage and generated maps, commentary and paths", () => {
		const text = projected().output;
		for (const dropped of [
			"sd_tournament",
			"mirage",
			"clusters",
			"aa_tournament",
			"EXAMPLE",
			"heading",
			"decision",
		])
			expect(text, dropped).not.toContain(dropped);
		expect(projected().sidecar.gzipBytes).toBeLessThanOrEqual(3072);
	});
	it("the committed-file check passes for a fresh build", () => {
		const r = projected();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});

	const dataArb = fc.record({
		schema: fc.constant("noise/1"),
		nulls: fc.array(
			fc.record({
				kind: fc.constantFrom("same_seed", "indep_seed"),
				diffs: fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 12 }),
			}),
			{ maxLength: 2 },
		),
		effects: fc.array(
			fc.record({
				abId: fc.string({ minLength: 1 }),
				era: fc.constantFrom("3v3", "5v5"),
				cs: fc.integer({ min: -9, max: 40 }),
			}),
			{ maxLength: 20 },
		),
		rules: fc.record({
			sameSeedSd: fc.double({ min: 0, max: 10, noNaN: true }),
			indepSd: fc.double({ min: 0, max: 10, noNaN: true }),
			mdeFactor: fc.double({ min: 0, max: 5, noNaN: true }),
		}),
	});
	test.prop([dataArb])("generated valid projections parse and round-trip", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		expect(dataset.projected.parse(JSON.parse(serialise(p)))).toEqual(p);
	});
	test.prop([dataArb])("a single-field corruption fails safeParse", (p) => {
		const cases: unknown[] = [
			{ ...p, schema: "noise/2" },
			{ ...p, extra: 1 },
			{ ...p, nulls: [{ kind: "other", diffs: [1] }] },
			{ ...p, nulls: [{ kind: "same_seed", diffs: [] }] },
			{ ...p, effects: [{ abId: "F1", era: "5v5" }] },
			{ ...p, rules: { sameSeedSd: 2.5, indepSd: 5.3 } },
			{ ...p, rules: { ...p.rules, note: "x" } },
		];
		for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
	});
});
