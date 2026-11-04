/**
 * F2 "Place a smoke, watch the sightlines change" on `/lab/figures/smoke-sight/`: hydration,
 * the Try path by keyboard and pointer, the legs rule, reduced motion, no JS, the error state,
 * Axe and layout shift (AC6.2 to AC6.5, AC16.4). Expected counts come from `sight.ts`, never
 * from literals.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import {
	addSmoke,
	type Board,
	MAP_NAME,
	moveSmoke,
	readout,
	readoutText,
	START_TOKENS,
	SUGGESTED_SMOKE,
	sightlines,
	smokeSet,
	startBoard,
	tileText,
} from "../../src/lib/figures/smoke-sight";
import { isWall, parseRows } from "../../src/lib/grid";

declare global {
	interface Window {
		/** Running layout-shift total, set by the init script of the layout-shift test. */
		__cls?: number;
	}
}

const URL = "/lab/figures/smoke-sight/";
const BASE = "http://127.0.0.1:4321";
const parsed = JSON.parse(readFileSync("src/data/article/maps_cs.json", "utf8")) as {
	maps: { name: string; rows: string[] }[];
};
const rows = parsed.maps.find((m) => m.name === MAP_NAME)?.rows;
if (!rows) throw new Error("maps_cs has no Mirage");
const map = parseRows(rows);

const readoutOf = (page: Page) => page.locator(".ss-readout");
const tokenAt = (page: Page, side: "ct" | "t", n: number): Locator =>
	page.locator(`g[data-token][aria-label^="${side === "ct" ? "CT" : "T"} ${n} at"]`);

/** Scrolls the figure in and waits for the interactive board. */
async function hydrate(page: Page): Promise<void> {
	await page.goto(URL);
	await page.locator("figure[data-figure]").scrollIntoViewIfNeeded();
	await expect(page.locator("figure astro-island")).not.toHaveAttribute("ssr", /.*/);
	await expect(page.locator("svg[role='application']")).toBeVisible();
}

async function desktop(browser: Browser): Promise<Page> {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 1440, height: 900 },
	});
	return context.newPage();
}

/** Page coordinates of a tile centre. */
async function tileCentre(page: Page, r: number, c: number): Promise<{ x: number; y: number }> {
	const box = await page.locator("svg[role='application']").boundingBox();
	if (!box) throw new Error("no board box");
	return {
		x: box.x + ((c + 0.5) / map.w) * box.width,
		y: box.y + ((r + 0.5) / map.h) * box.height,
	};
}

async function expectBoard(page: Page, board: Board): Promise<void> {
	const r = readout(map, board);
	await expect(readoutOf(page)).toHaveText(
		new RegExp(`^\\s*${readoutText(r, board.smokes.length).replace(/[()]/g, "\\$&")}\\s*$`),
	);
	await expect(page.locator("line.ss-line")).toHaveCount(r.count);
}

test("hydrates on scroll: the island loses ssr and the board replaces the keyframe", async ({
	page,
}) => {
	const served = await (await page.request.get(URL)).text();
	expect(served).toContain('role="img"');
	expect(served).toMatch(/<astro-island[^>]* ssr[ =>]/);
	await hydrate(page);
	await expect(page.locator("svg[role='img']")).toHaveCount(0);
	await expect(page.locator("g[data-token]")).toHaveCount(10);
});

test("default state shows every sightline and the ghost smoke; the counter matches sight.ts", async ({
	page,
}) => {
	await hydrate(page);
	const base = startBoard();
	await expectBoard(page, base);
	expect(readout(map, base).count).toBeGreaterThanOrEqual(8);
	await expect(page.locator("[data-ghost]")).toHaveCount(1);
	await expect(page.locator("g[data-smoke]")).toHaveCount(0);
});

