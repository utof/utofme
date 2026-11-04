// @vitest-environment node
/**
 * F1 logic (AC5.1, AC5.4): first contact, fog, ghosts, markers, interpolation, status text,
 * keyframe ticks and the autoplay state machine.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	buildFog,
	contactSight,
	firstContactTick,
	initialPlayback,
	keyframeTicks,
	markers,
	type Playback,
	type PlaybackAction,
	playerName,
	poseAt,
	type ReplayLike,
	reducePlayback,
	scrubFraction,
	statusLine,
	visiblePairs,
} from "../../src/lib/figures/replay";

const NBSP = " ";
const real = JSON.parse(readFileSync("src/data/article/replay_mirage.json", "utf8")) as ReplayLike;

/** A tiny synthetic round: 4 players (CT 0,1; T 2,3). */
function tiny(over: Partial<ReplayLike> = {}): ReplayLike {
	const n = 4;
	const flat = (v: number) => Array.from({ length: n }, () => v);
	const player = (side: "CT" | "T", r: number, c: number) => ({
		side,
		r: flat(r),
		c: flat(c),
		yaw: flat(0),
		alive: flat(1),
	});
	return {
		nTicks: n,
		firstContactTick: 1,
		players: [player("CT", 1, 1), player("CT", 2, 2), player("T", 5, 5), player("T", 6, 6)],
		events: [],
		sees: [[], [[0, 2]], [], []],
		smoke: [[], [], [], []],
		fire: [[], [], [], []],
		bomb: { planted: flat(0) },
		winner: "T",
		endReason: "bomb",
		...over,
	};
}

describe("firstContactTick (AC5.1)", () => {
	it("is the first tick with a cross-team pair and ignores same-team pairs", () => {
		const sides = ["CT", "CT", "T", "T"];
		expect(firstContactTick([[], [[0, 1]], [[2, 0]], [[0, 2]]], sides)).toBe(2);
		expect(firstContactTick([[], [[0, 1]], [[2, 3]]], sides)).toBeNull();
		expect(firstContactTick([], sides)).toBeNull();
	});
	it("on the real round it is tick 9, i.e. 7.2 s", () => {
		expect(real.firstContactTick).toBe(9);
		const sides = real.players.map((p) => p.side);
		expect(firstContactTick(real.sees, sides)).toBe(9);
		expect(9 * 0.8).toBeCloseTo(7.2, 9);
	});
	test.prop([
		fc.array(fc.array(fc.tuple(fc.nat(3), fc.nat(3)), { maxLength: 3 }), { maxLength: 8 }),
	])("equals the brute-force first tick over generated pair tables", (sees) => {
		const sides = ["CT", "CT", "T", "T"];
		const brute = sees.findIndex((p) => p.some(([a, b]) => sides[a] !== sides[b]));
		expect(firstContactTick(sees, sides)).toBe(brute < 0 ? null : brute);
	});
});

/** Random synthetic rounds for the fog properties: 3 + 3 players over up to 8 ticks. */
const roundArb = fc.integer({ min: 1, max: 8 }).chain((n) => {
	const side = (i: number): "CT" | "T" => (i < 3 ? "CT" : "T");
	const player = (i: number) =>
		fc.record({
			side: fc.constant(side(i)),
			r: fc.array(fc.integer({ min: 0, max: 27 }), { minLength: n, maxLength: n }),
			c: fc.array(fc.integer({ min: 0, max: 27 }), { minLength: n, maxLength: n }),
			yaw: fc.array(fc.constantFrom(0, 90, 180, 270), { minLength: n, maxLength: n }),
			alive: fc.array(fc.constantFrom(0, 1), { minLength: n, maxLength: n }),
		});
	return fc
		.record({
			players: fc.tuple(player(0), player(1), player(2), player(3), player(4), player(5)),
			sees: fc.array(
				fc.array(
					fc.oneof(
						fc.tuple(fc.nat(2), fc.integer({ min: 3, max: 5 })),
						fc.tuple(fc.integer({ min: 3, max: 5 }), fc.nat(2)),
						fc.tuple(fc.nat(2), fc.nat(2)),
					),
					{ maxLength: 4 },
				),
				{ minLength: n, maxLength: n },
			),
		})
		.map(
			(g): ReplayLike => ({
				nTicks: n,
				firstContactTick: 0,
				players: g.players,
				events: [],
				sees: g.sees,
				smoke: Array.from({ length: n }, () => []),
				fire: Array.from({ length: n }, () => []),
				bomb: { planted: Array.from({ length: n }, () => 0) },
				winner: "T",
				endReason: "bomb",
			}),
		);
});

