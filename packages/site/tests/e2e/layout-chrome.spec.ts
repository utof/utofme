/**
 * Page chrome: one shared left edge, 404 page, favicon, search header,
 * project header gap, garden gutter, footer hit areas.
 *
 * Why: UI review findings D-01/D-03/D-05/D-08/D-09/D-10/M-11/M-06.
 * @see packages/specs/reviews/ui/breaker-desktop.md
 */
import { expect, test } from "@playwright/test";

const ROUTES = [
	"/",
	"/now/",
	"/colophon/",
	"/stats/",
	"/search/",
	"/garden/",
	"/garden/graph/",
	"/works/tactical-arena/",
];

for (const route of ROUTES) {
	test(`shared page margin on ${route}`, async ({ page }) => {
		await page.goto(route);
		const edge = await page.evaluate(() => {
			const m =
				Number.parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue("--page-margin"),
				) || 0;
			const probe = document.createElement("div");
			probe.style.cssText = "position:absolute;visibility:hidden;width:var(--page-margin)";
			document.body.append(probe);
			const w = probe.getBoundingClientRect().width;
			probe.remove();
			const left = (s: string) => document.querySelector(s)?.getBoundingClientRect().left ?? null;
			return { w: w || m, main: left("main"), footer: left("footer"), card: left(".footer-meta") };
		});
		expect(edge.main).toBeCloseTo(edge.w, 0);
		expect(edge.footer).toBeCloseTo(edge.w, 0);
		if (edge.card !== null) expect(edge.card).toBeCloseTo(edge.w, 0);
	});
}

test("unknown URL serves the light 404 page", async ({ page }) => {
	const res = await page.goto("/this-page-does-not-exist-xyz/");
	expect(res?.status()).toBe(404);
	await expect(page.locator("h1")).toHaveText("Page not found");
	await expect(page.locator('main a[href="/"]').first()).toBeVisible();
	await expect(page.locator('footer[aria-label="Site footer"]')).toBeVisible();
});

test("favicon files exist and are linked", async ({ page, request }) => {
	await page.goto("/now/");
	await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
	expect((await request.get("/favicon.svg")).status()).toBe(200);
	expect((await request.get("/favicon.ico")).status()).toBe(200);
});

test("search has a header with a home link", async ({ page }) => {
	await page.goto("/search/");
	await expect(page.locator('[data-test="site-header"] a[href="/"]')).toBeVisible();
});

test("garden pages have a side gutter", async ({ page }) => {
	for (const route of ["/garden/", "/garden/graph/"]) {
		await page.goto(route);
		const x = (await page.locator("h1").boundingBox())?.x ?? 0;
		expect(x).toBeGreaterThanOrEqual(16);
	}
});
