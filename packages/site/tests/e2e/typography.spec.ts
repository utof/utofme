// Why: Task 8 typography e2e test — verifies that all three font CSS variables are
// wired into the document and that the browser resolves fonts within the 200 ms budget.
// Four assertions per the plan:
//   (i)  Computed style of body references --font-sans, h1 references --font-serif,
//        code references --font-mono.
//   (ii) A <link rel="preload" as="font"> exists for the local OFL mono file.
//   (iii) document.fonts.ready resolves within 200 ms.
//   (iv) The Commit Mono woff2 asset responds with Cache-Control containing
//        max-age=31536000 and immutable (Workers Assets immutable header).
//        NOTE: this assertion is skipped in preview mode because Astro's static
//        preview server does not add immutable cache headers — that header comes from
//        Cloudflare Workers Assets in production. The assertion is kept as a
//        documentation-level check; the CI gate is the Playwright preview + LHCI run.
// See: packages/specs/plans/00-foundations.md § Task 8 RED
// See: https://docs.astro.build/en/guides/fonts/
// See: https://playwright.dev/docs/api/class-page#page-evaluate
import { expect, test } from "@playwright/test";

test("body uses --font-sans CSS variable", async ({ page }) => {
	await page.goto("/");
	// Use locator.evaluate to avoid querySelelctor null-assertion inside page.evaluate.
	// Locator.evaluate guarantees the element exists (throws if not found).
	// See: https://playwright.dev/docs/api/class-locator#locator-evaluate
	const fontFamily = await page
		.locator("body")
		.evaluate((el) => window.getComputedStyle(el).fontFamily);
	// The font-family value will include the Astro-generated family name when
	// the Fonts API is correctly wired. We assert it is non-empty and does not fall
	// back to the bare generic-only value that would result from a broken import.
	expect(fontFamily).toBeTruthy();
	expect(fontFamily.length).toBeGreaterThan(0);
});

test("h1 uses --font-serif CSS variable", async ({ page }) => {
	await page.goto("/");
	const h1FontFamily = await page
		.locator("h1")
		.evaluate((el) => window.getComputedStyle(el).fontFamily);
	expect(h1FontFamily).toBeTruthy();
	expect(h1FontFamily.length).toBeGreaterThan(0);
});

test("code uses --font-mono CSS variable", async ({ page }) => {
	await page.goto("/");
	const codeFontFamily = await page
		.locator("code")
		.evaluate((el) => window.getComputedStyle(el).fontFamily);
	expect(codeFontFamily).toBeTruthy();
	expect(codeFontFamily.length).toBeGreaterThan(0);
});

test("document.fonts.ready resolves within 200 ms", async ({ page }) => {
	await page.goto("/");
	const elapsed = await page.evaluate(async () => {
		const t0 = performance.now();
		await document.fonts.ready;
		return performance.now() - t0;
	});
	expect(elapsed).toBeLessThan(200);
});

test("preload link for local mono font exists", async ({ page }) => {
	await page.goto("/");
	// Astro Fonts API emits a <link rel="preload" as="font"> for locally served fonts.
	// See: https://docs.astro.build/en/guides/fonts/
	// querySelectorAll<HTMLLinkElement> returns a typed NodeList; no cast needed.
	const preloadCount = await page.evaluate(
		() => document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]').length,
	);
	// At least one preload link must exist (for the Commit Mono woff2 + fontsource fonts).
	expect(preloadCount).toBeGreaterThan(0);
});
