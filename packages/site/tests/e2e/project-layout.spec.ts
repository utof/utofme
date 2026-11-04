/**
 * Project page composition, gallery lightbox, meta/link rows, prev/next slots.
 *
 * @see packages/specs/reviews/ui/polish.md (P-03, P-07, P-08, P-12, P-15)
 */
import { expect, test } from "@playwright/test";

const BASE = "http://127.0.0.1:4321";

test("≥1200 px: text left, gallery stacked right beside it", async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/works/enth/`);
	const h1 = await page.locator("h1").boundingBox();
	const figs = page.locator('[data-test="gallery"] figure');
	const a = await figs.nth(0).boundingBox();
	const b = await figs.nth(1).boundingBox();
	if (!h1 || !a || !b) throw new Error("missing boxes");
	expect(a.x).toBeGreaterThan(h1.x + 500);
	// Why: the 1340 px page column leaves the gallery exactly its 400 px minimum at 1280 px.
	expect(a.width).toBeGreaterThanOrEqual(400);
	expect(Math.abs(a.x - b.x)).toBeLessThan(1);
	expect(b.y).toBeGreaterThan(a.y + a.height);
	expect(Math.abs(a.y - h1.y)).toBeLessThan(120);
	const fs = await page.locator("h1").evaluate((e) => getComputedStyle(e).fontSize);
	expect(fs).toBe("36px");
	await ctx.close();
});

test("tablet: 2-up with equal frames, odd first figure spans both columns", async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 800, height: 900 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/works/enth/`);
	const boxes = await page.locator('[data-test="gallery"] figure .frame').evaluateAll((els) =>
		els.map((e) => {
			const r = e.getBoundingClientRect();
			return { x: r.x, w: r.width, h: r.height };
		}),
	);
	expect(boxes).toHaveLength(3);
	const [first, second, third] = boxes;
	if (!first || !second || !third) throw new Error("boxes");
	expect(first.w).toBeGreaterThan(second.w * 1.8);
	expect(Math.abs(second.w - third.w)).toBeLessThan(1);
	expect(Math.abs(second.h - third.h)).toBeLessThan(1);
	expect(Math.abs(second.w / second.h - 16 / 9)).toBeLessThan(0.02);
	await ctx.close();
});

test("lightbox: opens full-res with caption, arrows step, Esc returns focus", async ({
	browser,
}) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/works/enth/`);
	const thumbs = page.locator("button[data-zoom]");
	await thumbs.nth(0).click();
	const dialog = page.locator("dialog.lightbox");
	await expect(dialog).toBeVisible();
	const caption = await thumbs.nth(0).getAttribute("data-caption");
	await expect(dialog.locator("figcaption")).toHaveText(caption ?? "");
	const full = await thumbs.nth(0).getAttribute("data-full");
	expect(await dialog.locator("img").getAttribute("src")).toBe(full);
	await page.keyboard.press("ArrowRight");
	const caption2 = await thumbs.nth(1).getAttribute("data-caption");
	await expect(dialog.locator("figcaption")).toHaveText(caption2 ?? "");
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(thumbs.nth(1)).toBeFocused();
	// backdrop click closes
	await thumbs.nth(0).click();
	await page.mouse.click(5, 5);
	await expect(dialog).toBeHidden();
	await ctx.close();
});

test("meta: tags and links are separate rows; link hit area ≥ 44 px", async ({ browser }) => {
	const ctx = await browser.newContext({
		viewport: { width: 393, height: 852 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await ctx.newPage();
	await page.goto(`${BASE}/works/enth/`);
	const tags = await page.locator(".meta").boundingBox();
	const link = page.locator('[data-test="meta-link"] a').first();
	const box = await link.boundingBox();
	if (!tags || !box) throw new Error("boxes");
	expect(box.y).toBeGreaterThan(tags.y + tags.height - 1);
	expect(box.height).toBeGreaterThanOrEqual(44);
	const color = await link.evaluate((e) => getComputedStyle(e).color);
	expect(color).toBe("rgb(0, 100, 194)");
	await ctx.close();
});

test("prev/next: first project keeps 'All projects' centred", async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/works/tactical-arena/`);
	const nav = await page.locator('[data-test="prev-next"]').boundingBox();
	const all = await page.locator('[data-test="all-projects"]').boundingBox();
	const next = await page.locator('[data-test="next"]').boundingBox();
	if (!nav || !all || !next) throw new Error("boxes");
	expect(Math.abs(all.x + all.width / 2 - (nav.x + nav.width / 2))).toBeLessThan(2);
	expect(Math.abs(next.x + next.width - (nav.x + nav.width))).toBeLessThan(2);
	await ctx.close();
});
