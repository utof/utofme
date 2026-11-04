import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/sync-article-data.ts");
const FX = join(process.cwd(), "tests/fixtures/article-sync");
const MODULES = join(FX, "modules");

function tmp(prefix: string): string {
	return mkdtempSync(join(tmpdir(), `sync-${prefix}-`));
}
function notesCopy(): string {
	const d = tmp("notes");
	cpSync(join(FX, "notes"), d, { recursive: true });
	return d;
}
function run(site: string, args: string[], env: Record<string, string> = {}) {
	const r = spawnSync("bun", ["run", SCRIPT, "--site-root", site, "--modules", MODULES, ...args], {
		cwd: process.cwd(),
		env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "", ...env },
		encoding: "utf8",
	});
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
const read = (site: string, rel: string): string => readFileSync(join(site, rel), "utf8");
const sidecarShape = z.looseObject({
	schema: z.string(),
	sources: z.array(z.string()),
	sha256: z.string(),
});
const factsShape = z.object({ schema: z.string(), facts: z.record(z.string(), z.looseObject({})) });
const OUT = (n: string) => `src/data/article/${n}.json`;
const SIDE = (n: string) => `src/data/article-meta/sources/${n}.json`;
const FACTS = "src/data/article-meta/facts.json";

function snapshot(site: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const rel of [OUT("tiny"), OUT("other"), SIDE("tiny"), SIDE("other"), FACTS]) {
		if (existsSync(join(site, rel))) out[rel] = read(site, rel);
	}
	return out;
}

describe("sync (write mode)", () => {
	it("discovers every module in the folder, writes outputs, sidecars and facts", () => {
		const site = tmp("site");
		const r = run(site, ["--from", join(FX, "notes")]);
		expect(r.code).toBe(0);
		expect(read(site, OUT("tiny"))).toBe(
			'{"items":[{"id":"b","v":2},{"id":"a","v":1.5}],"schema":"tiny/1"}\n',
		);
		expect(read(site, OUT("other"))).toBe(
			'{"label":"six and a half","schema":"other/1","total":6.5}\n',
		);
		const side = sidecarShape.parse(JSON.parse(read(site, SIDE("other"))));
		expect(side).toMatchObject({ schema: "other/1", sources: ["other_a.json", "other_b.json"] });
		expect(side.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(Object.keys(side).sort()).toEqual(
			["bytes", "gzipBytes", "schema", "sha256", "sources", "syncedAt"].sort(),
		);
	});
	it("facts: drops src and unknown fields, sorts keys", () => {
		const site = tmp("site");
		expect(run(site, ["--from", join(FX, "notes")]).code).toBe(0);
		const text = read(site, FACTS);
		expect(text).not.toMatch(/src|extra|EXAMPLE/);
		const parsed = factsShape.parse(JSON.parse(text));
		expect(parsed.schema).toBe("facts/1");
		expect(Object.keys(parsed.facts)).toEqual([
			"agents.b28.holder",
			"elo.head.block2",
			"tempo.pros.contact.median",
		]);
		expect(parsed.facts["agents.b28.holder"]).toEqual({
			v: 58.2,
			digits: 0,
			unit: "%",
			measuredOn: { line: "5v5", block: 28, date: "2026-11-02" },
		});
	});
	it("a second run changes nothing (idempotent, syncedAt kept)", () => {
		const site = tmp("site");
		run(site, ["--from", join(FX, "notes")]);
		const first = snapshot(site);
		const second = run(site, ["--from", join(FX, "notes")]);
		expect(second.code).toBe(0);
		expect(snapshot(site)).toEqual(first);
		expect(second.out).toMatch(/unchanged/);
	});
	it("takes the notes folder from UTOFME_ARTICLE_DATA when --from is absent", () => {
		const site = tmp("site");
		expect(run(site, [], { UTOFME_ARTICLE_DATA: join(FX, "notes") }).code).toBe(0);
		expect(existsSync(join(site, OUT("tiny")))).toBe(true);
	});
	it("without --from and without the env var it exits 4", () => {
		expect(run(tmp("site"), []).code).toBe(4);
	});
	it("--only writes just the named datasets and leaves facts alone", () => {
		const site = tmp("site");
		expect(run(site, ["--from", join(FX, "notes"), "--only", "tiny"]).code).toBe(0);
		expect(Object.keys(snapshot(site)).sort()).toEqual([OUT("tiny"), SIDE("tiny")].sort());
		const both = tmp("site");
		run(both, ["--from", join(FX, "notes"), "--only", "other", "facts"]);
		expect(Object.keys(snapshot(both)).sort()).toEqual([FACTS, OUT("other"), SIDE("other")].sort());
	});
	it("--only with an unknown name exits 1", () => {
		const r = run(tmp("site"), ["--from", join(FX, "notes"), "--only", "nope"]);
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/nope/);
	});
	it("a missing source file is exit 4 and names the file", () => {
		const notes = notesCopy();
		writeFileSync(join(notes, "other_b.json"), "");
		const missing = tmp("notes");
		cpSync(join(FX, "notes", "tiny_src.json"), join(missing, "tiny_src.json"));
		const r = run(tmp("site"), ["--from", missing, "--only", "tiny", "other"]);
		expect(r.code).toBe(4);
		expect(r.out).toMatch(/other_a\.json/);
		expect(r.out).toMatch(/other_b\.json/);
	});
	it("a schema error is exit 1 with the file and JSON path, never the value", () => {
		const notes = notesCopy();
		writeFileSync(
			join(notes, "tiny_src.json"),
			JSON.stringify({ note: "n", items: [{ id: "a", v: "LEAKY", src: "s" }] }),
		);
		const site = tmp("site");
		const r = run(site, ["--from", notes, "--only", "tiny"]);
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/tiny_src\.json at \$\.items\[0\]\.v/);
		expect(r.out).not.toContain("LEAKY");
		expect(existsSync(join(site, OUT("tiny")))).toBe(false);
	});
	it("a source that is not JSON is exit 1", () => {
		const notes = notesCopy();
		writeFileSync(join(notes, "tiny_src.json"), "{oops");
		expect(run(tmp("site"), ["--from", notes, "--only", "tiny"]).code).toBe(1);
	});
	it("a privacy hit is exit 2 with the rule id, never the text, and writes nothing", () => {
		const notes = notesCopy();
		writeFileSync(
			join(notes, "tiny_src.json"),
			JSON.stringify({ note: "n", items: [{ id: "100.64.0.1", v: 1, src: "s" }] }),
		);
		const site = tmp("site");
		const r = run(site, ["--from", notes, "--only", "tiny"]);
		expect(r.code).toBe(2);
		expect(r.out).toMatch(/cgnat/);
		expect(r.out).not.toContain("100.64.0.1");
		expect(existsSync(join(site, OUT("tiny")))).toBe(false);
	});
	it("applies PRIVACY_DENYLIST from the env to datasets and facts", () => {
		const notes = notesCopy();
		writeFileSync(
			join(notes, "tiny_src.json"),
			JSON.stringify({ note: "n", items: [{ id: "zorblax", v: 1, src: "s" }] }),
		);
		const r = run(tmp("site"), ["--from", notes, "--only", "tiny"], {
			PRIVACY_DENYLIST: "zorblax",
		});
		expect(r.code).toBe(2);
		expect(r.out).not.toContain("zorblax");
		const facts = notesCopy();
		writeFileSync(
			join(facts, "facts.json"),
			JSON.stringify({
				schema: "facts/1",
				facts: { "a.b": { v: 1, digits: 0, alt: "zorblax", src: "s" } },
			}),
		);
		const f = run(tmp("site"), ["--from", facts, "--only", "facts"], {
			PRIVACY_DENYLIST: "zorblax",
		});
		expect(f.code).toBe(2);
		expect(f.out).not.toContain("zorblax");
	});
	it("a facts file with a bad key or interval is exit 1", () => {
		const notes = notesCopy();
		writeFileSync(
			join(notes, "facts.json"),
			JSON.stringify({ schema: "facts/1", facts: { "Bad.Key": { v: 1, digits: 0, src: "s" } } }),
		);
		expect(run(tmp("site"), ["--from", notes, "--only", "facts"]).code).toBe(1);
	});
});

