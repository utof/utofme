// Why: e2e tests for the URL-driven filter on `/` (the FilterBar island and the /works/
// index that mounted it were removed). Covers the no-JS fallback and hard-refresh
// pre-interaction rendering of `/?type=…` deep links.
//
// Fixture data (PROD — non-drafts only):
//   video-2:                 type=video,   tags=["overview","video"]
//   music-2:                 type=music,   tags=["beat","study"]
//   code-1:                  type=code,    tags=["demo","expressive-code"] (Task 8 fixture)
//   code-2:                  type=code,    tags=["utility"]
//   math-2:                  type=math,    tags=["number-theory"]
//   writing-2:               type=writing, tags=["post","iteration"]
//   writing-3-no-summary:    type=writing, tags=["no-summary"]   (Task 7 fixture)
//   cover-fixture:           type=writing, tags=["cover-image","phase-3"]  (Task 5 fixture)
//   external-only:           type=code,    tags=["external-only"]          (Task 6 fixture)
//   no-link:                 type=writing, tags=["no-link"]                (Task 6 fixture)
//   writing-mdx-island:      type=writing, tags=["mdx","svelte"]           (Task 9 fixture)
//   code-sandbox:            type=code,    tags=["sandpack","react","phase-3"] (Task 10 fixture)
//
// Total production cards: 12
//
// @see packages/specs/plans/02-interactivity.md § Task 5, § Task 6, § Task 7
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
// URL-driven tests on `/` only
//
// Why: the light-only masonry home renders no <FilterBar> (ADR 0040) and the
// /works/ index that mounted it was deleted. The inline `applyFilter` script was
// kept for `/?type=…&tag=…` deep links. A dedicated case pins that `/` has no chrome.
// ---------------------------------------------------------------------------

test.describe("FilterBar — absent from the masonry home (/)", () => {
	test(`0. no filter bar or toolbar is rendered on /`, async ({ page }) => {
		// @see packages/specs/adrs/0040-light-only-masonry-home.md
		await page.goto("/");
		await expect(page.locator('[data-test="works-grid"]')).toBeVisible();
		await expect(page.locator("[data-filter-bar]")).toHaveCount(0);
		await expect(page.getByRole("toolbar")).toHaveCount(0);
	});
});

for (const route of ["/"] as const) {
	test.describe(`FilterBar — JS enabled (${route})`, () => {
		test(`6. hard-refresh ?type=video → only video cards visible before interaction`, async ({
			page,
		}) => {
			// Hard navigate directly to a pre-filtered URL — the inline is:inline
			// script must apply the filter before paint, not just on user interaction.
			await page.goto(`?type=video`);
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

			// All 12 production cards should be visible (full grid, no filtering)
			// writing-3-no-summary (Task 7 fixture) is the 6th card; cover-fixture
			// (Task 5 fixture) is the 7th; external-only and no-link (Task 6 fixtures)
			// are the 8th and 9th; code-1 (Task 8 fixture) is the 10th;
			// writing-mdx-island (Task 9 fixture) is the 11th;
			// code-sandbox (Task 10 fixture) is the 12th.
			const grid = page.locator('[data-test="works-grid"] > li');
			const count = await grid.count();
			// Why >=: the build includes the real works next to the 12 fixture cards.
			expect(count).toBeGreaterThanOrEqual(12);

			// No JS console errors (can't run anyway, but ensure no inline script errors)
			expect(consoleErrors).toHaveLength(0);

			await context.close();
		});
	});
}
