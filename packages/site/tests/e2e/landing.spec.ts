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
	// Mask the entire works-grid to absorb subpixel font-rendering drift in card
	// titles, date pills, and tag pills across browser/OS patch cycles. The
	// typography-sentinel block above the grid (Phase 0 B4 invariant) remains
	// unmasked, so heading/font regressions on the page chrome are still caught.
	// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
	// See: packages/specs/plans/01-card-grid-mvp.md § Reviewer briefing point 5
	await expect(page).toHaveScreenshot("landing.png", {
		// Why: CI ubuntu-latest renderer (Chromium, system fonts) produces ~0.01 pixel
		// ratio drift vs local baseline in the header area. 0.02 headroom still catches
		// real layout/font regressions (those affect >>2% of pixels) while absorbing
		// cross-runner subpixel rendering variation. ADR candidate if this drifts again.
		maxDiffPixelRatio: 0.02,
		mask: [page.locator('[data-test="works-grid"]')],
	});
});
