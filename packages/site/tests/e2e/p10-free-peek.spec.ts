/**
 * Figure F8, "The free peek", on `/lab/figures/free-peek/` (AC12.2, AC12.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/free-peek/";
const BASE = "http://127.0.0.1:4321";
const fig = (page: Page) => page.locator("figure#f8");
const island = (page: Page) => page.locator("figure#f8 astro-island");

async function hydrate(page: Page): Promise<void> {
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(island(page).getByRole("button", { name: "Step out" })).toBeVisible();
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}
async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await hydrate(page);
}

test("hydrates on scroll, makes no data request, and opens on the out-and-back with a miss", async ({
	page,
}) => {
	const json: string[] = [];
	page.on("request", (r) => {
		if (/free_?peek[^/]*\.json/.test(r.url())) json.push(r.url());
	});
	await open(page);
	expect(json).toHaveLength(0);
	await expect(island(page).locator(".fp-miss")).toHaveCount(1);
	await expect(island(page)).toContainText("the shot lands on tile 4, now empty");
});

test("AC12.2: the Try path puts the miss marker on the vacated tile; Snap fire shows both fact values", async ({
	page,
}) => {
	await open(page);
	await island(page).getByRole("button", { name: "Reset" }).click();
	await island(page).getByRole("button", { name: "Step out" }).click();
	await island(page).getByRole("button", { name: "Step back" }).click();
	const miss = island(page).locator(".fp-miss");
	await expect(miss).toHaveCount(1);
	const missX = await miss.evaluate((el) =>
		el instanceof SVGGraphicsElement ? el.getBBox().x : -1,
	);
	const ghostX = await island(page)
		.locator(".fp-ghost")
		.evaluate((el) => (el instanceof SVGGraphicsElement ? el.getBBox().x : -1));
	expect(Math.abs(missX - ghostX)).toBeLessThan(20); // the cross sits on the tile the peeker left
	await island(page).getByRole("button", { name: "Snap fire" }).click();
	const text = (await island(page).innerText()).replaceAll(" ", " ");
	expect(text).toContain("Hit 57 % of the time (was 17 %)");
	await expect(island(page).locator(".fp-hit")).toHaveCount(1);
});

test("keyboard: arrows on the focused corridor step, and Real CS names the real window", async ({
	page,
}) => {
	await open(page);
	await island(page).getByRole("group").focus();
	await page.keyboard.press("ArrowRight");
	await expect(island(page)).toContainText("Tick 3: the peeker steps out");
	await page.keyboard.press("ArrowLeft");
	await expect(island(page)).toContainText("Tick 4: the peeker steps back");
	await island(page).getByRole("button", { name: "Real CS" }).click();
	await expect(island(page)).toContainText("15.6 ms");
});

test("AC12.3: no-JS shows the four-panel strip", async ({ browser }) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure#f8 li.fp-panel")).toHaveCount(4);
	await expect(page.locator("figure#f8 [data-stamp]")).toContainText("block 28");
	await context.close();
});

test("zero Axe violations: keyframe and hydrated with snap fire on", async ({ page }) => {
	await page.route("**/_astro/*.js", (r) => r.abort());
	await page.goto(URL);
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await page.unroute("**/_astro/*.js");
	await open(page);
	await island(page).getByRole("button", { name: "Snap fire" }).click();
	await island(page).getByRole("button", { name: "Real CS" }).click();
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
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
	const before = (await page.locator("figure#f8 .fig-reserve").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f8 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test("free peek @visual (Pixel 5)", async ({ page }) => {
	await open(page);
	await expect(fig(page)).toHaveScreenshot("free-peek-mobile.png", { animations: "disabled" });
});

test("free peek @visual (1440x900)", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	await expect(fig(page)).toHaveScreenshot("free-peek-desktop.png", { animations: "disabled" });
	await context.close();
});
