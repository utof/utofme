import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
	testDir: "/home/user/utofme/packages/site/tests/e2e",
	fullyParallel: true,
	reporter: "list",
	outputDir:
		"/tmp/claude-0/-home-user-utofme/12186c61-ba1b-59f1-af8b-474559f57556/scratchpad/pwout",
	use: { baseURL: "http://127.0.0.1:4321" },
	projects: [
		{
			name: "chromium-mobile",
			use: {
				...devices["Pixel 5"],
				launchOptions: { executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] },
			},
		},
	],
});
