import { expect, type Page, test } from "@playwright/test";

test.use({
	viewport: { width: 1280, height: 800 },
	hasTouch: false,
	isMobile: false,
	contextOptions: { reducedMotion: "no-preference" },
});

const mark = (page: Page) => page.getByRole("link", { name: "utofme", exact: true });

async function pointAt(page: Page, x: number, y: number): Promise<void> {
	const bounds = await mark(page).locator("svg").boundingBox();
	if (!bounds) throw new Error("Missing wordmark SVG");
	await page.mouse.move(bounds.x + x, bounds.y + y);
}

async function loadWithRoll(page: Page, roll: number, route = "/"): Promise<void> {
	await page.goto(route);
	await page.evaluate((value) => {
		Math.random = () => value;
	}, roll);
}

test("Block Flip follows the pointer and the next hover picks a different mode", async ({
	page,
}) => {
	await loadWithRoll(page, 0.1);
	const logo = mark(page);
	const block = logo.locator('[data-wordmark-tile][data-x="0"][data-y="0"]');
	const rest = await logo.boundingBox();

	await pointAt(page, 4, 7);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "block-flip");
	await expect(block).toHaveCSS("transform", /^matrix3d\(/);
	await expect(block).toHaveCSS("filter", /^drop-shadow\(/);
	const tilt = await block.evaluate((node) => node.style.transform);

	await pointAt(page, 18, 7);
	await expect.poll(() => block.evaluate((node) => node.style.transform)).not.toBe(tilt);
	expect(await logo.boundingBox()).toEqual(rest);

	await page.mouse.move(0, 0);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);
	await expect(block).toHaveCSS("transform", "none");
	await pointAt(page, 4, 7);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "pixel-assembly");
});

test("Pixel Assembly repels nearby squares and returns to the exact grid", async ({ page }) => {
	await loadWithRoll(page, 0.5);
	const logo = mark(page);
	const layer = logo.locator("[data-wordmark-pixels]");
	const nearby = layer.locator('rect[x="0"][y="0"]');
	const distant = layer.locator('rect[x="10"][y="6"]');

	await pointAt(page, 5, 5);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "pixel-assembly");
	await expect(layer.locator("rect")).toHaveCount(51);
	await expect
		.poll(() => nearby.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).e))
		.toBeLessThan(-0.5);
	await expect(distant).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

	await page.mouse.move(0, 0);
	await expect(nearby).toHaveCSS("transform", "none");
	await expect(distant).toHaveCSS("transform", "none");
});

test("Signal Sweep follows horizontal movement from the top left to the bottom right", async ({
	page,
}) => {
	await loadWithRoll(page, 0.9);
	const logo = mark(page);
	const layer = logo.locator("[data-wordmark-pixels]");
	const first = layer.locator('rect[x="0"][y="0"]');
	const last = layer.locator('rect[x="6"][y="10"]');
	const highlight = "rgb(255, 167, 70)";

	await pointAt(page, 1, 17);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "signal-sweep");
	await expect(first).toHaveCSS("fill", highlight);
	await expect(last).not.toHaveCSS("fill", highlight);

	await pointAt(page, 32, 17);
	await expect(last).toHaveCSS("fill", highlight);
	await expect(first).not.toHaveCSS("fill", highlight);
});

test("motion controls stop the interaction and the logo still navigates home", async ({ page }) => {
	await loadWithRoll(page, 0.1, "/works/tactical-arena/");
	const logo = mark(page);
	await pointAt(page, 5, 5);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "block-flip");
	await page.evaluate(() =>
		document.querySelector<HTMLButtonElement>("[data-motion-toggle]")?.click(),
	);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);
	await pointAt(page, 10, 10);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);

	await logo.click();
	await expect(page).toHaveURL(new URL("/", page.url()).href);
	const play = page.getByRole("button", { name: "Play motion" });
	await expect(play).toHaveAttribute("data-bound", "1");
	await play.click();
	await expect(page.locator("html")).toHaveAttribute("data-motion", "playing");
	await pointAt(page, 5, 5);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "block-flip");
});

test("reduced motion defaults to the static mark", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await loadWithRoll(page, 0.5);
	await pointAt(page, 5, 5);
	await expect(mark(page)).not.toHaveAttribute("data-wordmark-mode", /.+/);
	await expect(mark(page).locator("[data-wordmark-pixels] rect")).toHaveCount(0);
});
