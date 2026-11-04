import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { buildDataset, checkDataset, serialise } from "../../scripts/lib/article-data-core";
import { type ArchitectureData, dataset } from "../../src/lib/article-data/architecture";
import { shapeOf } from "../../src/lib/article-data/types";

const dir = "tests/fixtures/article-sync/architecture/";
const source: Record<string, unknown> = {
	"architecture.json": JSON.parse(readFileSync(`${dir}architecture.json`, "utf8")),
};
const ctx = { denylist: [] as string[], today: "2026-11-04" };
function projected() {
	const r = buildDataset(dataset, source, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const out = (): ArchitectureData => dataset.projected.parse(JSON.parse(projected().output));

describe("architecture dataset (AC3.1)", () => {
	it("is named architecture with a 2 KB cap and the whitelist keys", () => {
		expect(dataset.name).toBe("architecture");
		expect(dataset.maxGzip).toBe(2048);
		expect(shapeOf(dataset)).toEqual({
			schema: "architecture/1",
			keys: ["edges", "groups", "nodes", "schema"],
		});
	});
	it("the source schema accepts the fixture", () => {
		expect(
			dataset.sources["architecture.json"]?.safeParse(source["architecture.json"]).success,
		).toBe(true);
	});
	it("keeps exactly groups{id,label}, nodes{id,label,group,x,y}, edges{from,to,label}", () => {
		const o = out();
		expect(Object.keys(o).sort()).toEqual(["edges", "groups", "nodes", "schema"]);
		for (const g of o.groups) expect(Object.keys(g).sort()).toEqual(["id", "label"]);
		for (const n of o.nodes)
			expect(Object.keys(n).sort()).toEqual(["group", "id", "label", "x", "y"]);
		for (const e of o.edges) expect(Object.keys(e).sort()).toEqual(["from", "label", "to"]);
		expect(o.nodes).toHaveLength(3);
		expect(o.edges).toHaveLength(2);
	});
	it("drops files, blurb, data, note and title", () => {
		const text = projected().output;
		for (const dropped of ["EXAMPLE", "blurb", "stand-in", "files", '"data"', '"note"', '"title"'])
			expect(text, dropped).not.toContain(dropped);
	});
	it("rejects an edge that names an unknown node", () => {
		const bad: unknown = JSON.parse(
			readFileSync(`${dir}architecture.json`, "utf8").replace('"to": "b"', '"to": "zzz"'),
		);
		expect(buildDataset(dataset, { "architecture.json": bad }, ctx).ok).toBe(false);
	});
	it("the committed-file check passes for a fresh build", () => {
		const r = projected();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});

	const dataArb = fc.record({
		schema: fc.constant("architecture/1"),
		groups: fc.array(fc.record({ id: fc.string({ minLength: 1 }), label: fc.string() }), {
			maxLength: 4,
		}),
		nodes: fc.array(
			fc.record({
				id: fc.string({ minLength: 1 }),
				label: fc.string(),
				group: fc.string({ minLength: 1 }),
				x: fc.integer({ min: 0, max: 1000 }),
				y: fc.integer({ min: 0, max: 600 }),
			}),
			{ maxLength: 6 },
		),
		edges: fc.array(
			fc.record({
				from: fc.string({ minLength: 1 }),
				to: fc.string({ minLength: 1 }),
				label: fc.string(),
			}),
			{ maxLength: 6 },
		),
	});
	test.prop([dataArb])("generated valid projections parse and round-trip", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		expect(dataset.projected.parse(JSON.parse(serialise(p)))).toEqual(p);
	});
	test.prop([dataArb])("a single-field corruption fails safeParse", (p) => {
		const cases: unknown[] = [
			{ ...p, schema: "architecture/2" },
			{ ...p, extra: 1 },
			{ ...p, nodes: [{ id: "a", label: "A", group: "g", x: 1, y: 2, blurb: "x" }] },
			{ ...p, edges: [{ from: "a", to: "b", label: "x", data: "y" }] },
			{ ...p, groups: [{ id: "g" }] },
		];
		for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
	});
});
