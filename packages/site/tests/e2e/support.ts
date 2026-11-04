import type { Page } from "@playwright/test";

/**
 * Resolve once every `<img>` on the page has finished loading (or failed).
 *
 * Why: the masonry home lazy-loads its covers and the unloaded `<img>`s collapse to
 * zero height, so `<main>` measures ~590 px at `domcontentloaded` and ~4330 px once
 * the images are in (mobile viewport, measured). A `toHaveScreenshot` taken in
 * between is a mid-load frame whose height differs from run to run, which made the
 * regenerated baselines (and would make every later comparison) non-deterministic.
 * Call this after `goto` and before snapshotting any page that carries lazy images.
 *
 * @see https://playwright.dev/docs/api/class-page#page-wait-for-function
 */
export async function waitForImagesSettled(page: Page): Promise<void> {
	await page.waitForLoadState("load");
	// Why: natural-aspect cards make the one-column phone page tall enough that the last
	// lazy covers sit beyond Chromium's lazy-load distance and would never start; walk the
	// page once so every lazy image begins loading, then return to the top.
	await page.evaluate(async () => {
		const step = window.innerHeight;
		for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
			window.scrollTo(0, y);
			await new Promise((r) => requestAnimationFrame(r));
		}
		window.scrollTo(0, 0);
	});
	await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
}
