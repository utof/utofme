/**
 * check-docs: repo-local `@see` targets must exist on disk (#95).
 *
 * Why: a forward-reference to a not-yet-written ADR passed the doc gate silently.
 * @see packages/site/scripts/check-docs.ts
 * @see https://github.com/utof/utofme/issues/95
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function run(root: string): { status: number | null; stderr: string } {
	const r = spawnSync("bun", ["run", "scripts/check-docs.ts", "--root", root], {
		cwd: process.cwd(),
		encoding: "utf8",
	});
	return { status: r.status, stderr: r.stderr };
}

describe("check-docs @see existence", () => {
	it("fails on a @see that names a missing repo file", () => {
		const r = run("tests/fixtures/check-docs-see");
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("dangling");
		expect(r.stderr).toContain("9999-does-not-exist.md");
		expect(r.stderr).not.toContain("okLocal");
		expect(r.stderr).not.toContain("okUrl");
	});
});
