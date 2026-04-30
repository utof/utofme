/**
 * @see packages/specs/plans/06-indieweb.md § Task 8
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("/garden/welcome/ shows webmentions when fixture present", async ({ page }) => {
	await page.goto("/garden/welcome/");
	const aside = page.locator("aside.webmentions");
	await expect(aside).toBeVisible();
	// Avatar grid (likes / reposts)
	await expect(aside.locator(".webmention-avatar").first()).toBeVisible();
	// Reply h-cite
	await expect(aside.locator(".h-cite").first()).toBeVisible();
	// Axe clean
	const a11y = await new AxeBuilder({ page }).include("aside.webmentions").analyze();
	expect(a11y.violations).toEqual([]);
});

test("/garden/orphan/ renders no <aside.webmentions>", async ({ page }) => {
	await page.goto("/garden/orphan/");
	await expect(page.locator("aside.webmentions")).toHaveCount(0);
});
