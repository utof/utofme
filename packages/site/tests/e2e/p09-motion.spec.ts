// P9-6 "Pause motion": toggle state, persistence across reload and ClientRouter
// navigation, keyboard operability, reduced-motion default.
// @see packages/specs/specs/09-project-view.md § P9-6 (AC6.3, AC6.5)
import { expect, test } from "@playwright/test";

test("toggle pauses, persists across reload and a router navigation", async ({ page }) => {
	await page.goto("/");
	const btn = page.getByRole("button", { name: /pause motion/i });
	await expect(btn).toHaveAttribute("aria-pressed", "false");
	await btn.click();
	await expect(page.getByRole("button", { name: /play motion/i })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
	expect(await page.evaluate(() => localStorage.getItem("utofme:motion"))).toBe("paused");
	await page.reload();
	await expect(page.getByRole("button", { name: /play motion/i })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	// Client-side navigation away and back keeps the attribute (router drops <html> attrs).
	await page.locator("a.card--media[href^='/works/']").first().click();
	await page.waitForURL(/\/works\//);
	await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
	await page.goBack();
	await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
});

test("toggle is keyboard operable", async ({ page }) => {
	await page.goto("/");
	const btn = page.locator("[data-motion-toggle]");
	await btn.focus();
	await page.keyboard.press("Enter");
	await expect(btn).toHaveAttribute("aria-pressed", "true");
});

test.describe("reduced motion", () => {
	test("defaults to paused (posters) and can be opted back in", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		const btn = page.locator("[data-motion-toggle]");
		await expect(btn).toHaveAttribute("aria-pressed", "true");
		expect(await page.locator("video[data-loop]:not([data-ready])").count()).toBe(
			await page.locator("video[data-loop]").count(),
		);
		await btn.click();
		await expect(btn).toHaveAttribute("aria-pressed", "false");
	});
});
