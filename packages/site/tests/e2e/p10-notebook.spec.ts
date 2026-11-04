/**
 * Figure F7, "Tried / kept / parked", on `/lab/figures/notebook/` (AC11.2 to AC11.6, AC16.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/notebook/";
const BASE = "http://127.0.0.1:4321";
const fig = (page: Page) => page.locator("figure#f7");
const island = (page: Page) => page.locator("figure#f7 astro-island");
const marks = (page: Page) => page.locator("figure#f7 [data-mark]");
const chip = (page: Page, name: string) =>
	page.locator(`figure#f7 .nb-chip[data-outcome='${name}']`);

async function hydrate(page: Page): Promise<void> {
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator("figure#f7 .nb-chips")).toContainText("Outcome");
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}
async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await hydrate(page);
}
async function desktop(browser: Browser, hash = ""): Promise<Page> {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1280, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL + hash);
	await hydrate(page);
	return page;
}

test("hydrates on scroll with one notebook request and none for the parked drawer", async ({
	browser,
}) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1280, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/\/notebook[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await page.goto(URL);
	await hydrate(page);
	await expect(marks(page)).toHaveCount(229);
	await expect(page.locator("figure#f7 .nb-ring")).toHaveCount(10);
	await expect(page.locator("figure#f7 .nb-legend")).toContainText("kept 99");
	expect(requests.filter((u) => !u.includes("notebook_parked"))).toHaveLength(1);
	expect(requests.filter((u) => u.includes("notebook_parked"))).toHaveLength(0);
	await context.close();
});

test("the Try path: filter to reverted, then open a starred entry", async ({ browser }) => {
	const page = await desktop(browser);
	await chip(page, "reverted").click();
	await expect(marks(page)).toHaveCount(41);
	await marks(page)
		.filter({ has: page.locator(".nb-ring") })
		.first()
		.click();
	await expect(page.locator("figure#f7 .nb-card")).toBeVisible();
	await expect(page.locator("figure#f7 .nb-card")).toContainText("reverted");
	await page.context().close();
});

test("AC11.2: chip kept shows only kept marks; Enter on a mark opens its card", async ({
	browser,
}) => {
	const page = await desktop(browser);
	await chip(page, "kept").click();
	await expect(chip(page, "kept")).toHaveAttribute("aria-pressed", "true");
	await expect(marks(page)).toHaveCount(99);
	await expect(page.locator("figure#f7 .nb-mark:not(.nb-kept)")).toHaveCount(0);
	await chip(page, "kept").click();
	await expect(marks(page)).toHaveCount(229);
	const mark = page.locator("[data-mark='p2-lr1e4']");
	await mark.focus();
	await page.keyboard.press("Enter");
	const card = page.locator("#nb-p2-lr1e4");
	await expect(card).toContainText("Learning rate 1e-4 at plateau");
	await expect(card).toContainText("CS Elo vs lr 3e-4: +9");
	await expect(card).toContainText("2026-10-20");
	await page.context().close();
});

test("keyboard: the track is one tab stop and arrows move within and across rows", async ({
	browser,
}) => {
	const page = await desktop(browser);
	await expect(page.locator("figure#f7 [data-mark][tabindex='0']")).toHaveCount(1);
	const first = page.locator("figure#f7 [data-mark][tabindex='0']");
	await first.focus();
	const id0 = await first.getAttribute("data-mark");
	await page.keyboard.press("ArrowRight");
	await expect(page.locator("figure#f7 [data-mark]:focus")).not.toHaveAttribute(
		"data-mark",
		id0 ?? "",
	);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("End");
	await page.keyboard.press("Home");
	await expect(page.locator("figure#f7 [data-mark][tabindex='0']")).toHaveCount(1);
	await page.context().close();
});

test("AC11.3: loading with #nb-<id> opens that card", async ({ browser }) => {
	const page = await desktop(browser, "#nb-p3-flash-arc");
	await expect(page.locator("#nb-p3-flash-arc")).toContainText("Flash self-blind diagnosis");
	await page.context().close();
});

test("AC11.4: a phone shows the list with the ten starred entries first, 20 at a time", async ({
	page,
}) => {
	await open(page);
	const items = page.locator("figure#f7 .nb-item");
	await expect(items).toHaveCount(20);
	for (let i = 0; i < 10; i++) await expect(items.nth(i)).toContainText("★");
	await expect(items.nth(10)).not.toContainText("★");
	await page.getByRole("button", { name: "Show 20 more" }).click();
	await expect(items).toHaveCount(40);
	await items.first().click();
	await expect(page.locator("figure#f7 .nb-card")).toContainText("Zero-shot on CS maps");
});

test("AC11.5: no-JS shows the ten highlights and a count of the rest", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		javaScriptEnabled: false,
		viewport: { width: 1280, height: 900 },
	});
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure#f7 .nb-hl-list li")).toHaveCount(10);
	await expect(page.locator("figure#f7 .nb-hl-more")).toContainText("219 more entries");
	await expect(page.locator("figure#f7 .nb-legend")).toContainText("reverted 41");
	await context.close();
});

test("AC11.6: the parked dataset is requested only after the drawer opens", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1280, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	const parked: string[] = [];
	page.on("request", (r) => {
		if (/notebook_parked[^/]*\.json/.test(r.url())) parked.push(r.url());
	});
	await page.goto(URL);
	await hydrate(page);
	await page.waitForTimeout(400);
	expect(parked).toHaveLength(0);
	await page.locator("figure#f7 .nb-drawer summary").click();
	await expect(page.locator("figure#f7 .nb-pk li")).toHaveCount(74);
	await expect(page.locator("figure#f7 .nb-pk")).toContainText("Reopen if");
	expect(parked).toHaveLength(1);
	await context.close();
});

test("zero Axe violations: keyframe, hydrated, filtered with a card open", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1280, height: 900 },
	});
	const k = await context.newPage();
	await k.route("**/_astro/*.js", (r) => r.abort());
	await k.goto(URL);
	expect((await new AxeBuilder({ page: k }).analyze()).violations).toEqual([]);
	await context.close();
	const page = await desktop(browser);
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await chip(page, "reverted").click();
	await page.locator("[data-mark='p2-kickmain']").click();
	await page.locator("figure#f7 .nb-drawer summary").click();
	await expect(page.locator("figure#f7 .nb-pk li").first()).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await page.context().close();
	const mobile = await browser.newContext({ baseURL: BASE, viewport: { width: 393, height: 851 } });
	const m = await mobile.newPage();
	await m.goto(URL);
	await hydrate(m);
	expect((await new AxeBuilder({ page: m }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await mobile.close();
});

test("a failed data request keeps the keyframe with a note and Retry recovers", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/notebook.*.json", (r) => r.abort());
	await page.goto(URL);
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator(".nb-fail")).toContainText("Interactive version failed to load");
	await page.unroute("**/_astro/notebook.*.json");
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.locator("figure#f7 .nb-chips")).toContainText("Outcome");
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
	const before = (await page.locator("figure#f7 .fig-reserve").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f7 .fig-reserve").boundingBox())?.height ?? 0;
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
	const before = (await page.locator("figure#f7 .fig-reserve").boundingBox())?.height ?? 0;
	await hydrate(page);
	const after = (await page.locator("figure#f7 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
	await context.close();
});

test("notebook @visual (Pixel 5)", async ({ page }) => {
	await open(page);
	await expect(fig(page)).toHaveScreenshot("notebook-mobile.png", { animations: "disabled" });
});

test("notebook @visual (1440x900)", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	await expect(fig(page)).toHaveScreenshot("notebook-desktop.png", { animations: "disabled" });
	await context.close();
});
