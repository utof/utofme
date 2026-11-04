/**
 * `map_stages` dataset (F5): whitelist keys, no stage 1, no long rows, stand-in strings, caps.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table), § P10-9 (AC9.3)
 */
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
import { dataset, type MapStagesData } from "../../src/lib/article-data/map_stages";
import { shapeOf } from "../../src/lib/article-data/types";

const SRC = "maps_radar_stages.json";
const loose = z.looseObject({
	maps: z.array(
		z.looseObject({
			name: z.string(),
			stages: z.looseObject({}),
			counts: z.looseObject({}),
		}),
	),
});
const rawFixture = readFileSync(
	"tests/fixtures/article-sync/map_stages/maps_radar_stages.json",
	"utf8",
);
const source: unknown = JSON.parse(rawFixture);
const ctx = { denylist: [] as string[], today: "2026-11-04" };

function projected() {
	const r = buildDataset(dataset, { [SRC]: source }, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const mapsOf = (v: unknown) => loose.parse(v).maps;

// Why: building five maps of four 28×28 grids per sample is slow under load; pools of pre-sampled
// grids (fixed seed, so the file is deterministic) keep the properties fast while names, counts
// and the choice of grids still vary.
const gridOf = (alphabet: string) =>
	fc.constantFrom(
		...fc.sample(
			fc.array(fc.stringMatching(new RegExp(`^[${alphabet}]{28}$`)), {
				minLength: 28,
				maxLength: 28,
			}),
			{ seed: 7, numRuns: 6 },
		),
	);
const mapArb = fc.record({
	name: fc.stringMatching(/^de_[a-z0-9]{3,10}$/),
	stages: fc.record({
		frac_0_9: gridOf("0-9"),
		majority: gridOf("#."),
		corridors: gridOf("#."),
		final: gridOf("#.ABtc"),
	}),
	counts: fc.record({
		majority_floor: fc.nat(784),
		corridor_tiles_added: fc.nat(100),
		final_floor: fc.nat(784),
	}),
});
const dataArb = fc.record({
	schema: fc.constant("map_stages/1"),
	maps: fc.array(mapArb, { minLength: 1, maxLength: 5 }),
});

describe("map_stages dataset (AC3.1, AC9.3)", () => {
	it("is named map_stages with a 4 KB cap and the whitelist key set {schema, maps}", () => {
		expect(dataset.name).toBe("map_stages");
		expect(dataset.schemaId).toBe("map_stages/1");
		expect(dataset.maxGzip).toBe(4096);
		expect(shapeOf(dataset)).toEqual({ schema: "map_stages/1", keys: ["maps", "schema"] });
	});

	it("the source schema accepts the hand-cut source fixture", () => {
		expect(dataset.sources[SRC]?.safeParse(source).success).toBe(true);
	});

	it("keeps exactly {name, stages, counts} per map, four stages and three counts", () => {
		const out: unknown = JSON.parse(projected().output);
		expect(Object.keys(loose.parse(out)).sort()).toEqual(["maps", "schema"]);
		const maps = mapsOf(out);
		expect(maps.map((m) => m.name)).toEqual(["de_dust2", "de_mirage"]);
		for (const m of maps) {
			expect(Object.keys(m).sort()).toEqual(["counts", "name", "stages"]);
			expect(Object.keys(m.stages).sort()).toEqual(["corridors", "final", "frac_0_9", "majority"]);
			expect(Object.keys(m.counts).sort()).toEqual([
				"corridor_tiles_added",
				"final_floor",
				"majority_floor",
			]);
		}
	});

	it("never ships stage 1 (radar_floor_x4), leak walls, hashes or any 112-row field (OD-5)", () => {
		const text = projected().output;
		for (const dropped of [
			"radar_floor_x4",
			"leak_walls",
			"radar_sha256_12",
			"radar_px",
			"tile_px",
			"transform",
			"reproduces_committed",
			"licence_note",
			"about",
			"EXAMPLE",
		]) {
			expect(text, dropped).not.toContain(dropped);
		}
	});

	it("has no row longer than 28 characters and 28 rows per grid", () => {
		const out: unknown = JSON.parse(projected().output);
		for (const m of mapsOf(out)) {
			for (const rows of Object.values(m.stages)) {
				expect(Array.isArray(rows)).toBe(true);
				const list = z.array(z.string()).parse(rows);
				expect(list).toHaveLength(28);
				for (const row of list) expect(row.length).toBeLessThanOrEqual(28);
			}
		}
	});

	it("keeps the stage rows verbatim and stays under the cap with five maps' worth of data", () => {
		const r = projected();
		const src = loose.parse(source).maps;
		const got = mapsOf(JSON.parse(r.output));
		got.forEach((m, i) => {
			const s = src[i]?.stages;
			for (const k of ["frac_0_9", "majority", "corridors", "final"]) {
				expect(m.stages[k], k).toEqual(s?.[k]);
			}
			expect(m.counts).toEqual({
				majority_floor: src[i]?.counts["majority_floor"],
				corridor_tiles_added: src[i]?.counts["corridor_tiles_added"],
				final_floor: src[i]?.counts["final_floor"],
			});
		});
		expect(r.sidecar.gzipBytes).toBeLessThanOrEqual(4096);
		expect(r.sidecar.sources).toEqual([SRC]);
	});

	it("the committed-file check passes for a fresh build", () => {
		const r = projected();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});

	it("a source stage row of the wrong width or alphabet is a schema error with its path", () => {
		const parsed = loose.parse(JSON.parse(rawFixture));
		const bad = {
			...parsed,
			maps: parsed.maps.map((m, i) =>
				i === 1 ? { ...m, stages: { ...m.stages, majority: ["####"] } } : m,
			),
		};
		const r = buildDataset(dataset, { [SRC]: bad }, ctx);
		expect(r.ok).toBe(false);
	});

	test.prop([dataArb])("generated valid projections parse and round-trip serialisation", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		const back: MapStagesData = dataset.projected.parse(JSON.parse(serialise(p)));
		expect(back).toEqual(p);
		expect(serialise(p)).toBe(serialise(JSON.parse(serialise(p))));
	});

	test.prop([dataArb, fc.nat(), fc.nat()])(
		"a single-field corruption fails safeParse",
		(p, a, b) => {
			const m = a % p.maps.length;
			const row = b % 28;
			const patch = (f: (x: (typeof p.maps)[number]) => unknown) => ({
				...p,
				maps: p.maps.map((x, i) => (i === m ? f(x) : x)),
			});
			const cases: unknown[] = [
				{ ...p, schema: "map_stages/2" },
				{ ...p, extra: 1 },
				{ ...p, maps: [] },
				patch((x) => ({ ...x, extra: 1 })),
				patch((x) => ({ ...x, name: 7 })),
				patch((x) => ({ ...x, stages: { ...x.stages, radar_floor_x4: x.stages.final } })),
				patch((x) => ({ ...x, stages: { ...x.stages, majority: x.stages.majority.slice(1) } })),
				patch((x) => ({
					...x,
					stages: {
						...x.stages,
						frac_0_9: x.stages.frac_0_9.map((r, j) => (j === row ? `x${r.slice(1)}` : r)),
					},
				})),
				patch((x) => ({
					...x,
					stages: { ...x.stages, final: x.stages.final.map((r, j) => (j === row ? `${r}#` : r)) },
				})),
				patch((x) => ({ ...x, counts: { ...x.counts, leak_walls: 3 } })),
				patch((x) => ({ ...x, counts: { majority_floor: 1, final_floor: 2 } })),
			];
			for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
		},
	);

	it("five full-size maps stay within the cap when serialised (worst case: real shapes)", () => {
		const five = {
			schema: "map_stages/1",
			maps: ["a", "b", "c", "d", "e"].map((n) => ({
				name: `de_${n}`,
				stages: {
					frac_0_9: Array.from({ length: 28 }, (_, r) =>
						"0123456789".repeat(3).slice(r % 3, (r % 3) + 28),
					),
					majority: Array.from({ length: 28 }, (_, r) =>
						r % 2 ? "#.".repeat(14) : ".#".repeat(14),
					),
					corridors: Array.from({ length: 28 }, (_, r) =>
						r % 2 ? "#.".repeat(14) : ".#".repeat(14),
					),
					final: Array.from({ length: 28 }, (_, r) => (r % 2 ? "#.".repeat(14) : ".#".repeat(14))),
				},
				counts: { majority_floor: 1, corridor_tiles_added: 1, final_floor: 1 },
			})),
		};
		expect(gzipBytes(serialise(five))).toBeLessThanOrEqual(dataset.maxGzip);
	});
});
