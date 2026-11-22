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
	await page.mouse.move(bounds.x + x * bounds.width, bounds.y + y * bounds.height);
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

	await pointAt(page, 0.12, 0.21);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "block-flip");
	await expect(block).toHaveCSS("transform", /^matrix3d\(/);
	await expect(block).toHaveCSS("filter", /^drop-shadow\(/);
	const tilt = await block.evaluate((node) => node.style.transform);

	await pointAt(page, 0.55, 0.21);
	await expect.poll(() => block.evaluate((node) => node.style.transform)).not.toBe(tilt);
	expect(await logo.boundingBox()).toEqual(rest);

	await page.mouse.move(0, 0);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);
	await expect(block).toHaveCSS("transform", "none");
	await pointAt(page, 0.12, 0.21);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "pixel-assembly");
});

test("Pixel Assembly repels nearby squares and returns to the exact grid", async ({ page }) => {
	await loadWithRoll(page, 0.25);
	const logo = mark(page);
	const layer = logo.locator("[data-wordmark-pixels]");
	const nearby = layer.locator('rect[x="0"][y="0"]');
	const distant = layer.locator('rect[x="10"][y="6"]');

	await pointAt(page, 0.15, 0.15);
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
	await loadWithRoll(page, 0.45);
	const logo = mark(page);
	const layer = logo.locator("[data-wordmark-pixels]");
	const first = layer.locator('rect[x="0"][y="0"]');
	const last = layer.locator('rect[x="6"][y="10"]');
	const highlight = "rgb(255, 167, 70)";

	await pointAt(page, 0.03, 0.52);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "signal-sweep");
	await expect(first).toHaveCSS("fill", highlight);
	await expect(last).not.toHaveCSS("fill", highlight);

	await pointAt(page, 0.97, 0.52);
	await expect(last).toHaveCSS("fill", highlight);
	await expect(first).not.toHaveCSS("fill", highlight);
});

test("Outline opens the nearby strokes and restores the solid mark on exit", async ({ page }) => {
	await loadWithRoll(page, 0.65);
	const logo = mark(page);
	const u = logo.locator('[data-wordmark-tile][data-x="0"][data-y="0"]');
	const f = logo.locator('[data-wordmark-tile][data-x="6"][data-y="6"]');
	const solid = await u.getAttribute("d");
	const distant = await f.getAttribute("d");

	await pointAt(page, 0.08, 0.16);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "outline");
	const filled = (x: number) =>
		u.evaluate(
			(path, at) => path instanceof SVGPathElement && path.isPointInFill({ x: at, y: 2.5 }),
			x,
		);
	await expect.poll(() => filled(0.5)).toBe(false);
	expect(await filled(0.1)).toBe(true);
	expect(await f.getAttribute("d")).toBe(distant);

	await pointAt(page, 0.83, 0.82);
	await expect.poll(() => f.getAttribute("d")).not.toBe(distant);
	await expect.poll(() => u.getAttribute("d")).toBe(solid);
	await page.mouse.move(0, 0);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);
	expect(await f.getAttribute("d")).toBe(distant);
	await expect(logo.locator("[data-wordmark-pixels] rect")).toHaveCount(0);
});

test("Stretch follows the nearest corner and preserves the mark's frame and gutters", async ({
	page,
}) => {
	await loadWithRoll(page, 0.85);
	const logo = mark(page);
	const tiles = logo.locator("[data-wordmark-tile]");
	const paths = () => tiles.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("d")));
	const boxes = () =>
		tiles.evaluateAll((nodes) =>
			nodes.map((node) => {
				if (!(node instanceof SVGPathElement)) throw new Error("Expected a wordmark path");
				const { x, y, width, height } = node.getBBox();
				return { x, y, width, height };
			}),
		);
	const atRest = await paths();
	const bounds = await logo.boundingBox();

	await pointAt(page, 0.08, 0.11);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "stretch");
	await expect.poll(async () => (await boxes())[0]?.width).toBeGreaterThan(6);
	const [u, t, o, f] = await boxes();
	if (!u || !t || !o || !f) throw new Error("Missing wordmark glyphs");
	expect(t.x - u.width).toBeCloseTo(1);
	expect(o.y - u.height).toBeCloseTo(1);
	expect(f.x + f.width).toBeCloseTo(11);
	expect(f.y + f.height).toBeCloseTo(11);
	expect(await logo.boundingBox()).toEqual(bounds);

	await pointAt(page, 0.89, 0.9);
	await expect.poll(async () => (await boxes())[3]?.width).toBeGreaterThan(6);
	await page.mouse.move(0, 0);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);
	expect(await paths()).toEqual(atRest);
});

test("motion controls stop the interaction and the logo still navigates home", async ({ page }) => {
	await loadWithRoll(page, 0.1, "/works/tactical-arena/");
	const logo = mark(page);
	await pointAt(page, 0.15, 0.15);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "block-flip");
	await page.evaluate(() =>
		document.querySelector<HTMLButtonElement>("[data-motion-toggle]")?.click(),
	);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);
	await pointAt(page, 0.3, 0.3);
	await expect(logo).not.toHaveAttribute("data-wordmark-mode", /.+/);

	await logo.click();
	await expect(page).toHaveURL(new URL("/", page.url()).href);
	const play = page.getByRole("button", { name: "Play motion" });
	await expect(play).toHaveAttribute("data-bound", "1");
	await play.click();
	await expect(page.locator("html")).toHaveAttribute("data-motion", "playing");
	await pointAt(page, 0.15, 0.15);
	await expect(logo).toHaveAttribute("data-wordmark-mode", "block-flip");
});

test("reduced motion defaults to the static mark", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await loadWithRoll(page, 0.5);
	await pointAt(page, 0.15, 0.15);
	await expect(mark(page)).not.toHaveAttribute("data-wordmark-mode", /.+/);
	await expect(mark(page).locator("[data-wordmark-pixels] rect")).toHaveCount(0);
});
