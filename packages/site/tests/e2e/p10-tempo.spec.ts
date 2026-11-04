/**
 * Figure F4, "When does the first fight start?", on `/lab/figures/tempo/` (AC8.1 to AC8.3, AC16.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const URL = "/lab/figures/tempo/";
const BASE = "http://127.0.0.1:4321";
const fig = (page: Page) => page.locator("figure#f4");
const island = (page: Page) => page.locator("figure#f4 astro-island");

async function hydrate(page: Page): Promise<void> {
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(
		page.getByRole("slider", { name: /Your guess/ }).or(page.getByText("Guess again")),
	).toBeVisible();
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}
async function open(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await hydrate(page);
}

test("hydrates on scroll with one data request; the guess is open and the pros are hidden", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/tempo[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await open(page);
	expect(requests).toHaveLength(1);
	await expect(island(page).getByRole("slider")).toHaveValue("12");
	await expect(page.locator("figure#f4 [data-stamp]")).toContainText(
		"block 28 (5v5), 2026-11-04 rerun",
	);
});

test("AC8.1: before Reveal the snapshot has no 22.8; after Reveal it has 22.8 s and 22.1 to 23.6", async ({
	page,
}) => {
	await open(page);
	const before = await island(page).ariaSnapshot();
	expect(before).not.toContain("22.8");
	expect(before).toContain("9.6");
	await island(page).getByRole("slider").press("ArrowRight");
	await island(page).getByRole("button", { name: "Reveal" }).click();
	const after = (await island(page).ariaSnapshot()).replaceAll(" ", " ");
	expect(after).toContain("22.8 s");
	expect(after).toContain("22.1 to 23.6");
	expect(after).toContain("You guessed 12.8 s");
});

test("the Try path: drag the marker on the plot, then press Reveal; reload keeps it revealed", async ({
	page,
}) => {
	await open(page);
	const plot = island(page).locator(".tp-plot");
	const box = await plot.boundingBox();
	if (!box) throw new Error("no plot");
	await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.3);
	await page.mouse.up();
	const guess = Number(await island(page).getByRole("slider").inputValue());
	expect(guess).toBeGreaterThan(20);
	await island(page).getByRole("button", { name: "Reveal" }).click();
	await expect(island(page)).toContainText("pros take 22.8");
	await page.reload();
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(island(page).getByRole("button", { name: "Guess again" })).toBeVisible();
});

test("AC8.2: the plant metric reads 74.7 s for pros and 34.4 s for block 28", async ({ page }) => {
	await open(page);
	await island(page).getByRole("button", { name: "Just show me" }).click();
	await island(page).getByLabel("Metric").selectOption("plant");
	const text = (await island(page).innerText()).replaceAll(" ", " ");
	expect(text).toContain("74.7 s");
	expect(text).toContain("34.4 s");
	expect(text).toMatch(/never plant/);
	for (const d of await island(page)
		.locator("path")
		.evaluateAll((els) => els.map((e) => e.getAttribute("d") ?? "")))
		expect(d).not.toMatch(/[CcQqSsTtAa]/);
});

test("AC8.3: the stamp changes with the block selector", async ({ page }) => {
	await open(page);
	const stamp = page.locator("figure#f4 [data-stamp]");
	await expect(stamp).toContainText("block 28 (5v5)");
	await island(page).getByLabel("Agent checkpoint").selectOption("b10");
	await expect(stamp).toContainText("block 10 (5v5)");
	await expect(stamp).toContainText("1,690 rounds");
});

test("no-JS shows the revealed keyframe, the stamp and the data table", async ({ browser }) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure#f4 [role='img']")).toBeVisible();
	await expect(page.locator("figure#f4 [data-stamp]")).toContainText("block 28");
	await expect(fig(page)).toContainText("22.8");
	await page.locator("details.fig-details > summary").click();
	await expect(page.locator("details tbody tr")).toHaveCount(15);
	await context.close();
});

test("zero Axe violations: keyframe, hydrated and revealed", async ({ page }) => {
	await page.route("**/_astro/*.js", (r) => r.abort());
	await page.goto(URL);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await page.unroute("**/_astro/*.js");
	await open(page);
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
	await island(page).getByRole("button", { name: "Reveal" }).click();
	expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test("a failed data request keeps the keyframe with a note and Retry recovers", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/tempo*.json", (r) => r.abort());
	await page.goto(URL);
	await fig(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator(".tp-fail")).toContainText("Interactive version failed to load");
	await page.unroute("**/_astro/tempo*.json");
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(island(page).getByRole("slider")).toBeVisible();
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
	const before = (await page.locator("figure#f4 .fig-reserve").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f4 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test("tempo @visual (Pixel 5)", async ({ page }) => {
	await open(page);
	await expect(fig(page)).toHaveScreenshot("tempo-mobile.png", { animations: "disabled" });
});

test("tempo @visual (1440x900)", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	await expect(fig(page)).toHaveScreenshot("tempo-desktop.png", { animations: "disabled" });
	await context.close();
});
