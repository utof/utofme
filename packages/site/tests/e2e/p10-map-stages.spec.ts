/**
 * F5 "From a CS2 map to 28×28" on `/lab/figures/map-stages/`: hydration, every stop's counted
 * value for every map, the Try path, the strip, no JS (four SVGs), motion, error state, Axe and
 * layout shift (AC9.1, AC9.2, AC16.4). Expected values are computed from the dataset with
 * `map-stages.ts`, never typed.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { dataset } from "../../src/lib/article-data/map_stages";
import {
	DEFAULT_MAP,
	mapTitle,
	STAGES,
	stageCount,
	stageSummary,
	wallness,
} from "../../src/lib/figures/map-stages";

declare global {
	interface Window {
		/** Running layout-shift total, set by the init script of the layout-shift test. */
		__cls?: number;
	}
}

const URL = "/lab/figures/map-stages/";
const BASE = "http://127.0.0.1:4321";
const data = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/map_stages.json", "utf8")),
);
const mirage = data.maps.find((m) => m.name === DEFAULT_MAP);
if (!mirage) throw new Error("map_stages has no Mirage");

const readout = (page: Page) => page.locator(".ms-readout");
const mapSelect = (page: Page) => page.getByRole("combobox", { name: "Map", exact: true });
const slider = (page: Page) => page.getByRole("slider", { name: "Stage" });

async function hydrate(page: Page): Promise<void> {
	await page.goto(URL);
	await page.locator("figure[data-figure]").scrollIntoViewIfNeeded();
	await expect(page.locator("figure astro-island")).not.toHaveAttribute("ssr", /.*/);
	await expect(slider(page)).toBeVisible();
}

async function desktop(browser: Browser): Promise<Page> {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
	});
	return context.newPage();
}

test("hydrates on scroll: the island loses ssr and the controls replace the keyframe", async ({
	page,
}) => {
	const served = await (await page.request.get(URL)).text();
	expect(served).toMatch(/<astro-island[^>]* ssr[ =>]/);
	expect(served.match(/<svg[^>]*role="img"/g)).toHaveLength(4);
	await hydrate(page);
	await expect(page.locator("figure svg[role='img']")).toHaveCount(1);
});

test("default state: the final stage of Mirage with the four-stop strip under the slider", async ({
	page,
}) => {
	await hydrate(page);
	await expect(slider(page)).toHaveValue("3");
	await expect(readout(page)).toHaveText(stageSummary(mirage, 3));
	await expect(mapSelect(page)).toHaveValue(DEFAULT_MAP);
	const stops = page.locator("button.ms-stop");
	await expect(stops).toHaveCount(4);
	for (const [i, s] of STAGES.entries()) {
		await expect(stops.nth(i)).toContainText(s.title);
		await expect(stops.nth(i)).toContainText(String(stageCount(mirage, i)));
	}
	const slideBox = await slider(page).boundingBox();
	const stripBox = await page.locator("ul.ms-strip").boundingBox();
	if (!slideBox || !stripBox) throw new Error("missing boxes");
	// the slider sits above the strip, inside its width
	expect(slideBox.y).toBeLessThan(stripBox.y);
	expect(slideBox.x).toBeGreaterThanOrEqual(stripBox.x - 1);
	expect(slideBox.x + slideBox.width).toBeLessThanOrEqual(stripBox.x + stripBox.width + 1);
});

test("AC9.1: each stop shows its counted value, for every map", async ({ page }) => {
	await hydrate(page);
	for (const m of data.maps) {
		await mapSelect(page).selectOption(m.name);
		for (const i of [0, 1, 2, 3]) {
			await slider(page).focus();
			await page.keyboard.press("Home");
			for (let k = 0; k < i; k++) await page.keyboard.press("ArrowRight");
			await expect(readout(page), `${m.name} stop ${i}`).toHaveText(stageSummary(m, i));
			await expect(slider(page)).toHaveAttribute("aria-valuetext", stageSummary(m, i));
		}
	}
	await expect(mapSelect(page).locator("option")).toHaveText(
		data.maps.map((m) => mapTitle(m.name)),
	);
});

test("the Try path: sliding back to the floor fractions changes the board and the live region", async ({
	page,
}) => {
	await hydrate(page);
	const cell = (i: number) => page.locator("svg.ms-board rect.ms-cell").nth(i);
	const final = wallness(mirage, 3);
	const floor = wallness(mirage, 0);
	// a square the two stops draw differently
	const i = final.findIndex((v, k) => Math.abs(v - (floor[k] ?? 0)) > 0.3);
	expect(i).toBeGreaterThanOrEqual(0);
	await expect(cell(i)).toHaveAttribute("opacity", String(final[i]));
	await slider(page).focus();
	await page.keyboard.press("Home");
	await expect(readout(page)).toHaveText(stageSummary(mirage, 0));
	await expect(cell(i)).toHaveAttribute("opacity", String(floor[i]));
	await expect(page.locator(".ms-live")).toContainText(stageSummary(mirage, 0));
});

test("the strip: pressing a stop moves the slider", async ({ page }) => {
	await hydrate(page);
	await page.locator("button.ms-stop").nth(1).click();
	await expect(slider(page)).toHaveValue("1");
	await expect(readout(page)).toHaveText(stageSummary(mirage, 1));
	await expect(page.locator("button.ms-stop").nth(1)).toHaveAttribute("aria-current", "true");
});

