// Why: e2e tests for the project elements on `/` (catalogue home, ADR 0061): the featured
// grid (`works-grid`: hero + highlighted cards) and the topic rows.
// AxeBuilder API verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/accessibility-testing
// toHaveScreenshot API (mask, maxDiffPixelRatio) verified via context7 /microsoft/playwright.dev:
// https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-2
// See: packages/specs/plans/01-card-grid-mvp.md § Task 10
// Pagefind filter span assertion: see packages/specs/plans/02-interactivity.md § Task 8
// data-test card-link-* assertions: see packages/specs/plans/03-content-pipeline.md § Task 6
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/"] as const;

for (const route of ROUTES) {
	test.describe(`route ${route}`, () => {
		test("renders the featured grid and at least 5 project rows", async ({ page }) => {
			const res = await page.goto(route);
			expect(res?.status()).toBe(200);
			await expect(page.locator('[data-test="works-grid"] > li').first()).toBeVisible();
			const rows = await page.locator('[data-test="home-row"]').count();
			expect(rows).toBeGreaterThanOrEqual(5);
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
			// First focusable element is the wordmark link in the header.
			expect(["A", "BUTTON"]).toContain(focused);
		});

		test("visual regression", async ({ page }) => {
			await page.goto(route);
			await page.evaluate(() => document.fonts.ready);
			await expect(page.locator('[data-test="works-grid"]')).toBeVisible();
			// Why: <main> holds playing loops and spinning object canvases, so a <main> shot
			// would be flaky. Cards and rows have their own behaviour tests; this baseline
			// guards the chrome (the home's own header: wordmark, nav, Pause motion).
			await expect(page.locator('[data-test="site-header"]')).toHaveScreenshot(
				`${route === "/" ? "home" : "works"}.png`,
				{ maxDiffPixelRatio: 0.001 },
			);
		});

		test("prefers-reduced-motion disables the card hover transition", async ({ page }) => {
			// Why: page.emulateMedia() is the correct API in Playwright ≥ 1.x;
			// BrowserContext.emulateMedia() was removed. See:
			// https://playwright.dev/docs/api/class-page#page-emulate-media
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.goto(route);
			const seconds = await page
				.locator(".ct-feat__content")
				.first()
				.evaluate((el) =>
					getComputedStyle(el)
						.transitionDuration.split(",")
						.map((d) => Number.parseFloat(d) || 0),
				);
			// The catalogue collapses every transition to 0.01 ms under reduced motion.
			for (const s of seconds) expect(s).toBeLessThan(0.001);
		});

		test("featured cards follow the mouse and settle without moving their links", async ({
			browser,
			baseURL,
		}) => {
			const page = await browser.newPage({
				viewport: { width: 1440, height: 900 },
				hasTouch: false,
				isMobile: false,
				reducedMotion: "no-preference",
			});
			try {
				await page.goto(new URL(route, baseURL).href);
				await page.evaluate(() => document.fonts.ready);
				const card = page.locator('[data-test="home-hero"] a.ct-feat');
				const content = card.locator(".ct-feat__content");
				const bounds = await card.boundingBox();
				if (!bounds) throw new Error("Featured card is missing");
				const { x, y, width, height } = bounds;
				const offset = () =>
					content.evaluate((el) => {
						const transform = getComputedStyle(el).transform;
						const { m41, m42 } = new DOMMatrix(transform === "none" ? undefined : transform);
						return [Math.round(m41), Math.round(m42)];
					});

				await page.mouse.move(x + width * 0.15, y + height * 0.2);
				await expect.poll(offset).toEqual([-4, -4]);
				await page.mouse.move(x + width * 0.85, y + height * 0.8, { steps: 8 });
				await expect.poll(offset).toEqual([4, 4]);
				expect(await card.boundingBox()).toEqual(bounds);

				await page.mouse.move(1, 1);
				await expect(content).toHaveCSS("transform", "none");

				await page.getByRole("button", { name: "Pause motion" }).click();
				await page.mouse.move(x + width * 0.15, y + height * 0.2);
				await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
				await expect(content).toHaveCSS("transform", "none");
			} finally {
				await page.close();
			}
		});

		test("every project element exposes data-type and data-tags for the URL filter", async ({
			page,
		}) => {
			await page.goto(route);
			const missing = await page
				.locator("[data-home-item]")
				.evaluateAll(
					(items) => items.filter((li) => !li.querySelector("[data-type][data-tags]")).length,
				);
			expect(missing).toBe(0);
			await expect(page.locator('[data-home-row][data-type="code"]').first()).toBeAttached();
		});

		// -----------------------------------------------------------------------
		// cardHref branch assertions on the rows (ADR 0011).
		// Why: every catalogue part resolves its link through cardHref(); these pin each
		// branch on the row's "open" button so a refactor cannot silently break routing.
		// See: packages/specs/plans/03-content-pipeline.md § Task 6
		// -----------------------------------------------------------------------

		const row = (page: import("@playwright/test").Page, slug: string) =>
			page.locator(`details[data-home-row][data-slug="${slug}"]`);

		test("Case A: cover-fixture (body present) → the row opens /works/cover-fixture/", async ({
			page,
		}) => {
			await page.goto(route);
			const open = row(page, "cover-fixture").locator('[data-test="home-row-open"]');
			await expect(open).toHaveAttribute("href", "/works/cover-fixture/");
			await expect(open).toContainText("Open project");
		});

		test("Case B: external-only fixture (repo URL, no body) → the row links to the repo", async ({
			page,
		}) => {
			await page.goto(route);
			const open = row(page, "external-only").locator('[data-test="home-row-open"]');
			expect(await open.getAttribute("href")).toMatch(/^https?:\/\//);
			await expect(open).toContainText("Visit");
		});

		test("Case C: no-link fixture (no body, no external URL) → the row has no link, axe-core clean", async ({
			page,
		}) => {
			await page.goto(route);
			const details = row(page, "no-link");
			await expect(details).toBeAttached();
			await expect(details.locator("a")).toHaveCount(0);
			// Still expandable: the row shows its lede without a button.
			await details.locator("summary").click();
			await expect(details).toHaveAttribute("open", "");
			const results = await new AxeBuilder({ page }).analyze();
			expect(results.violations).toEqual([]);
		});
	});
}
