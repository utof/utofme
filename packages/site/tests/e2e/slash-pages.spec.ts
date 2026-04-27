/**
 * Why: covers acceptance criteria 1, 2 of phase-4 spec — every slash page
 * returns 200, renders the correct h1 and an updated timestamp, includes
 * the cross-link footer, and is axe-clean.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const STATIC_SLASH = [
	{ path: "/now/", title: "Now" },
	{ path: "/uses/", title: "Uses" },
	{ path: "/colophon/", title: "Colophon" },
	{ path: "/tops/", title: "Tops" },
];

for (const { path, title } of STATIC_SLASH) {
	test(`${path} renders title, updated time, and cross-link nav`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("h1")).toHaveText(title);
		await expect(page.locator("article header time")).toHaveAttribute(
			"datetime",
			/^\d{4}-\d{2}-\d{2}/,
		);
		const crosslinks = page.locator("article > nav.cross-link a");
		await expect(crosslinks).toHaveCount(4); // 5 - self
	});

	test(`${path} is axe-clean`, async ({ page }) => {
		await page.goto(path);
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});
}
