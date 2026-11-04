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

const loopCard = (page: import("@playwright/test").Page, slug: string) =>
	page.locator(`a.card[data-work-slug="${slug}"]`);
const cardVideo = (card: import("@playwright/test").Locator) => card.locator("video[data-loop]");
const isPlaying = (v: import("@playwright/test").Locator) =>
	v.evaluate((el) => el instanceof HTMLVideoElement && !el.paused && el.currentTime > 0);

test("a slideshow card is still at rest and plays only while hovered, then returns to the poster", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForLoadState("load");
	const card = loopCard(page, "enth");
	await card.scrollIntoViewIfNeeded();
	const video = cardVideo(card);
	await expect(video).toHaveAttribute("data-loop-play", "hover");
	await page.waitForTimeout(1500);
	expect(await video.evaluate((el) => el instanceof HTMLVideoElement && el.paused)).toBe(true);
	await expect(video).not.toHaveAttribute("data-ready", /.*/);
	await card.hover();
	await expect.poll(() => isPlaying(video), { timeout: 8000 }).toBe(true);
	await expect(video).toHaveAttribute("data-ready", /.*/);
	await page.mouse.move(0, 0);
	await expect
		.poll(() => video.evaluate((el) => el instanceof HTMLVideoElement && el.paused))
		.toBe(true);
	await expect(video).not.toHaveAttribute("data-ready", /.*/);
	expect(await video.evaluate((el) => el instanceof HTMLVideoElement && el.currentTime)).toBe(0);
});

test("a slideshow card plays on keyboard focus and stops when focus leaves", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("load");
	const card = loopCard(page, "enth");
	const video = cardVideo(card);
	await card.scrollIntoViewIfNeeded();
	// A key press first, so the script focus below counts as keyboard focus (:focus-visible).
	await page.keyboard.press("Tab");
	await card.focus();
	await expect(card).toBeFocused();
	await expect.poll(() => isPlaying(video), { timeout: 8000 }).toBe(true);
	await page.keyboard.press("Tab");
	await expect
		.poll(() => video.evaluate((el) => el instanceof HTMLVideoElement && el.paused))
		.toBe(true);
	await expect(video).not.toHaveAttribute("data-ready", /.*/);
});

test("an animation card (montage) autoplays in view without hover", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("load");
	const card = loopCard(page, "modified-maxwell-taichi");
	await card.scrollIntoViewIfNeeded();
	const video = cardVideo(card);
	await expect(video).toHaveAttribute("data-loop-play", "view");
	await expect.poll(() => isPlaying(video), { timeout: 8000 }).toBe(true);
});

test("a hovered slideshow card does not play while motion is paused", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: /pause motion/i }).click();
	const card = loopCard(page, "enth");
	await card.scrollIntoViewIfNeeded();
	await card.hover();
	await page.waitForTimeout(1500);
	expect(await cardVideo(card).evaluate((el) => el instanceof HTMLVideoElement && el.paused)).toBe(
		true,
	);
});

test("loop cards keep their rendition's aspect and the masonry packs without holes", async ({
	page,
}) => {
	await page.goto("/");
	const cards = await page.locator('[data-test="works-grid"] .loop-frame').evaluateAll((els) =>
		els.map((el) => {
			const v = el.querySelector("video");
			const r = el.getBoundingClientRect();
			return {
				ratio: r.width / r.height,
				video: Number(v?.getAttribute("width")) / Number(v?.getAttribute("height")),
				x: Math.round(r.x),
			};
		}),
	);
	expect(cards.length).toBeGreaterThan(0);
	for (const c of cards) expect(Math.abs(c.ratio / c.video - 1)).toBeLessThan(0.01);
	// Desktop Chrome is 1280 wide (three columns): the loop cards must not all stack in one column.
	expect(new Set(cards.map((c) => c.x)).size).toBeGreaterThanOrEqual(2);
});

test("home has no Axe violations with the caption bar", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("load");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