test("AC6.2: the Try path by keyboard: move a smoke onto the ghost and the count falls", async ({
	page,
}) => {
	await hydrate(page);
	const t = START_TOKENS[0];
	if (!t) throw new Error("no token");
	// S on a focused token drops a smoke on its tile; then walk it to the ghost with arrows.
	await tokenAt(page, "ct", 1).focus();
	await page.keyboard.press("s");
	let board = addSmoke(map, startBoard(), [t.r, t.c]);
	await expectBoard(page, board);
	const smoke = page.locator("g[data-smoke]").first();
	await smoke.focus();
	const [gr, gc] = SUGGESTED_SMOKE;
	let guard = 0;
	while ((board.smokes[0]?.[0] !== gr || board.smokes[0]?.[1] !== gc) && guard++ < 40) {
		const cur = board.smokes[0];
		if (!cur) throw new Error("smoke vanished");
		const [dr, dc] = [Math.sign(gr - cur[0]), Math.sign(gc - cur[1])];
		// vertical first, then horizontal, through the corridor
		const [key, ddr, ddc] =
			dr !== 0
				? [dr > 0 ? "ArrowDown" : "ArrowUp", dr, 0]
				: [dc > 0 ? "ArrowRight" : "ArrowLeft", 0, dc];
		const next = moveSmoke(map, board, 0, ddr as number, ddc as number);
		await page.keyboard.press(key as string);
		board = next;
		await expect(page.locator("g[data-smoke]").first()).toHaveAttribute(
			"aria-label",
			new RegExp(`at ${tileText(board.smokes[0] ?? [0, 0])}`),
		);
	}
	expect(board.smokes[0]).toEqual([gr, gc]);
	await expectBoard(page, board);
	const base = readout(map, startBoard());
	expect(readout(map, board).count).toBeLessThan(base.count);
	await expect(page.locator(".ss-live")).toContainText(readoutText(readout(map, board), 1));
	await expect(page.locator("[data-ghost]")).toHaveCount(0);
});

test("the ghost: a click drops a smoke there and the count matches sight.ts", async ({ page }) => {
	await hydrate(page);
	const { x, y } = await tileCentre(page, SUGGESTED_SMOKE[0], SUGGESTED_SMOKE[1] - 1);
	await page.mouse.click(x, y);
	const board = addSmoke(map, startBoard(), SUGGESTED_SMOKE);
	await expectBoard(page, board);
	await expect(page.locator("g[data-smoke]")).toHaveCount(1);
});

test("AC6.3: dragging a token with the pointer updates the count; Escape cancels a drag", async ({
	page,
}) => {
	await hydrate(page);
	const from = START_TOKENS.find((t) => t.side === "t" && t.n === 2);
	if (!from) throw new Error("no T 2");
	const open = (r: number, c: number) => rows[r]?.[c] === ".";
	// a free floor tile three columns to the west of the token
	const target: [number, number] = [from.r, from.c - 3];
	expect(open(target[0], target[1])).toBe(true);
	const a = await tileCentre(page, from.r, from.c);
	const b = await tileCentre(page, target[0], target[1]);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
	await page.mouse.move(b.x, b.y, { steps: 4 });
	await page.mouse.up();
	const moved: Board = {
		...startBoard(),
		tokens: startBoard().tokens.map((t) => (t === from ? { ...t, c: target[1] } : t)),
	};
	await expectBoard(page, moved);
	await expect(tokenAt(page, "t", 2)).toHaveAttribute("aria-label", new RegExp(tileText(target)));
	// Escape during a drag restores the origin.
	const c2 = await tileCentre(page, target[0], target[1]);
	await page.mouse.move(c2.x, c2.y);
	await page.mouse.down();
	const away = await tileCentre(page, target[0], target[1] + 1);
	await page.mouse.move(away.x, away.y, { steps: 3 });
	await page.keyboard.press("Escape");
	await page.mouse.up();
	await expect(tokenAt(page, "t", 2)).toHaveAttribute("aria-label", new RegExp(tileText(target)));
});

