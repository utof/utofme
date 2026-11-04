/**
 * F5 logic: counts computed from the stage rows and cross-checked against the dataset's own
 * counts (AC9.1), the per-stage wall opacities, the layer paths and the copy helpers.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9 (AC9.1, AC9.3)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataset, type MapStagesData } from "../../src/lib/article-data/map_stages";
import {
	centroid,
	checkCounts,
	closedTiles,
	DEFAULT_MAP,
	mapTitle,
	reopenedTiles,
	STAGES,
	type StageMap,
	stageCount,
	stageLayers,
	stageRows,
	stageSummary,
	wallness,
} from "../../src/lib/figures/map-stages";

const data: MapStagesData = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/map_stages.json", "utf8")),
);
const maps: readonly StageMap[] = data.maps;
const mirage = maps.find((m) => m.name === DEFAULT_MAP);
if (!mirage) throw new Error("map_stages has no Mirage");

const count = (rows: readonly string[], re: RegExp) =>
	rows.reduce((n, r) => n + (r.match(re)?.length ?? 0), 0);

describe("stages", () => {
	it("are four stops in order: floor share, majority vote, corridor pass, final grid", () => {
		expect(STAGES.map((s) => s.id)).toEqual(["frac_0_9", "majority", "corridors", "final"]);
		expect(STAGES.map((s) => s.title)).toEqual([
			"Floor share",
			"Majority vote",
			"Corridor pass",
			"Final grid",
		]);
	});
	it("the default map is Mirage and the dataset holds five maps", () => {
		expect(DEFAULT_MAP).toBe("de_mirage");
		expect(maps).toHaveLength(5);
	});
});

describe("counts computed from the rows (AC9.1)", () => {
	it("floor share counts squares with any floor (digit 1 to 9)", () => {
		for (const m of maps) expect(stageCount(m, 0), m.name).toBe(count(m.stages.frac_0_9, /[1-9]/g));
	});
	it("majority and corridors count '.' squares", () => {
		for (const m of maps) {
			expect(stageCount(m, 1), m.name).toBe(count(m.stages.majority, /\./g));
			expect(stageCount(m, 2), m.name).toBe(count(m.stages.corridors, /\./g));
		}
	});
	it("the final grid counts every non-wall square (floor, sites, spawns)", () => {
		for (const m of maps) expect(stageCount(m, 3), m.name).toBe(count(m.stages.final, /[^#]/g));
	});
	it("majority and final equal the dataset's counts; corridors = majority + tiles added", () => {
		for (const m of maps) {
			expect(stageCount(m, 1), m.name).toBe(m.counts.majority_floor);
			expect(stageCount(m, 3), m.name).toBe(m.counts.final_floor);
			expect(stageCount(m, 2), m.name).toBe(
				m.counts.majority_floor + m.counts.corridor_tiles_added,
			);
			expect(checkCounts(m), m.name).toEqual([]);
		}
	});
	it("checkCounts names every mismatch", () => {
		const bad: StageMap = {
			...mirage,
			counts: { majority_floor: 1, corridor_tiles_added: 1, final_floor: 1 },
		};
		const problems = checkCounts(bad);
		expect(problems).toHaveLength(3);
		expect(problems.join(" ")).toMatch(/majority/);
		expect(problems.join(" ")).toMatch(/corridors/);
		expect(problems.join(" ")).toMatch(/final/);
	});
	it("the squares the corridor pass reopens equal the added count; the closed squares explain the final drop", () => {
		for (const m of maps) {
			expect(reopenedTiles(m), m.name).toHaveLength(m.counts.corridor_tiles_added);
			expect(closedTiles(m), m.name).toHaveLength(stageCount(m, 2) - stageCount(m, 3));
		}
	});
});

describe("summaries", () => {
	it("print the stage title and the counted value, with what changed", () => {
		expect(stageSummary(mirage, 0)).toBe(
			`Floor share: ${count(mirage.stages.frac_0_9, /[1-9]/g)} squares with any floor`,
		);
		expect(stageSummary(mirage, 1)).toBe(
			`Majority vote: ${mirage.counts.majority_floor} floor squares`,
		);
		expect(stageSummary(mirage, 2)).toBe(
			`Corridor pass: ${mirage.counts.majority_floor + mirage.counts.corridor_tiles_added} floor squares (${mirage.counts.corridor_tiles_added} reopened)`,
		);
		expect(stageSummary(mirage, 3)).toBe(
			`Final grid: ${mirage.counts.final_floor} floor squares (${closedTiles(mirage).length} closed)`,
		);
	});
	it("a map without a change at a step prints no parenthesis", () => {
		const none: StageMap = {
			...mirage,
			stages: {
				...mirage.stages,
				corridors: mirage.stages.majority,
				final: mirage.stages.majority,
			},
		};
		expect(stageSummary(none, 2)).not.toContain("(");
		expect(stageSummary(none, 3)).not.toContain("(");
	});
	it("map titles drop the de_ prefix and capitalise", () => {
		expect(mapTitle("de_mirage")).toBe("Mirage");
		expect(mapTitle("de_dust2")).toBe("Dust2");
		expect(mapTitle("inferno")).toBe("Inferno");
	});
	it("stageRows returns the rows of the stop", () => {
		expect(stageRows(mirage, 0)).toBe(mirage.stages.frac_0_9);
		expect(stageRows(mirage, 3)).toBe(mirage.stages.final);
	});
});

describe("wall opacity per square", () => {
	it("floor share maps digit d to 1 - d/9; binary stages to 0 or 1", () => {
		const f = wallness(mirage, 0);
		expect(f).toHaveLength(28 * 28);
		mirage.stages.frac_0_9.forEach((row, r) => {
			[...row].forEach((ch, c) => {
				expect(f[r * 28 + c]).toBeCloseTo(1 - Number(ch) / 9, 10);
			});
		});
		for (const stage of [1, 2, 3]) {
			const w = wallness(mirage, stage);
			stageRows(mirage, stage).forEach((row, r) => {
				[...row].forEach((ch, c) => {
					expect(w[r * 28 + c], `${stage}:${r},${c}`).toBe(ch === "#" ? 1 : 0);
				});
			});
		}
	});
	it("is always within 0 and 1, for every map and stop", () => {
		for (const m of maps) {
			for (const stage of [0, 1, 2, 3]) {
				expect(
					wallness(m, stage).every((v) => v >= 0 && v <= 1),
					`${m.name} ${stage}`,
				).toBe(true);
			}
		}
	});
});

/** Reads the squares a layer path covers: `M x y h w v1 h-w z` runs. */
function covered(d: string): Set<number> {
	const out = new Set<number>();
	for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
		for (let i = 0; i < Number(w); i++) out.add(Number(y) * 28 + Number(x) + i);
	}
	return out;
}

