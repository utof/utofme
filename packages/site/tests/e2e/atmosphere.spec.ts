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
 * @see packages/site/playwright.config.ts (chromium-mobile only)
 */
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
