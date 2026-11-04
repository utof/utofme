/**
 * Figure F9, same experiment twice, on `/lab/figures/noise/` (AC13.2, AC13.3, AC16.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/noise/";
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

const island = (page: Page) => page.locator("figure#f9 astro-island");
const rounds = (page: Page) => page.getByRole("slider", { name: "Rounds per pair" });
const seeds = (page: Page) => page.getByLabel("Seeds", { exact: true });
const sentence = (page: Page) => page.locator("figure#f9 .nz-sentence");
const band = (page: Page) => page.locator("figure#f9 svg[role='img'] [data-band]");
const bandWidth = async (page: Page) => Number(await band(page).getAttribute("width"));

async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await page.locator("figure#f9").evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(rounds(page)).toBeVisible();
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}

test("hydrates on scroll with one data request; the default state shows the claim", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/\/noise[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await expect(sentence(page)).toHaveText(
		"With 2 seeds, an effect smaller than ±9.3 Elo is noise.",
	);
	await page.locator("figure#f9").evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(rounds(page)).toHaveValue("8000");
	expect(requests).toHaveLength(1);
	await expect(page.getByRole("button", { name: "Independent seeds" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
});

test("AC13.2 and the Try path: rounds all the way down widens the band, then one seed raises N", async ({
	page,
}) => {
	await open(page);
	const wide0 = await bandWidth(page);
	await rounds(page).fill("1000");
	await expect(rounds(page)).toHaveValue("1000");
	expect(await bandWidth(page)).toBeGreaterThan(wide0 * 2.5);
	await expect(page.locator("figure#f9 svg[role='img']")).toContainText(
		"tournament noise, 90 %: ±18.1",
	);
	await seeds(page).selectOption("1");
	await expect(sentence(page)).toHaveText(
		"With 1 seed, an effect smaller than ±13.2 Elo is noise.",
	);
	await page.getByRole("button", { name: "Same seed" }).click();
	await expect(sentence(page)).toContainText("±6.2");
});

test("keyboard: the slider steps by 1,000 rounds; the live region announces the sentence", async ({
	page,
}) => {
	await open(page);
	await rounds(page).focus();
	await page.keyboard.press("ArrowLeft");
	await expect(rounds(page)).toHaveValue("7000");
	await page.keyboard.press("Home");
	await expect(rounds(page)).toHaveValue("1000");
	await expect(page.locator("figure#f9 [aria-live='polite']")).toContainText(
		"Tournament band ±18.1",
	);
});

test("AC13.3: with JavaScript off the static dot plot and the default sentence are present", async ({
	browser,
}) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(sentence(page)).toHaveText(
		"With 2 seeds, an effect smaller than ±9.3 Elo is noise.",
	);
	const plot = page.locator("figure#f9 astro-island svg[role='img']:visible");
	await expect(plot).toHaveCount(1);
	expect(await plot.locator("[data-dot]").count()).toBeGreaterThan(30);
	await context.close();
});
test("Axe is clean with scripts removed", async ({ browser }) => {
	expect(await axeWithoutScripts(browser)).toEqual([]);
});

test("Axe is clean after hydration and after a change", async ({ page }) => {
	await open(page);
	await seeds(page).selectOption("3");
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a failed data request keeps the keyframe, shows a note and Retry brings the controls back", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/noise*.json", (r) => r.abort());
	await page.goto(URL);
	await page.locator("figure#f9").evaluate((el) => el.scrollIntoView({ block: "center" }));
	const note = page.locator("figure#f9 .nz-fail");
	await expect(note).toContainText("Interactive version failed to load");
	await page.unroute("**/_astro/noise*.json");
	await note.getByRole("button", { name: "Retry" }).click();
	await expect(rounds(page)).toBeVisible();
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
	const before = (await page.locator("figure#f9").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await expect(rounds(page)).toBeVisible();
	const after = (await page.locator("figure#f9").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const wide = await context.newPage();
	await wide.goto(URL);
	expect(await clsOf(wide)).toBeLessThanOrEqual(0.02);
	await context.close();
});

test("@visual F9 element snapshot", async ({ page }) => {
	await open(page);
	await expect(page.locator("figure#f9")).toHaveScreenshot("noise.png", { animations: "disabled" });
});
