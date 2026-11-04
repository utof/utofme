import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	createFacts,
	FACT_KEY,
	factEntrySchema,
	factsSchema,
	factsSourceSchema,
	measuredOnText,
} from "../../src/lib/facts";

const NBSP = " ";
const MINUS = "−";

const entry = (over: Record<string, unknown> = {}) => ({ v: 1, digits: 0, ...over });
const file = (facts: Record<string, unknown>) => ({ schema: "facts/1", facts });

describe("key pattern", () => {
	it("accepts dotted lower-case keys", () => {
		for (const k of ["elo.head.block2", "tempo.pros.contact.median", "a.b_c", "x1.y2"]) {
			expect(FACT_KEY.test(k), k).toBe(true);
		}
	});
	it("rejects everything else", () => {
		for (const k of ["a", "A.b", "a..b", "a.b-c", "a.B", ".a.b", "a.b.", "a b.c", "a.b\n"]) {
			expect(FACT_KEY.test(k), JSON.stringify(k)).toBe(false);
		}
	});
});

describe("factsSchema (facts/1, the shipped file: no `src`)", () => {
	it("accepts a minimal and a full entry", () => {
		const full = entry({
			unit: "s",
			sign: true,
			alt: "about 23 s",
			lo: 0.5,
			hi: 2,
			measuredOn: { line: "5v5", block: 28, date: "2026-11-02" },
		});
		expect(factsSchema.safeParse(file({ "a.b": entry(), "c.d": full })).success).toBe(true);
		expect(
			factsSchema.safeParse(
				file({ "c.d": entry({ measuredOn: { line: "3v3", date: "2026-10-25" } }) }),
			).success,
		).toBe(true);
	});
	it("rejects the wrong schema id, bad keys and unknown fields (src is dropped by the sync)", () => {
		expect(factsSchema.safeParse({ schema: "facts/2", facts: {} }).success).toBe(false);
		expect(factsSchema.safeParse(file({ "Bad.key": entry() })).success).toBe(false);
		expect(factsSchema.safeParse(file({ "a.b": entry({ src: "FACTS.md:1" }) })).success).toBe(
			false,
		);
		expect(factsSchema.safeParse({ ...file({}), extra: 1 }).success).toBe(false);
	});
	it("rejects broken fields, each at its own path", () => {
		const bad: Array<[Record<string, unknown>, string]> = [
			[{ digits: 7 }, "digits"],
			[{ digits: -1 }, "digits"],
			[{ digits: 1.5 }, "digits"],
			[{ v: "1" }, "v"],
			[{ unit: "" }, "unit"],
			[{ sign: "yes" }, "sign"],
			[{ alt: "" }, "alt"],
			[{ measuredOn: { line: "4v4", date: "2026-11-02" } }, "measuredOn"],
			[{ measuredOn: { line: "5v5", date: "11/02/2026" } }, "measuredOn"],
			[{ measuredOn: { line: "5v5", date: "2026-11-02", host: "x" } }, "measuredOn"],
		];
		for (const [over, path] of bad) {
			const r = factsSchema.safeParse(file({ "a.b": entry(over) }));
			expect(r.success, JSON.stringify(over)).toBe(false);
			if (!r.success) expect(r.error.issues[0]?.path.slice(0, 3)).toEqual(["facts", "a.b", path]);
		}
	});
	it("an interval needs both ends around v", () => {
		const parse = (o: Record<string, unknown>) => factEntrySchema.safeParse(entry({ v: 5, ...o }));
		expect(parse({ lo: 4, hi: 6 }).success).toBe(true);
		expect(parse({ lo: 5, hi: 5 }).success).toBe(true);
		expect(parse({ lo: 4 }).success).toBe(false);
		expect(parse({ hi: 6 }).success).toBe(false);
		expect(parse({ lo: 6, hi: 7 }).success).toBe(false);
		expect(parse({ lo: 3, hi: 4 }).success).toBe(false);
	});
});

describe("factsSourceSchema (notes file: `src` required)", () => {
	it("requires a non-empty src on every entry", () => {
		expect(factsSourceSchema.safeParse(file({ "a.b": entry({ src: "FACTS.md:1" }) })).success).toBe(
			true,
		);
		expect(factsSourceSchema.safeParse(file({ "a.b": entry() })).success).toBe(false);
		expect(factsSourceSchema.safeParse(file({ "a.b": entry({ src: "" }) })).success).toBe(false);
	});
});

const valid = fc.record(
	{
		v: fc.integer({ min: -1000, max: 1000 }),
		digits: fc.integer({ min: 0, max: 6 }),
		unit: fc.constantFrom("s", "%", "m"),
		sign: fc.boolean(),
		alt: fc.string({ minLength: 1, maxLength: 12 }),
		measuredOn: fc.record({
			line: fc.constantFrom("5v5", "3v3"),
			date: fc.constantFrom("2026-10-25", "2026-11-02"),
		}),
	},
	{ requiredKeys: ["v", "digits"] },
);

