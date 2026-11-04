// P9-7 card treatment on `/`: dark-glass caption, hover "reveal" (no zoom),
// keyboard parity, home LCP, Axe. Desktop (fine pointer) context: the default
// Pixel 5 project is touch-only, where the reveal is intentionally static.
// @see packages/specs/specs/09-project-view.md § P9-7
import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test } from "@playwright/test";

test.use({ ...devices["Desktop Chrome"], channel: "chromium" });

const capTransform = (card: import("@playwright/test").Locator) =>
	card.locator(".cap").evaluate((el) => getComputedStyle(el).transform);

test("caption bar is dark glass with all-white text and no radius", async ({ page }) => {
	await page.goto("/");
	const cap = page.locator(".card--media .cap").first();
	const s = await cap.evaluate((el) => {
		const c = getComputedStyle(el);
		return { bg: c.backgroundColor, radius: c.borderRadius, blur: c.backdropFilter };
	});
	expect(s.bg).toBe("rgba(16, 16, 16, 0.62)");
	expect(s.radius).toBe("0px");
	expect(s.blur).toBe("none");
	for (const sel of [".cap__t", ".cap__d", ".cap__m"]) {
		const el = cap.locator(sel).first();
		if (await el.count()) {
			expect(await el.evaluate((e) => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)");
		}
	}
});

test("hover reveals the meta line and does not zoom the media; leaving restores", async ({
	page,
}) => {
	await page.goto("/");
	const card = page.locator("a.card--media").first();
	await card.scrollIntoViewIfNeeded();
	const meta = card.locator(".cap__m");
	const media = card.locator("[data-vt-frame] > *").first();
	await expect(meta).toHaveCSS("opacity", "0");
	expect(await capTransform(card)).not.toBe("none");
	await card.hover();
	await expect(meta).toHaveCSS("opacity", "1");
	await expect.poll(() => capTransform(card)).toBe("none");
	// No zoom: the media never carries a transform, hovered or not.
	await page.waitForTimeout(700);
	expect(await media.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
	await page.mouse.move(0, 0);
	await expect(meta).toHaveCSS("opacity", "0");
});

test("keyboard focus-visible gives the same end state as hover", async ({ page }) => {
	await page.goto("/");
	await page.keyboard.press("Tab");
	// Tab through until a media card is focused.
	for (let i = 0; i < 12; i++) {
		if (await page.locator("a.card--media:focus-visible").count()) break;
		await page.keyboard.press("Tab");
	}
	const card = page.locator("a.card--media:focus-visible");
	await expect(card).toHaveCount(1);
	await expect(card.locator(".cap__m")).toHaveCSS("opacity", "1");
	expect(await capTransform(card)).toBe("none");
});

test("paused motion keeps the meta visible and the media untransformed", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: /pause motion/i }).click();
	const card = page.locator("a.card--media").first();
	await expect(card.locator(".cap__m")).toHaveCSS("opacity", "1");
	await card.hover();
	const media = card.locator("[data-vt-frame] > *").first();
	expect(await media.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
});

test("exactly one element has fetchpriority=high; first cards are not lazy", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('[fetchpriority="high"]')).toHaveCount(1);
	const first = page.locator("a.card--media").first().locator("img").first();
	await expect(first).not.toHaveAttribute("loading", "lazy");
});

test("home has no Axe violations with the caption bar", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("load");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
