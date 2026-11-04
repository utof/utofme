/**
 * `maps_generated` dataset (F10): v1 to v3 only, 12 maps each as bare rows, CS-likeness numbers
 * equal to the keyed facts, nothing else from the source.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table), § P10-14
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
import { dataset, type MapsGeneratedData } from "../../src/lib/article-data/maps_generated";
import { shapeOf } from "../../src/lib/article-data/types";
import { fact } from "../../src/lib/facts";

const SRC = "maps_generated.json";
const loose = z.looseObject({
	generators: z.array(z.looseObject({ id: z.string(), maps: z.array(z.unknown()) })),
	csLikeness: z.looseObject({}),
});
const rawFixture = readFileSync(
	"tests/fixtures/article-sync/maps_generated/maps_generated.json",
	"utf8",
);
const source: unknown = JSON.parse(rawFixture);
const ctx = { denylist: [] as string[], today: "2026-11-04" };

function projected() {
	const r = buildDataset(dataset, { [SRC]: source }, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}

// Why: building thirty-six 28×28 grids per sample is slow under load; a pool of pre-sampled grids
// (fixed seed, so the file is deterministic) keeps the property fast while the numbers and the
// choice of grids still vary.
const gridPool = fc.sample(
	fc.array(fc.stringMatching(/^[#.ABtc]{28}$/), { minLength: 28, maxLength: 28 }),
	{ seed: 7, numRuns: 8 },
);
const mapArb = fc.constantFrom(...gridPool);
const genArb = (id: string) =>
	fc.record({ id: fc.constant(id), maps: fc.array(mapArb, { minLength: 12, maxLength: 12 }) });
const dataArb = fc.record({
	schema: fc.constant("maps_generated/1"),
	generators: fc.tuple(genArb("v1"), genArb("v2"), genArb("v3")),
	csLikeness: fc.record({
		v2: fc.double({ min: 0, max: 30, noNaN: true }),
		v3: fc.double({ min: 0, max: 30, noNaN: true }),
		real: fc.double({ min: 0, max: 30, noNaN: true }),
	}),
});

describe("maps_generated dataset (AC3.1)", () => {
	it("is named maps_generated with a 6 KB cap and the whitelist key set", () => {
		expect(dataset.name).toBe("maps_generated");
		expect(dataset.schemaId).toBe("maps_generated/1");
		expect(dataset.maxGzip).toBe(6144);
		expect(shapeOf(dataset)).toEqual({
			schema: "maps_generated/1",
			keys: ["csLikeness", "generators", "schema"],
		});
	});

	it("the source schema accepts the hand-cut source fixture", () => {
		expect(dataset.sources[SRC]?.safeParse(source).success).toBe(true);
	});

	it("keeps v1, v2, v3 in that order, each {id, maps[12]} of bare 28-row grids", () => {
		const out = loose.parse(JSON.parse(projected().output));
		expect(Object.keys(out).sort()).toEqual(["csLikeness", "generators", "schema"]);
		expect(out.generators.map((g) => g.id)).toEqual(["v1", "v2", "v3"]);
		for (const g of out.generators) {
			expect(Object.keys(g).sort()).toEqual(["id", "maps"]);
			expect(g.maps).toHaveLength(12);
			for (const m of g.maps) {
				const rows = z.array(z.string()).parse(m);
				expect(rows).toHaveLength(28);
				for (const row of rows) expect(row).toMatch(/^[#.ABtc]{28}$/);
			}
		}
	});

	it("ships the first twelve maps of each generator, rows verbatim", () => {
		const out = loose.parse(JSON.parse(projected().output));
		const src = z
			.object({
				generators: z.array(
					z.object({ id: z.string(), maps: z.array(z.object({ rows: z.array(z.string()) })) }),
				),
			})
			.parse(source);
		for (const g of out.generators) {
			const from = src.generators.find((s) => s.id === g.id);
			expect(g.maps).toEqual(from?.maps.slice(0, 12).map((m) => m.rows));
		}
	});

	it("drops the other generators, the per-map statistics and every text field", () => {
		const text = projected().output;
		for (const dropped of [
			"procgen",
			"hand_made",
			"lanes",
			"floor",
			"tries",
			"cpu_s",
			"regime",
			"ct_near",
			"ct_side",
			"family_stats",
			"two_good_routes",
			"site_sightline",
			"scipy",
			"label_backend",
			"EXAMPLE",
			"about",
			"metric",
		]) {
			expect(text, dropped).not.toContain(dropped);
		}
		expect(loose.parse(JSON.parse(text)).generators.map((g) => g.id)).not.toContain("v0");
	});

	it("csLikeness = {v2, v3, real} and equals the keyed facts the caption prints", () => {
		const c = loose.parse(JSON.parse(projected().output)).csLikeness;
		expect(Object.keys(c).sort()).toEqual(["real", "v2", "v3"]);
		expect(c).toEqual({
			v2: fact("maps.v2.outside").v,
			v3: fact("maps.v3.outside").v,
			real: fact("maps.real.outside").v,
		});
	});

	it("stays under the cap", () => {
		const r = projected();
		expect(r.sidecar.gzipBytes).toBeLessThanOrEqual(6144);
		expect(r.sidecar.sources).toEqual([SRC]);
	});

	it("the committed-file check passes for a fresh build", () => {
		const r = projected();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});

	it("a source generator with fewer than twelve maps is a build failure", () => {
		const parsed = JSON.parse(rawFixture) as { generators: { id: string; maps: unknown[] }[] };
		const bad = {
			...parsed,
			generators: parsed.generators.map((g) =>
				g.id === "v3" ? { ...g, maps: g.maps.slice(0, 11) } : g,
			),
		};
		expect(buildDataset(dataset, { [SRC]: bad }, ctx).ok).toBe(false);
	});

	test.prop([dataArb])("generated valid projections parse and round-trip serialisation", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		const back: MapsGeneratedData = dataset.projected.parse(JSON.parse(serialise(p)));
		expect(back).toEqual(p);
		expect(serialise(p)).toBe(serialise(JSON.parse(serialise(p))));
	});

	test.prop([dataArb, fc.nat(), fc.nat()])(
		"a single-field corruption fails safeParse",
		(p, a, b) => {
			const g = a % 3;
			const patchGen = (f: (x: (typeof p.generators)[number]) => unknown) => ({
				...p,
				generators: p.generators.map((x, i) => (i === g ? f(x) : x)),
			});
			const cases: unknown[] = [
				{ ...p, schema: "maps_generated/2" },
				{ ...p, extra: 1 },
				{ ...p, generators: p.generators.slice(0, 2) },
				{ ...p, generators: [...p.generators].reverse() },
				{ ...p, csLikeness: { v2: 1, v3: 2 } },
				{ ...p, csLikeness: { ...p.csLikeness, extra: 1 } },
				patchGen((x) => ({ ...x, name: "x" })),
				patchGen((x) => ({ ...x, id: "v0" })),
				patchGen((x) => ({ ...x, maps: x.maps.slice(1) })),
				patchGen((x) => ({ ...x, maps: x.maps.map((m, i) => (i === b % 12 ? m.slice(1) : m)) })),
				patchGen((x) => ({
					...x,
					maps: x.maps.map((m, i) => (i === b % 12 ? m.map((r, j) => (j === 0 ? `${r}#` : r)) : m)),
				})),
				patchGen((x) => ({ ...x, maps: x.maps.map((m, i) => (i === 0 ? { rows: m } : m)) })),
			];
			for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
		},
	);

	it("a worst-case serialisation of three generators stays within the cap", () => {
		const grid = Array.from({ length: 28 }, (_, r) => (r % 2 ? "#.".repeat(14) : ".#".repeat(14)));
		const p = {
			schema: "maps_generated/1",
			generators: ["v1", "v2", "v3"].map((id) => ({
				id,
				maps: Array.from({ length: 12 }, () => grid),
			})),
			csLikeness: { v2: 8.4, v3: 3.7, real: 5.4 },
		};
		expect(gzipBytes(serialise(p))).toBeLessThanOrEqual(dataset.maxGzip);
	});
});
