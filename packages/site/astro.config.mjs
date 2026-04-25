// Why: Phase 0 ships static-only output (no SSR routes); keeps the build free-tier-cheap on Cloudflare Workers Assets and avoids miniflare runtime quirks.
// See: packages/specs/specs/00-foundations.md § "Context / invariants" + § "Non-goals" — ADR 0004 will land in Task 10a and supersede this pointer.
//
// Why: Svelte integration is registered in Phase 2, not Phase 0. Phase 0 ships zero hydrated islands; registering svelte() here would emit a Svelte client runtime chunk and violate the 0-KB-JS first-load invariant.
// See: packages/specs/specs/00-foundations.md § "Non-goals" + § "Success criteria".
import { defineConfig } from "astro/config";

export default defineConfig({
	output: "static",
});
