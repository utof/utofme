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
import { dataset, type ReplayMirageData } from "../../src/lib/article-data/replay_mirage";
import { shapeOf } from "../../src/lib/article-data/types";
import { fact } from "../../src/lib/facts";

const SRC = "replay_head_cs.json";
const FIXTURE = "tests/fixtures/article-sync/replay_mirage/replay_head_cs.json";
const source: unknown = JSON.parse(readFileSync(FIXTURE, "utf8"));
const ctx = { denylist: [] as string[], today: "2026-11-04" };

const looseRound = z.looseObject({
	map: z.looseObject({ name: z.string() }),
	players: z.array(z.looseObject({ pid: z.number() })),
	sees: z.array(z.array(z.array(z.number()))),
});
const looseSource = z.looseObject({ rounds: z.array(looseRound) });

function projectedText(src: unknown = source) {
	const r = buildDataset(dataset, { [SRC]: src }, ctx);
	if (!r.ok) throw new Error(JSON.stringify(r.problems));
	return r;
}
const projectedValue = (): ReplayMirageData =>
	dataset.projected.parse(JSON.parse(projectedText().output));

const asRecord = z.record(z.string(), z.unknown());
const asArray = z.array(z.unknown());

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
	const arr = asArray.safeParse(v);
	if (arr.success) {
		for (const x of arr.data) allKeys(x, out);
		return out;
	}
	const rec = asRecord.safeParse(v);
	if (rec.success) {
		for (const [k, x] of Object.entries(rec.data)) {
			out.add(k);
			allKeys(x, out);
		}
	}
	return out;
}

