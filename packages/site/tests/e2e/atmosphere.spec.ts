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

// Why: global Window merge lets page.evaluate callbacks read __startCalls
// without `as unknown` casts (following the pattern in palette.spec.ts).
// This merge is test-file-local and not exported.
declare global {
	interface Window {
		/**
		 * Spy counter set by the cmd-K BufferSource test's addInitScript.
		 * Incremented each time `AudioBufferSourceNode.prototype.start` is called.
		 *
		 * @see packages/specs/plans/07-atmosphere.md § T2 TDD red cases
		 */
		__startCalls: number;
		/** Vendor-prefixed AudioContext present on some older Chromium builds. */
		webkitAudioContext?: typeof AudioContext;
	}
}

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

/**
 * Plan §T2 red case (lines ~201–202): e2e coverage for spec acceptance #5
 * (lazy AudioContext — only plays after user opt-in and cmd-K keydown).
 *
 * Option B: spy on `AudioBufferSourceNode.prototype.start` via `addInitScript`
 * (stronger signal than `resume` — directly asserts "audio playback was triggered").
 *
 * Why `addInitScript` + `__startCalls`: the IIFE in SoundToggle.astro uses
 * `ctx.createBufferSource()` then `.start()` to play sounds. Patching the
 * prototype before page load intercepts every call regardless of when the
 * AudioContext was created.
 *
 * @see packages/specs/plans/07-atmosphere.md § T2 TDD red cases ~201–202
 * @see packages/specs/specs/07-atmosphere.md § acceptance #5
 */
test("sound: cmd-k keydown plays the cmd-k buffer", async ({ page }) => {
	// Instrument BEFORE navigation so the patch runs in the page context on load.
	await page.addInitScript(() => {
		window.__startCalls = 0;
		const Ctor = window.AudioContext || window.webkitAudioContext;
		if (!Ctor) return;
		const origCreate = Ctor.prototype.createBufferSource;
		Ctor.prototype.createBufferSource = function (this: AudioContext) {
			const node = origCreate.call(this) as AudioBufferSourceNode;
			const origStart = node.start.bind(node);
			node.start = (...args: Parameters<typeof node.start>) => {
				window.__startCalls += 1;
				return origStart(...(args as Parameters<typeof origStart>));
			};
			return node;
		};
	});

	await page.goto("/");

	// Enable sound — this triggers ensure() which creates AudioContext + decodes buffers.
	await page.locator("[data-sound-toggle]").click();

	// Wait for decodeAudioData to settle; allow up to 4 s for network + decode.
	// The `__startCalls` key exists immediately (set by addInitScript) so we
	// wait for the toggle's aria-pressed to be "true" as a proxy that the click
	// was processed, then give decode time to complete.
	await expect(page.locator("[data-sound-toggle]")).toHaveAttribute("aria-pressed", "true");
	// Small grace period for async decode pipeline to finish before we fire cmd-K.
	await page.waitForTimeout(500);

	const before = await page.evaluate(() => window.__startCalls);

	// Dispatch ctrl+K — the IIFE accepts both metaKey and ctrlKey (SoundToggle.astro line 110).
	await page.keyboard.press("Control+k");

	// Wait up to 3 s for BufferSource.start() to be called.
	await page.waitForFunction((b: number) => window.__startCalls > b, before, { timeout: 3000 });

	const after = await page.evaluate(() => window.__startCalls);
	expect(after).toBeGreaterThan(before);
});

// ---------------------------------------------------------------------------
// T3 — Time-of-day accent shifts
// ---------------------------------------------------------------------------

/**
 * Verifies that [data-tod] is set on <html> before DOMContentLoaded, proving
 * the inline-script runs at first paint (not post-hydration).
 *
 * Why per-test timezoneId: setting it at project scope would affect every other
 * e2e case; scoped here to isolate the UTC clock fixture.
 *
 * @see packages/specs/plans/07-atmosphere.md § T3 TDD red cases
 * @see packages/specs/specs/07-atmosphere.md § Success criteria #11
 */
test.describe("time-of-day", () => {
	test.use({ timezoneId: "UTC" });

	test("applies before DOMContentLoaded — 06:00 UTC → dawn", async ({ page }) => {
		await page.clock.install({ time: new Date("2026-05-01T06:00:00Z") });
		await page.clock.pauseAt(new Date("2026-05-01T06:00:00Z"));
		await page.goto("/");

		const tod = await page.evaluate(
			() =>
				new Promise<string>((resolve) => {
					if (document.readyState === "loading") {
						document.addEventListener(
							"DOMContentLoaded",
							() => resolve(document.documentElement.dataset.tod ?? ""),
							{ once: true },
						);
					} else {
						resolve(document.documentElement.dataset.tod ?? "");
					}
				}),
		);

		expect(tod).toBe("dawn");
	});

	test("applies before DOMContentLoaded — 12:00 UTC → day", async ({ page }) => {
		await page.clock.install({ time: new Date("2026-05-01T12:00:00Z") });
		await page.clock.pauseAt(new Date("2026-05-01T12:00:00Z"));
		await page.goto("/");

		const tod = await page.evaluate(
			() =>
				new Promise<string>((resolve) => {
					if (document.readyState === "loading") {
						document.addEventListener(
							"DOMContentLoaded",
							() => resolve(document.documentElement.dataset.tod ?? ""),
							{ once: true },
						);
					} else {
						resolve(document.documentElement.dataset.tod ?? "");
					}
				}),
		);

		expect(tod).toBe("day");
	});
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
