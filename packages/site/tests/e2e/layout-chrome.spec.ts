/**
 * Page chrome: one shared left edge, 404 page, favicon, search header,
 * project header gap, garden gutter, footer hit areas.
 *
 * Why: UI review findings D-01/D-03/D-05/D-08/D-09/D-10/M-11/M-06.
 * @see packages/specs/reviews/ui/breaker-desktop.md
 */
import { expect, test } from "@playwright/test";

// Why no "/": the catalogue home has its own column and gutter (ADR 0061);
// `home-catalogue.spec.ts` checks that its header, main and footer share one left edge.
const ROUTES = [
	"/now/",
	"/colophon/",
	"/stats/",
	"/search/",
	"/garden/",
	"/garden/graph/",
	"/works/tactical-arena/",
];

for (const route of ROUTES) {
	test(`shared page margin on ${route}`, async ({ page }) => {
		await page.goto(route);
		const edge = await page.evaluate(() => {
			const m =
				Number.parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue("--page-margin"),
				) || 0;
			const probe = document.createElement("div");
			probe.style.cssText = "position:absolute;visibility:hidden;width:var(--page-margin)";
			document.body.append(probe);
			const w = probe.getBoundingClientRect().width;
			probe.remove();
			const left = (s: string) => document.querySelector(s)?.getBoundingClientRect().left ?? null;
			return { w: w || m, main: left("main"), footer: left("footer"), card: left(".footer-meta") };
		});
		expect(edge.main).toBeCloseTo(edge.w, 0);
		expect(edge.footer).toBeCloseTo(edge.w, 0);
		if (edge.card !== null) expect(edge.card).toBeCloseTo(edge.w, 0);
	});
}

const MISSING = "/this-page-does-not-exist-xyz/";

test("unknown URL serves the light 404 page", async ({ page }) => {
	const res = await page.goto(MISSING);
	expect(res?.status()).toBe(404);
	await expect(page.locator("h1")).toHaveText("This page doesn’t exist!!");
	await expect(page.getByRole("link", { name: "Back to main page" })).toHaveAttribute("href", "/");
	await expect(page.getByRole("button", { name: "Back to previous page" })).toHaveCount(0);
	await expect(page.locator("canvas[data-404-art]")).toBeVisible();
	await expect(page.locator('footer[aria-label="Site footer"]')).toBeVisible();
});

test("404 can return to the previous page in this tab", async ({ page }) => {
	await page.goto("/now/");
	await page.evaluate((path) => {
		const link = document.createElement("a");
		link.textContent = "Broken link";
		link.href = path;
		document.querySelector("main")?.append(link);
	}, MISSING);
	await page.getByRole("link", { name: "Broken link" }).click();
	await expect(page).toHaveURL(MISSING);
	await expect(page.getByRole("link", { name: "Back to main page" })).toHaveCount(0);
	await page.getByRole("button", { name: "Back to previous page" }).click();
	await expect(page).toHaveURL("/now/");
});

test("404 prefers home when there is only forward history", async ({ page }) => {
	await page.goto(MISSING);
	await page.goto("/now/");
	await page.goBack();
	await expect(page.getByRole("link", { name: "Back to main page" })).toBeVisible();
});

test("404 and home capture each header with its own page on navigation", async ({ page }) => {
	await page.goto(MISSING);
	const header = page.locator('[data-test="site-header"]');
	await expect(header).toHaveCSS("view-transition-name", "none");
	await header.locator('[data-test="wordmark"]').click();
	await expect(page.locator("[data-home-catalogue]")).toBeVisible();
	await expect(header).toHaveCSS("view-transition-name", "none");
	await page.goBack();
	await expect(page).toHaveURL(MISSING);
	await expect(page.locator("[data-404-art]")).toBeVisible();
	await expect(header).toHaveCSS("view-transition-name", "none");
});

test("404 artwork is still under reduced motion and animates on request", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(MISSING);
	const canvas = page.locator("canvas[data-404-art]");
	await expect(canvas).toBeVisible();
	const frame = (): Promise<string> =>
		canvas.evaluate((el) => {
			if (!(el instanceof HTMLCanvasElement)) throw new Error("Expected the 404 canvas");
			return el.toDataURL();
		});
	const still = await frame();
	await expect(page.getByRole("button", { name: "Play motion" })).toBeVisible();
	await page.getByRole("button", { name: "Play motion" }).click();
	await expect.poll(frame).not.toBe(still);
	await page.getByRole("button", { name: "Pause motion" }).click();
	const paused = await frame();
	await expect
		.poll(async () => {
			await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
			return frame();
		})
		.toBe(paused);
});

test("only a swipe from outside the visible 404 sends it moving", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(MISSING);
	const canvas = page.locator("[data-404-art]");
	await expect(canvas).toBeVisible();
	const start = await canvas.evaluate((el) => {
		if (!(el instanceof HTMLCanvasElement)) throw new Error("Expected the 404 canvas");
		const context = el.getContext("2d");
		if (!context) throw new Error("Expected a 2D context");
		const box = el.getBoundingClientRect();
		const row = Math.floor(el.height / 2);
		const { data } = context.getImageData(0, row, el.width, 1);
		const pixel = data.findIndex((alpha, i) => i % 4 === 3 && alpha === 255) / 4;
		const y = box.top + ((row + 0.5) / el.height) * box.height;
		const x = box.left + ((pixel + 3) / el.width) * box.width;

		// The pointer first reports a position on the mark, then leaves it.
		const pointer = (clientX: number, clientY: number) => {
			window.dispatchEvent(
				new PointerEvent("pointermove", {
					clientX,
					clientY,
					pointerType: "mouse",
					isPrimary: true,
				}),
			);
		};
		pointer(x, y);
		pointer(x + 1, y);
		pointer(10, y);
		return { left: box.left, y };
	});
	await expect
		.poll(async () => {
			await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
			return (await canvas.boundingBox())?.x;
		})
		.toBeCloseTo(start.left);
	await page.mouse.move(1260, start.y);
	await expect
		.poll(async () => (await canvas.boundingBox())?.x ?? 0)
		.toBeGreaterThan(start.left + 8);
});

test("favicon files exist and are linked", async ({ page, request }) => {
	await page.goto("/now/");
	await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
	expect((await request.get("/favicon.svg")).status()).toBe(200);
	expect((await request.get("/favicon.ico")).status()).toBe(200);
});

test("search has a header with a home link", async ({ page }) => {
	await page.goto("/search/");
	await expect(page.locator('[data-test="site-header"] a[href="/"]')).toBeVisible();
});

test("garden pages have a side gutter", async ({ page }) => {
	for (const route of ["/garden/", "/garden/graph/"]) {
		await page.goto(route);
		const x = (await page.locator("h1").boundingBox())?.x ?? 0;
		expect(x).toBeGreaterThanOrEqual(16);
	}
});
