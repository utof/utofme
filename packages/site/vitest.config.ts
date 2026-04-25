// Why: defineConfig shape verified against context7 /vitest-dev/vitest (v4.0.7 docs,
// https://github.com/vitest-dev/vitest/blob/main/docs/config/environment.md and
// https://github.com/vitest-dev/vitest/blob/main/docs/guide/features.md).
// environment: 'happy-dom' is the CLAUDE.md-mandated DOM environment for unit +
// integration tests (spec § "Pinned dev deps"). coverage.provider: 'v8' is the
// default built-in provider; lcov reporter feeds CI coverage upload steps.
//
// Why only `tests/e2e/**` is excluded: Phase 0 final-polish (Task 10 round) deleted
// the 9 comment-only RED stubs that were placeholders for unit-tests of CLI gates.
// Those gates duplicate CLI-level checks (biome, prettier, astro check, type-coverage,
// knip, depcruise, check-docs, no-js, size-limit, lhci) that lefthook + CI already
// enforce; running them under Vitest just shells out and asserts exit code === 0,
// which adds nothing the lefthook chain doesn't already gate. See the plan-amendment
// rationale in packages/specs/plans/00-foundations.md § "Acceptance tests".
// Phase 1 will be the first phase that adds real Vitest tests (content-collection
// loaders, URL filter logic).
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "happy-dom",
		coverage: { provider: "v8", reporter: ["text", "lcov"] },
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			// Playwright e2e specs live in tests/e2e/ and use .spec.ts extension;
			// Vitest 4.x default include catches **/*.spec.ts so we must exclude them.
			// Why: Vitest and Playwright have incompatible test() APIs — mixing them
			// causes "Playwright Test did not expect test() to be called here" error.
			// See: packages/specs/plans/00-foundations.md § Task 5b
			"tests/e2e/**",
		],
	},
});
