/**
 * Figure F1, replay of a real round, on `/lab/figures/replay/` (AC5.2 to AC5.5, AC16.4).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { formatSeconds } from "../../src/lib/figure-scale";
import { buildFog, type ReplayLike } from "../../src/lib/figures/replay";

const URL = "/lab/figures/replay/";
const BASE = "http://127.0.0.1:4321";
const DATA = JSON.parse(readFileSync("src/data/article/replay_mirage.json", "utf8")) as ReplayLike;
const FIRST = DATA.firstContactTick;

const island = (page: Page) => page.locator("figure#f1 astro-island");
const slider = (page: Page) => page.getByRole("slider", { name: "Time" });
const play = (page: Page) => page.locator("button.rp-play");
const clock = (page: Page) => page.locator(".rp-clock");

/** Scrolls the figure to the middle of the viewport and waits for the interactive view. */
async function hydrate(page: Page): Promise<void> {
	await page.locator("figure#f1").scrollIntoViewIfNeeded();
	await page.locator("figure#f1").evaluate((el) => el.scrollIntoView({ block: "center" }));
	await expect(page.locator(".rp-grid")).toBeVisible();
	await expect(island(page)).not.toHaveAttribute("ssr", /.*/);
}

async function open(page: Page, reduced = true): Promise<void> {
	await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
	await page.goto(URL);
	await hydrate(page);
}

async function desktop(browser: Browser, reduced = true): Promise<Page> {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
		reducedMotion: reduced ? "reduce" : "no-preference",
	});
	const page = await context.newPage();
	await page.goto(URL);
	await hydrate(page);
	return page;
}

const canvasHash = (page: Page) =>
	page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL());

test("hydrates on scroll: the island loses `ssr`, the canvas and controls appear, one data request", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (r) => {
		if (/replay_mirage[^/]*\.json/.test(r.url())) requests.push(r.url());
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await hydrate(page);
	await expect(page.locator("canvas[role='img']")).toBeVisible();
	await expect(slider(page)).toHaveValue(String(FIRST));
	expect(requests).toHaveLength(1);
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.locator("figure#f1").evaluate((el) => el.scrollIntoView({ block: "center" }));
	expect(requests).toHaveLength(1);
});

test("AC5.2: the first-contact marker sets the time label to the dataset's value", async ({
	page,
}) => {
	await open(page);
	await slider(page).press("End");
	await expect(clock(page)).toHaveText(formatSeconds(72 * 0.8));
	await page.getByRole("button", { name: /First contact/ }).click();
	await expect(clock(page)).toHaveText(formatSeconds(FIRST * 0.8));
	await expect(slider(page)).toHaveValue(String(FIRST));
});

test("AC5.2: See as Defenders hides attackers they cannot see and shows ghosts", async ({
	page,
}) => {
	await open(page);
	const fog = buildFog(DATA);
	const at = fog.CT.findIndex((f) => f.ghosts.length > 0);
	expect(at).toBeGreaterThan(0);
	await slider(page).fill(String(at));
	const all = await canvasHash(page);
	await page.getByRole("radio", { name: "Defenders" }).check();
	await expect(page.locator(".rp-status")).toContainText(
		/Defenders see \d of \d attackers; \d last-seen place/,
	);
	expect(await canvasHash(page)).not.toBe(all);
	await page.getByRole("radio", { name: "All", exact: true }).check();
	await expect(page.locator(".rp-status")).not.toContainText("Defenders see");
	expect(await canvasHash(page)).toBe(all);
});

test("the Try path: watch as the defenders, then play", async ({ page }) => {
	await open(page);
	await page.getByRole("radio", { name: "Defenders" }).check();
	await play(page).click();
	await expect(play(page)).toHaveText("Pause");
	await expect.poll(async () => Number(await slider(page).inputValue())).toBeGreaterThan(FIRST);
	await play(page).click();
	await expect(play(page)).toHaveText("Play");
});

test("keyboard: Space, arrows, Shift, Home/End and the event keys", async ({ page }) => {
	await open(page);
	await slider(page).focus();
	await page.keyboard.press("ArrowRight");
	await expect(slider(page)).toHaveValue(String(FIRST + 1));
	await page.keyboard.press("Shift+ArrowLeft");
	await expect(slider(page)).toHaveValue(String(FIRST + 1 - 5));
	await page.keyboard.press("End");
	await expect(slider(page)).toHaveValue("72");
	await page.keyboard.press("Home");
	await expect(slider(page)).toHaveValue("0");
	await page.keyboard.press("]");
	await expect(slider(page)).toHaveValue(String(FIRST));
	await page.keyboard.press("Space");
	await expect(play(page)).toHaveText("Pause");
	await page.keyboard.press("Space");
	await expect(play(page)).toHaveText("Play");
});

test("AC5.3: under reduced motion nothing autoplays and the canvas is stable for 2 s", async ({
	page,
}) => {
	await open(page, true);
	await expect(play(page)).toHaveText("Play");
	const first = await canvasHash(page);
	await page.waitForTimeout(2000);
	expect(await canvasHash(page)).toBe(first);
	await expect(slider(page)).toHaveValue(String(FIRST));
});

test("autoplay starts once when half in view, and any interaction cancels it for good", async ({
	page,
}) => {
	await open(page, false);
	await expect(play(page)).toHaveText("Pause");
	await expect.poll(async () => Number(await slider(page).inputValue())).toBeGreaterThan(0);
	await slider(page).focus();
	await page.keyboard.press("ArrowRight");
	await expect(play(page)).toHaveText("Play");
	const held = await slider(page).inputValue();
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.locator("figure#f1").evaluate((el) => el.scrollIntoView({ block: "center" }));
	await page.waitForTimeout(600);
	await expect(play(page)).toHaveText("Play");
	expect(await slider(page).inputValue()).toBe(held);
});