describe("layer paths", () => {
	it("cover exactly the squares with opacity > 0, each at its own opacity, merged by run", () => {
		for (const stage of [0, 1, 2, 3]) {
			const w = wallness(mirage, stage);
			const layers = stageLayers(mirage, stage);
			const seen = new Map<number, number>();
			for (const l of layers) {
				for (const i of covered(l.d)) {
					expect(seen.has(i), `square ${i} drawn twice at stage ${stage}`).toBe(false);
					seen.set(i, l.opacity);
				}
			}
			w.forEach((v, i) => {
				if (v > 0) expect(seen.get(i), `stage ${stage} square ${i}`).toBeCloseTo(v, 10);
				else expect(seen.has(i)).toBe(false);
			});
		}
	});
	it("binary stages are a single layer at full opacity", () => {
		for (const stage of [1, 2, 3]) {
			const layers = stageLayers(mirage, stage);
			expect(layers).toHaveLength(1);
			expect(layers[0]?.opacity).toBe(1);
		}
		expect(stageLayers(mirage, 0).length).toBeGreaterThan(2);
	});
});

describe("centroid", () => {
	it("is the centre of the squares in x, y units, and the origin for none", () => {
		expect(centroid([[2, 4]])).toEqual([4.5, 2.5]);
		expect(
			centroid([
				[0, 0],
				[2, 4],
			]),
		).toEqual([2.5, 1.5]);
		expect(centroid([])).toEqual([0, 0]);
	});
});
