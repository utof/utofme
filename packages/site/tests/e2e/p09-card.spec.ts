// Featured cards on `/` (catalogue home): framed covers, pointer motion, keyboard
// focus, home LCP, loop playback rules (P9-6/P9-7), Axe. Desktop (fine pointer) context:
// the default Pixel 5 project is touch-only, where hover does not apply.
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
// @see packages/specs/specs/09-project-view.md § P9-7
import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test } from "@playwright/test";

test.use({ ...devices["Desktop Chrome"], channel: "chromium" });

const hero = (page: import("@playwright/test").Page) =>
	page.locator('[data-test="home-hero"] a.card');
const transformOf = (el: import("@playwright/test").Locator) =>
	el.evaluate((e) => getComputedStyle(e).transform);

test("featured covers sit in a paper frame with a hard 3 px ink edge", async ({ page }) => {
	await page.goto("/");
	const frames = page.locator('[data-test="works-grid"] .ct-frame');
	expect(await frames.count()).toBeGreaterThanOrEqual(2);
	for (const frame of [frames.first(), frames.nth(1)]) {
		const s = await frame.evaluate((el) => {
			const c = getComputedStyle(el);
			return { bg: c.backgroundColor, shadow: c.boxShadow, radius: c.borderRadius };
		});
		expect(s.bg).toBe("rgb(243, 239, 226)");
		expect(s.shadow).toBe("rgb(36, 35, 42) 0px 0px 0px 3px");
		expect(s.radius).toBe("0px");
	}
});

test("featured artwork follows the pointer and returns on exit", async ({ page }) => {
	await page.goto("/");
	const card = hero(page);
	await card.scrollIntoViewIfNeeded();
	const bounds = await card.boundingBox();
	if (!bounds) throw new Error("Expected a visible featured card");
	const content = card.locator(".ct-feat__content");
	const direction = () =>
		content.evaluate((el) => {
			const { transform } = getComputedStyle(el);
			const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
			return [Math.sign(matrix.m41), Math.sign(matrix.m42)];
		});
	await expect(content).toHaveCSS("transform", "none");
	const { x, y, width, height } = bounds;
	await page.mouse.move(x + width * 0.25, y + height * 0.25);
	await expect.poll(direction).toEqual([-1, -1]);
	await page.mouse.move(x + width * 0.75, y + height * 0.75);
	await expect.poll(direction).toEqual([1, 1]);
	await expect(card).toHaveCSS("transform", "none");
	await page.mouse.move(0, 0);
	await expect(content).toHaveCSS("transform", "none");
});

test("keyboard focus shows a 4 px ink outline on a featured card", async ({ page }) => {
	await page.goto("/");
	for (let i = 0; i < 20; i++) {
		await page.keyboard.press("Tab");
		if (await page.locator("a.card:focus-visible").count()) break;
	}
	const card = page.locator("a.card:focus-visible");
	await expect(card).toHaveCount(1);
	await expect(card).toHaveCSS("outline-width", "4px");
	await expect(card).toHaveCSS("outline-color", "rgb(36, 35, 42)");
	await expect(card).toHaveCSS("outline-style", "solid");
});

test("paused motion: hover leaves the artwork still", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: /pause motion/i }).click();
	const card = hero(page);
	await card.hover({ position: { x: 24, y: 24 } });
	await page.waitForTimeout(400);
	expect(await transformOf(card.locator(".ct-feat__content"))).toBe("none");
	expect(await transformOf(card.locator("img").first())).toBe("none");
});

test("exactly one element has fetchpriority=high; first cards are not lazy", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('[fetchpriority="high"]')).toHaveCount(1);
	const cards = page.locator('[data-test="works-grid"] .card');
	await expect(cards.first().locator("img").first()).toHaveAttribute("fetchpriority", "high");
	for (let i = 0; i < 4; i++) {
		await expect(cards.nth(i).locator("img").first()).not.toHaveAttribute("loading", "lazy");
	}
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

test("covers fill their fixed-ratio frame and the highlights sit in columns", async ({ page }) => {
	await page.goto("/");
	const clips = await page.locator('[data-test="works-grid"] .ct-clip').evaluateAll((els) =>
		els.map((el) => {
			const r = el.getBoundingClientRect();
			const media = el.querySelector(".loop-frame, img")?.getBoundingClientRect();
			return {
				hero: el.classList.contains("ct-clip--hero"),
				ratio: r.width / r.height,
				fills: media
					? Math.abs(media.width - r.width) < 1 && Math.abs(media.height - r.height) < 1
					: false,
				x: Math.round(r.x),
			};
		}),
	);
	expect(clips.length).toBeGreaterThan(1);
	for (const c of clips) {
		expect(c.fills).toBe(true);
		expect(Math.abs(c.ratio / (c.hero ? 16 / 8.4 : 16 / 10) - 1)).toBeLessThan(0.02);
	}
	// Desktop Chrome is 1280 wide: the highlight cards must not all stack in one column.
	expect(new Set(clips.filter((c) => !c.hero).map((c) => c.x)).size).toBeGreaterThanOrEqual(2);
});

test("home has no Axe violations (desktop)", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("load");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
