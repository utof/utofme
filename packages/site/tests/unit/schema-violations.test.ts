import { spawnSync } from "node:child_process";
import { copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Why: `bunx astro check` spawns a full Astro type-check pass; on this machine
// that takes ~12 s. Vitest default testTimeout is 5000 ms, so we raise it here.
// @see https://vitest.dev/config/#testtimeout
// Why: bumped from 30s to 60s in Phase 3 — function-form schema + new deps
//      (astro-expressive-code, @astrojs/react, sandpack-react, sharp) made
//      `astro check` cold-start slower on CI. Local runs land in ~30-40s.
// Why: bumped from 60s to 240s — on the vboxsf-mounted checkout `astro check` took
//      ~120s inside the parallel full-suite run (77s alone under load, 36s with the
//      staged invalid fixture on a quieter machine), so 60s failed on timing alone
//      while the assertions held (exit code 1, error names `_invalid-test.mdx`,
//      message mentions the schema).
const ASTRO_CHECK_TIMEOUT_MS = 240_000;

describe("astro check fails on schema violation", () => {
	it(
		"emits a Zod error pointing at the offending file when an invalid fixture is staged",
		() => {
			const src = resolve(
				import.meta.dirname,
				"../fixtures/invalid-frontmatter/missing-duration.mdx",
			);
			const dst = resolve(import.meta.dirname, "../../src/content/works/_invalid-test.mdx");
			copyFileSync(src, dst);
			try {
				// Why: spawnSync returns a fully-typed SpawnSyncReturns<Buffer> so no
				// `as` cast is needed — keeps type-coverage at 100%.
				// @see https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options
				const result = spawnSync("bunx", ["astro", "check"], {
					cwd: resolve(import.meta.dirname, "../.."),
					encoding: "buffer",
				});
				const exitCode = result.status ?? 1;
				const output = result.stderr.toString() + result.stdout.toString();
				expect(exitCode).not.toBe(0);
				expect(output).toMatch(/_invalid-test\.mdx/);
				expect(output.toLowerCase()).toMatch(/duration|invalid|expected/);
			} finally {
				unlinkSync(dst);
			}
		},
		ASTRO_CHECK_TIMEOUT_MS,
	);
});
