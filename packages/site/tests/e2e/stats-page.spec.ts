/**
 * Why: covers acceptance criteria 4, 7 of phase-4 spec — /stats renders
 * 5 source sections from the fixture; the source flagged error: true
 * (Literal in the fixture) shows the ⚠ indicator and unavailable copy.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("/stats renders all 5 sources from the fixture", async ({ page }) => {
	const r = await page.goto("/stats/");
	expect(r?.status()).toBe(200);
	await expect(page.locator("h1")).toHaveText("Stats");
	const sections = page.locator('[data-test="stats-section"]');
	await expect(sections).toHaveCount(5);
	// Scope the source-label assertions to the stats sections so the
	// HCard footer's "GitHub @utof" rel=me link doesn't collide with
	// strict-mode locator resolution.
	await expect(sections.getByText("GitHub")).toBeVisible();
	await expect(sections.getByText("Strava")).toBeVisible();
	await expect(sections.getByText("Last.fm")).toBeVisible();
	await expect(sections.getByText("Literal")).toBeVisible();
	await expect(sections.getByText("Wakatime")).toBeVisible();
});

test("/stats shows ⚠ indicator on errored sources (Literal in fixture)", async ({ page }) => {
	await page.goto("/stats/");
	const literal = page.locator('[data-test="stats-section"]').filter({ hasText: "Literal" });
	await expect(literal).toContainText("data temporarily unavailable");
	await expect(literal.locator('[aria-label="data temporarily unavailable"]')).toBeVisible();
});

test("/stats is axe-clean", async ({ page }) => {
	await page.goto("/stats/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
