// Why: Playwright e2e smoke tests that the layout primitives still render with
// the expected data-component attribute on a real page.
//
// Where each primitive renders now (ADR 0040): the light-only masonry home dropped
// the Phase-0 typography sentinel (<Frame><Cluster>…) and the <Stack>/<Grid> wrapper;
// the /works/ index (the last <Stack>/<Grid> user) was deleted, along with both
// components. So no page renders any primitive; this file keeps the negative case.
// See: packages/specs/plans/00-foundations.md § Task 9 step 4
// See: packages/specs/adrs/0040-light-only-masonry-home.md
import { expect, test } from "@playwright/test";

test("the masonry home renders no layout primitives and no typography specimen", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.locator('[data-test="works-grid"]')).toBeVisible();
	await expect(page.locator("[data-component]")).toHaveCount(0);
	await expect(page.locator('[data-test="typography-specimen"]')).toHaveCount(0);
});
