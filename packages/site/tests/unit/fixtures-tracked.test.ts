/**
 * Guard: nothing under tests/fixtures/ may be swallowed by a .gitignore rule.
 *
 * Why: `graph-rollup/dist` once went missing in CI because a global ignore rule
 * (`dist`) hid a fixture that existed only on the author's disk (#138). Local runs
 * stayed green, CI failed. This fails locally the moment a fixture is ignored.
 * @see https://github.com/utof/utofme/issues/138
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("tests/fixtures", () => {
	it("has no git-ignored files", () => {
		const r = spawnSync(
			"git",
			["ls-files", "--others", "--ignored", "--exclude-standard", "--", "tests/fixtures"],
			{ cwd: process.cwd(), encoding: "utf8" },
		);
		expect(r.status).toBe(0);
		expect(r.stdout.trim().split("\n").filter(Boolean)).toEqual([]);
	});
});
