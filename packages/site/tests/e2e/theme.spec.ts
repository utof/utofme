/**
 * Theme toggle e2e — cycle, FOUC-free first paint, system mode, SPA resilience.
 *
 * Why: regression guards for Phase 6 Task 9 (inline theme scripts) + Task 10
 * (CSS variables). FOUC test seeds localStorage via addInitScript so the
 * inline first-paint script reads it BEFORE the first frame; that is the
 * whole point of inlining the script in <head>.
 *
 * @see packages/specs/plans/06-indieweb.md § Task 10
 * @see packages/site/src/lib/theme.ts
 * @see packages/site/src/styles/tokens.css
 */
import { expect, test } from "@playwright/test";

test("toggle cycles system → light → dark → system", async ({ page }) => {
	// The wireToggleScript cycle is system → light → dark → system → light → … —
	// see src/lib/theme.ts. Fresh context with cleared storage starts at "system"
	// (default Playwright context has prefers-color-scheme: light, so the inline
	// script sets data-theme="light" + data-theme-source="system").
	await page.goto("/");
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	const btn = page.locator("[data-theme-toggle]");
	await expect(btn).toBeVisible();

	// Initial: system source.
	expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBe("system");

	// Click 1: system → light, localStorage = "light"
	await btn.click();
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
	expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBeUndefined();
	expect(await page.evaluate(() => localStorage.getItem("utofme:theme"))).toBe("light");

	// Click 2: light → dark, localStorage = "dark"
	await btn.click();
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
	expect(await page.evaluate(() => localStorage.getItem("utofme:theme"))).toBe("dark");

	// Click 3: dark → system, localStorage cleared, themeSource = "system"
	await btn.click();
	expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBe("system");
	expect(await page.evaluate(() => localStorage.getItem("utofme:theme"))).toBeNull();
});

test("dark localStorage persists across reload (no FOUC)", async ({ page, context }) => {
	// addInitScript runs BEFORE every page-script, so the inline theme script in
	// <head> reads "dark" on first paint — no flash of light theme.
	await context.addInitScript(() => localStorage.setItem("utofme:theme", "dark"));
	await page.goto("/");

	// Assert <html data-theme="dark"> is set BEFORE the first paint.
	const themeAtFirstPaint = await page.evaluate(() => {
		return new Promise<string>((resolve) => {
			requestAnimationFrame(() => resolve(document.documentElement.dataset.theme ?? ""));
		});
	});
	expect(themeAtFirstPaint).toBe("dark");

	// Visual baseline — generated on first run with --update-snapshots.
	await expect(page).toHaveScreenshot("home-dark.png", { maxDiffPixelRatio: 0.05 });
});

test("system mode follows prefers-color-scheme: dark", async ({ browser }) => {
	const ctx = await browser.newContext({ colorScheme: "dark" });
	const page = await ctx.newPage();
	await page.goto("/");
	expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
	expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBe("system");
	await ctx.close();
});

test("toggle still works after SPA navigation (data-astro-rerun)", async ({ page, context }) => {
	// ClientRouter re-renders <body>; without `data-astro-rerun` on the toggle's
	// inline script, the new button has no click handler. Regression guard.
	//
	// Why start at a work-detail page: the breadcrumb `<a href="/works/">` is the
	// only stable cross-route link on the site, so it's the safest source of a
	// real ClientRouter <a> click. Home page card-grid links go to /works/<slug>/
	// (not /works/), so we navigate there first.
	//
	// Why seed localStorage = "light": establishes a deterministic non-system
	// starting state so the toggle's next step (→ dark) makes data-theme observably
	// flip. Without seeding, the fresh context starts at system+light and click 1
	// also produces light — `before === after` would falsely fail.
	await context.addInitScript(() => localStorage.setItem("utofme:theme", "light"));
	await page.goto("/works/code-1/");
	await page.click("a[href='/works/']");
	await page.waitForURL("**/works/");

	const btn = page.locator("[data-theme-toggle]");
	await expect(btn).toBeVisible();
	const before = await page.evaluate(() => document.documentElement.dataset.theme);
	await btn.click();
	const after = await page.evaluate(() => document.documentElement.dataset.theme);
	expect(after).not.toBe(before);
});
