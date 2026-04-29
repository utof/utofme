/**
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #4 + #8
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("wikilinks page renders resolved + broken wikilinks", async ({ page }) => {
	// Slug is "wikilinks" (fixture file is wikilinks.mdx — not wikilink-demo)
	await page.goto("/garden/wikilinks/");
	await expect(page.locator("a.wikilink").first()).toBeVisible();
	await expect(page.locator("span.wikilink-broken").first()).toBeVisible();
	// Broken span must NOT be wrapped in an anchor.
	const brokenAncestor = await page
		.locator("span.wikilink-broken")
		.first()
		.evaluate((el) => el.closest("a") !== null);
	expect(brokenAncestor).toBe(false);
});

test("math-demo renders KaTeX", async ({ page }) => {
	await page.goto("/garden/math-demo/");
	await expect(page.locator(".katex").first()).toBeVisible();
});

test("callout-demo renders styled callouts", async ({ page }) => {
	// @r4ai/remark-callout emits data-callout attribute (not class="callout").
	// Verified via dist/garden/callout-demo/index.html — plugin uses data attrs.
	// See packages/specs/specs/05-garden.md § Acceptance criterion #4
	await page.goto("/garden/callout-demo/");
	await expect(page.locator("[data-callout]").first()).toBeVisible();
});

test("orphan note shows empty backlinks copy", async ({ page }) => {
	await page.goto("/garden/orphan/");
	await expect(page.locator(".backlinks .empty")).toBeVisible();
});

test("garden detail axe clean", async ({ page }) => {
	await page.goto("/garden/welcome/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
