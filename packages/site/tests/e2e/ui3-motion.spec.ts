/**
 * E2E for the round-3 motion fixes: graph under reduced motion, lightbox first
 * frame, palette navigation through the router, header control position.
 *
 * @see packages/specs/reviews/ui/motion.md (M3-05, M3-06, M3-07, M3-09, M3-13, M3-14)
 */
import { expect, test } from "@playwright/test";

test("graph paints a static, non-blank canvas under reduced motion (M3-05)", async ({
	browser,
}) => {
	const ctx = await browser.newContext({
		reducedMotion: "reduce",
		viewport: { width: 1280, height: 800 },
	});
	const page = await ctx.newPage();
	await page.goto("/garden/graph/");
	await page.locator(".graph canvas").waitFor();
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const c = document.querySelector<HTMLCanvasElement>(".graph canvas");
					const g = c?.getContext("2d");
					if (!c || !g) return 0;
					const d = g.getImageData(0, 0, c.width, c.height).data;
					let n = 0;
					for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
					return n;
				}),
			{ timeout: 8000 },
		)
		.toBeGreaterThan(200);
	await ctx.close();
});

test("lightbox image has its full size in the first open frame; step swaps image + caption together (M3-06/07)", async ({
	browser,
}) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.goto("/works/enth/");
	const first = await page.evaluate(
		() =>
			new Promise<{ w: number; h: number; dlg: number }>((resolve) => {
				const dlg = document.querySelector<HTMLDialogElement>("dialog.lightbox");
				const img = dlg?.querySelector("img");
				if (!dlg || !img) throw new Error("no lightbox");
				const mo = new MutationObserver(() => {
					if (!dlg.open) return;
					mo.disconnect();
					requestAnimationFrame(() => {
						const r = img.getBoundingClientRect();
						resolve({ w: r.width, h: r.height, dlg: dlg.getBoundingClientRect().height });
					});
				});
				mo.observe(dlg, { attributes: true, attributeFilter: ["open"] });
				document.querySelector<HTMLButtonElement>("button[data-zoom]")?.click();
			}),
	);
	expect(first.w).toBeGreaterThan(300);
	expect(first.h).toBeGreaterThan(150);
	expect(first.dlg).toBeGreaterThan(200);
	// Step: after the swap the figcaption and the img src agree with the same button.
	const thumbs = page.locator("button[data-zoom]");
	await page.keyboard.press("ArrowRight");
	const second = thumbs.nth(1);
	await expect(page.locator("dialog.lightbox figcaption")).toHaveText(
		(await second.getAttribute("data-caption")) ?? "",
	);
	expect(await page.locator("dialog.lightbox img").getAttribute("src")).toBe(
		await second.getAttribute("data-full"),
	);
	await ctx.close();
});

test("palette Enter navigates through the router, no full reload (M3-14)", async ({ page }) => {
	await page.goto("/");
	await page.waitForFunction(() => document.documentElement.dataset["paletteReady"] === "true");
	await page.evaluate(() => Reflect.set(window, "__marker", 7));
	await page.keyboard.press("ControlOrMeta+k");
	await page.locator("[data-palette-input]").fill("colophon");
	await page.keyboard.press("Enter");
	await page.waitForURL(/\/colophon\//);
	expect(await page.evaluate(() => Reflect.get(window, "__marker"))).toBe(7);
	// Exit fade: the palette is removed after its 120 ms exit.
	await expect(page.locator("[data-palette]")).toHaveCount(0);
});

test("palette backdrop fades in instead of popping (M3-13)", async ({ browser }) => {
	const ctx = await browser.newContext({
		reducedMotion: "no-preference",
		viewport: { width: 1280, height: 800 },
	});
	const page = await ctx.newPage();
	await page.goto("/colophon/");
	await page.waitForFunction(() => document.documentElement.dataset["paletteReady"] === "true");
	await page.evaluate(() => localStorage.setItem("utofme:motion", "playing"));
	await page.reload();
	await page.waitForFunction(() => document.documentElement.dataset["paletteReady"] === "true");
	await page.keyboard.press("ControlOrMeta+k");
	const anim = await page.evaluate(() => {
		const b = document.querySelector("[data-palette-backdrop]");
		return b ? b.getAnimations().length : -1;
	});
	expect(anim).toBeGreaterThan(0);
	await ctx.close();
});

test("Pause motion keeps its x position on / and a project page (M3-09)", async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	const xs: number[] = [];
	for (const path of ["/", "/works/enth/"]) {
		await page.goto(path);
		const box = await page.locator("[data-motion-toggle]").boundingBox();
		if (!box) throw new Error("no toggle");
		xs.push(box.x + box.width);
	}
	expect(Math.abs((xs[0] ?? 0) - (xs[1] ?? 99))).toBeLessThan(1.5);
	await ctx.close();
});
