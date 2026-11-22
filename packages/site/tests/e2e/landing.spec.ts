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

// Why: the home renders no FilterBar (ADR 0040, kept by the catalogue layout, ADR 0061) and
// the /works/ index that mounted it was deleted, so only the negative case remains.
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
test("home renders the wordmark as h1 and no FilterBar toolbar", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { level: 1, name: "utofme" })).toBeVisible();
	await expect(page.getByRole("toolbar", { name: "filter" })).toHaveCount(0);
});

test("visual regression baseline /", async ({ page }) => {
	await page.goto("/");
	// The header depends on fonts. Project covers can stay lazy below it.
	await page.evaluate(() => document.fonts.ready);
	// Why: the chrome moved out of <main> into the shared site header; <main> is
	// only the card grid, so a masked <main> shot guarded nothing and flaked.
	// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
	await expect(page.locator('[data-test="site-header"]')).toHaveScreenshot("landing.png", {
		// Why: CI ubuntu-latest renderer (Chromium, system fonts) produces ~0.01 pixel
		// ratio drift vs local baseline in the header area. 0.02 headroom still catches
		// real layout/font regressions (those affect >>2% of pixels) while absorbing
		// cross-runner subpixel rendering variation.
		maxDiffPixelRatio: 0.02,
	});
});
