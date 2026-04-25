// Why: Playwright e2e test for the landing page. Verifies HTTP 200, page title, and
// zero Axe accessibility violations. Visual-regression (toHaveScreenshot) is Task 5c.
// AxeBuilder import shape verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/accessibility-testing
// See: packages/specs/plans/00-foundations.md § Task 5b
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home page loads with no Axe violations", async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle(/utofme/);
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
