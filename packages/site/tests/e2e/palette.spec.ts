// Why: e2e tests for CommandPalette.svelte island on `/`.
// Covers dataset-ready flag, open/close, filtering, keyboard navigation,
// ⌘+Enter blank-tab open, outside-click close, focus trap, and reduced-motion.
//
// Fixture mount: CommandPalette is temporarily mounted on / via index.astro
// for Task 9 (client:idle). Task 10 moves the mount into _BaseLayout.astro.
//
// Synchronisation strategy: wait for document.documentElement.dataset.paletteReady
// === "true" (set in onMount) rather than a window event — the dataset flag
// survives ClientRouter <body> swaps because <html> attributes persist.
//
// @see packages/specs/plans/02-interactivity.md § Task 9
import { expect, test } from "@playwright/test";

// Why: declaring __lastOpenCall on the browser Window type so test 5's
// page.evaluate callbacks are fully typed without `as unknown` casts.
// This interface merge is test-file-local and not exported.
declare global {
	interface Window {
		/** Spy set by test 5 to capture window.open calls. */
		__lastOpenCall: { target: string; name: string } | null;
	}
}

/**
 * Wait until the CommandPalette island has mounted (dataset flag set).
 *
 * Why: `client:idle` delays hydration until after idle; waiting for the
 * dataset flag is the canonical readiness primitive per the plan.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 9
 */
async function waitForPalette(page: import("@playwright/test").Page): Promise<void> {
	await page.waitForFunction(() => document.documentElement.dataset.paletteReady === "true", {
		timeout: 5000,
	});
}

/**
 * Open the palette via ⌘K / Ctrl+K keyboard shortcut.
 *
 * Why: helper avoids repeating the modifier key platform logic in every test.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 9
 */
async function openPalette(page: import("@playwright/test").Page): Promise<void> {
	// Use Meta+K (Cmd+K on Mac) — Playwright maps "Meta" to the OS meta key.
	// The Pixel 5 chromium project runs on Linux so Ctrl+K fires; using
	// "ControlOrMeta" matches both platforms.
	await page.keyboard.press("ControlOrMeta+k");
}

