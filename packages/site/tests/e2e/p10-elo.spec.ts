/**
 * Figure F3, Elo over training, on `/lab/figures/elo/` (AC7.2 to AC7.5, AC16.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/elo/";
const BASE = "http://127.0.0.1:4321";

/**
 * Axe over the page as served with every `<script>` removed (Axe itself needs scripting).
 *
 * Why: same approach as `p10-layout.spec.ts` (AC1.8) for the "JavaScript disabled" check.
 */
async function axeWithoutScripts(browser: Browser): Promise<unknown[]> {
	const context = await browser.newContext({ baseURL: BASE });
	await context.route("**/*.js", (route) => route.abort());
	await context.route(`**${URL}`, async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script>/g, "");
		await route.fulfill({ response, body });
	});
	const page = await context.newPage();
	await page.goto(URL);
	const scripts = await page.locator("script").count();
	const { violations } = await new AxeBuilder({ page }).analyze();
	await context.close();
	return scripts === 0 ? violations : [{ id: "scripts-still-present" }];
}

const island = (page: Page) => page.locator("figure#f3 astro-island");
const chart = (page: Page) => page.locator("figure#f3 svg.el-chart");
const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function hydrate(page: Page): Promise<void> {
	await page.locator("figure#f3").evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(chart(page)).toBeVisible();
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
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	return page;
}

test("hydrates on scroll: the island loses `ssr`, the chart appears, one data request", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/\/elo[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	expect(requests).toHaveLength(0);
	await hydrate(page);
	expect(requests).toHaveLength(1);
	await expect(chip(page, "Hand-made CS maps")).toHaveAttribute("aria-pressed", "true");
});

test("AC7.2: the default view labels block 28 as +96 (+94 to +98); the 3v3 panel has its own axis and paths", async ({
	page,
}) => {
	await open(page);
	await expect(chart(page)).toContainText("+96 (+94 to +98)");
	const main = await chart(page).locator("path[data-line]").getAttribute("d");
	const panelLines = page.locator("figure#f3 .el-panel path[data-panel-line]");
	await expect(panelLines).toHaveCount(2);
	for (const d of await panelLines.evaluateAll((els) => els.map((e) => e.getAttribute("d")))) {
		expect(d).not.toBe(main);
	}
	expect(await page.locator("figure#f3 svg.el-chart .el-panel").count()).toBe(0);
	await expect(
		page.getByText("3v3 era (different game; not on this scale)", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("After block 28 the game changed", { exact: true })).toBeVisible();
});

test("AC7.5: compiled maps show three points, block 28 reading +86", async ({ page }) => {
	await open(page);
	await chip(page, "Compiled CS maps").click();
	await expect(chart(page).locator("[data-point]")).toHaveCount(3);
	await expect(chart(page)).toContainText("+86 (+84 to +89)");
	await expect(chart(page)).toContainText("3 readouts");
	await chip(page, "Generated test maps").click();
	await expect(chart(page).locator("[data-band]")).toHaveCount(0);
	await chip(page, "Hand-made CS maps").click();
	await expect(chart(page).locator("[data-band]")).toHaveCount(2);
});

test("AC7.3 and the Try path: compiled maps, then the flash-kick marker links to its notebook entry", async ({
	page,
}) => {
	await open(page);
	await chip(page, "Compiled CS maps").click();
	await page.getByRole("button", { name: /^Flash kick:/ }).click();
	const card = page.locator("figure#f3 .el-card");
	await expect(card).toContainText("+4 Elo vs control (90 % interval +3 to +6)");
	await card.getByRole("link", { name: "In the notebook" }).click();
	await expect.poll(() => page.evaluate(() => location.hash)).toBe("#nb-p3-kick-fixed");
});

test("keyboard: the markers are in the tab order; arrows read points; Escape closes a card", async ({
	page,
}) => {
	await open(page);
	await chart(page).focus();
	await expect(chart(page)).toContainText("Block 28: +96 Elo (90 % interval +94 to +98)");
	await page.keyboard.press("ArrowLeft");
	await expect(chart(page)).toContainText("Block 24: +86 Elo");
	await page.keyboard.press("Home");
	await expect(chart(page)).toContainText("Block 2: 0 Elo");
	await page.keyboard.press("Tab");
	await expect(page.getByRole("button", { name: /^Flash arc:/ })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("figure#f3 .el-card")).toBeVisible();
	await page.locator("figure#f3 .el-card").getByRole("button", { name: "Close" }).focus();
	await page.keyboard.press("Escape");
	await expect(page.locator("figure#f3 .el-card")).toHaveCount(0);
});

test("AC7.4: with JavaScript off the keyframe shows the claim and the tables have one row per point", async ({
	browser,
}) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure#f3 astro-island svg[role='img']:visible")).toContainText(
		"+96 (+94 to +98)",
	);
	await page.locator("figure#f3 details summary").click();
	await expect(page.locator("figure#f3 table.el-table").first().locator("tbody tr")).toHaveCount(
		10,
	);
	await expect(page.locator("figure#f3 table.el-table").nth(2).locator("tbody tr")).toHaveCount(3);
	await context.close();
});
test("Axe is clean with scripts removed", async ({ browser }) => {
	expect(await axeWithoutScripts(browser)).toEqual([]);
});

test("Axe is clean after hydration, with a marker card open", async ({ page }) => {
	await open(page);
	await page.getByRole("button", { name: /^Bot roles:/ }).click();
	await expect(page.locator("figure#f3 .el-card")).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a failed data request keeps the keyframe, shows a note and Retry brings the chart back", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/elo*.json", (r) => r.abort());
	await page.goto(URL);
	await page.locator("figure#f3").evaluate((el) => el.scrollIntoView({ block: "center" }));
	const note = page.locator("figure#f3 .el-fail");
	await expect(note).toContainText("Interactive version failed to load");
	await expect(page.locator("figure#f3 astro-island svg[role='img']:visible")).toBeVisible();
	await page.unroute("**/_astro/elo*.json");
	await note.getByRole("button", { name: "Retry" }).click();
	await expect(chart(page)).toBeVisible();
	await expect(note).toHaveCount(0);
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

test("AC16.4: CLS stays at or under 0.02 and hydration does not move the figure", async ({
	page,
	browser,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	const before = (await page.locator("figure#f3").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f3").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
	const wide = await desktop(browser);
	expect(await clsOf(wide)).toBeLessThanOrEqual(0.02);
	await wide.context().close();
});

test("@visual F3 element snapshot", async ({ page }) => {
	await open(page);
	await expect(page.locator("figure#f3")).toHaveScreenshot("elo.png", { animations: "disabled" });
});
