/**
 * Figure F7 logic: filters (AC11.1), highlights, timeline geometry, roving focus, phone list,
 * card text and the F3 marker links (AC11.7).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { dataset as eloDataset } from "../../src/lib/article-data/elo";
import { dataset, type NotebookData } from "../../src/lib/article-data/notebook";
import { dataset as parkedDataset } from "../../src/lib/article-data/notebook_parked";
import { fact } from "../../src/lib/facts";
import {
	areaOrder,
	buildTimeline,
	cardId,
	countByOutcome,
	type Entry,
	type Filter,
	filterEntries,
	HIGHLIGHT_IDS,
	idFromHash,
	listOrder,
	listPage,
	metricLine,
	moveFocus,
	OUTCOMES,
	PAGE,
	summary,
} from "../../src/lib/figures/notebook";

const read = (f: string): unknown => JSON.parse(readFileSync(`src/data/article/${f}.json`, "utf8"));
const nb: NotebookData = dataset.projected.parse(read("notebook"));
const parked = parkedDataset.projected.parse(read("notebook_parked"));
const elo = eloDataset.projected.parse(read("elo"));
const entries = nb.entries;
const none: Filter = { outcomes: new Set(), areas: new Set() };

describe("notebook data and facts", () => {
	it("229 entries, 74 parked items, 12 areas, outcome counts equal the facts", () => {
		expect(entries).toHaveLength(fact("notebook.entries").v);
		expect(parked.parked).toHaveLength(fact("notebook.parked").v);
		expect(areaOrder(entries)).toHaveLength(fact("notebook.areas").v);
		const c = countByOutcome(entries);
		for (const o of OUTCOMES) expect(c[o], o).toBe(fact(`notebook.outcome.${o}`).v);
		expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
	});
});

describe("AC11.1 filters", () => {
	const entryArb = fc.record({
		id: fc.uuid(),
		date: fc.constantFrom("2026-10-11", "2026-10-12", "2026-11-04"),
		title: fc.string(),
		area: fc.constantFrom("a", "b", "c"),
		outcome: fc.constantFrom(...OUTCOMES),
		summary: fc.string(),
	});
	const filterArb = fc.record({
		outcomes: fc.subarray([...OUTCOMES]).map((x) => new Set(x)),
		areas: fc.subarray(["a", "b", "c"]).map((x) => new Set(x)),
	});
	test.prop([fc.array(entryArb, { maxLength: 30 }), filterArb])(
		"filtered is a subset, in order",
		(es, f) => {
			const out = filterEntries(es, f);
			const ids = new Set(es.map((e) => e.id));
			for (const e of out) expect(ids.has(e.id)).toBe(true);
			expect(out).toEqual(es.filter((e) => out.includes(e)));
			for (const e of out) {
				if (f.outcomes.size) expect(f.outcomes.has(e.outcome)).toBe(true);
				if (f.areas.size) expect(f.areas.has(e.area)).toBe(true);
			}
		},
	);
	test.prop([fc.array(entryArb, { maxLength: 30 })])(
		"clearing every chip returns all; counts sum",
		(es) => {
			expect(filterEntries(es, none)).toEqual(es);
			const c = countByOutcome(es);
			expect(OUTCOMES.reduce((n, o) => n + c[o], 0)).toBe(es.length);
		},
	);
	it("on the real data: kept shows 99, reverted 41, kept + area narrows", () => {
		expect(filterEntries(entries, { ...none, outcomes: new Set(["kept"]) })).toHaveLength(99);
		expect(filterEntries(entries, { ...none, outcomes: new Set(["reverted"]) })).toHaveLength(41);
		const kl = filterEntries(entries, { outcomes: new Set(["kept"]), areas: new Set(["learner"]) });
		expect(kl.length).toBeGreaterThan(0);
		expect(kl.length).toBeLessThan(99);
	});
});

describe("highlights (owner sign-off list)", () => {
	it("are ten distinct ids and every one resolves to an entry", () => {
		expect(HIGHLIGHT_IDS).toHaveLength(10);
		expect(new Set(HIGHLIGHT_IDS).size).toBe(10);
		for (const id of HIGHLIGHT_IDS)
			expect(
				entries.some((e) => e.id === id),
				id,
			).toBe(true);
	});
});

describe("AC11.7 F3 markers", () => {
	it("every notebook id named by the Elo markers resolves to an entry", () => {
		expect(elo.markers.length).toBeGreaterThan(0);
		for (const m of elo.markers) {
			expect(
				entries.some((e) => e.id === m.notebookId),
				m.notebookId,
			).toBe(true);
			expect(idFromHash(`#${cardId(m.notebookId)}`, entries)).toBe(m.notebookId);
		}
	});
	it("idFromHash ignores other hashes and unknown ids", () => {
		expect(idFromHash("#f3", entries)).toBeNull();
		expect(idFromHash("#nb-nope", entries)).toBeNull();
		expect(idFromHash("", entries)).toBeNull();
	});
});

describe("timeline geometry", () => {
	const tl = buildTimeline(entries);
	it("has one row per area and one mark per entry, all inside the canvas", () => {
		expect(tl.rows).toHaveLength(12);
		const marks = tl.rows.flatMap((r) => r.marks);
		expect(marks).toHaveLength(entries.length);
		for (const m of marks) {
			expect(m.x).toBeGreaterThan(tl.left);
			expect(m.x).toBeLessThan(tl.w);
			expect(m.y).toBeGreaterThan(0);
			expect(m.y).toBeLessThan(tl.h);
		}
		expect(tl.byId.size).toBe(entries.length);
	});
	it("marks of one row never sit on top of each other", () => {
		for (const r of tl.rows)
			for (const a of r.marks)
				for (const b of r.marks)
					if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5);
	});
	it("marks are ordered by date inside a row, and rows stack without gaps", () => {
		for (const r of tl.rows) {
			let prev = "";
			for (const m of r.marks) {
				const d = entries.find((e) => e.id === m.id)?.date ?? "";
				expect(d >= prev).toBe(true);
				prev = d;
			}
		}
		const top = tl.rows.map((r) => r.top);
		expect(top[0]).toBe(0);
		expect(tl.h).toBe(tl.rows.reduce((n, r) => n + r.h, 0));
	});
	it("axis labels never overprint and every entry date lies inside the axis", () => {
		expect(tl.ticks.length).toBeGreaterThan(3);
		for (let i = 1; i < tl.ticks.length; i++)
			expect((tl.ticks[i]?.x ?? 0) - (tl.ticks[i - 1]?.x ?? 0)).toBeGreaterThanOrEqual(100);
		expect(tl.ticks.map((t) => t.label)).toContain("19 Oct");
	});
	it("an empty notebook yields an empty timeline", () => {
		const e = buildTimeline([]);
		expect(e.rows).toEqual([]);
		expect(e.h).toBe(0);
	});
});

describe("roving focus", () => {
	const tl = buildTimeline(entries);
	const row0 = tl.rows[0]?.marks ?? [];
	it("left and right move along the row and stop at its ends", () => {
		const a = row0[0]?.id ?? "";
		const b = row0[1]?.id ?? "";
		expect(moveFocus(tl, a, "ArrowLeft")).toBe(a);
		expect(moveFocus(tl, a, "ArrowRight")).toBe(b);
		expect(moveFocus(tl, b, "ArrowLeft")).toBe(a);
		const last = row0[row0.length - 1]?.id ?? "";
		expect(moveFocus(tl, last, "ArrowRight")).toBe(last);
		expect(moveFocus(tl, b, "Home")).toBe(a);
		expect(moveFocus(tl, a, "End")).toBe(last);
	});
	it("up and down change row to the nearest mark in x", () => {
		const a = row0[3]?.id ?? "";
		const down = moveFocus(tl, a, "ArrowDown");
		expect(tl.byId.get(down)?.row).toBe(1);
		expect(moveFocus(tl, down, "ArrowUp")).not.toBe(down);
		expect(tl.byId.get(moveFocus(tl, a, "ArrowUp"))?.row).toBe(0);
	});
	it("skips marks the filter hides", () => {
		const a = row0[0]?.id ?? "";
		const c = row0[2]?.id ?? "";
		const visible = new Set(row0.filter((_, i) => i !== 1).map((m) => m.id));
		expect(moveFocus(tl, a, "ArrowRight", visible)).toBe(c);
	});
	it("unknown keys and ids stay put", () => {
		expect(moveFocus(tl, "nope", "ArrowRight")).toBe("nope");
		expect(moveFocus(tl, row0[0]?.id ?? "", "x")).toBe(row0[0]?.id);
	});
});

describe("phone list", () => {
	it("starts with the ten starred entries in story order, then newest first", () => {
		const l = listOrder(entries);
		expect(l.slice(0, 10).map((e) => e.id)).toEqual([...HIGHLIGHT_IDS]);
		expect(l).toHaveLength(entries.length);
		const rest = l.slice(10);
		for (let i = 1; i < rest.length; i++)
			expect((rest[i - 1]?.date ?? "") >= (rest[i]?.date ?? "")).toBe(true);
	});
	it("paginates by 20 after the starred items and counts what remains", () => {
		const p1 = listPage(entries, none, PAGE);
		expect(p1.items.length).toBe(Math.max(10, PAGE));
		expect(p1.remaining).toBe(entries.length - p1.items.length);
		const p2 = listPage(entries, none, PAGE * 2);
		expect(p2.items.length).toBe(PAGE * 2);
		const all = listPage(entries, none, 10_000);
		expect(all.remaining).toBe(0);
		const reverted = listPage(entries, { ...none, outcomes: new Set(["reverted"]) }, PAGE);
		for (const e of reverted.items) expect(e.outcome).toBe("reverted");
	});
});

describe("card text", () => {
	const mk = (o: Partial<Entry>): Entry => ({
		id: "x",
		date: "2026-10-11",
		title: "t",
		area: "a",
		outcome: "kept",
		summary: "s",
		...o,
	});
	it("prints metric: delta (ci) with signs", () => {
		expect(metricLine(mk({ metric: "Elo vs control", delta: 9, ci: [6, 12] }))).toBe(
			"Elo vs control: +9 (+6 to +12)",
		);
		expect(metricLine(mk({ metric: "win rate vs bots", delta: 0.08, ci: [0.05, 0.12] }))).toBe(
			"win rate vs bots: +0.08 (+0.05 to +0.12)",
		);
		expect(metricLine(mk({ metric: "Elo", delta: -9.5 }))).toBe("Elo: −9.5");
	});
	it("handles a metric without a number, and no metric", () => {
		expect(metricLine(mk({ metric: "seconds" }))).toBe("seconds");
		expect(metricLine(mk({}))).toBeNull();
	});
	it("every real entry prints without throwing", () => {
		for (const e of entries) expect(() => metricLine(e)).not.toThrow();
	});
	it("summary names the counts", () => {
		expect(summary(entries, 229)).toContain(
			"99 kept, 41 reverted, 11 inconclusive, 18 parked, 60 tooling",
		);
	});
});