describe("replay_mirage dataset (AC3.1, AC5.6)", () => {
	it("is named replay_mirage with a 10 KB cap and the whitelist key set", () => {
		expect(dataset.name).toBe("replay_mirage");
		expect(dataset.schemaId).toBe("replay_mirage/1");
		expect(dataset.maxGzip).toBe(10 * 1024);
		expect(shapeOf(dataset)).toEqual({
			schema: "replay_mirage/1",
			keys: [
				"bomb",
				"endReason",
				"events",
				"fire",
				"firstContactTick",
				"map",
				"nTicks",
				"players",
				"schema",
				"sees",
				"smoke",
				"tickS",
				"winner",
			],
		});
	});

	it("the source schema accepts the hand-cut source fixture", () => {
		expect(dataset.sources[SRC]?.safeParse(source).success).toBe(true);
	});

	it("the projection's key set equals the spec row exactly, at every level", () => {
		const out = projectedValue();
		expect(Object.keys(out).sort()).toEqual([...shapeOf(dataset).keys]);
		expect(Object.keys(out.map).sort()).toEqual(["name", "rows"]);
		expect(Object.keys(out.bomb).sort()).toEqual(["c", "planted", "r"]);
		expect(out.players).toHaveLength(10);
		for (const p of out.players) {
			expect(Object.keys(p).sort()).toEqual([
				"alive",
				"blind",
				"c",
				"gait",
				"hp",
				"r",
				"side",
				"yaw",
			]);
		}
	});

	it("AC5.6: no brain, seed, pid, team, source or about key anywhere in the output", () => {
		const keys = allKeys(JSON.parse(projectedText().output));
		for (const k of [
			"brain",
			"seed",
			"pid",
			"team",
			"source",
			"about",
			"capabilities",
			"d4",
			"size",
		]) {
			expect(keys.has(k), k).toBe(false);
		}
		const text = projectedText().output;
		for (const s of ["EXAMPLE", "g5line", "notes/"]) expect(text, s).not.toContain(s);
	});

	it("AC5.6: a source round that is not de_mirage is rejected", () => {
		const bad = looseSource.parse(JSON.parse(readFileSync(FIXTURE, "utf8")));
		const [round] = bad.rounds;
		if (!round) throw new Error("fixture has no round");
		const dust = { ...bad, rounds: [{ ...round, map: { ...round.map, name: "de_dust2" } }] };
		const r = buildDataset(dataset, { [SRC]: dust }, ctx);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.problems[0]?.code).toBe(1);
			expect(r.problems[0]?.where).toBe("$.rounds[0].map.name");
		}
	});

	it("uses round 0 only and keeps the map name and rows", () => {
		const out = projectedValue();
		expect(out.map.name).toBe("de_mirage");
		expect(out.map.rows).toHaveLength(28);
		expect(out.map.rows.join("")).toMatch(/a/);
		expect(out.map.rows.join("")).toMatch(/b/);
		expect(out.tickS).toBe(0.8);
		expect(out.nTicks).toBe(73);
		expect(out.winner).toBe("T");
		expect(out.endReason).toBe("bomb");
	});

	it("players are in pid order with one value per tick", () => {
		const out = projectedValue();
		expect(out.players.map((p) => p.side)).toEqual(
			[..."CCCCCTTTTT"].map((s) => (s === "C" ? "CT" : "T")),
		);
		for (const p of out.players) {
			for (const k of ["r", "c", "yaw", "hp", "alive", "gait", "blind"] as const) {
				expect(p[k], k).toHaveLength(out.nTicks);
			}
		}
	});

	it("events keep only the listed kinds as [tick, kind, pid, pid2, r, c]", () => {
		const out = projectedValue();
		const kinds = new Set(out.events.map((e) => e[1]));
		expect([...kinds].sort()).toEqual([
			"damage",
			"defuse_start",
			"kill",
			"plant",
			"plant_start",
			"round_end",
			"throw",
		]);
		expect(out.events.filter((e) => e[1] === "kill")).toHaveLength(fact("replay.kills").v);
		for (const e of out.events) expect(e).toHaveLength(6);
		const ticks = out.events.map((e) => e[0]);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
	});

	it("sees holds cross-team pairs only and firstContactTick is the first non-empty tick", () => {
		const out = projectedValue();
		const side = out.players.map((p) => p.side);
		expect(out.sees).toHaveLength(out.nTicks);
		for (const pairs of out.sees) {
			for (const [a, b] of pairs) expect(side[a]).not.toBe(side[b]);
		}
		const first = out.sees.findIndex((p) => p.length > 0);
		expect(out.firstContactTick).toBe(first);
		expect(out.firstContactTick).toBe(9);
		// The fact the caption prints is computed from the same tick (FACTS replay.contact.s).
		expect(out.firstContactTick * out.tickS).toBeCloseTo(fact("replay.contact.s").v, 6);
	});

	it("keeps the same-team pairs out even though the source has them", () => {
		const sees = looseSource.parse(source).rounds[0]?.sees ?? [];
		const total = sees.reduce((n, p) => n + p.length, 0);
		const kept = projectedValue().sees.reduce((n, p) => n + p.length, 0);
		expect(kept).toBeLessThan(total);
		expect(kept).toBeGreaterThan(0);
	});

	it("smoke and fire are per-tick flat tile indices inside the grid; one smoke appears", () => {
		const out = projectedValue();
		expect(out.smoke).toHaveLength(out.nTicks);
		expect(out.fire).toHaveLength(out.nTicks);
		for (const t of [...out.smoke, ...out.fire]) for (const i of t) expect(i).toBeLessThan(28 * 28);
		expect(out.smoke.findIndex((s) => s.length > 0)).toBe(28);
		expect(out.fire.every((f) => f.length === 0)).toBe(true);
	});

	it("stays under the 10 KB gzip cap", () => {
		const r = projectedText();
		expect(r.sidecar.gzipBytes).toBeLessThanOrEqual(10 * 1024);
		expect(r.sidecar.sources).toEqual([SRC]);
	});

	it("the committed-file check passes for a fresh build", () => {
		const r = projectedText();
		expect(
			checkDataset(dataset, { output: r.output, sidecar: serialise(r.sidecar), denylist: [] }),
		).toEqual([]);
	});

	it("a second build of the same source is byte-identical (AC3.7)", () => {
		expect(projectedText().output).toBe(projectedText().output);
	});
});

