/**
 * Why: footer is added to _BaseLayout in this task — so it must appear on
 * every existing route too. Regression guard against any future route
 * that opts out of _BaseLayout.
 */
import { expect, test } from "@playwright/test";

// Why: trailing slash required — astro.config.mjs sets trailingSlash: "always";
// without it the preview server returns 404 instead of the page.
const ROUTES = ["/", "/works/", "/search/", "/works/code-2/"];

for (const route of ROUTES) {
	test(`footer renders on ${route}`, async ({ page }) => {
		await page.goto(route);
		const footer = page.locator('footer[aria-label="Site footer"]');
		await expect(footer).toBeVisible();
		await expect(footer.locator('nav[aria-label="Slash pages"] a')).toHaveCount(5);
		await expect(footer.locator('a[href="https://github.com/utof/utofme"]')).toBeVisible();
	});
}
