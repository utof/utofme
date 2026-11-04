import { readFileSync } from "node:fs";
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	classifyPath,
	parseDenylist,
	RULE_IDS,
	type RuleSet,
	scanJson,
	scanText,
} from "../../scripts/lib/privacy-scan-core";

const fx = (name: string): string => readFileSync(`tests/fixtures/privacy/${name}`, "utf8");
type Case = { set: RuleSet; json?: boolean; pos: string; neg: string };
const rules = JSON.parse(fx("rules.json")) as Record<string, Case>;
const denylist = parseDenylist(fx("denylist.txt"));

const ids = (f: ReadonlyArray<{ rule: string }>): string[] => f.map((x) => x.rule);

describe("rule fixtures", () => {
	it("covers every rule id", () => {
		expect(Object.keys(rules).sort()).toEqual([...RULE_IDS].sort());
	});
	for (const [id, c] of Object.entries(rules)) {
		const scan = (s: string) =>
			c.json ? scanJson({ v: s }, "shipped", denylist) : scanText(s, "shipped", denylist);
		it(`${id}: positive hits, negative is clean`, () => {
			expect(ids(scan(c.pos))).toContain(id);
			expect(ids(scan(c.neg))).not.toContain(id);
		});
	}
	it("json-only rules do not fire on plain text", () => {
		for (const id of ["credential-word", "lane-name", "hex-rev"]) {
			expect(ids(scanText(rules[id]?.pos ?? "", "shipped", denylist))).not.toContain(id);
		}
	});
	it("cgnat is reported instead of ipv4 for 100.64/10", () => {
		expect(ids(scanText("100.64.0.1", "core", denylist))).toEqual(["cgnat"]);
		expect(ids(scanText("0.0.0.0", "core", denylist))).toEqual([]);
	});
});

describe("rule sets", () => {
	it("core excludes the shipped rules", () => {
		expect(ids(scanText("local-only/x GitHub release", "core", denylist))).toEqual([]);
	});
	it("docs checks only denylist and email", () => {
		const t = "192.0.2.7 /home/x a@example.invalid zorblax";
		expect(ids(scanText(t, "docs", denylist)).sort()).toEqual(["denylist", "email"]);
	});
});

describe("denylist", () => {
	it("hits in prose, a path, a hyphenated host-like token, a JSON key and a word pair", () => {
		expect(ids(scanText("Some Zorblax prose", "core", denylist))).toContain("denylist");
		expect(ids(scanText("/srv/data/quuxington/x", "core", denylist))).toContain("denylist");
		expect(ids(scanText("a-zorblax-box.example", "core", denylist))).toContain("denylist");
		expect(ids(scanJson({ zorblax_id: 1 }, "core", denylist))).toContain("denylist");
		expect(ids(scanText("the Two   Words here", "core", denylist))).toContain("denylist");
	});
	it("is silent for an empty denylist and clean text", () => {
		expect(scanText("zorblax", "core", [])).toEqual([]);
		expect(scanText("nothing", "core", denylist)).toEqual([]);
	});
	it("messages never contain the matched text", () => {
		const f = scanJson({ k: "zorblax 192.0.2.7 a@example.invalid" }, "shipped", denylist);
		expect(f.length).toBeGreaterThan(0);
		for (const x of f) {
			const s = JSON.stringify(x).toLowerCase();
			for (const bad of ["zorblax", "192.0.2.7", "example.invalid"]) expect(s).not.toContain(bad);
		}
	});
	test.prop([fc.string(), fc.nat()])("a token inserted anywhere is detected", (s, n) => {
		const at = s.length === 0 ? 0 : n % (s.length + 1);
		const text = `${s.slice(0, at)} zorblax ${s.slice(at)}`;
		expect(ids(scanText(text, "docs", denylist))).toContain("denylist");
	});
	it("parseDenylist drops blanks and comments and lower-cases", () => {
		expect(parseDenylist("# c\n\n  Foo Bar \nBAZ\n")).toEqual(["foo bar", "baz"]);
	});
});

describe("raw-like records", () => {
	const rec = JSON.parse(fx("raw-records.json")) as { raw: unknown; projection: unknown };
	it("raw hits and the projection is clean", () => {
		const raw = ids(scanJson(rec.raw, "shipped", denylist));
		for (const id of ["internal-path", "transfer", "lane-name", "hex-rev", "cgnat"])
			expect(raw).toContain(id);
		expect(scanJson(rec.projection, "shipped", denylist)).toEqual([]);
	});
	it("reports JSON paths", () => {
		const f = scanJson({ a: [{ b: "192.0.2.7" }] }, "core", []);
		expect(f).toEqual([{ rule: "ipv4", where: "$.a[0].b" }]);
	});
});

describe("classifyPath (scope table)", () => {
	const c = classifyPath;
	it("shipped", () => {
		for (const p of [
			"packages/site/src/data/article/maps_cs.json",
			"packages/site/src/content/works/tactical-arena.mdx",
			"packages/site/src/components/article/NBlock.astro",
			"packages/site/src/lib/figures/x.ts",
			"packages/site/dist/works/tactical-arena/index.html",
			"packages/site/dist/_astro/maps_cs.abc.json",
		])
			expect(c(p), p).toBe("shipped");
	});
	it("core", () => {
		for (const p of [
			"packages/site/src/data/article-meta/facts.json",
			"packages/site/src/lib/article-data/maps_cs.ts",
			"packages/site/tests/fixtures/article/sight_parity.json",
			"packages/site/tests/fixtures/article-sync/notes/a.json",
			"packages/site/dist/index.html",
		])
			expect(c(p), p).toBe("core");
	});
	it("docs", () => {
		for (const p of [
			"packages/specs/specs/10-tactical-arena-article.md",
			"packages/specs/plans/10-x.md",
			"packages/specs/reports/10-d1.md",
			"packages/specs/adrs/0055-privacy-scan.md",
		])
			expect(c(p), p).toBe("docs");
	});
	it("excluded or out of scope", () => {
		expect(c("packages/site/tests/fixtures/privacy/rules.json")).toBe("excluded");
		expect(c("packages/site/scripts/lib/privacy-scan-core.ts")).toBe("excluded");
		expect(c("packages/specs/adrs/0049-x.md")).toBeUndefined();
		expect(c("packages/site/src/pages/index.astro")).toBeUndefined();
	});
});