test("the slider is a real range input: pointer drag changes the stop", async ({ page }) => {
	await hydrate(page);
	const box = await slider(page).boundingBox();
	if (!box) throw new Error("no slider box");
	await page.mouse.click(box.x + 4, box.y + box.height / 2);
	await expect(slider(page)).toHaveValue("0");
	await expect(readout(page)).toHaveText(stageSummary(mirage, 0));
});

test("motion: the morph is a short opacity transition, none under reduced motion or Pause motion", async ({
	page,
}) => {
	await hydrate(page);
	const dur = () =>
		page
			.locator("rect.ms-cell")
			.first()
			.evaluate((el) => getComputedStyle(el).transitionDuration);
	expect(await dur()).not.toBe("0s");
	await page.evaluate(() => {
		localStorage.setItem("utofme:motion", "paused");
		document.dispatchEvent(new Event("utofme:motion"));
	});
	await expect(page.locator(".ms-box")).toHaveAttribute("data-still", "");
	expect(await dur()).toBe("0s");
	const reduced = await page.context().newPage();
	await reduced.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(reduced);
	expect(
		await reduced
			.locator("rect.ms-cell")
			.first()
			.evaluate((el) => getComputedStyle(el).transitionDuration),
	).toBe("0s");
});

test("AC9.2 no JS: four small multiples as SVG images with their counts", async ({ browser }) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("figure svg")).toHaveCount(4);
	await expect(page.locator("figure svg[role='img']")).toHaveCount(4);
	for (const [i, s] of STAGES.entries()) {
		await expect(page.locator("ol.ms-multi > li").nth(i)).toContainText(s.title);
		await expect(page.locator("ol.ms-multi > li").nth(i)).toContainText(
			String(stageCount(mirage, i)),
		);
	}
	await context.close();
	// Why: Axe itself needs scripting, so its no-script pass runs on the markup with every
	// <script> removed in a normal context (same technique as p10-layout.spec.ts).
	const bare = await browser.newContext({ baseURL: BASE });
	await bare.route("**/*.js", (route) => route.abort());
	await bare.route(`${BASE}${URL}`, async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script>/g, "");
		await route.fulfill({ response, body });
	});
	const barePage = await bare.newPage();
	await barePage.goto(URL);
	expect(await barePage.locator("script").count()).toBe(0);
	expect((await new AxeBuilder({ page: barePage }).analyze()).violations).toEqual([]);
	await bare.close();
});

test("a failed data request keeps the keyframe, shows a note and Retry loads the controls", async ({
	page,
}) => {
	let fail = true;
	await page.route("**/_astro/map_stages*.json", (route) =>
		fail ? route.abort() : route.continue(),
	);
	await page.goto(URL);
	await page.locator("figure[data-figure]").scrollIntoViewIfNeeded();
	await expect(page.locator(".ms-fail")).toContainText("Interactive version failed to load");
	await expect(page.locator("figure svg[role='img']")).toHaveCount(4);
	fail = false;
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(slider(page)).toBeVisible();
	await expect(page.locator(".ms-fail")).toHaveCount(0);
});

test("Axe: no violations after hydration (mobile and desktop)", async ({ page, browser }) => {
	await hydrate(page);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	const d = await desktop(browser);
	await hydrate(d);
	expect((await new AxeBuilder({ page: d }).analyze()).violations).toEqual([]);
	await d.context().close();
});

test("AC16.4: layout shift stays under 0.02 while scrolling past the figure (mobile and desktop)", async ({
	page,
	browser,
}) => {
	const measure = async (p: Page): Promise<number> => {
		await p.emulateMedia({ reducedMotion: "reduce" });
		await p.addInitScript(() => {
			window.__cls = 0;
			new PerformanceObserver((list) => {
				for (const e of list.getEntries()) {
					if (
						"value" in e &&
						typeof e.value === "number" &&
						"hadRecentInput" in e &&
						e.hadRecentInput === false
					) {
						window.__cls = (window.__cls ?? 0) + e.value;
					}
				}
			}).observe({ type: "layout-shift", buffered: true });
		});
		await p.goto(URL);
		await p.evaluate(async () => {
			const step = Math.max(200, window.innerHeight / 2);
			for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
				window.scrollTo(0, y);
				await new Promise((r) => setTimeout(r, 120));
			}
		});
		await expect(slider(p)).toBeVisible();
		await p.waitForTimeout(300);
		return p.evaluate(() => window.__cls ?? 0);
	};
	expect(await measure(page)).toBeLessThanOrEqual(0.02);
	const d = await desktop(browser);
	expect(await measure(d)).toBeLessThanOrEqual(0.02);
	await d.context().close();
});

// Why: baselines need the real fonts, so they are rendered on GitHub by the baseline workflow
// (plan § Visual baselines) and these titles are skipped locally with --grep-invert @visual.
test("@visual F5 hydrated figure, Pixel 5", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	await expect(page.locator("figure[data-figure]")).toHaveScreenshot("map-stages-pixel5.png", {
		animations: "disabled",
	});
});

test("@visual F5 hydrated figure, desktop 1440x900", async ({ browser }) => {
	const page = await desktop(browser);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	await expect(page.locator("figure[data-figure]")).toHaveScreenshot("map-stages-desktop.png", {
		animations: "disabled",
	});
	await page.context().close();
});