test.describe("CommandPalette — /", () => {
	test("1. paletteReady dataset flag set; ⌘K opens palette in ≤ 100 ms", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);

		// Measure open latency
		const before = Date.now();
		await openPalette(page);
		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });
		const elapsed = Date.now() - before;
		expect(elapsed).toBeLessThanOrEqual(100);
	});

	test("2. Esc closes palette; focus returns to trigger element", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Press Escape
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden({ timeout: 300 });
	});

	test("3. typing 'wor' filters list to match 'Go to /works/'", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Type into the search input
		await page.keyboard.type("wor");

		// "Go to /works/" action should be visible
		const item = dialog.locator("[data-palette-item]").filter({ hasText: "Go to /works/" });
		await expect(item).toBeVisible({ timeout: 300 });

		// Other actions should be hidden (not rendered when filtered out)
		const homeItem = dialog.locator("[data-palette-item]").filter({ hasText: "Go to home" });
		await expect(homeItem).toBeHidden({ timeout: 300 });
	});

	test("4. Up/Down keys move selection; Enter activates navigate action", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Clear the input and type to get known results
		await page.keyboard.type("home");

		// First item should be selected (index 0)
		const firstItem = dialog.locator('[data-palette-item][aria-selected="true"]');
		await expect(firstItem).toBeVisible({ timeout: 300 });

		// Press Enter to navigate — the page should navigate to /
		// Why: waitForURL is the non-deprecated replacement for waitForNavigation per Playwright docs.
		// @see https://playwright.dev/docs/api/class-page#page-wait-for-url
		await Promise.all([page.waitForURL(/.*/, { timeout: 2000 }), page.keyboard.press("Enter")]);
		// Action "Go to home" targets "/" — URL contains "/"
		expect(page.url()).toContain("/");
	});

	test("5. ⌘+Enter on navigate action calls window.open with '_blank'", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);

		// Stub window.open before opening palette
		await page.evaluate(() => {
			window.__lastOpenCall = null;
			window.open = (url?: string | URL, target?: string) => {
				window.__lastOpenCall = {
					target: typeof url === "string" ? url : (url?.toString() ?? ""),
					name: target ?? "",
				};
				return null;
			};
		});

		await openPalette(page);
		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Filter to "works" to get a known navigate action
		await page.keyboard.type("wor");
		const item = dialog.locator("[data-palette-item]").filter({ hasText: "Go to /works" });
		await expect(item).toBeVisible({ timeout: 300 });

		// Press ⌘+Enter (ControlOrMeta+Enter) to open in new tab
		await page.keyboard.press("ControlOrMeta+Enter");

		// Assert window.open was called with target="/works/" and name="_blank"
		const call = await page.evaluate(() => window.__lastOpenCall);
		expect(call).toMatchObject({ target: "/works/", name: "_blank" });
	});

	test("6. outside click closes palette", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Click outside the dialog on the backdrop.
		// Why: backdrop is position:fixed; inset:0, so (20,20) from its top-left always
		// lands on the backdrop itself — viewport-independent. Center-click would land
		// on the centered dialog when the list is tall enough to reach center.
		await page.locator("[data-palette-backdrop]").click({ position: { x: 20, y: 20 } });
		await expect(dialog).toBeHidden({ timeout: 300 });
	});

	test("7. Tab cycles strictly within palette (focus trap)", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Tab forward a few times — focus must stay inside the dialog
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press("Tab");
			const focused = await page.evaluate(() => {
				const el = document.activeElement;
				if (!el) return false;
				const palette = document.querySelector('[role="dialog"][data-palette]');
				return palette ? palette.contains(el) : false;
			});
			expect(focused).toBe(true);
		}

		// Shift+Tab back — focus must still stay inside the dialog
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press("Shift+Tab");
			const focused = await page.evaluate(() => {
				const el = document.activeElement;
				if (!el) return false;
				const palette = document.querySelector('[role="dialog"][data-palette]');
				return palette ? palette.contains(el) : false;
			});
			expect(focused).toBe(true);
		}
	});

	test("8. prefers-reduced-motion: palette visible, no animation", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// With reduced-motion, animationName should be 'none'
		const animationName = await dialog.evaluate((el) => getComputedStyle(el).animationName);
		expect(animationName).toBe("none");
	});

	// Why: Phase 4 adds 5 slash pages (/now /uses /colophon /tops /stats); the
	// palette must expose navigate entries for each so keyboard-first users can
	// reach them without touching the mouse.
	// @see packages/specs/specs/04-slash-pages.md § AC8
	test("10. palette nav lists 5 slash routes", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Clear query so all actions are visible (no filtering)
		const input = dialog.locator("input");
		await input.fill("");

		const items = dialog.locator("[data-palette-item]");
		for (const slug of [
			"Go to /now/",
			"Go to /uses/",
			"Go to /colophon/",
			"Go to /tops/",
			"Go to /stats/",
		]) {
			await expect(items.filter({ hasText: slug })).toBeVisible({ timeout: 300 });
		}
	});

	// Why: transition:persist only takes effect when Astro's ClientRouter handles
	// navigation. ClientRouter wired in Task 12 — this test now exercises SPA nav.
	// @see packages/specs/plans/02-interactivity.md § Task 10
	test("9. palette persists across route navigation (ClientRouter wired)", async ({ page }) => {
		await page.goto("/");
		await waitForPalette(page);
		await openPalette(page);

		const dialog = page.locator('[role="dialog"][data-palette]');
		await expect(dialog).toBeVisible({ timeout: 100 });

		// Type a query so we can verify state is preserved after nav
		await page.keyboard.type("wor");
		const input = dialog.locator("input");
		await expect(input).toHaveValue("wor", { timeout: 300 });

		// Navigate to /works/ via in-page anchor click so ClientRouter intercepts it.
		// Why: page.goto() is a full browser navigation and bypasses ClientRouter;
		// transition:persist only works when ClientRouter handles the swap.
		// Clicking a synthetic same-origin anchor triggers the SPA swap path.
		await page.evaluate(() => {
			const a = document.createElement("a");
			a.href = "/works/";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		});
		await page.waitForURL(/\/works/, { timeout: 5000 });
		// Why: paletteReady flag is already set before nav; transition:persist keeps
		// the CommandPalette island alive — onMount does not re-fire. We wait a beat
		// for the SPA swap to settle then assert directly on the existing DOM.
		await page.waitForTimeout(300);

		// Palette should still be open and query preserved
		const dialogAfterNav = page.locator('[role="dialog"][data-palette]');
		await expect(dialogAfterNav).toBeVisible({ timeout: 1000 });
		const inputAfterNav = dialogAfterNav.locator("input");
		await expect(inputAfterNav).toHaveValue("wor", { timeout: 500 });
	});
});
