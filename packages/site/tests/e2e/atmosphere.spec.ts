/**
 * atmosphere.spec.ts — Phase 7 atmosphere-feature e2e cases.
 *
 * Started in T1 (custom cursor); extended by T2 (sound), T3 (ToD), T4 (easter eggs).
 *
 * Why: negative coverage for client:media gating. Positive case (renders on
 * fine pointer) is covered at unit layer only — the single Playwright project
 * is chromium-mobile (Pixel 5, coarse pointer), so fine-pointer rendering
 * cannot be exercised here.
 *
 * @see packages/specs/plans/07-atmosphere.md § T1 TDD red cases
 * @see packages/specs/plans/07-atmosphere.md § T2 TDD red cases
 * @see packages/site/playwright.config.ts (chromium-mobile only)
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// T1 — Custom cursor
// ---------------------------------------------------------------------------

test("cursor: no JS downloaded on coarse pointer", async ({ page }) => {
	const cursorRequests: string[] = [];
	page.on("request", (req) => {
		const url = req.url();
		if (url.includes("CustomCursor")) {
			cursorRequests.push(url);
		}
	});

	await page.goto("/");

	expect(cursorRequests).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// T2 — Sound toggle
// ---------------------------------------------------------------------------

test("sound: default off, axe-clean", async ({ page }) => {
	await page.goto("/");

	// SoundToggle button should be in the DOM with aria-pressed="false"
	const btn = page.locator("[data-sound-toggle]");
	await expect(btn).toHaveAttribute("aria-pressed", "false");

	// Axe-core: zero violations on the page (sound toggle is part of the page)
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toHaveLength(0);
});

test("sound: toggle persists across reload", async ({ page }) => {
	await page.goto("/");

	const btn = page.locator("[data-sound-toggle]");
	await expect(btn).toHaveAttribute("aria-pressed", "false");

	// Click the toggle to enable sound
	await btn.click();
	await expect(btn).toHaveAttribute("aria-pressed", "true");

	// Reload and assert state is restored from localStorage
	await page.reload();
	const btnAfterReload = page.locator("[data-sound-toggle]");
	await expect(btnAfterReload).toHaveAttribute("aria-pressed", "true");
});

test("cursor: no JS downloaded on coarse pointer + reduced-motion", async ({ page }) => {
	// Merged per plan §T1: "Implementer may merge into the JS-download case."
	// On chromium-mobile (Pixel 5, coarse pointer) the client:media="(pointer: fine)"
	// gate prevents CustomCursor.js from being requested regardless of motion
	// preference. Reduced-motion is added here to document intent: the
	// combination of coarse pointer AND reduced-motion never downloads the script.
	// The unit layer (cursor.test.ts) covers the reduced-motion rAF gate directly.
	await page.emulateMedia({ reducedMotion: "reduce" });

	const cursorRequests: string[] = [];
	page.on("request", (req) => {
		const url = req.url();
		if (url.includes("CustomCursor")) {
			cursorRequests.push(url);
		}
	});

	await page.goto("/");

	expect(cursorRequests).toHaveLength(0);
});
