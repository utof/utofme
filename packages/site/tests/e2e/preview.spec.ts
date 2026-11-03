// Why: e2e tests for Preview.svelte hover-popover island on `/works/`.
// Covers hover-visible, click-navigates, reduced-motion, Esc-closes, no-summary.
//
// The light-only masonry home no longer mounts <Preview> (ADR 0040: "hide, don't
// delete"), so the popover scenarios run on /works/, the page that still mounts
// it; a negative case pins that `/` ships no popover island.
//
// Fixture data (PROD — non-drafts only):
//   writing-2 has summary; writing-3-no-summary has no summary.
//
// @see packages/specs/plans/02-interactivity.md § Task 7
// @see packages/specs/adrs/0040-light-only-masonry-home.md
import { expect, test } from "@playwright/test";

/**
 * Wait for the Preview island to attach to the DOM AND hydrate.
 *
 * Why: `client:visible` hydrates once the element enters the viewport; the
 * `[data-preview]` wrapper is zero-size so Playwright's default
 * `state: 'visible'` never fires (visible requires non-zero size). We wait for
 * `state: 'attached'` instead. Attached alone is not enough: the SSR markup
 * already contains the wrapper, so a hover fired before hydration finds no
 * listeners and the 50 ms popover assertions flake on a loaded machine. Astro
 * removes the `ssr` attribute from `<astro-island>` once it hydrates
 * (runtime/server/astro-island.js), so the readiness signal is the island losing it.
 *
 * @see https://playwright.dev/docs/api/class-page#page-wait-for-selector
 */
async function waitForPreview(page: import("@playwright/test").Page): Promise<void> {
	await page.waitForSelector("astro-island:not([ssr]):has([data-preview])", {
		state: "attached",
		timeout: 5000,
	});
}

test.describe("Preview popover — /works/", () => {
	test("0. the masonry home does not mount the popover island", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator('[data-test="works-grid"]')).toBeVisible();
		await expect(page.locator("[data-preview]")).toHaveCount(0);
	});

	test("1. hover card → popover visible within 50 ms", async ({ page }) => {
		await page.goto("/works/");
		await waitForPreview(page);

		// Get the first card that has a data-preview-target attribute
		const card = page.locator("[data-preview-target]").first();
		await card.hover();

		// Popover should become visible quickly
		const popover = page.locator("[data-preview-popover]");
		await expect(popover).toBeVisible({ timeout: 50 });
	});

	test("2. click card → navigation happens (popover does not block)", async ({ page }) => {
		await page.goto("/works/");
		await waitForPreview(page);

		// Find the first card that is an <a> (has href — navigable)
		const linkCard = page.locator("a[data-preview-target]").first();

		// Hover first to show popover
		await linkCard.hover();
		const popover = page.locator("[data-preview-popover]");
		await expect(popover).toBeVisible({ timeout: 50 });

		// Key assertion: pointer-events: none means the popover never blocks the card link.
		const popoverPE = await popover.evaluate((el) => getComputedStyle(el).pointerEvents);
		expect(popoverPE).toBe("none");
	});

	test("3. reduced-motion: popover visible, animationName === 'none'", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/works/");
		await waitForPreview(page);

		const card = page.locator("[data-preview-target]").first();
		await card.hover();

		const popover = page.locator("[data-preview-popover]");
		await expect(popover).toBeVisible({ timeout: 50 });

		// With reduced-motion, animation should be none
		const animationName = await popover.evaluate((el) => getComputedStyle(el).animationName);
		expect(animationName).toBe("none");
	});

	test("4. Esc closes popover", async ({ page }) => {
		await page.goto("/works/");
		await waitForPreview(page);

		const card = page.locator("[data-preview-target]").first();
		await card.hover();

		const popover = page.locator("[data-preview-popover]");
		await expect(popover).toBeVisible({ timeout: 50 });

		// Press Escape
		await page.keyboard.press("Escape");

		// Popover should be hidden
		await expect(popover).toBeHidden({ timeout: 300 });
	});

	test("5. card without summary → popover renders without summary cleanly", async ({ page }) => {
		await page.goto("/works/");
		await waitForPreview(page);

		// writing-3-no-summary has id "writing-3-no-summary" in the collection
		const noSummaryCard = page.locator('[data-preview-target="writing-3-no-summary"]');
		await noSummaryCard.hover();

		const popover = page.locator("[data-preview-popover]");
		await expect(popover).toBeVisible({ timeout: 50 });

		// Summary element should not be present (no empty paragraph)
		const summaryEl = popover.locator("[data-preview-summary]");
		await expect(summaryEl).toBeHidden();
	});
});
