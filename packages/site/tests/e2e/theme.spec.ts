/**
 * Light-only theme e2e — no toggle, stored/OS dark choices ignored, SPA resilience.
 *
 * Why: ADR 0040 made the site light-only (`LIGHT_ONLY` in src/lib/theme.ts): the
 * system → light → dark cycle, the `ThemeToggle` button and the dark selectors in
 * tokens.css are inert. These cases replace the Phase 6 Task 9/10 dark-mode cases
 * (toggle cycle, "dark persists across reload", "system follows
 * prefers-color-scheme: dark") with their light-only equivalents, so a regression
 * that lets a stored `utofme:theme=dark` or an OS dark preference flip the site dark
 * is still caught. The no-FOUC angle is kept: the check runs on the first animation
 * frame, seeded through addInitScript so the head script sees the stored value
 * BEFORE the first paint.
 *
 * The cycle/persistence logic itself (`inlineThemeScript`, `wireToggleScript`) stays
 * covered by tests/unit/theme-script.test.ts, which exercises the functions directly.
 *
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 * @see packages/site/src/lib/theme.ts
 * @see packages/site/src/styles/tokens.css
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../../src/lib/theme.ts";

/**
 * Computed canvas colour. `_BaseLayout` paints `--color-bg` on `<html>`; the `#FFFFFF`
 * canvas (ADR 0042) computes to `rgb(255, 255, 255)`.
 */
async function canvasBackground(page: Page): Promise<string> {
	return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

test("light-only: <html data-theme=light> is static and no theme toggle is rendered", async ({
	page,
}) => {
	// Why both routes: `/` is the minimal masonry home, `/now/` a full-chrome
	// layout where ThemeToggle used to sit next to SoundToggle.
	for (const route of ["/", "/now/"] as const) {
		await page.goto(route);
		await expect(page.locator("[data-theme-toggle]")).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
		// No `themeSource`: nothing distinguishes "system" from "explicit" any more.
		expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBeUndefined();
	}
});

test("a stored dark choice is ignored: stays light at first paint, no FOUC", async ({
	page,
	context,
}) => {
	// addInitScript runs BEFORE every page-script, so a head script that honoured
	// the stored value would already have flipped the theme on first paint.
	await context.addInitScript((k) => localStorage.setItem(k, "dark"), THEME_STORAGE_KEY);
	await page.goto("/");

	const themeAtFirstPaint = await page.evaluate(() => {
		return new Promise<string>((resolve) => {
			requestAnimationFrame(() => resolve(document.documentElement.dataset.theme ?? ""));
		});
	});
	expect(themeAtFirstPaint).toBe("light");
	expect(await canvasBackground(page)).toBe("rgb(255, 255, 255)");
	// The stored value is left alone (the script never reads or writes it).
	expect(await page.evaluate((k) => localStorage.getItem(k), THEME_STORAGE_KEY)).toBe("dark");
});

test("an OS dark preference is ignored: data-theme stays light", async ({ browser }) => {
	const ctx = await browser.newContext({ colorScheme: "dark" });
	const page = await ctx.newPage();
	await page.goto("/");
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
	expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBeUndefined();
	expect(await canvasBackground(page)).toBe("rgb(255, 255, 255)");
	// `color-scheme: light` on :root keeps UA widgets (scrollbars, form controls) light too.
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
		"light",
	);
	await ctx.close();
});

test("stays light after SPA navigation (forced-light script has data-astro-rerun)", async ({
	page,
	context,
}) => {
	// ClientRouter re-renders <body>; the forced-light head script carries
	// `data-astro-rerun` so it re-runs on each swap. Seed a stored dark choice so a
	// swap that fell back to the original theme script would visibly flip the page.
	//
	// Why start at a work-detail page: the breadcrumb `<a href="/">` is the
	// only stable cross-route link on the site, so it's the safest source of a
	// real ClientRouter <a> click.
	await context.addInitScript((k) => localStorage.setItem(k, "dark"), THEME_STORAGE_KEY);
	await page.goto("/works/code-1/");
	await page.click("a[data-test='breadcrumb']");
	await page.waitForURL((url) => url.pathname === "/");

	await expect(page.locator("[data-theme-toggle]")).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
	expect(await canvasBackground(page)).toBe("rgb(255, 255, 255)");
});