describe("factEntrySchema properties", () => {
	test.prop([valid])("valid entries parse", (e) => {
		expect(factEntrySchema.safeParse(e).success).toBe(true);
	});
	test.prop([valid, fc.constantFrom("v", "digits")])("a corrupted core field fails", (e, k) => {
		expect(factEntrySchema.safeParse({ ...e, [k]: "x" }).success).toBe(false);
	});
	test.prop([valid, fc.string({ minLength: 1 })])("an unknown field fails", (e, k) => {
		fc.pre(!["v", "digits", "unit", "sign", "alt", "lo", "hi", "measuredOn"].includes(k));
		expect(factEntrySchema.safeParse({ ...e, [k]: 1 }).success).toBe(false);
	});
});

describe("createFacts", () => {
	const facts = createFacts(
		file({
			"elo.head.block2": entry({ v: 96, sign: true, lo: 94, hi: 98 }),
			"tempo.pros.contact.median": entry({
				v: 22.8,
				digits: 1,
				unit: "s",
				lo: 22.14,
				hi: 23.63,
				alt: "about 23 s",
			}),
			"tempo.pros.plant.median": entry({ v: 74.65, digits: 1, unit: "s" }),
			"sight.grid.extra": entry({ v: 14.6, digits: 1, unit: "%", alt: "1 in 7" }),
			"elo.3v3.to5v5": entry({ v: -94, sign: true }),
			"net.params": entry({ v: 706080 }),
			"agents.b28.holder": entry({
				v: 58.2,
				unit: "%",
				measuredOn: { line: "5v5", block: 28, date: "2026-11-02" },
			}),
			"util.agent.grenades": entry({
				v: 0.905,
				digits: 1,
				measuredOn: { line: "3v3", date: "2026-10-25" },
			}),
		}),
	);

	it("rejects an invalid file at creation", () => {
		expect(() => createFacts({ schema: "facts/1", facts: { "A.b": entry() } })).toThrow();
	});
	it("fact(key) returns the entry with its key; an unknown key throws", () => {
		expect(facts.fact("elo.head.block2")).toMatchObject({ key: "elo.head.block2", v: 96, lo: 94 });
		expect(() => facts.fact("no.such.key")).toThrow(/unknown fact key "no\.such\.key"/);
		expect(() => facts.fact("constructor")).toThrow(/unknown fact key/);
		expect(() => facts.fact("to.string")).toThrow(/unknown fact key/);
	});
	it("prints at the stored digits, with sign and grouping, never rounding further", () => {
		expect(facts.formatFact("elo.head.block2")).toBe("+96");
		expect(facts.formatFact("elo.3v3.to5v5")).toBe(`${MINUS}94`);
		expect(facts.formatFact("tempo.pros.plant.median")).toBe(`74.7${NBSP}s`);
		expect(facts.formatFact("tempo.pros.contact.median")).toBe(`22.8${NBSP}s`);
		expect(facts.formatFact("net.params")).toBe("706,080");
		expect(facts.formatFact("sight.grid.extra")).toBe(`14.6${NBSP}%`);
		expect(facts.formatFact("agents.b28.holder")).toBe(`58${NBSP}%`);
		expect(facts.formatFact("util.agent.grenades")).toBe("0.9");
	});
	it("ci appends the interval at the fact's digits (signed facts keep the plus signs)", () => {
		expect(facts.formatFact("elo.head.block2", { ci: true })).toBe("+96 (+94 to +98)");
		expect(facts.formatFact("tempo.pros.contact.median", { ci: true })).toBe(
			`22.8${NBSP}s (22.1 to 23.6)`,
		);
	});
	it("ci without an interval and alt without wording are build errors", () => {
		expect(() => facts.formatFact("net.params", { ci: true })).toThrow(/interval/);
		expect(() => facts.formatFact("net.params", { alt: true })).toThrow(/approved wording/);
	});
	it("alt prints the approved wording", () => {
		expect(facts.formatFact("sight.grid.extra", { alt: true })).toBe("1 in 7");
		expect(facts.formatFact("tempo.pros.contact.median", { alt: true })).toBe("about 23 s");
	});
	it("describes where an agent-vs-pro number was measured", () => {
		expect(measuredOnText({ line: "5v5", block: 28, date: "2026-11-02" })).toBe(
			"block 28 (5v5), 2026-11-02",
		);
		expect(measuredOnText({ line: "3v3", date: "2026-10-25" })).toBe("the 3v3 line, 2026-10-25");
	});
});
