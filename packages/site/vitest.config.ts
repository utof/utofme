// Why: getViteConfig from astro/config includes the Astro Vite plugin so
// Vitest can transform .astro files — required for experimental_AstroContainer
// (Container API) unit tests introduced in Task 4. Without the plugin, Vitest's
// Rollup parser sees raw .astro frontmatter (`---`) and throws a parse error.
// See: https://docs.astro.build/en/guides/testing/#vitest
// @see packages/specs/plans/06-indieweb.md § Task 4
//
// All previous options (alias, environment, coverage, typecheck, exclude) are
// preserved verbatim — only the config function changes from defineConfig to
// getViteConfig. getViteConfig accepts { test: … } as first arg and optional
// Astro config overrides as second arg.
import { getViteConfig } from "astro/config";

export default getViteConfig(
	{
		// Why: `astro:content` is a Vite virtual module generated at build time by
		// Astro's content-plugin; it does not exist as a file on disk. Vitest resolves
		// imports from disk, so without an alias the import fails with "Cannot find
		// module 'astro:content'". Aliasing to `astro/content/config` (the public
		// package export declared in astro/package.json) provides `defineCollection` so
		// `content.config.ts` can be imported in unit tests. Only `defineCollection` is
		// used in the file; the alias does NOT affect `getCollection` or render helpers
		// (those come from the full virtual module and are not needed in schema unit tests).
		// @see packages/specs/plans/01-card-grid-mvp.md § Task 2
		resolve: {
			// Why: Svelte 5 ships separate browser/server entry points. Without the
			// `browser` condition, Node resolves to `src/index-server.js` which throws
			// on `mount()` ("not available on the server"). Adding `browser` here
			// mirrors the canonical Svelte Vitest setup documented at:
			// https://svelte.dev/docs/svelte/testing#Unit-and-integration-tests
			// Conditioned on VITEST so the Astro build (which deliberately uses SSR
			// Svelte) is not affected.
			conditions: process.env.VITEST ? ["browser"] : [],
			alias: {
				"astro:content": "astro/content/config",
			},
		},
		test: {
			environment: "happy-dom",
			coverage: { provider: "v8", reporter: ["text", "lcov"] },
			typecheck: {
				enabled: true,
				include: ["**/*.test-d.ts"],
			},
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				// Playwright e2e specs live in tests/e2e/ and use .spec.ts extension;
				// Vitest 4.x default include catches **/*.spec.ts so we must exclude them.
				// Why: Vitest and Playwright have incompatible test() APIs — mixing them
				// causes "Playwright Test did not expect test() to be called here" error.
				// See: packages/specs/plans/00-foundations.md § Task 5b
				"tests/e2e/**",
				// Why: Stryker creates sandboxes under .stryker-tmp/ for instrumented
				// test runs. Without this exclusion, `vitest run` (outside Stryker) picks
				// up the sandboxed copies of e2e specs and fails with Playwright errors.
				// @see packages/specs/adrs/0008-stryker-and-fast-check-targets.md
				".stryker-tmp/**",
			],
		},
	},
	// Why: pass site so context.site is defined in Container API renders; mirrors
	// astro.config.mjs#site set in Task 1. trailingSlash preserves routing invariants.
	{
		site: "https://utof.me/",
		trailingSlash: "always",
	},
);
