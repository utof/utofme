import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import {
	buildDataset,
	checkDataset,
	gzipBytes,
	serialise,
} from "../../scripts/lib/article-data-core";
import { dataset, type MapsCsData } from "../../src/lib/article-data/maps_cs";
import { shapeOf } from "../../src/lib/article-data/types";

const SRC = "maps_cs.json";
const mapsShape = z.looseObject({
	maps: z.array(z.looseObject({ name: z.string(), rows: z.array(z.string()) })),
});
const rawFixture = readFileSync("tests/fixtures/article-sync/maps_cs/maps_cs.json", "utf8");
const mapsOf = (v: unknown) => mapsShape.parse(v).maps;
const source: unknown = JSON.parse(
	readFileSync("tests/fixtures/article-sync/maps_cs/maps_cs.json", "utf8"),
);
const ctx = { denylist: [] as string[], today: "2026-11-04" };

function projected() {
	const r = buildDataset(dataset, { [SRC]: source }, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}

const rowArb = fc.stringMatching(/^[#.ABtc]{28}$/);
const mapArb = fc.record({
	name: fc.stringMatching(/^de_[a-z0-9]{3,10}$/),
	rows: fc.array(rowArb, { minLength: 28, maxLength: 28 }),
});
const dataArb = fc.record({
	schema: fc.constant("maps_cs/1"),
	maps: fc.array(mapArb, { minLength: 1, maxLength: 5 }),
});

describe("maps_cs dataset (AC3.1)", () => {
	it("is named maps_cs with a 2 KB cap and the whitelist key set {schema, maps}", () => {
		expect(dataset.name).toBe("maps_cs");
		expect(dataset.schemaId).toBe("maps_cs/1");
		expect(dataset.maxGzip).toBe(2048);
		expect(shapeOf(dataset)).toEqual({ schema: "maps_cs/1", keys: ["maps", "schema"] });
	});
	it("the source schema accepts the hand-cut source fixture", () => {
		expect(dataset.sources[SRC]?.safeParse(source).success).toBe(true);
	});
	it("the projection's key set equals the spec row exactly, at both levels", () => {
		const out: unknown = JSON.parse(projected().output);
		expect(Object.keys(mapsShape.parse(out)).sort()).toEqual(["maps", "schema"]);
		const maps = mapsOf(out);
		expect(maps).toHaveLength(2);
		for (const m of maps) expect(Object.keys(m).sort()).toEqual(["name", "rows"]);
		expect(maps.map((m) => m.name)).toEqual(["de_dust2", "de_mirage"]);
	});
	it("drops every other field and all path-like strings", () => {
		const text = projected().output;
		for (const dropped of [
			"translate",
			"stats",
			"held_out",
			"tile_units",
			"tile_m",
			"pipeline",
			"sources",
			"frame",
			"about",
			"EXAMPLE",
		]) {
			expect(text, dropped).not.toContain(dropped);
		}
	});
	it("keeps the grids verbatim and stays under the cap", () => {
		const r = projected();
		const out: unknown = JSON.parse(r.output);
		expect(mapsOf(out).map((m) => m.rows)).toEqual(mapsOf(source).map((m) => m.rows));
		expect(r.sidecar.gzipBytes).toBeLessThanOrEqual(2048);
		expect(r.sidecar.sources).toEqual([SRC]);
	});
	it("the committed-file check passes for a fresh build", () => {
		const r = projected();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});
	it("a source row of the wrong width or alphabet is a schema error with its path", () => {
		const parsed = mapsShape.parse(JSON.parse(rawFixture));
		const bad = {
			...parsed,
			maps: parsed.maps.map((m, i) =>
				i === 1 ? { ...m, rows: m.rows.map((r, j) => (j === 3 ? "####" : r)) } : m,
			),
		};
		const r = buildDataset(dataset, { [SRC]: bad }, ctx);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems[0]).toMatchObject({ code: 1, where: "$.maps[1].rows[3]" });
	});

	test.prop([dataArb])("generated valid projections parse and round-trip serialisation", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		const back: MapsCsData = dataset.projected.parse(JSON.parse(serialise(p)));
		expect(back).toEqual(p);
		expect(serialise(p)).toBe(serialise(JSON.parse(serialise(p))));
	});
	test.prop([dataArb, fc.nat(), fc.nat()])(
		"a single-field corruption fails safeParse",
		(p, a, b) => {
			const m = a % p.maps.length;
			const cases: unknown[] = [
				{ ...p, schema: "maps_cs/2" },
				{ ...p, extra: 1 },
				{ ...p, maps: [] },
				{ ...p, maps: p.maps.map((x, i) => (i === m ? { ...x, held_out: true } : x)) },
				{ ...p, maps: p.maps.map((x, i) => (i === m ? { ...x, name: 7 } : x)) },
				{ ...p, maps: p.maps.map((x, i) => (i === m ? { ...x, rows: x.rows.slice(1) } : x)) },
				{
					...p,
					maps: p.maps.map((x, i) =>
						i === m ? { ...x, rows: x.rows.map((r, j) => (j === b % 28 ? r.slice(1) : r)) } : x,
					),
				},
				{
					...p,
					maps: p.maps.map((x, i) =>
						i === m
							? { ...x, rows: x.rows.map((r, j) => (j === b % 28 ? `x${r.slice(1)}` : r)) }
							: x,
					),
				},
			];
			for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
		},
	);
	it("serialisation of the real shape stays within the cap for five maps", () => {
		const five = {
			schema: "maps_cs/1",
			maps: ["a", "b", "c", "d", "e"].map((n) => ({
				name: `de_${n}`,
				rows: Array.from({ length: 28 }, (_, r) => (r % 2 ? "#.".repeat(14) : ".#".repeat(14))),
			})),
		};
		expect(gzipBytes(serialise(five))).toBeLessThanOrEqual(dataset.maxGzip);
	});
});