describe("buildFog (AC5.1)", () => {
	test.prop([roundArb])("a team's fog contains every one of its own living players", (d) => {
		const fog = buildFog(d);
		for (const side of ["CT", "T"] as const) {
			for (let t = 0; t < d.nTicks; t++) {
				d.players.forEach((p, pid) => {
					if (p.side === side && p.alive[t] === 1) expect(fog[side][t]?.visible[pid]).toBe(true);
				});
			}
		}
	});

	test.prop([roundArb])("ghosts are hidden living enemies and never currently seen ones", (d) => {
		const fog = buildFog(d);
		for (const side of ["CT", "T"] as const) {
			for (let t = 0; t < d.nTicks; t++) {
				const f = fog[side][t];
				for (const g of f?.ghosts ?? []) {
					expect(d.players[g.pid]?.side).not.toBe(side);
					expect(f?.visible[g.pid]).toBe(false);
					expect(d.players[g.pid]?.alive[t]).toBe(1);
					expect(g.age).toBeGreaterThanOrEqual(1);
				}
			}
		}
	});

	test.prop([roundArb])(
		"a ghost's age grows by one per hidden tick and its place is the last seen",
		(d) => {
			const fog = buildFog(d);
			for (const side of ["CT", "T"] as const) {
				for (let t = 1; t < d.nTicks; t++) {
					const now = fog[side][t]?.ghosts ?? [];
					const before = fog[side][t - 1]?.ghosts ?? [];
					for (const g of now) {
						const prev = before.find((x) => x.pid === g.pid);
						if (prev) {
							expect(g.age).toBe(prev.age + 1);
							expect([g.r, g.c]).toEqual([prev.r, prev.c]);
						}
						const seenAt = t - g.age;
						expect(d.players[g.pid]?.r[seenAt]).toBe(g.r);
						expect(d.players[g.pid]?.c[seenAt]).toBe(g.c);
						expect(fog[side][seenAt]?.visible[g.pid]).toBe(true);
					}
				}
			}
		},
	);

	it("on the real round the defenders lose sight of an attacker and keep a ghost of it", () => {
		const fog = buildFog(real);
		const ghosts = fog.CT.flatMap((f, t) => f.ghosts.map((g) => ({ t, ...g })));
		expect(ghosts.length).toBeGreaterThan(0);
		const g = ghosts[0];
		if (!g) throw new Error("no ghost");
		expect(real.players[g.pid]?.side).toBe("T");
		expect(fog.CT[g.t]?.visible[g.pid]).toBe(false);
		// At first contact somebody on each side is seen by the other.
		expect(fog.CT[9]?.visible.some((v, pid) => v && real.players[pid]?.side === "T")).toBe(true);
	});
});

describe("visiblePairs and contactSight", () => {
	it("All draws every pair; a team draws only its own observers' pairs", () => {
		const d = tiny({
			sees: [
				[],
				[
					[0, 2],
					[3, 1],
				],
				[],
				[],
			],
		});
		expect(visiblePairs(d, "all", 1)).toEqual([
			[0, 2],
			[3, 1],
		]);
		expect(visiblePairs(d, "CT", 1)).toEqual([[0, 2]]);
		expect(visiblePairs(d, "T", 1)).toEqual([[3, 1]]);
	});
	it("the contact sight is the first pair at the first contact tick", () => {
		expect(contactSight(real)).toEqual(real.sees[9]?.[0]);
		expect(contactSight(tiny({ sees: [[], [], [], []] }))).toBeNull();
	});
});

