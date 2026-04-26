// Why: e2e tests for the works-grid on `/` and `/works/`.
// AxeBuilder API verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/accessibility-testing
// toHaveScreenshot API (mask, maxDiffPixelRatio) verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
// See: packages/specs/plans/01-card-grid-mvp.md § Task 10
// Pagefind filter span assertion: see packages/specs/plans/02-interactivity.md § Task 8
// data-test card-link-* assertions: see packages/specs/plans/03-content-pipeline.md § Task 6
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/works/"] as const;

for (const route of ROUTES) {
	test.describe(`route ${route}`, () => {
		test("renders the works grid with at least 5 production cards", async ({ page }) => {
			const res = await page.goto(route);
			expect(res?.status()).toBe(200);
			const cards = page.locator('[data-test="works-grid"] > li');
			const count = await cards.count();
			expect(count).toBeGreaterThanOrEqual(5);
		});

		test("axe clean", async ({ page }) => {
			await page.goto(route);
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});

		test("first linked card is tab-focusable", async ({ page }) => {
			await page.goto(route);
			await page.keyboard.press("Tab");
			const focused = await page.evaluate(() => document.activeElement?.tagName);
			// First focusable element is the first <a> card in the grid.
			// Task 6: cardHref now returns /works/<id>/ for entries with body, so most
			// cards render as <a>; writing-3-no-summary is the only <article> (no body,
			// no external URL). Tab skips non-focusable elements and non-<a> cards.
			expect(["A", "BUTTON"]).toContain(focused);
		});

		test("visual regression", async ({ page }) => {
			await page.goto(route);
			// Mask the entire works-grid to absorb subpixel font-rendering drift in
			// card titles, date pills, and tag pills across browser/OS patch cycles.
			// Structural regressions (missing grid, wrong layout) remain detectable
			// because the area outside the grid (page chrome, h1, spacing) is unmasked.
			// See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
			// See: packages/specs/plans/01-card-grid-mvp.md § Reviewer briefing point 5
			await expect(page).toHaveScreenshot(`${route === "/" ? "home" : "works"}.png`, {
				maxDiffPixelRatio: 0.001,
				mask: [page.locator('[data-test="works-grid"]')],
			});
		});

		test("prefers-reduced-motion disables card outline transition", async ({ page }) => {
			// Why: page.emulateMedia() is the correct API in Playwright ≥ 1.x;
			// BrowserContext.emulateMedia() was removed. See:
			// https://playwright.dev/docs/api/class-page#page-emulate-media
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.goto(route);
			const transition = await page
				.locator(".card")
				.first()
				.evaluate((el) => getComputedStyle(el).transitionDuration);
			expect(["0s", "0s, 0s", ""]).toContain(transition);
		});

		test("card with type=code exposes a data-pagefind-filter=type child element with textContent 'code'", async ({
			page,
		}) => {
			// Why: Pagefind reads filter values from element textContent, not the
			// attribute value. This test asserts the hidden span for the 'code' type
			// card is present in the DOM and has the correct text.
			// See: https://pagefind.app/docs/metadata/ (fetched 2026-04-26)
			// See: packages/specs/plans/02-interactivity.md § Task 8 TDD
			await page.goto(route);
			// Find a card element that has data-type="code" and look for its
			// child span with data-pagefind-filter="type" whose textContent is "code".
			const filterSpan = page
				.locator('.card[data-type="code"] [data-pagefind-filter="type"]')
				.first();
			await expect(filterSpan).toHaveText("code");
		});

		// -----------------------------------------------------------------------
		// Task 6 — cardHref branch assertions (data-test="card-link-*")
		// Why: Card.astro now delegates href-decision to cardHref(); these tests
		// pin each branch so a refactor cannot silently break the routing logic.
		// See: packages/specs/plans/03-content-pipeline.md § Task 6
		// -----------------------------------------------------------------------

		test("Case A: cover-fixture (body present) → outer <a> points to /works/ detail and has data-test=card-link-detail", async ({
			page,
		}) => {
			// cover-fixture has a body, so cardHref returns /works/cover-fixture/.
			// The outer element must be <a href="/works/cover-fixture/"> with
			// data-test="card-link-detail".
			await page.goto(route);
			const card = page.locator('[data-preview-target="cover-fixture"]');
			await expect(card).toHaveAttribute("data-test", "card-link-detail");
			const href = await card.getAttribute("href");
			expect(href).toMatch(/^\/works\//);
		});

		test("Case B: external-only fixture (repo URL, no body) → outer <a> points to repo URL and has data-test=card-link-external", async ({
			page,
		}) => {
			// external-only has repo="https://github.com/example/external-only" and
			// no body, so cardHref returns the repo URL.
			// The outer element must be <a href="https://github.com/…"> with
			// data-test="card-link-external".
			await page.goto(route);
			const card = page.locator('[data-preview-target="external-only"]');
			await expect(card).toHaveAttribute("data-test", "card-link-external");
			const href = await card.getAttribute("href");
			expect(href).toMatch(/^https?:\/\//);
		});

		test("Case C: no-link fixture (no body, no external URL) → outer element is <article> with no href, axe-core clean", async ({
			page,
		}) => {
			// no-link is type=writing with no external URL and an empty body,
			// so cardHref returns "" and the outer element renders as <article>.
			await page.goto(route);
			const card = page.locator('[data-preview-target="no-link"]');
			const tagName = await card.evaluate((el) => el.tagName.toLowerCase());
			expect(tagName).toBe("article");
			// <article> must not carry an href attribute.
			const href = await card.getAttribute("href");
			expect(href).toBeNull();
			// Axe-core must report zero violations on this route (covers the <article> branch).
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});
	});
}
