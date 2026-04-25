// Why: defineConfig shape verified against context7 /vitest-dev/vitest (v4.0.7 docs,
// https://github.com/vitest-dev/vitest/blob/main/docs/config/environment.md and
// https://github.com/vitest-dev/vitest/blob/main/docs/guide/features.md).
// environment: 'happy-dom' is the CLAUDE.md-mandated DOM environment for unit +
// integration tests (spec § "Pinned dev deps"). coverage.provider: 'v8' is the
// default built-in provider; lcov reporter feeds CI coverage upload steps.
//
// exclude list: Tasks 1–4 committed comment-only RED stubs that contain no
// `test()` calls; Vitest 4.x fails a run if a matched file has no suite.
// Each task that activates a stub (Tasks 5b–10d) REMOVES that stub from this
// exclude list as part of its commit.
// See: packages/specs/plans/00-foundations.md § Task 5a
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "happy-dom",
		coverage: { provider: "v8", reporter: ["text", "lcov"] },
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			// Comment-only RED stubs — activated progressively in Tasks 5b–10d:
			"tests/unit/scaffold.test.ts",
			"tests/unit/tooling.test.ts",
			"tests/unit/type-coverage.test.ts",
			"tests/unit/knip.test.ts",
			"tests/unit/depcruise.test.ts",
			"tests/unit/check-docs.test.ts",
		],
	},
});