describe("markers", () => {
	const m = markers(real);
	it("lists contact, 7 kills, smoke, plant, two defuse starts and the end, sorted by tick", () => {
		const count = (k: string) => m.filter((x) => x.kind === k).length;
		expect(count("contact")).toBe(1);
		expect(count("kill")).toBe(7);
		expect(count("smoke")).toBe(1);
		expect(count("fire")).toBe(0);
		expect(count("plant")).toBe(1);
		expect(count("defuse")).toBe(2);
		expect(count("end")).toBe(1);
		const ticks = m.map((x) => x.tick);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
		expect(new Set(m.map((x) => x.id)).size).toBe(m.length);
	});
	it("the contact marker is at firstContactTick; smoke onset is the first tick a new area appears", () => {
		expect(m.find((x) => x.kind === "contact")?.tick).toBe(9);
		expect(m.find((x) => x.kind === "smoke")?.tick).toBe(28);
		expect(m.find((x) => x.kind === "plant")?.tick).toBe(32);
		expect(m.find((x) => x.kind === "end")?.tick).toBe(72);
	});
	it("labels name players by side, no ids or ticks", () => {
		const first = m.find((x) => x.kind === "kill");
		expect(first?.label).toBe("Defender 2 eliminates Attacker 1");
		expect(m.find((x) => x.kind === "plant")?.label).toBe("Attacker 4 plants the bomb");
		expect(m.find((x) => x.kind === "end")?.label).toMatch(/attackers win/i);
		for (const x of m) expect(x.label).not.toMatch(/tick|pid/i);
	});
	it("a fire onset is marked as a molotov", () => {
		const fire = real.fire.map((_, t) => (t >= 5 ? [10, 11] : []));
		const withFire = markers({ ...real, fire });
		expect(withFire.filter((x) => x.kind === "fire").map((x) => x.tick)).toEqual([5]);
		expect(withFire.find((x) => x.kind === "fire")?.label).toBe("Molotov fire starts");
	});
	it("a second smoke is another onset", () => {
		const smoke = Array.from({ length: 6 }, (_, t) => (t < 1 ? [] : t < 3 ? [1, 2] : [1, 2, 50]));
		const d = tiny({ nTicks: 6, smoke, sees: [[], [[0, 2]], [], [], [], []] });
		expect(
			markers(d)
				.filter((x) => x.kind === "smoke")
				.map((x) => x.tick),
		).toEqual([1, 3]);
	});
});

describe("playerName", () => {
	it("numbers attackers (T) and defenders (CT) from 1 inside their side", () => {
		const sides = real.players.map((p) => p.side);
		expect(playerName(sides, 0)).toBe("Defender 1");
		expect(playerName(sides, 4)).toBe("Defender 5");
		expect(playerName(sides, 5)).toBe("Attacker 1");
		expect(playerName(sides, 9)).toBe("Attacker 5");
	});
});

describe("poseAt (interpolation)", () => {
	it("is exact on whole ticks and linear in between", () => {
		const p = real.players[0];
		if (!p) throw new Error("no player");
		const a = poseAt(real, 0, 3);
		expect([a.r, a.c]).toEqual([p.r[3], p.c[3]]);
		const mid = poseAt(real, 0, 3.5);
		expect(mid.r).toBeCloseTo(((p.r[3] ?? 0) + (p.r[4] ?? 0)) / 2, 9);
		expect(mid.c).toBeCloseTo(((p.c[3] ?? 0) + (p.c[4] ?? 0)) / 2, 9);
	});
	it("turns the short way round and converts yaw to the screen angle", () => {
		const players = [{ side: "CT" as const, r: [0, 0], c: [0, 0], yaw: [90, 90], alive: [1, 1] }];
		expect(poseAt({ nTicks: 2, players }, 0, 0).angle).toBe(0); // yaw 90 = north
		const turn = [{ side: "CT" as const, r: [0, 0], c: [0, 0], yaw: [45, 315], alive: [1, 1] }];
		// yaw 45 → screen 45, yaw 315 → screen 135; halfway is 90 either way here.
		expect(poseAt({ nTicks: 2, players: turn }, 0, 0.5).angle).toBeCloseTo(90, 9);
		const wrap = [{ side: "CT" as const, r: [0, 0], c: [0, 0], yaw: [100, 80], alive: [1, 1] }];
		// screen 350 → 10: through 0, not through 180.
		const w = poseAt({ nTicks: 2, players: wrap }, 0, 0.5).angle;
		expect(Math.min(w, 360 - w)).toBeLessThan(1e-9);
	});
	it("holds the last place when the player dies on the next tick, and clamps past the end", () => {
		const players = [{ side: "T" as const, r: [4, 8], c: [4, 8], yaw: [0, 0], alive: [1, 0] }];
		const held = poseAt({ nTicks: 2, players }, 0, 0.75);
		expect([held.r, held.c]).toEqual([4, 4]);
		const end = poseAt({ nTicks: 2, players }, 0, 9);
		expect([end.r, end.c]).toEqual([8, 8]);
	});
	test.prop([fc.nat(72), fc.nat(9)])(
		"whole ticks reproduce the data on the real round",
		(t, pid) => {
			const p = real.players[pid];
			const pose = poseAt(real, pid, t);
			expect([pose.r, pose.c]).toEqual([p?.r[t], p?.c[t]]);
		},
	);
});

