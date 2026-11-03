// Why: Playwright e2e tests for the landing page. Verifies HTTP 200, page title,
// zero Axe accessibility violations, and visual-regression baseline.
// AxeBuilder import shape verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/accessibility-testing
// toHaveScreenshot API (mask, maxDiffPixelRatio) verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
// See: packages/specs/plans/00-foundations.md § Task 5b, § Task 5c
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { waitForImagesSettled } from "./support";

test("home page loads with no Axe violations", async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle(/utofme/);
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

// Why: Phase 2 sentinel — verifies FilterBar hydrates and is visible on cold
// load; queries by accessible role so the assertion doubles as an a11y check.
// RED until FilterBar is mounted with role="toolbar" aria-label="filter".
// The light-only masonry home no longer renders FilterBar (ADR 0040), so the
// positive case now runs on /works/, which still mounts it; `/` gets a negative.
// @see packages/specs/plans/02-interactivity.md § Task 6
// @see packages/specs/adrs/0040-light-only-masonry-home.md
test("FilterBar toolbar is visible on cold load of /works/", async ({ page }) => {
	await page.goto("/works/");
	await expect(page.getByRole("toolbar", { name: "filter" })).toBeVisible();
});

test("masonry home renders no FilterBar toolbar", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { level: 1, name: "utofme" })).toBeVisible();
	await expect(page.getByRole("toolbar", { name: "filter" })).toHaveCount(0);
});

test("visual regression baseline /", async ({ page }) => {
	await page.goto("/");
	// Why: the masonry home's lazy covers change <main>'s height until loaded.
	await waitForImagesSettled(page);
	// Mask the entire works-grid to absorb subpixel font-rendering drift in card
	// titles and cover media across browser/OS patch cycles. The <h1> above the
	// grid remains unmasked, so heading/font regressions on the page chrome are
	// still caught (the Phase 0 typography sentinel was dropped by ADR 0040).
	// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
	// See: packages/specs/plans/01-card-grid-mvp.md § Reviewer briefing point 5
	// Clip to <main> so the footer (added in Task 4) does not affect
	// this baseline — full-page snapshots would require re-baselining on
	// every footer style change. Footer has its own footer.spec.ts coverage.
	await expect(page.locator("main")).toHaveScreenshot("landing.png", {
		// Why: CI ubuntu-latest renderer (Chromium, system fonts) produces ~0.01 pixel
		// ratio drift vs local baseline in the header area. 0.02 headroom still catches
		// real layout/font regressions (those affect >>2% of pixels) while absorbing
		// cross-runner subpixel rendering variation. ADR candidate if this drifts again.
		maxDiffPixelRatio: 0.02,
		mask: [page.locator('[data-test="works-grid"]')],
	});
});
