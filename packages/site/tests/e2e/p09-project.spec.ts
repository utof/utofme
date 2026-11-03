/**
 * Project page anatomy (spec P9-8), e2e.
 *
 * @see packages/specs/specs/09-project-view.md § P9-8
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("anatomy: one h1, meta row, banner frame, prev/next, ordered", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	await expect(page.locator("h1")).toHaveCount(1);
	await expect(page.locator("h1")).toHaveAttribute("tabindex", "-1");
	await expect(page.locator('[data-test="project-meta"]')).toHaveCount(1);
	await expect(page.locator(".banner[data-vt-frame][data-work-slug]")).toHaveCount(1);
	await expect(page.locator('[data-test="prev-next"]')).toBeVisible();
	const order = await page.evaluate(() => {
		const q = (s: string) => document.querySelector(s);
		const pos = (a: Element | null, b: Element | null) =>
			!!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		return {
			bannerBeforeH1: pos(q(".banner"), q("h1")),
			h1BeforeMeta: pos(q("h1"), q('[data-test="project-meta"]')),
			metaBeforeBody: pos(q('[data-test="project-meta"]'), q(".e-content")),
			bodyBeforeNav: pos(q(".e-content"), q('[data-test="prev-next"]')),
		};
	});
	expect(order).toEqual({
		bannerBeforeH1: true,
		h1BeforeMeta: true,
		metaBeforeBody: true,
		bodyBeforeNav: true,
	});
});

test("banner is 16:9 on a phone", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	const box = await page.locator(".banner").boundingBox();
	if (!box) throw new Error("no banner");
	expect(box.width / box.height).toBeGreaterThan(16 / 9 - 0.05);
	expect(box.width / box.height).toBeLessThan(16 / 9 + 0.05);
});

test("banner is 3:1 on desktop", async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await ctx.newPage();
	await page.goto("http://127.0.0.1:4321/works/cover-fixture/");
	const box = await page.locator(".banner").boundingBox();
	if (!box) throw new Error("no banner");
	expect(Math.abs(box.width / box.height - 3)).toBeLessThan(0.06);
	await ctx.close();
});

test("axe clean on a project page", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
