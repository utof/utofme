/**
 * F10 "Roll a map" on `/lab/figures/roll-map/`: hydration, New seed, the generator toggle, the
 * thumbnail strip, Compare with Mirage, requests, no JS (a twelve-map strip), the error states,
 * Axe and layout shift (AC14.1, AC14.2, AC16.4). Expected paths are computed from the datasets
 * with `roll-map.ts`, never typed.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { dataset } from "../../src/lib/article-data/maps_generated";
import {
	DEFAULT_GENERATOR,
	GENERATORS,
	generatorMaps,
	likenessLine,
	mapShapes,
	seedLabel,
} from "../../src/lib/figures/roll-map";

declare global {
	interface Window {
		/** Running layout-shift total, set by the init script of the layout-shift test. */
		__cls?: number;
	}
}

const URL = "/lab/figures/roll-map/";
const BASE = "http://127.0.0.1:4321";
const data = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/maps_generated.json", "utf8")),
);
const cs = JSON.parse(readFileSync("src/data/article/maps_cs.json", "utf8")) as {
	maps: { name: string; rows: string[] }[];
};
const miragePath = (() => {
	const rows = cs.maps.find((m) => m.name === "de_mirage")?.rows;
	if (!rows) throw new Error("maps_cs has no Mirage");
	return mapShapes(rows).walls;
})();
const wall = (id: string, i: number) => {
	const rows = generatorMaps(data, id)[i];
	if (!rows) throw new Error(`no ${id} map ${i}`);
	return mapShapes(rows).walls;
};

const board = (page: Page) => page.locator("svg.rm-board").first();
const boardWalls = (page: Page) => board(page).locator(".rm-wall");
const newSeed = (page: Page) => page.getByRole("button", { name: "New seed" });
const label = (page: Page) => page.locator(".rm-label");

async function hydrate(page: Page): Promise<void> {
	await page.goto(URL);
	await page.locator("figure[data-figure]").scrollIntoViewIfNeeded();
	await expect(page.locator("figure astro-island")).not.toHaveAttribute("ssr", /.*/);
	await expect(newSeed(page)).toBeVisible();
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
	await hydrate(page);
	await expect(page.locator("svg.rm-strip-svg")).toHaveCount(0);
});

test("default state: v3 map 1 with the v3 strip of twelve thumbnails", async ({ page }) => {
	await hydrate(page);
	await expect(page.getByRole("radio", { name: DEFAULT_GENERATOR })).toBeChecked();
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(0, 12)}`);
	await expect(boardWalls(page)).toHaveAttribute("d", wall("v3", 0));
	const thumbs = page.locator("button.rm-thumb");
	await expect(thumbs).toHaveCount(12);
	for (let i = 0; i < 12; i++) {
		await expect(thumbs.nth(i).locator(".rm-wall")).toHaveAttribute("d", wall("v3", i));
	}
	await expect(thumbs.first()).toHaveAttribute("aria-current", "true");
});

test("AC14.1, the Try path: New seed changes the board and the label, then Compare puts Mirage beside it", async ({
	page,
}) => {
	await hydrate(page);
	await newSeed(page).click();
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(1, 12)}`);
	await expect(boardWalls(page)).toHaveAttribute("d", wall("v3", 1));
	expect(wall("v3", 1)).not.toBe(wall("v3", 0));
	await expect(page.locator(".rm-live")).toContainText("map 2 of 12");
	await page.getByLabel("Compare with Mirage").check();
	await expect(page.locator("svg.rm-board")).toHaveCount(2);
	await expect(page.locator("svg.rm-board").nth(1)).toHaveAttribute("aria-label", /Mirage/);
	await expect(page.locator("svg.rm-board").nth(1).locator(".rm-wall")).toHaveAttribute(
		"d",
		miragePath,
	);
	await page.getByLabel("Compare with Mirage").uncheck();
	await expect(page.locator("svg.rm-board")).toHaveCount(1);
});

