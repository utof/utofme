/**
 * Figure F11, "Agents vs pros, side by side", on `/lab/figures/agents-vs-pros/` (AC15.1, AC15.2).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/agents-vs-pros/";
const BASE = "http://127.0.0.1:4321";
const fig = (page: Page) => page.locator("figure#f11");
const island = (page: Page) => page.locator("figure#f11 astro-island");
const rows = (page: Page) => island(page).locator("li.av-row");

async function hydrate(page: Page): Promise<void> {
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(island(page).getByRole("button", { name: "Sort by gap" })).toBeVisible();
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}
async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await hydrate(page);
}

test("hydrates on scroll with one data request; eleven rows, each with its stamp", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/agents_vs_pros[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await open(page);
	expect(requests).toHaveLength(1);
	await expect(rows(page)).toHaveCount(11);
	for (const stamp of await island(page).locator("[data-stamp]").allInnerTexts())
		expect(stamp).toMatch(/^(block 28 · 5v5|3v3 agent · 2026-10-25)$/);
});

test("AC15.1 and the Try path: sorted by gap, the toggle flips the order, the top row opens", async ({
	page,
}) => {
	await open(page);
	await expect(rows(page).first()).toHaveAttribute("data-row", "flashes");
	const sort = island(page).getByRole("button", { name: "Sort by gap" });
	await expect(sort).toHaveAttribute("aria-pressed", "true");
	await sort.click();
	await expect(rows(page).first()).toHaveAttribute("data-row", "openKill");
	await sort.click();
	const top = rows(page).first().getByRole("button");
	await top.focus();
	await page.keyboard.press("Enter");
	await expect(top).toHaveAttribute("aria-expanded", "true");
	await expect(island(page)).toContainText("Source: 3v3 agent readout; 224 pro maps of 2026.");
	await page.keyboard.press("Space");
	await expect(top).toHaveAttribute("aria-expanded", "false");
});

test("AC15.2: no-JS shows eleven stamped rows and a table with eleven rows", async ({
	browser,
}) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure#f11 li.av-row")).toHaveCount(11);
	await page.locator("details.fig-details > summary").click();
	await expect(page.locator("details tbody tr")).toHaveCount(11);
	await context.close();
});

test("zero Axe violations: keyframe, hydrated and with a row open", async ({ page }) => {
	await page.route("**/_astro/*.js", (r) => r.abort());
	await page.goto(URL);
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await page.unroute("**/_astro/*.js");
	await open(page);
	await rows(page).first().getByRole("button").click();
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test("a failed data request keeps the keyframe with a note and Retry recovers", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/agents_vs_pros*.json", (r) => r.abort());
	await page.goto(URL);
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator(".av-fail")).toContainText("Interactive version failed to load");
	await page.unroute("**/_astro/agents_vs_pros*.json");
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(island(page).getByRole("button", { name: "Sort by gap" })).toBeVisible();
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
	const before = (await page.locator("figure#f11 .fig-reserve").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f11 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test("agents vs pros @visual (Pixel 5)", async ({ page }) => {
	await open(page);
	await expect(fig(page)).toHaveScreenshot("agents-vs-pros-mobile.png", { animations: "disabled" });
});

test("agents vs pros @visual (1440x900)", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	await expect(fig(page)).toHaveScreenshot("agents-vs-pros-desktop.png", {
		animations: "disabled",
	});
	await context.close();
});
