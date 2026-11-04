/**
 * Figure F6, "The machine, as boxes you can poke", on `/lab/figures/machine/` (AC10.1 to AC10.3,
 * AC16.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/machine/";
const BASE = "http://127.0.0.1:4321";
const fig = (page: Page) => page.locator("figure#f6");
const island = (page: Page) => page.locator("figure#f6 astro-island");
const count = (page: Page) => page.locator("figure#f6 .mc-count");
const readout = (page: Page) => page.locator("figure#f6 [data-readout]");

async function hydrate(page: Page): Promise<void> {
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator("figure#f6 [data-node]").first()).toBeAttached();
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}
async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await hydrate(page);
}
async function desktop(browser: Browser): Promise<Page> {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1280, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	return page;
}

test("hydrates on scroll with one data request; stage 4 is highlighted by default", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/\/architecture[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await expect(count(page)).toHaveText("4 / 9");
	await hydrate(page);
	expect(requests).toHaveLength(1);
	await expect(count(page)).toHaveText("4 / 9");
	await expect(readout(page)).toContainText("4. Train");
	await expect(page.locator("figure#f6 [data-node]")).toHaveCount(18);
	await expect(page.locator("figure#f6 [data-edge]")).toHaveCount(27);
	await expect(page.locator("[data-node='train']")).toHaveClass(/\bon\b/);
});

test("the Try path on a phone: Next steps through the stages in the vertical layout", async ({
	page,
}) => {
	await open(page);
	await expect(page.locator("figure#f6 svg.mc-svg")).toHaveAttribute("viewBox", "0 0 360 792");
	await page.getByRole("button", { name: "Next" }).click();
	await expect(count(page)).toHaveText("5 / 9");
	await expect(readout(page)).toContainText("5. Save");
	await expect(page.locator("[data-node='backup']")).toHaveClass(/\bon\b/);
});

test("AC10.1: focusing each of the 18 boxes shows its blurb; Next x9 reaches 9 / 9 and Previous returns", async ({
	browser,
}) => {
	const page = await desktop(browser);
	await expect(page.locator("figure#f6 svg.mc-svg")).toHaveAttribute("viewBox", "0 0 1000 600");
	const nodes = page.locator("figure#f6 [data-node]");
	for (let i = 0; i < 18; i++) {
		const n = nodes.nth(i);
		await n.focus();
		const name = (await n.getAttribute("aria-label")) ?? "?";
		await expect(readout(page)).toContainText(name);
		await expect(readout(page)).toContainText("Receives:");
		await expect(readout(page)).toContainText("Sends:");
	}
	// The default is stage 4, so Next stops (disabled) at 9 / 9 after five clicks; nine presses are
	// safe because the button is only pressed while enabled.
	const next = page.getByRole("button", { name: "Next" });
	for (let i = 0; i < 9; i++) if (await next.isEnabled()) await next.click();
	await expect(count(page)).toHaveText("9 / 9");
	await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
	for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Previous" }).click();
	await expect(count(page)).toHaveText("1 / 9");
	await page.context().close();
});

test("an arrow shows its flow sentence; keyboard moves between connected boxes", async ({
	browser,
}) => {
	const page = await desktop(browser);
	await page.locator("[data-edge='env>train']").focus();
	await expect(readout(page)).toContainText(
		"512 games × 256 steps × 10 players = 1.31 M decisions",
	);
	await page.locator("[data-node='env']").focus();
	await page.keyboard.press("ArrowDown");
	await expect(page.locator("[data-node='bots']")).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("[data-node='bots']")).toHaveAttribute("aria-pressed", "true");
	await page.keyboard.press("Escape");
	await expect(page.locator("[data-node='bots']")).toHaveAttribute("aria-pressed", "false");
	await page.context().close();
});

test("Pause motion: the island carries the calm class under reduced motion", async ({ page }) => {
	await open(page);
	await expect(page.locator("figure#f6 .fig-box")).toHaveClass(/\bcalm\b/);
});

test("AC10.2: no-JS shows the diagram keyframe, 18 blurbs and the 9 stages", async ({
	browser,
}) => {
	const context = await browser.newContext({
		baseURL: BASE,
		javaScriptEnabled: false,
		viewport: { width: 1280, height: 900 },
	});
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure#f6 svg[role='img']")).toBeVisible();
	await expect(count(page)).toHaveText("4 / 9");
	await expect(page.locator("figure#f6 details dl dt")).toHaveCount(18);
	await expect(page.locator("figure#f6 details ol li")).toHaveCount(9);
	await context.close();
});

test("zero Axe violations: keyframe, hydrated and after Next", async ({ page }) => {
	await page.route("**/_astro/*.js", (r) => r.abort());
	await page.goto(URL);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await page.unroute("**/_astro/*.js");
	await open(page);
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await page.getByRole("button", { name: "Next" }).click();
	await page.locator("[data-node='backup']").focus();
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test("a failed data request keeps the keyframe with a note and Retry recovers", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/architecture*.json", (r) => r.abort());
	await page.goto(URL);
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator(".mc-fail")).toContainText("Interactive version failed to load");
	await page.unroute("**/_astro/architecture*.json");
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.locator("figure#f6 [data-node]").first()).toBeAttached();
});

async function clsOf(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				let sum = 0;
				new PerformanceObserver((list) => {
					for (const e of list.getEntries()) {
						if (
							"value" in e &&
							typeof e.value === "number" &&
							"hadRecentInput" in e &&
							!e.hadRecentInput
						)
							sum += e.value;
					}
				}).observe({ type: "layout-shift", buffered: true });
				const max = document.documentElement.scrollHeight;
				let y = 0;
				const step = () => {
					window.scrollTo(0, y);
					y += window.innerHeight / 2;
					if (y <= max + window.innerHeight) setTimeout(step, 120);
					else setTimeout(() => resolve(sum), 400);
				};
				step();
			}),
	);
}

test("AC16.4: CLS at most 0.02 while scrolling; hydration moves the box by at most 2 px", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	const before = (await page.locator("figure#f6 .fig-reserve").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f6 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test("hydration moves the box by at most 2 px at 1280 px too", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1280, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	const before = (await page.locator("figure#f6 .fig-reserve").boundingBox())?.height ?? 0;
	await hydrate(page);
	const after = (await page.locator("figure#f6 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
	await context.close();
});

test("machine @visual (Pixel 5)", async ({ page }) => {
	await open(page);
	await expect(fig(page)).toHaveScreenshot("machine-mobile.png", { animations: "disabled" });
});

test("machine @visual (1440x900)", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	await expect(fig(page)).toHaveScreenshot("machine-desktop.png", { animations: "disabled" });
	await context.close();
});
