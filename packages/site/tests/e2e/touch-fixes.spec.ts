/**
 * E2E for the touch / palette UI fixes (cursor ring, tap targets, palette reach).
 *
 * @see packages/specs/reviews/ui/breaker-mobile.md (B-01, B-06)
 * @see packages/specs/reviews/ui/breaker-desktop.md (B-04)
 */
import { expect, test } from "@playwright/test";

test.describe("coarse pointer", () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 393, height: 852 } });

	test("no visible custom-cursor ring on touch", async ({ page }) => {
		await page.goto("/colophon/");
		const visible = await page
			.locator("[data-cursor]")
			.evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== "none").length);
		expect(visible).toBe(0);
	});

	test("tap targets are at least 44x44", async ({ page }) => {
		// Why: controls live on different pages (home is `minimal`: no sound toggle).
		const targets: [string, string][] = [
			["/", "[data-motion-toggle]"],
			["/colophon/", "[data-sound-toggle]"],
			["/works/linsae/", "[data-test='all-projects']"],
			["/works/linsae/", "[data-test='prev'], [data-test='next']"],
		];
		const small: string[] = [];
		for (const [path, sel] of targets) {
			await page.goto(path);
			const box = await page
				.locator(sel)
				.first()
				.evaluate((el) => {
					const cs = getComputedStyle(el, "::before");
					const r = el.getBoundingClientRect();
					return {
						w: Math.max(r.width, Number.parseFloat(cs.width) || 0),
						h: Math.max(r.height, Number.parseFloat(cs.height) || 0),
					};
				});
			if (box.w < 44 || box.h < 44) small.push(`${sel} ${box.w}x${box.h}`);
		}
		expect(small).toEqual([]);
	});
});

test("palette: typing a project name and Enter opens it", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	await expect(page.locator("html[data-palette-ready='true']")).toBeAttached();
	await page.keyboard.press("Control+k");
	await page.locator("[data-palette-input]").fill("linsae");
	await expect(page.locator("[data-palette-item]").first()).toContainText(/linsae/i);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/works\/linsae\/$/);
});

test("palette Enter after a card visit and Back raises no page error (state_unsafe_mutation)", async ({
	page,
}) => {
	// Why: LinkPreview's focusout handler wrote $state while Svelte removed the palette input.
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	await expect(page.locator("html[data-palette-ready='true']")).toBeAttached();
	await page.locator("a[href^='/works/']").first().click();
	await expect(page).toHaveURL(/\/works\//);
	await page.goBack();
	await page.locator("[data-motion-toggle]").first().click();
	await page.keyboard.press("Control+k");
	await page.locator("[data-palette-input]").fill("search");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/search\/$/);
	await page.waitForTimeout(300);
	expect(errors).toEqual([]);
});