describe("statusLine", () => {
	it("first contact: time, who is alive, bomb state", () => {
		expect(statusLine(real, 9)).toBe(
			`7.2${NBSP}s · 5 attackers, 5 defenders alive · bomb not planted`,
		);
	});
	it("counts the dead from their kill tick and says who won at the end", () => {
		expect(statusLine(real, 24)).toContain("3 attackers, 5 defenders alive");
		expect(statusLine(real, 25)).toContain("3 attackers, 4 defenders alive");
		expect(statusLine(real, 54)).toContain("bomb planted");
		expect(statusLine(real, 72)).toMatch(/attackers win/i);
	});
	it("a single survivor reads in the singular", () => {
		const d = tiny();
		const players = d.players.map((p, i) => (i === 3 ? { ...p, alive: [1, 1, 0, 0] } : p));
		expect(statusLine({ ...d, players }, 2)).toContain("1 attacker, 2 defenders alive");
	});
});

describe("scrubFraction and keyframeTicks", () => {
	it("maps ticks onto the bar, the pros' 22.8 s marker included", () => {
		expect(scrubFraction(0, 73)).toBe(0);
		expect(scrubFraction(72, 73)).toBe(1);
		expect(scrubFraction(22.8 / 0.8, 73)).toBeCloseTo(0.396, 3);
		expect(scrubFraction(3, 1)).toBe(0);
	});
	it("the strip is 0, first contact, first kill, plant, last kill, last tick", () => {
		expect(keyframeTicks(real)).toEqual([0, 9, 24, 32, 64, 72]);
	});
	it("without a plant the middle frame is the midpoint", () => {
		const d = tiny({
			nTicks: 10,
			events: [
				[3, "kill", 2, 0, 1, 1],
				[6, "kill", 3, 1, 1, 1],
			],
		});
		const t = keyframeTicks(d);
		expect(t).toHaveLength(6);
		expect(t).toEqual([0, 1, 3, 5, 6, 9]);
	});
});

const D = { nTicks: 73, firstContactTick: 9 };
const run = (s: Playback, ...actions: PlaybackAction[]): Playback =>
	actions.reduce((acc, a) => reducePlayback(acc, a, D.nTicks), s);