describe("--check (no notes repo needed)", () => {
	function synced() {
		const site = tmp("site");
		run(site, ["--from", join(FX, "notes")]);
		return site;
	}
	it("exits 0 on freshly synced files", () => {
		const r = run(synced(), ["--check"]);
		expect(r.code).toBe(0);
	});
	it("exits 3 for a tampered output, a missing output or an orphan output", () => {
		const a = synced();
		writeFileSync(join(a, OUT("tiny")), read(a, OUT("tiny")).replace("1.5", "1.6"));
		expect(run(a, ["--check"]).code).toBe(3);

		const b = synced();
		writeFileSync(join(b, OUT("other")), "");
		expect([1, 3]).toContain(run(b, ["--check"]).code);

		const c = synced();
		rmSync(join(c, OUT("other")));
		const rc = run(c, ["--check"]);
		expect(rc.code).toBe(3);
		expect(rc.out).toMatch(/other\.json/);

		const d = synced();
		writeFileSync(join(d, "src/data/article/stray.json"), '{"schema":"stray/1"}\n');
		const rd = run(d, ["--check"]);
		expect(rd.code).toBe(3);
		expect(rd.out).toMatch(/stray\.json/);
	});
	it("exits 1 when a committed output no longer parses, 2 on a privacy hit", () => {
		const a = synced();
		writeFileSync(join(a, OUT("tiny")), '{"items":[{"id":1,"v":2}],"schema":"tiny/1"}\n');
		const ra = run(a, ["--check"]);
		expect(ra.code).toBe(1);
		expect(ra.out).toMatch(/\$\.items\[0\]\.id/);

		const b = synced();
		writeFileSync(
			join(b, OUT("tiny")),
			'{"items":[{"id":"100.64.0.1","v":2}],"schema":"tiny/1"}\n',
		);
		const rb = run(b, ["--check"]);
		expect(rb.out).toMatch(/cgnat/);
		expect(rb.out).not.toContain("100.64.0.1");
	});
	it("checks facts.json: a leftover `src` field fails (1), a missing file fails (3)", () => {
		const a = synced();
		const facts = factsShape.parse(JSON.parse(read(a, FACTS)));
		const withSrc = {
			...facts,
			facts: { ...facts.facts, "elo.head.block2": { v: 1, digits: 0, src: "FACTS.md:1" } },
		};
		writeFileSync(join(a, FACTS), JSON.stringify(withSrc));
		expect(run(a, ["--check"]).code).toBe(1);

		const b = synced();
		rmSync(join(b, FACTS));
		expect(run(b, ["--check"]).code).toBe(3);
	});
	it("--check --only checks just that dataset (no orphan scan)", () => {
		const a = synced();
		writeFileSync(join(a, "src/data/article/stray.json"), "{}\n");
		expect(run(a, ["--check", "--only", "tiny"]).code).toBe(0);
	});
	it("an empty site with modules but no outputs fails (3)", () => {
		const site = tmp("site");
		mkdirSync(join(site, "src/data/article"), { recursive: true });
		expect(run(site, ["--check"]).code).toBe(3);
		expect(readdirSync(join(site, "src/data/article"))).toEqual([]);
	});
});
