// Why: static output keeps free-tier-cheap; adapter added in Phase 4 with SSR.
// See: packages/specs/adrs/0004-static-output-default.md
// Why: Svelte integration is registered in Phase 2, not Phase 0 — Phase 0 ships
// zero islands and zero JS first-load (spec line 91 + line 18). The @astrojs/svelte
// package is kept in devDependencies for Phase 2 forward-compat; mere package
// presence emits no runtime — only registering svelte() in integrations[] does.
import { defineConfig } from "astro/config";

export default defineConfig({
	output: "static",
});
