// Why: Playwright e2e smoke tests that each layout primitive renders on the
// landing page with the expected data-component attribute. One assertion per
// primitive — minimal, focused. The data-component attribute is the only stable
// selector needed; DOM shape and CSS are covered by visual-regression + size-limit.
// See: packages/specs/plans/00-foundations.md § Task 9 step 4
import { expect, test } from "@playwright/test";

test("Stack renders with data-component=stack", async ({ page }) => {
	await page.goto("/");
	const count = await page.locator('[data-component="stack"]').count();
	expect(count).toBeGreaterThan(0);
});

test("Cluster renders with data-component=cluster", async ({ page }) => {
	await page.goto("/");
	const count = await page.locator('[data-component="cluster"]').count();
	expect(count).toBeGreaterThan(0);
});

test("Grid renders with data-component=grid", async ({ page }) => {
	await page.goto("/");
	const count = await page.locator('[data-component="grid"]').count();
	expect(count).toBeGreaterThan(0);
});

test("Frame renders with data-component=frame", async ({ page }) => {
	await page.goto("/");
	const count = await page.locator('[data-component="frame"]').count();
	expect(count).toBeGreaterThan(0);
});

test("typography-specimen container present", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('[data-test="typography-specimen"]')).toBeVisible();
});
