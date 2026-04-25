// Why: static output keeps free-tier-cheap; adapter added in Phase 4 with SSR.
// See: packages/specs/adrs/0004-static-output-default.md
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
	output: "static",
	integrations: [svelte()],
});
