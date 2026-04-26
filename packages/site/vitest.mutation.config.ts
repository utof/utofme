// Why: Scoped Vitest config for Stryker mutation runs. Uses mergeConfig to inherit
// the `astro:content` alias from the base vitest.config.ts — without it, Stryker's
// vitest-runner cannot resolve the import chain in content.config.ts.
// environment: "node" replaces happy-dom because mutation runs exercise pure logic
// (schema + sort/filter helpers); DOM overhead is unnecessary and slows runs.
// typecheck disabled: Stryker's typescript-checker handles type-level mutation
// separately; enabling Vitest typecheck too would double the type-check overhead.
// @see packages/specs/adrs/0008-stryker-and-fast-check-targets.md
// @see packages/specs/plans/01-card-grid-mvp.md § Task 12
import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
	baseConfig,
	defineConfig({
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
		},
	}),
);