describe("autoplay state machine (AC5.4)", () => {
	const start = initialPlayback(D);
	it("starts static at first contact, 1×, not playing, autoplay armed", () => {
		expect(start).toEqual({ pos: 9, playing: false, speed: 1, autoplay: "armed" });
	});
	it("starts once, at 1× from the beginning, when at least half is in view and motion is allowed", () => {
		const s = run(start, { type: "visible", ratio: 0.5, paused: false });
		expect(s).toMatchObject({ pos: 0, playing: true, speed: 1, autoplay: "running" });
	});
	it("does not start below half, or under paused motion", () => {
		expect(run(start, { type: "visible", ratio: 0.49, paused: false })).toEqual(start);
		expect(run(start, { type: "visible", ratio: 1, paused: true })).toEqual(start);
	});
	it("advances by dt × speed / 0.8 s and stops at the end; autoplay is then spent for good", () => {
		let s = run(start, { type: "visible", ratio: 1, paused: false });
		s = run(s, { type: "frame", dtMs: 800 });
		expect(s.pos).toBeCloseTo(1, 9);
		s = run(s, { type: "frame", dtMs: 80 });
		expect(s.pos).toBeCloseTo(1.1, 9);
		s = run(s, { type: "frame", dtMs: 1_000_000 });
		expect(s).toMatchObject({ pos: 72, playing: false, autoplay: "spent" });
		expect(run(s, { type: "visible", ratio: 1, paused: false })).toEqual(s);
	});
	it("speed scales the advance", () => {
		const s = run(
			{ ...start, playing: true, pos: 0 },
			{ type: "speed", speed: 2 },
			{ type: "play" },
		);
		expect(run(s, { type: "frame", dtMs: 800 }).pos).toBeCloseTo(2, 9);
	});
	it("any interaction cancels autoplay for good, before or during it", () => {
		for (const a of [
			{ type: "seek", pos: 3 },
			{ type: "speed", speed: 0.5 },
			{ type: "pause" },
			{ type: "play" },
			{ type: "interact" },
		] as const) {
			const before = run(start, a);
			expect(before.autoplay, a.type).toBe("cancelled");
			expect(
				run(before, { type: "visible", ratio: 1, paused: false }).playing === false ||
					a.type === "play",
			).toBe(true);
			const during = run(run(start, { type: "visible", ratio: 1, paused: false }), a);
			expect(during.autoplay, a.type).toBe("cancelled");
			if (a.type !== "play") expect(during.playing, a.type).toBe(false);
		}
	});
	it("Pause motion during playback stops it at once (within one frame)", () => {
		const s = run(
			start,
			{ type: "visible", ratio: 1, paused: false },
			{ type: "frame", dtMs: 400 },
		);
		expect(s.playing).toBe(true);
		const stopped = run(s, { type: "motion", paused: true });
		expect(stopped.playing).toBe(false);
		expect(stopped.pos).toBe(s.pos);
		expect(stopped.autoplay).toBe("cancelled");
		// A user-pressed Play still works afterwards (tick-stepped by the renderer).
		expect(run(stopped, { type: "play" }).playing).toBe(true);
	});
	it("Play at the end restarts from the beginning; seek clamps and rounds to a tick", () => {
		const end = run(start, { type: "seek", pos: 999 });
		expect(end.pos).toBe(72);
		expect(run(end, { type: "play" })).toMatchObject({ pos: 0, playing: true });
		expect(run(start, { type: "seek", pos: -4 }).pos).toBe(0);
		expect(run(start, { type: "seek", pos: 3.6 }).pos).toBe(4);
	});
	test.prop([
		fc.array(
			fc.oneof(
				fc.record({ type: fc.constant("frame" as const), dtMs: fc.integer({ min: 0, max: 3000 }) }),
				fc.record({ type: fc.constant("play" as const) }),
				fc.record({ type: fc.constant("pause" as const) }),
				fc.record({ type: fc.constant("seek" as const), pos: fc.integer({ min: -5, max: 90 }) }),
				fc.record({
					type: fc.constant("visible" as const),
					ratio: fc.double({ min: 0, max: 1, noNaN: true }),
					paused: fc.boolean(),
				}),
				fc.record({ type: fc.constant("motion" as const), paused: fc.boolean() }),
			),
			{ maxLength: 30 },
		),
	])("pos stays inside the round and autoplay never returns to armed", (actions) => {
		let s = start;
		let left = false;
		for (const a of actions) {
			s = reducePlayback(s, a, D.nTicks);
			expect(s.pos).toBeGreaterThanOrEqual(0);
			expect(s.pos).toBeLessThanOrEqual(72);
			if (s.autoplay !== "armed") left = true;
			if (left) expect(s.autoplay).not.toBe("armed");
		}
	});
});
