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
	// Mask [data-test="works-grid"] h2 to absorb subpixel font-rendering drift in
	// card titles across browser patches. Phase 1 cards replaced the full-page
	// typography specimen as the primary source of variable-text rendering variance.
	// The typography-specimen sentinel block is still present on the page (Phase 0
	// B4 invariant) but no longer the dominant drift source.
	// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
	// See: packages/specs/plans/01-card-grid-mvp.md § Task 10 Step 2
	await expect(page).toHaveScreenshot("landing.png", {
		maxDiffPixelRatio: 0.001,
		mask: [page.locator('[data-test="works-grid"] h2')],
	});
});
