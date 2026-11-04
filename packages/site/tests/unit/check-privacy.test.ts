import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/check-privacy.ts");
const SITE = "packages/site";

function tree(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "privacy-"));
	for (const [rel, text] of Object.entries(files)) {
		const p = join(root, SITE, rel);
		mkdirSync(dirname(p), { recursive: true });
		writeFileSync(p, text);
	}
	mkdirSync(join(root, SITE), { recursive: true });
	return root;
}

function run(root: string, args: string[], denylist = "") {
	const r = spawnSync("bun", ["run", SCRIPT, "--root", root, ...args], {
		cwd: join(root, SITE),
		env: {
			PATH: process.env["PATH"] ?? "",
			HOME: process.env["HOME"] ?? "",
			PRIVACY_DENYLIST: denylist,
		},
		encoding: "utf8",
	});
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("check-privacy CLI", () => {
	it("exits 0 on a clean tree and warns without the denylist", () => {
		const root = tree({ "src/data/article/a.json": '{"schema":"a/1","n":[1,2]}' });
		const r = run(root, []);
		expect(r.code).toBe(0);
		expect(r.out).toMatch(/PRIVACY_DENYLIST/);
	});
	it("exits 2 on a CGNAT address and names the rule and file, not the text", () => {
		const root = tree({ "src/data/article/a.json": '{"host":"100.64.0.1"}' });
		const r = run(root, []);
		expect(r.code).toBe(2);
		expect(r.out).toMatch(/cgnat/);
		expect(r.out).toMatch(/src\/data\/article\/a\.json/);
		expect(r.out).not.toContain("100.64.0.1");
	});
	it("applies the denylist from the env and never prints the word", () => {
		const root = tree({ "src/data/article/a.json": '{"note":"a zorblax here"}' });
		expect(run(root, []).code).toBe(0);
		const r = run(root, [], "zorblax\n");
		expect(r.code).toBe(2);
		expect(r.out).not.toContain("zorblax");
	});
	it("--require-denylist exits 4 with an empty env", () => {
		const root = tree({ "src/data/article/a.json": "{}" });
		expect(run(root, ["--require-denylist"]).code).toBe(4);
		expect(run(root, ["--require-denylist"], "zorblax").code).toBe(0);
	});
	it("applies shipped rules to article data but only core rules to article-meta", () => {
		const root = tree({
			"src/data/article/a.json": '{"p":"local-only/x"}',
			"src/data/article-meta/b.json": '{"p":"local-only/x"}',
		});
		const r = run(root, []);
		expect(r.code).toBe(2);
		expect(r.out).toMatch(/article\/a\.json/);
		expect(r.out).not.toMatch(/article-meta/);
	});
	it("--dist scans every dist/_astro/*.json, referenced or not, and other text as core", () => {
		const root = tree({
			"dist/_astro/orphan.abc.json": '{"x":"192.0.2.7"}',
			"dist/index.html": "<p>fine</p>",
		});
		const r = run(root, ["--dist", join(root, SITE, "dist")]);
		expect(r.code).toBe(2);
		expect(r.out).toMatch(/dist\/_astro\/orphan\.abc\.json/);
		expect(r.out).toMatch(/ipv4/);
	});
	it("--dist scans the article route with the shipped rules", () => {
		const root = tree({ "dist/works/tactical-arena/index.html": "<p>see local-only/notes</p>" });
		const r = run(root, ["--dist", join(root, SITE, "dist")]);
		expect(r.code).toBe(2);
		expect(r.out).toMatch(/internal-path/);
		const ok = tree({ "dist/other/index.html": "<p>see local-only/notes</p>" });
		expect(run(ok, ["--dist", join(ok, SITE, "dist")]).code).toBe(0);
	});
	it("scans explicit paths and skips excluded fixtures", () => {
		const root = tree({
			"tests/fixtures/privacy/x.json": '{"h":"192.0.2.7"}',
			"src/data/article/a.json": '{"h":"192.0.2.7"}',
		});
		expect(run(root, ["tests/fixtures/privacy/x.json"]).code).toBe(0);
		expect(run(root, ["src/data/article/a.json"]).code).toBe(2);
	});
});
