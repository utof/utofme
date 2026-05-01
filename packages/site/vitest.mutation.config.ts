// Why: Scoped Vitest config for Stryker mutation runs. Standalone (NOT
// mergeConfig'd against vitest.config.ts) because Phase 7 T1 switched the base
// to `getViteConfig(...)` from astro/config which returns a CALLBACK, and
// Vite's `mergeConfig` rejects callbacks ("Cannot merge config in form of
// callback"). The mutation suite only targets pure logic in `src/lib/*.ts`
// and `src/content.config.ts` schema parsing — it does NOT render any
// `.astro` files, so the Astro Vite plugin is unnecessary here.
//
// environment: "node" — mutation runs exercise pure logic (schema + sort/filter
//   helpers); DOM overhead is unnecessary and slows runs.
// typecheck disabled: Stryker's typescript-checker handles type-level mutation
//   separately; enabling Vitest typecheck too would double the type-check overhead.
// resolve.alias `astro:content` → `astro/content/config` mirrors the base
//   config so `content.config.ts` resolves `defineCollection` in the test runner.
// @see packages/specs/adrs/0008-stryker-and-fast-check-targets.md
// @see packages/specs/plans/01-card-grid-mvp.md § Task 12
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"astro:content": "astro/content/config",
		},
	},
	test: {
		environment: "node",
		include: [
			"tests/unit/content-schema.test.ts",
			"tests/unit/works-query.test.ts",
			"tests/unit/works-helpers.test.ts",
			"tests/unit/url-state.test.ts",
			"tests/unit/filter.test.ts",
			"tests/unit/keymap.test.ts",
		],
		typecheck: { enabled: false },
		exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**", ".stryker-tmp/**"],
	},
});