test("AC5.4: Pause motion during playback stops it at once", async ({ page }) => {
	await open(page, false);
	await expect(play(page)).toHaveText("Pause");
	await page.evaluate(() => {
		localStorage.setItem("utofme:motion", "paused");
		document.dispatchEvent(new CustomEvent("utofme:motion"));
	});
	await expect(play(page)).toHaveText("Play", { timeout: 500 });
	const stopped = await slider(page).inputValue();
	await page.waitForTimeout(500);
	expect(await slider(page).inputValue()).toBe(stopped);
});

test("keyframe only (scripts blocked): zero Axe violations", async ({ page }) => {
	await page.route("**/_astro/**/*.js", (r) => r.abort());
	await page.route("**/_astro/*.js", (r) => r.abort());
	await page.goto(URL);
	await expect(island(page)).toHaveAttribute("ssr", /.*/);
	await expect(page.locator("svg[data-board]")).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("AC5.5: no-JS shows the keyframe board and the 6-frame strip", async ({ browser }) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	await expect(page.locator("svg[data-board][role='img']")).toBeVisible();
	await expect(page.locator("ol.rp-strip > li")).toHaveCount(6);
	await expect(page.locator("figure#f1 figcaption")).toContainText("Figure 1.");
	await expect(page.locator("[data-stamp]")).toContainText("block 28");
	await page.locator("details.fig-details > summary").click();
	await expect(page.locator("ol.rp-events > li")).toHaveCount(13);
	await context.close();
});

test("zero Axe violations after hydration, with the data panel open", async ({ page }) => {
	await open(page);
	await page.locator("details.fig-details > summary").click();
	const results = await new AxeBuilder({ page }).analyze();
	expect(
		results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
	).toEqual([]);
});

test("a failed data request keeps the keyframe, shows a note and Retry brings the figure back", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.route("**/_astro/replay_mirage*.json", (r) => r.abort());
	await page.goto(URL);
	await page.locator("figure#f1").evaluate((el) => el.scrollIntoView({ block: "center" }));
	const note = page.locator(".rp-fail");
	await expect(note).toContainText("Interactive version failed to load");
	await expect(page.locator("svg[data-board]")).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await page.unroute("**/_astro/replay_mirage*.json");
	await note.getByRole("button", { name: "Retry" }).click();
	await expect(page.locator(".rp-grid")).toBeVisible();
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
						) {
							sum += e.value;
						}
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

test("AC16.4: CLS stays at or under 0.02 while scrolling, and hydration does not move the box", async ({
	page,
	browser,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	const before = (await page.locator("figure#f1 .fig-reserve").boundingBox())?.height ?? 0;
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	await hydrate(page);
	const after = (await page.locator("figure#f1 .fig-reserve").boundingBox())?.height ?? 0;
	expect(Math.abs(after - before)).toBeLessThanOrEqual(2);

	const wide = await desktop(browser);
	const bigBefore = await wide.locator("figure#f1 .fig-reserve").boundingBox();
	expect(bigBefore?.height).toBeGreaterThan(300);
	expect(await clsOf(wide)).toBeLessThanOrEqual(0.02);
	await wide.context().close();
});

test("the controls and the canvas fit inside the figure on a phone and on a desktop", async ({
	page,
	browser,
}) => {
	await open(page);
	const fits = async (p: Page) => {
		const box = await p.locator("figure#f1 .fig-reserve").boundingBox();
		if (!box) throw new Error("no box for the reserved area");
		for (const sel of [".rp-board", ".rp-bar", ".rp-side"]) {
			const b = await p.locator(sel).first().boundingBox();
			if (!b) throw new Error(`no box for ${sel}`);
			expect(b.x, sel).toBeGreaterThanOrEqual(box.x - 1);
			expect(b.x + b.width, sel).toBeLessThanOrEqual(box.x + box.width + 1);
			expect(b.y + b.height, sel).toBeLessThanOrEqual(box.y + box.height + 1);
		}
	};
	await fits(page);
	// The long stamp must not push the phone page sideways.
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
	// Phone order: board, then the bar, then the side panel.
	const ys = await Promise.all(
		[".rp-board", ".rp-bar", ".rp-side"].map(
			async (s) => (await page.locator(s).first().boundingBox())?.y ?? 0,
		),
	);
	expect(ys[0]).toBeLessThan(ys[1] ?? 0);
	expect(ys[1]).toBeLessThan(ys[2] ?? 0);
	const barBox = await page.locator(".rp-bar").boundingBox();
	expect(barBox?.height).toBeLessThanOrEqual(57);
	const wide = await desktop(browser);
	await fits(wide);
	await wide.context().close();
});

test("a canvas redraw is deterministic: same state, same pixels", async ({ page }) => {
	await open(page);
	await slider(page).fill("30");
	const a = await canvasHash(page);
	await slider(page).fill("12");
	await slider(page).fill("30");
	expect(await canvasHash(page)).toBe(a);
});

test("replay board @visual (Pixel 5)", async ({ page }) => {
	await open(page);
	await expect(page.locator("figure#f1")).toHaveScreenshot("replay-mobile.png", {
		animations: "disabled",
	});
});

test("replay board @visual (1440x900)", async ({ browser }) => {
	const page = await desktop(browser);
	await expect(page.locator("figure#f1")).toHaveScreenshot("replay-desktop.png", {
		animations: "disabled",
	});
	await page.context().close();
});
