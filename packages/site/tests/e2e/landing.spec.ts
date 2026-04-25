// Why: Playwright e2e tests for the landing page. Verifies HTTP 200, page title,
// zero Axe accessibility violations, and visual-regression baseline.
// AxeBuilder import shape verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/accessibility-testing
// toHaveScreenshot API (mask, maxDiffPixelRatio) verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
// See: packages/specs/plans/00-foundations.md § Task 5b, § Task 5c
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home page loads with no Axe violations", async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle(/utofme/);
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

test("visual regression baseline /", async ({ page }) => {
	await page.goto("/");
	// Mask h1 to absorb subpixel font-rendering drift across browser patches.
	// Task 9 will swap this for [data-test="typography-specimen"] when the
	// typography page lands.
	// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
	await expect(page).toHaveScreenshot("landing.png", {
		maxDiffPixelRatio: 0.001,
		mask: [page.locator("h1")],
	});
});
