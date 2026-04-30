/// <reference types="astro/client" />

// Why: tsc (via vitest typecheck) cannot resolve *.astro imports because Astro
// uses the Vite plugin transform — not tsc module resolution — for .astro files.
// This ambient declaration gives tsc enough type info to pass; the actual runtime
// shape is AstroComponentFactory (isAstroComponentFactory: true) provided by the
// Vite transform. Without this, `vitest run` exits 1 with TypeCheckError for any
// .test.ts file that imports a .astro component.
// See: https://docs.astro.build/en/guides/upgrade-to/v6/#vitest-client-environment-support
declare module "*.astro" {
	import type { AstroComponentFactory } from "astro/runtime/server/index.js";

	const Component: AstroComponentFactory;
	export default Component;
}
