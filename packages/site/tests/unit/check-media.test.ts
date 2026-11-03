/**
 * Why: AC4.3 / AC4.4 — `check:media` exits 0 on the committed tree and 5 on a tree with a deleted file,
 * every manifest URL resolves to a file under `public/`, and the CLI needs no ffmpeg or media root for `--check`.
 * @see packages/specs/specs/09-project-view.md § P9-4 (AC4.3, AC4.4)
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { must } from "../../scripts/lib/loops-core";
import manifestJson from "../../src/data/loops.json";
import { loopsManifestSchema } from "../../src/lib/loops/manifest";

const site = resolve(import.meta.dirname, "../..");
const cli = join(site, "scripts/encode-loops.ts");
// Resolve bun once (vitest runs under node; process.execPath is not bun).
const bun = execFileSync("sh", ["-c", "command -v bun"], { encoding: "utf8" }).trim();
const tmps: string[] = [];
afterAll(() => {
	for (const t of tmps) rmSync(t, { recursive: true, force: true });
});

function check(siteRoot: string) {
	// Minimal PATH: proves --check does not need ffmpeg.
	const r = spawnSync(bun, ["run", cli, "--check", "--site-root", siteRoot], {
		env: { PATH: "", HOME: process.env.HOME ?? "" },
		encoding: "utf8",
	});
	return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function copyTree(): string {
	const dir = mkdtempSync(join(tmpdir(), "check-media-"));
	tmps.push(dir);
	cpSync(join(site, "public/loops"), join(dir, "public/loops"), { recursive: true });
	cpSync(join(site, "src/assets/loops"), join(dir, "src/assets/loops"), { recursive: true });
	mkdirSync(join(dir, "src/data"), { recursive: true });
	cpSync(join(site, "src/data/loops.json"), join(dir, "src/data/loops.json"));
	return dir;
}

describe("manifest on the committed tree", () => {
	const manifest = loopsManifestSchema.parse(manifestJson);
	it("every manifest URL resolves to a file under public/ and every poster exists", () => {
		for (const e of Object.values(manifest)) {
			expect(existsSync(join(site, e.posterPath))).toBe(true);
			for (const s of [e.card, e.banner]) {
				for (const src of s?.sources ?? [])
					expect(existsSync(join(site, "public", src.url))).toBe(true);
			}
		}
	});
	it("contains the synthetic fixture loop", () => {
		expect(Object.keys(manifest)).toContain("fixture-testsrc");
	});
});

describe("check:media CLI", () => {
	it("exits 0 on the committed tree without ffmpeg", () => {
		const r = check(site);
		expect(r.out).toContain("check:media ok");
		expect(r.code).toBe(0);
	});
	it("exits 5 when a listed file is deleted", () => {
		const dir = copyTree();
		const d = join(dir, "public/loops/fixture-testsrc");
		const victim = must(
			readdirSync(d).find((f) => f.endsWith(".h264.mp4")),
			"h264 file",
		);
		unlinkSync(join(d, victim));
		const r = check(dir);
		expect(r.code).toBe(5);
		expect(r.out).toContain("missing");
	});
	it("exits 5 on an orphan and on a byte mismatch", () => {
		const dir = copyTree();
		writeFileSync(join(dir, "public/loops/fixture-testsrc/card.00000000.av1.mp4"), "x");
		expect(check(dir).out).toContain("orphan");
		const dir2 = copyTree();
		const d2 = join(dir2, "public/loops/fixture-testsrc");
		const f = must(
			readdirSync(d2).find((n) => n.startsWith("card.") && n.endsWith(".av1.mp4")),
			"card av1 file",
		);
		writeFileSync(join(d2, f), "tampered");
		const r = check(dir2);
		expect(r.code).toBe(5);
		expect(r.out).toMatch(/bytes|hash/);
	});
	it("exits 1 on a malformed manifest", () => {
		const dir = copyTree();
		writeFileSync(join(dir, "src/data/loops.json"), '{"x": 1}');
		expect(check(dir).code).toBe(1);
	});
});
