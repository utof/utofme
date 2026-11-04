/**
 * F10 logic: generators, seed cycling, labels, the CS-likeness lines (equal to the dataset and the
 * keyed facts), and the shapes a map is drawn from.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { dataset, type MapsGeneratedData } from "../../src/lib/article-data/maps_generated";
import { fact } from "../../src/lib/facts";
import {
	DEFAULT_GENERATOR,
	GENERATORS,
	generatorMaps,
	likenessLine,
	MAPS_PER_GENERATOR,
	mapShapes,
	nextIndex,
	realLikenessLine,
	seedLabel,
} from "../../src/lib/figures/roll-map";
import { parseRows, siteRects, spawnTiles, wallPath } from "../../src/lib/grid";

const data: MapsGeneratedData = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/maps_generated.json", "utf8")),
);

describe("generators", () => {
	it("are v1, v2, v3 in order, with public copy and no digits in the blurbs", () => {
		expect(GENERATORS.map((g) => g.id)).toEqual(["v1", "v2", "v3"]);
		for (const g of GENERATORS) {
			expect(g.blurb.length).toBeGreaterThan(10);
			expect(g.blurb).not.toMatch(/\d/);
		}
		expect(DEFAULT_GENERATOR).toBe("v3");
		expect(MAPS_PER_GENERATOR).toBe(12);
	});

	it("the dataset holds twelve maps of 28 rows for each", () => {
		for (const g of GENERATORS) {
			const maps = generatorMaps(data, g.id);
			expect(maps).toHaveLength(MAPS_PER_GENERATOR);
			for (const rows of maps) expect(rows).toHaveLength(28);
		}
	});

	it("an unknown generator has no maps", () => {
		expect(generatorMaps(data, "v0")).toEqual([]);
	});
});

describe("New seed", () => {
	test.prop([fc.integer({ min: 0, max: 11 })])(
		"advances by one and wraps after twelve presses",
		(start) => {
			expect(nextIndex(start, 12)).toBe((start + 1) % 12);
			let i = start;
			for (let k = 0; k < 12; k++) i = nextIndex(i, 12);
			expect(i).toBe(start);
		},
	);
	it("an empty bank stays at zero", () => {
		expect(nextIndex(0, 0)).toBe(0);
	});
	it("labels are one-based: 'map 4 of 12'", () => {
		expect(seedLabel(0, 12)).toBe("map 1 of 12");
		expect(seedLabel(3, 12)).toBe("map 4 of 12");
		expect(seedLabel(11, 12)).toBe("map 12 of 12");
	});
});

describe("CS-likeness lines", () => {
	it("v2 and v3 print the dataset numbers, which equal the keyed facts", () => {
		expect(likenessLine(data, "v2")).toContain(String(fact("maps.v2.outside").v));
		expect(likenessLine(data, "v3")).toContain(String(fact("maps.v3.outside").v));
		expect(realLikenessLine(data)).toContain(String(fact("maps.real.outside").v));
	});
	it("v1 says it was not measured and invents no number", () => {
		expect(likenessLine(data, "v1")).toBe("Not measured for this generator.");
		expect(likenessLine(data, "v1")).not.toMatch(/\d/);
	});
	it("lower is more CS-like: the sentence says 'key metrics' outside the real range", () => {
		expect(likenessLine(data, "v3")).toMatch(/key metrics/);
		expect(likenessLine(data, "v3")).toMatch(/real maps' range/);
	});
});

describe("map shapes", () => {
	it("a map is drawn from its walls path, site boxes and spawn squares", () => {
		const rows = generatorMaps(data, "v3")[0];
		if (!rows) throw new Error("no v3 map 1");
		const s = mapShapes(rows);
		const grid = parseRows(rows);
		expect(s.walls).toBe(wallPath(grid, 1));
		expect(s.sites).toEqual(
			(["a", "b"] as const).flatMap((k) => siteRects(grid, k).map((r) => ({ k, r }))),
		);
		expect(s.ct).toEqual(spawnTiles(grid, "ct"));
		expect(s.t).toEqual(spawnTiles(grid, "t"));
		expect(s.sites.map((x) => x.k)).toEqual(["a", "b"]);
		expect(s.ct.length).toBeGreaterThan(0);
		expect(s.t.length).toBeGreaterThan(0);
	});
	it("every shipped map parses with two sites and both spawns", () => {
		for (const g of GENERATORS) {
			for (const rows of generatorMaps(data, g.id)) {
				const s = mapShapes(rows);
				expect(s.sites).toHaveLength(2);
				expect(s.ct.length).toBeGreaterThan(0);
				expect(s.t.length).toBeGreaterThan(0);
			}
		}
	});
});
