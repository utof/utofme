// Why: e2e tests for FilterBar.svelte island on `/` and `/works`.
// Covers URL-driven filter state, chip interactions, reset, back-button,
// no-JS fallback, and hard-refresh pre-interaction rendering.
//
// Fixture data (PROD — non-drafts only):
//   video-2:                 type=video,   tags=["overview","video"]
//   music-2:                 type=music,   tags=["beat","study"]
//   code-2:                  type=code,    tags=["utility"]
//   math-2:                  type=math,    tags=["number-theory"]
//   writing-2:               type=writing, tags=["post","iteration"]
//   writing-3-no-summary:    type=writing, tags=["no-summary"]   (Task 7 fixture)
//
// Total production cards: 6
//
// @see packages/specs/plans/02-interactivity.md § Task 5, § Task 6, § Task 7
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helper — count visible cards (li items where the card is not hidden)
// ---------------------------------------------------------------------------

/**
 * Count `<li>` items in the works-grid that are not hidden.
 *
 * Why: the inline filter script sets `hidden` on `<li>` wrappers; counting
 * non-hidden lis is simpler than counting visible descendants.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 5
 */
async function visibleCardCount(page: import("@playwright/test").Page): Promise<number> {
	return page.evaluate(() => {
		const grid = document.querySelector('[data-test="works-grid"]');
		if (!grid) return 0;
		const items = Array.from(grid.querySelectorAll("li"));
		return items.filter((li) => !li.hidden).length;
	});
}

// ---------------------------------------------------------------------------
// Parameterised tests — run identical filter scenarios on / and /works
// ---------------------------------------------------------------------------

for (const route of ["/", "/works"] as const) {
	test.describe(`FilterBar — JS enabled (${route})`, () => {
		test(`1. type=video chip → URL + only video cards visible`, async ({ page }) => {
			await page.goto(route);
			// Wait for the filter bar to hydrate
			await page.waitForSelector("[data-filter-bar]");

			// Click the video type chip
			await page.click('[data-filter-bar] button[data-type="video"]');

			// URL should contain type=video
			await expect(page).toHaveURL(/[?&]type=video/);

			// Only the one video production card should be visible
			const count = await visibleCardCount(page);
			expect(count).toBe(1);
		});

		test(`2. add tag=overview → URL has both params, still 1 card`, async ({ page }) => {
			await page.goto(route);
			await page.waitForSelector("[data-filter-bar]");

			// Select type=video first
			await page.click('[data-filter-bar] button[data-type="video"]');
			await expect(page).toHaveURL(/[?&]type=video/);

			// Add the overview tag chip
			await page.click('[data-filter-bar] button[data-tag="overview"]');
			await expect(page).toHaveURL(/[?&]type=video/);
			await expect(page).toHaveURL(/[?&]tag=overview/);

			const count = await visibleCardCount(page);
			expect(count).toBe(1);
		});

		test(`3. reset button → URL strips params, all 6 cards visible`, async ({ page }) => {
			await page.goto(route);
			await page.waitForSelector("[data-filter-bar]");

			// Set a filter first
			await page.click('[data-filter-bar] button[data-type="video"]');
			await page.click('[data-filter-bar] button[data-tag="overview"]');
			await expect(page).toHaveURL(/[?&]type=video/);

			// Click reset
			await page.click("[data-filter-bar] button[data-reset]");

			// URL should be clean (no type/tag params)
			const url = new URL(page.url());
			expect(url.searchParams.get("type")).toBeNull();
			expect(url.searchParams.getAll("tag")).toHaveLength(0);

			const count = await visibleCardCount(page);
			expect(count).toBe(6);
		});

		test(`4. back button restores prior filter`, async ({ page }) => {
			// Note: writeState uses replaceState (not pushState) so individual filter
			// changes don't add history entries. We navigate to a filtered URL as the
			// starting point, then navigate away, then go back to verify restoration.
			await page.goto(`${route === "/" ? "" : route}?type=video&tag=overview`);
			await page.waitForSelector("[data-filter-bar]");
			const filteredCount = await visibleCardCount(page);
			expect(filteredCount).toBe(1);

			// Navigate to a different page and come back
			await page.goto(route === "/" ? "/works" : "/");
			await page.goBack();

			await page.waitForSelector("[data-filter-bar]");
			// Filter state should be restored from URL
			await expect(page).toHaveURL(/[?&]type=video/);
			const restoredCount = await visibleCardCount(page);
			expect(restoredCount).toBe(1);
		});

		test(`5a. axe-core clean with FilterBar visible`, async ({ page }) => {
			await page.goto(route);
			await page.waitForSelector("[data-filter-bar]");
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});

		test(`6. hard-refresh ?type=video → only video cards visible before interaction`, async ({
			page,
		}) => {
			// Hard navigate directly to a pre-filtered URL — the inline is:inline
			// script must apply the filter before paint, not just on user interaction.
			await page.goto(`${route === "/" ? "" : route}?type=video`);
			// No user interaction — just check the DOM immediately after load
			const count = await visibleCardCount(page);
			expect(count).toBe(1);
		});
	});

	test.describe(`FilterBar — JS disabled (${route})`, () => {
		test(`5. no-JS: full grid renders, filter bar hidden, no console error`, async ({
			browser,
		}) => {
			const context = await browser.newContext({ javaScriptEnabled: false });
			const page = await context.newPage();

			const consoleErrors: string[] = [];
			page.on("console", (msg) => {
				if (msg.type() === "error") consoleErrors.push(msg.text());
			});

			await page.goto(route);

			// Filter bar should not be visible (it has hidden attribute removed only by JS)
			const filterBar = page.locator("[data-filter-bar]");
			// Either the element is not present (SSR conditional) or it has hidden attribute
			const isVisible = await filterBar.isVisible().catch(() => false);
			expect(isVisible).toBe(false);

			// All 6 production cards should be visible (full grid, no filtering)
			// writing-3-no-summary (Task 7 fixture) is a non-draft, adding a 6th card.
			const grid = page.locator('[data-test="works-grid"] > li');
			const count = await grid.count();
			expect(count).toBe(6);

			// No JS console errors (can't run anyway, but ensure no inline script errors)
			expect(consoleErrors).toHaveLength(0);

			await context.close();
		});
	});
}
