/**
 * Figure F6 logic: copy coverage (AC10.3), the stage walk, geometry, keyboard rule and privacy.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { dataset } from "../../src/lib/article-data/architecture";
import { fact } from "../../src/lib/facts";
import {
	arrowGeom,
	DEFAULT_STAGE,
	EDGE_COPY,
	edgeId,
	edgeName,
	groupBoxes,
	layoutFor,
	NODE_COPY,
	neighbourInDirection,
	readingOrder,
	readout,
	receives,
	STAGES,
	sends,
	stageIndex,
	summary,
	VERTICAL_POS,
	wrapLabel,
} from "../../src/lib/figures/machine";

const data = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/architecture.json", "utf8")),
);
const nodeIds = data.nodes.map((n) => n.id);
const edgeIds = data.edges.map(edgeId);

describe("machine copy (AC10.3)", () => {
	it("the data has 18 boxes, 27 arrows, 7 groups and unique edge ids", () => {
		expect(data.nodes).toHaveLength(18);
		expect(data.edges).toHaveLength(27);
		expect(data.groups).toHaveLength(7);
		expect(new Set(edgeIds).size).toBe(27);
	});
	it("every node and edge id has copy and no copy key lacks an id", () => {
		expect(Object.keys(NODE_COPY).sort()).toEqual([...nodeIds].sort());
		expect(Object.keys(EDGE_COPY).sort()).toEqual([...edgeIds].sort());
		expect(Object.keys(VERTICAL_POS).sort()).toEqual([...nodeIds].sort());
	});
	it("has 9 stages whose boxes and arrows exist, and stage 4 is the default", () => {
		expect(STAGES).toHaveLength(9);
		expect(DEFAULT_STAGE).toBe(3);
		expect(STAGES[DEFAULT_STAGE]?.title).toBe("Train");
		for (const s of STAGES) {
			expect(s.text.length).toBeGreaterThan(20);
			for (const n of s.nodes) expect(nodeIds).toContain(n);
			for (const e of s.edges) expect(edgeIds).toContain(e);
		}
	});
	it("the training-loop sentence agrees with the facts", () => {
		const sentence = EDGE_COPY["env>train"];
		expect(sentence).toContain(`${fact("train.batch.games").v} games`);
		expect(sentence).toContain(`${fact("train.batch.steps").v} steps`);
		expect(sentence).toContain(`${fact("train.decisions.update").v.toFixed(2)} M`);
		expect(STAGES[3]?.text).toContain(`${fact("train.batch.games").v} games`);
	});
	it("uses generic compute words and names no file, path or transfer mechanism", () => {
		const all = [
			...Object.values(NODE_COPY),
			...Object.values(EDGE_COPY),
			...STAGES.flatMap((s) => [s.title, s.text]),
		].join("\n");
		expect(all).not.toMatch(
			/\.(py|pkl|npz|json|sh|md|tgz)\b|\w\/\w+\.|\\|release|github|journal|isaac|vboxuser/i,
		);
		expect(all).toContain("friend's RTX 2080 Ti");
		expect(all).toContain("desktop GTX 1660 Ti");
		expect(all).toContain("my laptop");
		expect(all).toContain("small cloud budget");
		expect(EDGE_COPY["queue>gpus"]).toBe("The job is shipped to the GPU machine.");
	});
});

describe("machine behaviour", () => {
	it("stageIndex clamps instead of wrapping", () => {
		expect(stageIndex(-3)).toBe(0);
		expect(stageIndex(4)).toBe(4);
		expect(stageIndex(99)).toBe(8);
	});
	test.prop([fc.integer({ min: -50, max: 50 })])("stageIndex is always a valid stage", (i) => {
		expect(STAGES[stageIndex(i)]).toBeDefined();
	});
	it("Next x9 from the default reaches stage 9 and Previous returns", () => {
		let i = DEFAULT_STAGE;
		for (let k = 0; k < 9; k++) i = stageIndex(i + 1);
		expect(i + 1).toBe(9);
		for (let k = 0; k < 9; k++) i = stageIndex(i - 1);
		expect(i + 1).toBe(1);
	});
	it("receives and sends list arrow labels", () => {
		expect(receives(data, "train")).toEqual([
			"observations",
			"opponents",
			"warm start",
			"GPU time",
		]);
		expect(sends(data, "train")).toEqual(["actions", "checkpoints"]);
		expect(sends(data, "v2d")).toEqual([]);
		const r = readout(data, { kind: "node", id: "v2d" }, 0);
		expect(r.sends).toBe("Sends: nothing");
		expect(r.receives).toBe("Receives: replays");
	});
	it("readout falls back to the stage and handles edges", () => {
		expect(readout(data, null, 3).title).toBe("4. Train");
		const e = readout(data, { kind: "edge", id: "env>train" }, 0);
		expect(e.text).toContain("1.31 M decisions");
		expect(e.title).toContain("Env core (JAX)");
		expect(readout(data, { kind: "node", id: "nope" }, 0).title).toBe("1. Write the job");
	});
	it("reading order is column by column", () => {
		const order = readingOrder(data);
		expect(order).toHaveLength(18);
		expect(order[0]).toBe("gen");
		expect(order.indexOf("env")).toBeLessThan(order.indexOf("train"));
		expect(order.indexOf("train")).toBeLessThan(order.indexOf("tour"));
	});
	it("arrows leave and enter at box borders, and reverse pairs bend apart", () => {
		const layout = layoutFor(data, "wide");
		const fwd = arrowGeom(layout, { from: "env", to: "train" }, true);
		const back = arrowGeom(layout, { from: "train", to: "env" }, true);
		expect(fwd?.d).toContain("Q");
		expect(fwd?.d).not.toBe(back?.d);
		const straight = arrowGeom(layout, { from: "gen", to: "env" }, false);
		expect(straight?.d.startsWith("M")).toBe(true);
		expect(straight?.d).toContain("L");
		expect(arrowGeom(layout, { from: "gen", to: "zzz" }, false)).toBeNull();
	});
	it("arrow keys step to the connected box in that direction", () => {
		const layout = layoutFor(data, "wide");
		expect(neighbourInDirection(data, layout, "env", "ArrowRight")).toBe("train");
		expect(neighbourInDirection(data, layout, "train", "ArrowLeft")).toBe("env");
		expect(["gen", "csmaps", "prodemo"]).toContain(
			neighbourInDirection(data, layout, "env", "ArrowLeft"),
		);
		expect(neighbourInDirection(data, layout, "env", "ArrowDown")).toBe("bots");
		expect(neighbourInDirection(data, layout, "env", "x")).toBeNull();
		expect(neighbourInDirection(data, layout, "v2d", "ArrowDown")).toBeNull();
	});
	it("the vertical layout fits its canvas without overlapping boxes", () => {
		const l = layoutFor(data, "narrow");
		const ps = Object.values(l.pos);
		for (const p of ps) {
			expect(p.x - l.boxW / 2).toBeGreaterThanOrEqual(0);
			expect(p.x + l.boxW / 2).toBeLessThanOrEqual(l.w);
			expect(p.y + l.boxH / 2).toBeLessThanOrEqual(l.h);
		}
		for (const a of ps)
			for (const b of ps)
				if (a !== b)
					expect(Math.abs(a.x - b.x) >= l.boxW || Math.abs(a.y - b.y) >= l.boxH).toBe(true);
	});
	it("the wide layout has no overlapping boxes either", () => {
		const l = layoutFor(data, "wide");
		const ps = Object.values(l.pos);
		for (const a of ps)
			for (const b of ps)
				if (a !== b)
					expect(Math.abs(a.x - b.x) >= l.boxW || Math.abs(a.y - b.y) >= l.boxH).toBe(true);
	});
	it("summary names the counts and the stage", () => {
		expect(summary(data, 3)).toBe(
			"Diagram of 18 boxes in 7 groups joined by 27 arrows. Stage 4 of 9, Train, is highlighted.",
		);
	});
	it("wrapLabel keeps short labels and balances long ones over two lines", () => {
		expect(wrapLabel("Checkpoints", 20)).toEqual(["Checkpoints"]);
		expect(wrapLabel("Map generator v1/v2/v3", 16)).toEqual(["Map generator", "v1/v2/v3"]);
		for (const n of data.nodes)
			for (const line of wrapLabel(n.label, 20)) expect(line.length).toBeLessThanOrEqual(24);
	});
	it("group backdrops contain their boxes and stay inside the canvas", () => {
		const l = layoutFor(data, "wide");
		const boxes = groupBoxes(data, l);
		expect(boxes).toHaveLength(7);
		for (const g of boxes) {
			expect(g.x).toBeGreaterThanOrEqual(0);
			expect(g.x + g.w).toBeLessThanOrEqual(l.w);
			expect(g.y).toBeGreaterThanOrEqual(0);
			expect(g.y + g.h).toBeLessThanOrEqual(l.h);
		}
	});
	it("edgeName reads from → to", () => {
		const e = data.edges[0];
		expect(e && edgeName(data, e)).toContain(": from ");
	});
});