const nTicksArb = fc.integer({ min: 1, max: 6 });
const dataArb: fc.Arbitrary<ReplayMirageData> = nTicksArb
	.chain((n) => {
		const series = <T>(arb: fc.Arbitrary<T>) => fc.array(arb, { minLength: n, maxLength: n });
		const player = (side: "CT" | "T") =>
			fc.record({
				side: fc.constant(side),
				r: series(fc.integer({ min: 0, max: 27 })),
				c: series(fc.integer({ min: 0, max: 27 })),
				yaw: series(fc.constantFrom(0, 45, 90, 135, 180, 225, 270, 315)),
				hp: series(fc.integer({ min: 0, max: 4 })),
				alive: series(fc.constantFrom<0 | 1>(0, 1)),
				gait: series(fc.integer({ min: 0, max: 2 })),
				blind: series(fc.constantFrom(0, 1)),
			});
		const tiles = fc.array(fc.array(fc.integer({ min: 0, max: 783 }), { maxLength: 4 }), {
			minLength: n,
			maxLength: n,
		});
		return fc.record({
			schema: fc.constant("replay_mirage/1" as const),
			map: fc.constant({
				name: "de_mirage" as const,
				rows: Array.from({ length: 28 }, (_, r) => (r % 2 ? "#a".repeat(14) : ".b".repeat(14))),
			}),
			tickS: fc.constant(0.8 as const),
			nTicks: fc.constant(n),
			winner: fc.constantFrom("T" as const, "CT" as const),
			endReason: fc.constantFrom("bomb", "defuse", "elimination"),
			firstContactTick: fc.integer({ min: 0, max: n - 1 }),
			players: fc
				.tuple(
					player("CT"),
					player("CT"),
					player("CT"),
					player("CT"),
					player("CT"),
					player("T"),
					player("T"),
					player("T"),
					player("T"),
					player("T"),
				)
				.map((t) => [...t]),
			events: fc.array(
				fc.tuple(
					fc.integer({ min: 0, max: n - 1 }),
					fc.constantFrom(
						"damage",
						"kill",
						"throw",
						"plant_start",
						"plant",
						"defuse_start",
						"defuse",
						"round_end",
					),
					fc.integer({ min: -1, max: 9 }),
					fc.integer({ min: -1, max: 9 }),
					fc.integer({ min: 0, max: 27 }),
					fc.integer({ min: 0, max: 27 }),
				),
				{ maxLength: 5 },
			),
			smoke: tiles,
			fire: tiles,
			sees: fc.array(
				fc.array(fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 5, max: 9 })), {
					maxLength: 3,
				}),
				{ minLength: n, maxLength: n },
			),
			bomb: fc.record({
				planted: series(fc.constantFrom<0 | 1>(0, 1)),
				r: series(fc.integer({ min: 0, max: 27 })),
				c: series(fc.integer({ min: 0, max: 27 })),
			}),
		});
	})
	.map((d) => ({
		// Why: `firstContactTick` is derived, so the generated `sees` must agree with it.
		...d,
		sees: d.sees.map((pairs, t) => {
			if (t < d.firstContactTick) return [];
			return t === d.firstContactTick && pairs.length === 0 ? [[0, 5] as [number, number]] : pairs;
		}),
	}));

describe("replay_mirage projected schema", () => {
	test.prop([dataArb])("generated valid projections parse and round-trip serialisation", (p) => {
		expect(dataset.projected.safeParse(p).success).toBe(true);
		const back: ReplayMirageData = dataset.projected.parse(JSON.parse(serialise(p)));
		expect(back).toEqual(p);
		expect(serialise(p)).toBe(serialise(JSON.parse(serialise(p))));
	});

	test.prop([dataArb, fc.nat()])("a single-field corruption fails safeParse", (p, k) => {
		const at = (i: number) => ({
			...p,
			players: p.players.map((x, j) => (j === i % 10 ? { ...x, r: x.r.slice(1) } : x)),
		});
		const cases: unknown[] = [
			{ ...p, schema: "replay_mirage/2" },
			{ ...p, extra: 1 },
			{ ...p, brain: "x" },
			{ ...p, map: { ...p.map, name: "de_dust2" } },
			{ ...p, map: { ...p.map, size: 28 } },
			{ ...p, tickS: 0.5 },
			{ ...p, winner: "draw" },
			{ ...p, players: p.players.slice(1) },
			{ ...p, players: p.players.map((x, j) => (j === k % 10 ? { ...x, pid: j } : x)) },
			{ ...p, players: p.players.map((x, j) => (j === k % 10 ? { ...x, team: 1 } : x)) },
			at(k),
			{ ...p, events: [[0, "reload", 0, 0, 1, 1]] },
			{ ...p, events: [[0, "kill", 0, 1, 1]] },
			{ ...p, smoke: [[784], ...p.smoke.slice(1)] },
			{ ...p, sees: [[[0, 1, 2]], ...p.sees.slice(1)] },
			{ ...p, bomb: { ...p.bomb, extra: 1 } },
			{ ...p, sees: [[[0, 1]], ...p.sees.slice(1)] },
			{ ...p, firstContactTick: p.firstContactTick + 1 },
		];
		for (const c of cases) expect(dataset.projected.safeParse(c).success).toBe(false);
	});

	it("serialisation of a synthetic 73-tick round stays near the cap's order of magnitude", () => {
		expect(
			gzipBytes(serialise({ a: Array.from({ length: 5000 }, (_, i) => i % 28) })),
		).toBeLessThan(10 * 1024);
	});
});