/** Presses arrows to walk the first smoke over floor tiles to a target tile (BFS over single steps). */
async function walkSmoke(page: Page, board: Board, to: [number, number]): Promise<Board> {
	const from = board.smokes[0];
	if (!from) throw new Error("no smoke to walk");
	const key = (r: number, c: number) => r * map.w + c;
	const dirs: Array<[string, number, number]> = [
		["ArrowUp", -1, 0],
		["ArrowDown", 1, 0],
		["ArrowLeft", 0, -1],
		["ArrowRight", 0, 1],
	];
	const prev = new Map<number, [number, string]>();
	const queue: Array<[number, number]> = [[from[0], from[1]]];
	prev.set(key(from[0], from[1]), [-1, ""]);
	while (queue.length > 0 && !prev.has(key(to[0], to[1]))) {
		const cur = queue.shift();
		if (!cur) break;
		for (const [name, dr, dc] of dirs) {
			const nr = cur[0] + dr;
			const nc = cur[1] + dc;
			if (nr < 0 || nc < 0 || isWall(map, nr, nc)) continue;
			if (prev.has(key(nr, nc))) continue;
			prev.set(key(nr, nc), [key(cur[0], cur[1]), name]);
			queue.push([nr, nc]);
		}
	}
	const path: string[] = [];
	for (let at = key(to[0], to[1]); (prev.get(at)?.[0] ?? -1) >= 0; at = prev.get(at)?.[0] ?? -1) {
		path.unshift(prev.get(at)?.[1] ?? "");
	}
	await page.locator("g[data-smoke]").first().focus();
	let next = board;
	for (const name of path) {
		await page.keyboard.press(name);
		const d = dirs.find(([n]) => n === name);
		next = moveSmoke(map, next, 0, d?.[1] ?? 0, d?.[2] ?? 0);
	}
	return next;
}

test("AC6.5: a target at the rim of a smoke is still seen from outside; a smoke on the viewer blinds it", async ({
	page,
}) => {
	await hydrate(page);
	const start = startBoard();
	// A pair whose target stands inside a smoke disc yet stays visible (the legs rule), found with sight.ts.
	const lines = sightlines(map, start.tokens, []);
	let found: { from: number; to: number; at: [number, number] } | undefined;
	for (const l of lines) {
		const viewer = start.tokens[l.from];
		const target = start.tokens[l.to];
		if (!viewer || !target) continue;
		for (let r = 0; r < map.h && !found; r++) {
			for (let c = 0; c < map.w && !found; c++) {
				if (rows[r]?.[c] === "#") continue;
				const b = { ...start, smokes: [[r, c] as [number, number]] };
				const covered = smokeSet(map, b.smokes);
				if (!covered.has(target.r * map.w + target.c) || covered.has(viewer.r * map.w + viewer.c))
					continue;
				if (sightlines(map, b.tokens, b.smokes).some((x) => x.from === l.from && x.to === l.to)) {
					found = { from: l.from, to: l.to, at: [r, c] };
				}
			}
		}
		if (found) break;
	}
	if (!found) throw new Error("the start scene has no rim pair");
	const viewer = start.tokens[found.from];
	const target = start.tokens[found.to];
	if (!viewer || !target) throw new Error("bad tokens");
	await page.getByRole("button", { name: "Add smoke" }).click();
	let board = await walkSmoke(page, addSmoke(map, start), found.at);
	await expectBoard(page, board);
	expect(
		sightlines(map, board.tokens, board.smokes).some(
			(l) => l.from === found?.from && l.to === found?.to,
		),
	).toBe(true);
	// remove it, smoke on the viewer
	await page.locator("g[data-smoke]").first().focus();
	await page.keyboard.press("Delete");
	await tokenAt(page, viewer.side, viewer.n).focus();
	await page.keyboard.press("s");
	board = addSmoke(map, start, [viewer.r, viewer.c]);
	await expectBoard(page, board);
	expect(sightlines(map, board.tokens, board.smokes).filter((l) => l.from === found?.from)).toEqual(
		[],
	);
});

test("keyboard: Tab walks the tokens, then the ghost; arrows move a token one tile", async ({
	page,
}) => {
	await hydrate(page);
	const first = tokenAt(page, "ct", 1);
	await first.focus();
	for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
	await expect(tokenAt(page, "t", 5)).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(page.locator("[data-ghost]")).toBeFocused();
	const t = START_TOKENS.find((x) => x.side === "ct" && x.n === 1);
	if (!t) throw new Error("no CT 1");
	await first.focus();
	await page.keyboard.press("ArrowDown");
	await expect(first).toHaveAttribute(
		"aria-label",
		new RegExp(`CT 1 at ${tileText([t.r + 1, t.c])}`),
	);
});

