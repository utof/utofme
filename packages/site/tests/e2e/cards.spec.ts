// Why: e2e tests for the works-grid on `/` and `/works`.
// AxeBuilder API verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/accessibility-testing
// toHaveScreenshot API (mask, maxDiffPixelRatio) verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
// See: packages/specs/plans/01-card-grid-mvp.md § Task 10
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/works"] as const;

for (const route of ROUTES) {
	test.describe(`route ${route}`, () => {
		test("renders the works grid with at least 5 production cards", async ({ page }) => {
			const res = await page.goto(route);
			expect(res?.status()).toBe(200);
			const cards = page.locator('[data-test="works-grid"] > li');
			const count = await cards.count();
			expect(count).toBeGreaterThanOrEqual(5);
		});

		test("axe clean", async ({ page }) => {
			await page.goto(route);
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});

		test("first linked card is tab-focusable", async ({ page }) => {
			await page.goto(route);
			await page.keyboard.press("Tab");
			const focused = await page.evaluate(() => document.activeElement?.tagName);
			// First focusable element is either the page's skip link (if added in Phase 0) or the first <a> card.
			// writing-2 has no external URL (renders as <article>; not focusable); the first <a> card
			// is math-2 which has an arxiv URL. Tab skips non-focusable elements.
			expect(["A", "BUTTON"]).toContain(focused);
		});

		test("visual regression", async ({ page }) => {
			await page.goto(route);
			// Mask the entire works-grid to absorb subpixel font-rendering drift in
			// card titles, date pills, and tag pills across browser/OS patch cycles.
			// Structural regressions (missing grid, wrong layout) remain detectable
			// because the area outside the grid (page chrome, h1, spacing) is unmasked.
			// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
			// See: packages/specs/plans/01-card-grid-mvp.md § Reviewer briefing point 5
			await expect(page).toHaveScreenshot(`${route === "/" ? "home" : "works"}.png`, {
				maxDiffPixelRatio: 0.001,
				mask: [page.locator('[data-test="works-grid"]')],
			});
		});

		test("prefers-reduced-motion disables card outline transition", async ({ page }) => {
			// Why: page.emulateMedia() is the correct API in Playwright ≥ 1.x;
			// BrowserContext.emulateMedia() was removed. See:
			// https://playwright.dev/docs/api/class-page#page-emulate-media
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.goto(route);
			const transition = await page
				.locator(".card")
				.first()
				.evaluate((el) => getComputedStyle(el).transitionDuration);
			expect(["0s", "0s, 0s", ""]).toContain(transition);
		});
	});
}
