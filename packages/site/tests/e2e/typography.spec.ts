// Why: Task 8 typography e2e test — verifies that all three font CSS variables are
// wired into the document and that the browser resolves fonts within the 200 ms budget.
// Four assertions per the plan:
//   (i)  Computed style of body and h1 resolves to a Geist-prefixed family;
//        --font-serif / --font-mono to Newsreader / Geist Mono (ADR 0042).
//        These match the Astro Fonts API's hashed-family-name convention
//        (e.g. "Geist-8451acc10d36f8f4"), which is what `getComputedStyle` returns.
//   (ii) A <link rel="preload" as="font"> exists for the mono face.
//   (iii) document.fonts.ready resolves within 200 ms.
//   (iv) The mono woff2 asset responds with Cache-Control containing
//        max-age=31536000 and immutable. Per spec § "Success criteria" (line 109),
//        this header is verified in PRODUCTION on the deployed *.workers.dev URL —
//        Cloudflare Workers Assets emits the immutable header. Astro's local preview
//        server does NOT emit it, so this assertion is explicitly `test.skip`'d here
//        with a deferral reason that is machine-visible in the Playwright report.
// See: packages/specs/plans/00-foundations.md § Task 8 RED
// See: packages/specs/specs/00-foundations.md § "Success criteria" (line 109)
// See: https://docs.astro.build/en/guides/fonts/
// See: https://playwright.dev/docs/api/class-page#page-evaluate
import { expect, test } from "@playwright/test";

test("body font-family resolves to a Geist-prefixed family (--font-sans cascade)", async ({
	page,
}) => {
	await page.goto("/");
	// Use locator.evaluate to avoid querySelector null-assertion inside page.evaluate.
	// Locator.evaluate guarantees the element exists (throws if not found).
	// See: https://playwright.dev/docs/api/class-locator#locator-evaluate
	const fontFamily = await page
		.locator("body")
		.evaluate((el) => window.getComputedStyle(el).fontFamily);
	// The Astro Fonts API emits a hashed family name (e.g. "Geist-8451acc10d36f8f4")
	// into the --font-sans CSS variable; the cascade resolves it here. Asserting
	// the substring match ensures the Fonts API actually wired Geist (not just any
	// non-empty font-family fallback).
	expect(fontFamily).toMatch(/Geist/);
});

test("h1 font-family resolves to Geist (v21: headings are sans, ADR 0042)", async ({ page }) => {
	await page.goto("/");
	const h1FontFamily = await page
		.locator("h1")
		.evaluate((el) => window.getComputedStyle(el).fontFamily);
	expect(h1FontFamily).toMatch(/Geist/);
	expect(h1FontFamily).not.toMatch(/Geist\s*Mono/i);
});

// Why: `/` no longer renders serif text or a <code> element (masonry home), so the
// serif + mono wiring is asserted on the Fonts API custom properties instead.
test("--font-serif resolves to a Newsreader-prefixed family", async ({ page }) => {
	await page.goto("/");
	const serif = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--font-serif"),
	);
	expect(serif).toMatch(/Newsreader/);
});

test("--font-mono resolves to a Geist-Mono-prefixed family", async ({ page }) => {
	await page.goto("/");
	const mono = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--font-mono"),
	);
	// Astro emits "Geist Mono-<hash>" plus a quoted fallback token; tolerate both.
	expect(mono).toMatch(/Geist\s*Mono/i);
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
	// Astro Fonts API emits a <link rel="preload" as="font"> for locally served fonts
	// when the <Font> component is invoked with `preload`. Phase 0 only preloads the
	// mono face (see _BaseLayout.astro for the rationale).
	// See: https://docs.astro.build/en/guides/fonts/
	const preloadCount = await page.evaluate(
		() => document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]').length,
	);
	expect(preloadCount).toBeGreaterThan(0);
});

// Why: Spec § "Success criteria" (line 109) mandates `Cache-Control: public,
// max-age=31536000, immutable` on the woff2 asset. That header is emitted by
// Cloudflare Workers Assets in production, NOT by Astro's local preview server
// (which is the harness Playwright runs against in CI). Asserting it here against
// a localhost-preview server would always fail — silently `if (header)` skipping
// it (the prior implementation) hid the deferral. This explicit `.skip` keeps the
// deferral machine-visible in `playwright test --reporter=list` output.
//
// Verification path: the production gate is the deploy.yml workflow — after the
// `*.workers.dev` URL is live, a manual `curl -I` or a future Phase 6 e2e job
// against the deployed URL will assert the header. Tracking that in `progress.md`.
test.skip("woff2 asset responds with immutable Cache-Control header", () => {
	// Deferred to production verification (Cloudflare Workers Assets emits the
	// immutable header; Astro preview server does not). See spec § "Success criteria".
});
