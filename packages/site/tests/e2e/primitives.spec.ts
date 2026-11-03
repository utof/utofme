// Why: Playwright e2e smoke tests that the layout primitives still render with
// the expected data-component attribute on a real page. One assertion per
// primitive — minimal, focused. The data-component attribute is the only stable
// selector needed; DOM shape and CSS are covered by visual-regression + size-limit.
//
// Where each primitive renders now (ADR 0040): the light-only masonry home dropped
// the Phase-0 typography sentinel (<Frame><Cluster>…) and the <Stack>/<Grid> wrapper,
// so on `/` none of the primitives render. <Stack> and <Grid> are still used by
// /works/, so those two run there. <Cluster> and <Frame> are rendered by no page any
// more; their `data-component` contract is asserted by tests/unit/primitives.test.ts
// through the Astro Container API instead.
// See: packages/specs/plans/00-foundations.md § Task 9 step 4
// See: packages/specs/adrs/0040-light-only-masonry-home.md
import { expect, test } from "@playwright/test";

test("Stack renders with data-component=stack", async ({ page }) => {
	await page.goto("/works/");
	const count = await page.locator('[data-component="stack"]').count();
	expect(count).toBeGreaterThan(0);
});

test("Grid renders with data-component=grid", async ({ page }) => {
	await page.goto("/works/");
	const count = await page.locator('[data-component="grid"]').count();
	expect(count).toBeGreaterThan(0);
});

test("the masonry home renders no layout primitives and no typography specimen", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.locator('[data-test="works-grid"]')).toBeVisible();
	await expect(page.locator("[data-component]")).toHaveCount(0);
	await expect(page.locator('[data-test="typography-specimen"]')).toHaveCount(0);
});
