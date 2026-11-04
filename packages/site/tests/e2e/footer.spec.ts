/**
 * Why: footer is added to _BaseLayout in this task — so it must appear on
 * every existing route too. Regression guard against any future route
 * that opts out of _BaseLayout.
 */
import { expect, test } from "@playwright/test";

// Why: trailing slash required — astro.config.mjs sets trailingSlash: "always";
// without it the preview server returns 404 instead of the page.
const ROUTES = ["/", "/now/", "/search/", "/works/code-2/"];

for (const route of ROUTES) {
	test(`footer renders on ${route}`, async ({ page }) => {
		await page.goto(route);
		const footer = page.locator('footer[aria-label="Site footer"]');
		await expect(footer).toBeVisible();
		await expect(footer.locator('nav[aria-label="Slash pages"] a')).toHaveCount(5);
		await expect(footer.locator('a[href="https://github.com/utof/utofme"]')).toBeVisible();
	});
}

// Why: the h-card used to be bare <body> children and sat flush at
// x=0. They now share the footer's side inset, so the h-card's left edge must equal the
// "© utof" copy's left edge and sit inside the viewport margins. Home (minimal) hides
// the h-card by design.
for (const route of ["/now/", "/garden/", "/works/tactical-arena/"]) {
	test(`footer identity block aligns with the footer on ${route}`, async ({ page }) => {
		await page.goto(route);
		const card = await page.locator(".h-card").boundingBox();
		const copy = await page.locator("footer .copy").boundingBox();
		expect(card).not.toBeNull();
		expect(copy).not.toBeNull();
		expect(card?.x).toBeGreaterThan(0);
		expect(Math.abs((card?.x ?? 0) - (copy?.x ?? 0))).toBeLessThanOrEqual(1);
		// Microformat contract unchanged.
		await expect(page.locator(".h-card .u-url.p-name")).toHaveText("utof.me");
	});
}
