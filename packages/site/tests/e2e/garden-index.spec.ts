/**
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #3 + #8
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("garden index lists all fixture notes", async ({ page }) => {
	await page.goto("/garden/");
	const links = page.locator(".note-list a");
	await expect(links).toHaveCount(6); // 6 fixtures from Task 1
});

test("garden index axe clean", async ({ page }) => {
	await page.goto("/garden/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
