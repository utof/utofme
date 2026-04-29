/**
 * link-preview.spec.ts — Phase 5 Task 10 e2e for the LinkPreview island.
 *
 * Why: covers the three Acceptance #6 scenarios for hover previews —
 *   1. mouse hover reveals the tooltip within 200 ms
 *   2. Escape dismisses the tooltip
 *   3. keyboard focus also reveals the tooltip (a11y parity with hover)
 *
 * Slug correction: the plan snippet referenced `/garden/wikilink-demo/`, but
 * the actual fixture filename in src/content/notes/ is `wikilinks.mdx`, which
 * the garden detail page slugifies to `/garden/wikilinks/`. The corrected slug
 * is used here per the Task 10 controller brief.
 *
 * The LinkPreview island is mounted with client:idle in _BaseLayout.astro;
 * we wait for the network-idle load state before interacting so hydration
 * has had a chance to attach the delegated body-level listeners.
 *
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #6
 * @see packages/specs/plans/05-garden.md § Task 10
 */
import { expect, test } from "@playwright/test";

const FIXTURE_URL = "/garden/wikilinks/";
const TOOLTIP = '[role="tooltip"].visible';

test("hover over a wikilink reveals preview within 200 ms", async ({ page }) => {
	await page.goto(FIXTURE_URL);
	await page.waitForLoadState("networkidle");
	const link = page.locator("a.wikilink").first();
	await link.hover();
	await expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 200 });
});

test("Escape dismisses the preview", async ({ page }) => {
	await page.goto(FIXTURE_URL);
	await page.waitForLoadState("networkidle");
	await page.locator("a.wikilink").first().hover();
	await expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 200 });
	await page.keyboard.press("Escape");
	await expect(page.locator(TOOLTIP)).toHaveCount(0);
});

test("focus reveals preview (keyboard accessibility)", async ({ page }) => {
	await page.goto(FIXTURE_URL);
	await page.waitForLoadState("networkidle");
	await page.locator("a.wikilink").first().focus();
	await expect(page.locator(TOOLTIP)).toBeVisible({ timeout: 200 });
});
