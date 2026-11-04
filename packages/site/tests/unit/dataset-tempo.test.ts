import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { buildDataset, serialise } from "../../scripts/lib/article-data-core";
import { dataset, type TempoData } from "../../src/lib/article-data/tempo";
import { shapeOf } from "../../src/lib/article-data/types";

const read = (f: string): unknown =>
	JSON.parse(readFileSync(`tests/fixtures/article-sync/tempo/${f}`, "utf8"));
const src: Record<string, unknown> = {
	"tempo_dists.json": read("tempo_dists.json"),
	"tempo.json": read("tempo.json"),
};
const ctx = { denylist: [] as string[], today: "2026-11-04" };
function build(s: Record<string, unknown> = src) {
	const r = buildDataset(dataset, s, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const value = (): TempoData => dataset.projected.parse(JSON.parse(build().output));

describe("tempo dataset (AC3.1)", () => {
	it("has the spec row's key set and a 4 KB cap", () => {
		expect(dataset.maxGzip).toBe(4 * 1024);
		expect(shapeOf(dataset).keys).toEqual([
			"binS",
			"botsContact",
			"prosCi",
			"rounds",
			"schema",
			"series",
		]);
		expect(Object.keys(value().series).sort()).toEqual(["b10", "b28", "b6", "pros", "v5a2"]);
		expect(Object.keys(value().series.b28.contact).sort()).toEqual([
			"hist",
			"n",
			"nEvent",
			"noneShare",
			"q",
		]);
	});

	it("sources accept the fixture; the head series and texts are dropped", () => {
		for (const [name, schema] of Object.entries(dataset.sources))
			expect(schema.safeParse(src[name]).success, name).toBe(true);
		const text = build().output;
		for (const bad of ["head", "spotted", "length", "demos", "bullets", "EXAMPLE", "about"])
			expect(text, bad).not.toContain(`"${bad}"`);
	});

	it("keeps the pros' interval, the bots' median and a 160-bin histogram that sums to nEvent", () => {
		const v = value();
		expect(v.prosCi.contact).toEqual([22.8, 22.14, 23.63]);
		expect(v.prosCi.plant[0]).toBe(74.65);
		expect(v.botsContact).toBe(17.6);
		expect(v.series.b28.plant.q[2]).toBe(34.4);
		for (const s of Object.values(v.series))
			for (const m of Object.values(s)) {
				expect(m.hist).toHaveLength(160);
				expect(m.hist.reduce((a, b) => a + b, 0)).toBe(m.nEvent);
			}
	});

	it("is deterministic and round-trips", () => {
		const a = build();
		expect(build().output).toBe(a.output);
		const v = value();
		expect(dataset.projected.parse(JSON.parse(serialise(v)))).toEqual(v);
	});

	it("rejects a histogram that does not sum to nEvent", () => {
		const v = value();
		const bad = structuredClone(v);
		bad.series.b28.contact.nEvent += 1;
		expect(dataset.projected.safeParse(bad).success).toBe(false);
	});

	test.prop([fc.constantFrom("b28", "pros", "v5a2"), fc.integer({ min: 0, max: 159 })])(
		"a single corrupted bin fails safeParse",
		(who, bin) => {
			const bad = structuredClone(value());
			const key = who as "b28" | "pros" | "v5a2";
			bad.series[key].plant.hist[bin] = (bad.series[key].plant.hist[bin] ?? 0) + 1;
			expect(dataset.projected.safeParse(bad).success).toBe(false);
		},
	);
});