test("Show sampled points draws dots; Reset restores the start", async ({ page }) => {
	await hydrate(page);
	await page.getByLabel("Show sampled points").check();
	await expect(page.locator("path.ss-dots").first()).toBeVisible();
	await tokenAt(page, "t", 2).focus();
	await page.keyboard.press("ArrowLeft");
	await page.getByRole("button", { name: "Reset" }).click();
	await expectBoard(page, startBoard());
	await page.getByLabel("Show sampled points").uncheck();
	await expect(page.locator("path.ss-dots")).toHaveCount(0);
});

test("recompute: the median of 100 synthetic keyboard moves is at most 1 ms, the 95th percentile at most 4 ms", async ({
	browser,
}) => {
	// Why: the spec budget is "at most 4 ms per move" with a 1 ms proxy; one CPU hiccup on a shared
	// runner must not fail the run, so the proxy is the median and the hard limit the 95th percentile.
	const page = await desktop(browser);
	await hydrate(page);
	await tokenAt(page, "t", 2).focus();
	const { median, p95 } = await page.evaluate(async () => {
		const el = document.activeElement;
		if (!el) throw new Error("no focus");
		const samples: number[] = [];
		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			el.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: i % 2 === 0 ? "ArrowLeft" : "ArrowRight",
					bubbles: true,
					cancelable: true,
				}),
			);
			await Promise.resolve();
			samples.push(performance.now() - t0);
		}
		samples.sort((a, b) => a - b);
		return { median: samples[50] ?? 0, p95: samples[94] ?? 0 };
	});
	expect(median).toBeLessThanOrEqual(1);
	expect(p95).toBeLessThanOrEqual(4);
	await page.context().close();
});

test("reduced motion: lines do not animate in", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	const name = await page
		.locator("line.ss-line")
		.first()
		.evaluate((el) => getComputedStyle(el).animationName);
	expect(name).toBe("none");
});

test("no JS: the keyframe shows the suggested smoke and both counts", async ({ browser }) => {
	const context = await browser.newContext({ baseURL: BASE, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(URL);
	const withSmoke = readout(map, addSmoke(map, startBoard(), SUGGESTED_SMOKE));
	await expect(page.locator(".ss-readout")).toHaveText(
		new RegExp(
			`Enemy sightlines:\\s*${withSmoke.count}\\s*\\(was ${withSmoke.base} with no smoke\\)`,
		),
	);
	await expect(page.locator("svg[role='img'] g[data-token]")).toHaveCount(10);
	await expect(page.locator("svg[role='img'] [data-smoke-disc]")).toHaveCount(1);
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

test("a failed data request keeps the keyframe, shows a note and Retry loads the board", async ({
	page,
}) => {
	let fail = true;
	await page.route("**/_astro/maps_cs*.json", (route) => (fail ? route.abort() : route.continue()));
	await page.goto(URL);
	await page.locator("figure[data-figure]").scrollIntoViewIfNeeded();
	await expect(page.locator(".ss-fail")).toContainText("Interactive version failed to load");
	await expect(page.locator("svg[role='img']")).toHaveCount(1);
	fail = false;
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.locator("svg[role='application']")).toBeVisible();
	await expect(page.locator(".ss-fail")).toHaveCount(0);
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
		await expect(p.locator("svg[role='application']")).toBeVisible();
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
test("@visual F2 hydrated board, Pixel 5", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	await expect(page.locator("figure[data-figure]")).toHaveScreenshot("smoke-sight-pixel5.png", {
		animations: "disabled",
	});
});

test("@visual F2 hydrated board, desktop 1440x900", async ({ browser }) => {
	const page = await desktop(browser);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await hydrate(page);
	await expect(page.locator("figure[data-figure]")).toHaveScreenshot("smoke-sight-desktop.png", {
		animations: "disabled",
	});
	await page.context().close();
});