test("AC14.1: switching v3 to v1 by keyboard changes the strip and keeps the map number", async ({
	page,
}) => {
	await hydrate(page);
	await newSeed(page).click();
	await page.getByRole("radio", { name: "v3" }).focus();
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("ArrowLeft");
	await expect(page.getByRole("radio", { name: "v1" })).toBeChecked();
	await expect(label(page)).toHaveText(`Generator v1 · ${seedLabel(1, 12)}`);
	for (const i of [0, 5, 11]) {
		await expect(page.locator("button.rm-thumb").nth(i).locator(".rm-wall")).toHaveAttribute(
			"d",
			wall("v1", i),
		);
	}
	expect(wall("v1", 5)).not.toBe(wall("v3", 5));
	await expect(boardWalls(page)).toHaveAttribute("d", wall("v1", 1));
	await expect(page.locator(".rm-note")).toContainText(likenessLine(data, "v1"));
	await page.getByRole("radio", { name: "v2" }).check();
	await expect(page.locator(".rm-note")).toContainText(likenessLine(data, "v2"));
	expect(GENERATORS.map((g) => g.id)).toEqual(["v1", "v2", "v3"]);
});

test("a thumbnail selects its map; New seed wraps after twelve presses", async ({ page }) => {
	await hydrate(page);
	await page.locator("button.rm-thumb").nth(7).click();
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(7, 12)}`);
	await expect(boardWalls(page)).toHaveAttribute("d", wall("v3", 7));
	for (let i = 0; i < 12; i++) await newSeed(page).click();
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(7, 12)}`);
});

test("keyboard: Enter on New seed rolls; the strip scrolls the focused thumbnail into view", async ({
	page,
}) => {
	await hydrate(page);
	await newSeed(page).focus();
	await page.keyboard.press("Enter");
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(1, 12)}`);
	const last = page.locator("button.rm-thumb").nth(11);
	await last.focus();
	await expect(last).toBeInViewport();
	await page.keyboard.press("Enter");
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(11, 12)}`);
});

test("each dataset is requested once, and the Mirage file is the one figure F2 uses", async ({
	page,
}) => {
	const seen: string[] = [];
	page.on("request", (r) => {
		if (/\/_astro\/maps_(generated|cs)\.[^/]+\.json$/.test(r.url())) seen.push(r.url());
	});
	await hydrate(page);
	await page.getByLabel("Compare with Mirage").check();
	await newSeed(page).click();
	expect(seen.filter((u) => u.includes("maps_generated"))).toHaveLength(1);
	expect(seen.filter((u) => u.includes("maps_cs"))).toHaveLength(1);
});

test("nothing animates: New seed leaves no running animation", async ({ page }) => {
	await hydrate(page);
	await newSeed(page).click();
	expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("AC14.2 no JS: the featured v3 map and a strip with twelve maps", async ({ browser }) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("svg.rm-strip-svg symbol")).toHaveCount(12);
	await expect(page.locator("svg.rm-strip-svg use")).toHaveCount(12);
	await expect(page.locator("svg.rm-board use")).toHaveCount(1);
	await expect(page.locator(".rm-note")).toContainText(likenessLine(data, "v3"));
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
	await page.route("**/_astro/maps_generated*.json", (route) =>
		fail ? route.abort() : route.continue(),
	);
	await page.goto(URL);
	await page.locator("figure[data-figure]").scrollIntoViewIfNeeded();
	await expect(page.locator(".rm-fail")).toContainText("Interactive version failed to load");
	await expect(page.locator("svg.rm-strip-svg")).toHaveCount(1);
	fail = false;
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(newSeed(page)).toBeVisible();
	await expect(page.locator(".rm-fail")).toHaveCount(0);
});

test("a failed Mirage request leaves the figure working with Compare disabled", async ({
	page,
}) => {
	await page.route("**/_astro/maps_cs*.json", (route) => route.abort());
	await hydrate(page);
	await expect(page.getByLabel("Compare with Mirage")).toBeDisabled();
	await newSeed(page).click();
	await expect(label(page)).toHaveText(`Generator v3 · ${seedLabel(1, 12)}`);
});

test("Axe: no violations after hydration, with Compare on (mobile and desktop)", async ({
	page,
	browser,
}) => {
	await hydrate(page);
	await page.getByLabel("Compare with Mirage").check();
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
		await expect(newSeed(p)).toBeVisible();
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
test("@visual F10 hydrated figure, Pixel 5", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	await expect(page.locator("figure[data-figure]")).toHaveScreenshot("roll-map-pixel5.png", {
		animations: "disabled",
	});
});

test("@visual F10 hydrated figure, desktop 1440x900", async ({ browser }) => {
	const page = await desktop(browser);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	await expect(page.locator("figure[data-figure]")).toHaveScreenshot("roll-map-desktop.png", {
		animations: "disabled",
	});
	await page.context().close();
});
