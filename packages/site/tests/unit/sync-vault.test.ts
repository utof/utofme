/**
 * Why: the sync script is destructive (deletes-not-visited). Unit tests
 * exercise it against the in-repo fixture vault but write to a tempdir,
 * then assert the resulting tree by walking it. Idempotency + dry-run +
 * collision behaviour are all asserted.
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 */

import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { runSync } from "../../scripts/sync-vault.ts";

const VAULT = join(__dirname, "..", "fixtures", "vault");
let dest: string;

beforeEach(async () => {
	dest = await mkdtemp(join(tmpdir(), "sync-vault-"));
	await mkdir(join(dest, "_assets"), { recursive: true });
});

describe("runSync", () => {
	it("copies only publish:true notes", async () => {
		await runSync({ vaultPath: VAULT, dest, dryRun: false });
		const entries = await readdir(dest);
		expect(entries.sort()).toContain("published-1.mdx");
		expect(entries.sort()).toContain("published-2.mdx");
		expect(entries).not.toContain("private.mdx");
		expect(entries).not.toContain("untagged.mdx");
	});

	it("skips .obsidian/", async () => {
		await runSync({ vaultPath: VAULT, dest, dryRun: false });
		const entries = await readdir(dest);
		expect(entries).not.toContain("workspace.json");
		expect(entries).not.toContain(".obsidian");
	});

	it("mirrors referenced images into _assets/", async () => {
		await runSync({ vaultPath: VAULT, dest, dryRun: false });
		const assets = await readdir(join(dest, "_assets"));
		expect(assets).toContain("fig.png");
	});

	it("is idempotent (running twice leaves the same tree)", async () => {
		await runSync({ vaultPath: VAULT, dest, dryRun: false });
		const a = (await readdir(dest)).sort();
		await runSync({ vaultPath: VAULT, dest, dryRun: false });
		const b = (await readdir(dest)).sort();
		expect(b).toEqual(a);
	});

	it("deletes files in dest that are not visited this run", async () => {
		await writeFile(join(dest, "stale.mdx"), "---\ntitle: Stale\n---\n", "utf8");
		await runSync({ vaultPath: VAULT, dest, dryRun: false });
		const entries = await readdir(dest);
		expect(entries).not.toContain("stale.mdx");
	});

	it("dry-run leaves dest untouched", async () => {
		await writeFile(join(dest, "stale.mdx"), "---\ntitle: Stale\n---\n", "utf8");
		const summary = await runSync({ vaultPath: VAULT, dest, dryRun: true });
		const entries = await readdir(dest);
		expect(entries).toContain("stale.mdx"); // not deleted
		expect(entries).not.toContain("published-1.mdx"); // not written
		expect(summary.wouldWrite).toBeGreaterThan(0);
		expect(summary.wouldDelete).toBeGreaterThan(0);
	});
});
