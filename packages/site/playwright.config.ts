// Why: `channel: 'chromium'` pins new headless mode — the real Chromium browser (not chrome-headless-shell)
// for more authentic end-to-end testing. Per context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/browsers#chromium-new-headless-mode
// Pixel 5 mobile project targets the Lighthouse mobile gate (spec § success criteria).
// Per context7 /microsoft/playwright.dev: https://playwright.dev/docs/test-configuration
// See: packages/specs/plans/00-foundations.md § Task 5b
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:4321",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium-mobile",
			use: { ...devices["Pixel 5"], channel: "chromium" },
		},
	],
	webServer: {
		command: "bun run preview",
		url: "http://127.0.0.1:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
