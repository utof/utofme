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
import { dataset, type EloData, GAME_LABELS, MARKER_SPECS } from "../../src/lib/article-data/elo";
import { shapeOf } from "../../src/lib/article-data/types";

const FILES = [
	"elo_main_line.json",
	"elo_5v5_tournaments.json",
	"elo_3v3_lines.json",
	"ab_results.json",
] as const;
const source: Record<string, unknown> = Object.fromEntries(
	FILES.map((f) => [f, JSON.parse(readFileSync(`tests/fixtures/article-sync/elo/${f}`, "utf8"))]),
);
const ctx = { denylist: [] as string[], today: "2026-11-04" };

function projected() {
	const r = buildDataset(dataset, source, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const out = (): EloData => dataset.projected.parse(JSON.parse(projected().output));

describe("elo dataset (AC3.1)", () => {
	it("is named elo with a 4 KB cap and the whitelist top-level keys", () => {
		expect(dataset.name).toBe("elo");
		expect(dataset.maxGzip).toBe(4096);
		expect(shapeOf(dataset)).toEqual({
			schema: "elo/1",
			keys: ["after28", "compiled", "era3v3", "main", "markers", "schema"],
		});
	});
	it("the source schemas accept the hand-cut fixtures", () => {
		for (const f of FILES) expect(dataset.sources[f]?.safeParse(source[f]).success, f).toBe(true);
	});
	it("the projection's key sets equal the spec row, at every level", () => {
		const o = out();
		const keys = (x: object) => Object.keys(x).sort();
		for (const m of o.main) {
			expect(keys(m)).toEqual(
				keys({ block: 0, hand: 0, gen: 0, chained: 0, ...(m.perSeed ? { perSeed: 0 } : {}) }),
			);
			expect(Object.keys(m.hand).every((k) => ["v", "lo", "hi"].includes(k))).toBe(true);
		}
		for (const c of o.compiled) expect(keys(c)).toEqual(["block", "hi", "lo", "v"]);
		for (const a of o.after28) {
			expect(Object.keys(a).every((k) => ["id", "v", "lo", "hi", "game", "alt"].includes(k))).toBe(
				true,
			);
			if (a.alt) expect(keys(a.alt)).toEqual(["game", "v"]);
		}
		expect(keys(o.era3v3)).toEqual(["seed0", "seed1"]);
		for (const p of [...o.era3v3.seed0, ...o.era3v3.seed1])
			expect(keys(p)).toEqual(["block", "hi", "lo", "v"]);
		for (const m of o.markers)
			expect(keys(m)).toEqual(["abId", "block", "cs", "hi", "lo", "notebookId"]);
	});
	it("main line: per-seed only at blocks 24 and 28, chained blocks 6, 12, 16 carry no interval", () => {
		const o = out();
		expect(o.main.filter((m) => m.perSeed).map((m) => m.block)).toEqual([24, 28]);
		const chained = o.main.filter((m) => m.chained);
		expect(chained.map((m) => m.block)).toEqual([6, 12, 16]);
		for (const m of chained) expect(m.hand.lo).toBeUndefined();
		const head = o.main.find((m) => m.block === 28);
		expect(head).toMatchObject({
			hand: { v: 96, lo: 94, hi: 98 },
			gen: 81,
			perSeed: { s1: 102, s2: 90 },
		});
		expect(o.main[0]).toMatchObject({ block: 2, hand: { v: 0 }, chained: false });
	});
	it("compiled: blocks 2, 10 and 28 from the compiled-maps tournament (block 28 reads +86, 84 to 89)", () => {
		expect(out().compiled).toEqual([
			{ block: 2, v: 0, lo: 0, hi: 0 },
			{ block: 10, v: 55, lo: 52, hi: 57 },
			{ block: 28, v: 86, lo: 84, hi: 89 },
		]);
	});
	it("after28 omits the 3v3 to 5v5 widening and names each segment's game, with the other game", () => {
		const a = out().after28;
		expect(a.map((s) => s.id)).toEqual(["b29-30", "b32-33", "snap", "g6", "crouch"]);
		expect(a.find((s) => s.id === "snap")).toMatchObject({
			v: 29,
			game: "snap game",
			alt: { game: "today's game", v: -15 },
		});
		for (const s of a) expect(s.game).toBe(GAME_LABELS[s.id]);
	});
	it("era 3v3 keeps the CS maps of era A, two seeds", () => {
		const e = out().era3v3;
		expect(e.seed0.length).toBeGreaterThan(0);
		expect(e.seed1.length).toBeGreaterThan(0);
	});
	it("markers: flash arc and bot roles (block 6), flash kick (block 8), with their notebook ids", () => {
		expect(out().markers).toEqual([
			{ abId: "F1", block: 6, cs: -4, lo: -6, hi: -2, notebookId: "p3-flash-arc" },
			{ abId: "F2", block: 6, cs: 2, lo: 1, hi: 4, notebookId: "p3-bot-roles" },
			{ abId: "F4", block: 8, cs: 4, lo: 3, hi: 6, notebookId: "p3-kick-fixed" },
		]);
		expect(MARKER_SPECS.map((m) => m.notebookId)).toEqual(out().markers.map((m) => m.notebookId));
	});
	it("drops run labels, dates, src lines, methods and the notes' text", () => {
		const text = projected().output;
		expect(text).not.toContain('"note"');
		for (const dropped of [
			"run",
			"src",
			"method",
			"readout",
			"headline",
			"caveats",
			"EXAMPLE",
			"g5line",
			"v5a2",
			"runlabel",
			"structured",
		])
			expect(text, dropped).not.toContain(dropped);
	});
	it("stays under the cap and the committed-file check passes", () => {
		const r = projected();
		expect(r.sidecar.gzipBytes).toBeLessThanOrEqual(4096);
		expect(r.sidecar.sources).toEqual([...FILES].sort());
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});
	it("a missing marker row is an error, not a silent drop", () => {
		const ab = z
			.looseObject({ rows: z.array(z.looseObject({ id: z.string() })) })
			.parse(source["ab_results.json"]);
		const bad = {
			...source,
			"ab_results.json": { ...ab, rows: ab.rows.filter((r) => r.id !== "F4") },
		};
		expect(() => dataset.project(bad)).toThrow(/F4/);
	});

	const pt = fc.record({
		block: fc.integer({ min: 1, max: 40 }),
		v: fc.integer({ min: -50, max: 400 }),
		lo: fc.integer({ min: -50, max: 400 }),
		hi: fc.integer({ min: -50, max: 400 }),
	});
	const dataArb = fc.record({
		schema: fc.constant("elo/1"),
		main: fc.array(
			fc.record({
				block: fc.integer({ min: 1, max: 40 }),
				hand: fc.record({ v: fc.integer({ min: -50, max: 400 }) }),
				gen: fc.integer({ min: -50, max: 400 }),
				chained: fc.boolean(),
			}),
			{ maxLength: 12 },
		),
		compiled: fc.array(pt, { maxLength: 3 }),
		after28: fc.array(
			fc.record({
				id: fc.string({ minLength: 1 }),
				v: fc.integer({ min: -50, max: 100 }),
				game: fc.string({ minLength: 1 }),
			}),
			{ maxLength: 6 },
		),
		era3v3: fc.record({
			seed0: fc.array(pt, { maxLength: 4 }),
			seed1: fc.array(pt, { maxLength: 4 }),
		}),
		markers: fc.array(
			fc.record({
				abId: fc.string({ minLength: 1 }),
				block: fc.integer({ min: 1, max: 40 }),
				cs: fc.integer({ min: -9, max: 9 }),
				lo: fc.integer({ min: -9, max: 9 }),
				hi: fc.integer({ min: -9, max: 9 }),
				notebookId: fc.string({ minLength: 1 }),
			}),
			{ maxLength: 3 },
		),
	});
	test.prop([dataArb])("generated valid projections parse and round-trip serialisation", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		expect(dataset.projected.parse(JSON.parse(serialise(p)))).toEqual(p);
		expect(serialise(p)).toBe(serialise(JSON.parse(serialise(p))));
		expect(gzipBytes(serialise(p))).toBeGreaterThan(0);
	});
	test.prop([dataArb])("a single-field corruption fails safeParse", (p) => {
		const cases: unknown[] = [
			{ ...p, schema: "elo/2" },
			{ ...p, extra: 1 },
			{ ...p, main: [{ block: "x", hand: { v: 1 }, gen: 0, chained: false }] },
			{ ...p, main: [{ block: 2, hand: { v: 1, src: "x" }, gen: 0, chained: false }] },
			{ ...p, compiled: [{ block: 2, v: 1 }] },
			{ ...p, markers: [{ abId: "F1", block: 6, cs: 1, lo: 0, hi: 2 }] },
			{ ...p, era3v3: { seed0: [] } },
		];
		for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
	});
});
