/**
 * Why: Phase 3 Task 5 — e2e + filesystem checks for the cover-image pipeline.
 *      Seven cases verifying <picture> multi-format output, srcset widths,
 *      loading attribute, passthrough absence, and visual baseline.
 * @see packages/specs/plans/03-content-pipeline.md § Task 5
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Why: use import.meta.url for a file-relative path so the dist directory
//      resolves correctly regardless of what directory the playwright worker
//      process chooses as CWD.  Test file is at tests/e2e/image-pipeline.spec.ts
//      so two levels up lands at packages/site, then /dist.
const SITE_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const DIST = resolve(SITE_ROOT, "dist");
const ASTRO_ASSETS = resolve(DIST, "_astro");

// ---------------------------------------------------------------------------
// Case 1 — built HTML contains a <picture> with at least 2 <source> elements
// ---------------------------------------------------------------------------

test("1. cover-fixture HTML has <picture> with ≥2 <source> elements", async ({ page }) => {
	const res = await page.goto("/works/cover-fixture/");
	expect(res?.status()).toBe(200);
	const sources = page.locator("picture source");
	const count = await sources.count();
	expect(count).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// Case 2 — AVIF source is present
// ---------------------------------------------------------------------------

test("2. <source type='image/avif'> present in cover-fixture", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	const avifSource = page.locator("picture source[type='image/avif']");
	await expect(avifSource).toBeAttached();
});

// ---------------------------------------------------------------------------
// Case 3 — WebP source is present
// ---------------------------------------------------------------------------

test("3. <source type='image/webp'> present in cover-fixture", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	const webpSource = page.locator("picture source[type='image/webp']");
	await expect(webpSource).toBeAttached();
});

// ---------------------------------------------------------------------------
// Case 4 — each <source> has srcset listing ≥3 widths
// ---------------------------------------------------------------------------

test("4. each <source> has srcset with ≥3 width descriptors", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	const sources = page.locator("picture source");
	const count = await sources.count();
	expect(count).toBeGreaterThanOrEqual(2);
	for (let i = 0; i < count; i++) {
		const srcset = await sources.nth(i).getAttribute("srcset");
		expect(srcset).toBeTruthy();
		// Each width entry is "<url> <Nw>" — count the " <Nw>" tokens
		const widthEntries = (srcset ?? "").split(",").filter((s) => /\d+w\s*$/.test(s.trim()));
		expect(widthEntries.length).toBeGreaterThanOrEqual(3);
	}
});

// ---------------------------------------------------------------------------
// Case 5 — passthrough: original JPEG not emitted at dist/assets/works/…;
//           optimised variants exist under dist/_astro/
// ---------------------------------------------------------------------------

test("5. original JPEG not in dist/assets/; optimised variants in dist/_astro/", () => {
	// Why: Astro rewrites local-asset paths to /_astro/<hash>.<ext>.
	//      The raw source file must NOT be copied verbatim into dist/assets/.
	const rawPath = resolve(DIST, "assets/works/cover-fixture.jpg");
	expect(existsSync(rawPath), `raw path ${rawPath} should not exist`).toBe(false);

	// At least one optimised variant (avif or webp) must be in _astro/
	expect(existsSync(ASTRO_ASSETS), `_astro dir must exist after build`).toBe(true);
	const astroFiles = readdirSync(ASTRO_ASSETS);
	const hasOptimised = astroFiles.some(
		(f) =>
			f.startsWith("cover-fixture.") &&
			(f.endsWith(".avif") || f.endsWith(".webp") || f.endsWith(".jpg")),
	);
	expect(hasOptimised).toBe(true);
});

// ---------------------------------------------------------------------------
// Case 6 — loading="lazy" on the <img> fallback inside <picture>
// ---------------------------------------------------------------------------

test("6. <img> inside <picture> has loading='lazy'", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	const img = page.locator("picture img");
	await expect(img).toHaveAttribute("loading", "lazy");
});

// ---------------------------------------------------------------------------
// Case 7 — visual-regression baseline for /works/cover-fixture/
// ---------------------------------------------------------------------------

test("7. visual regression baseline for /works/cover-fixture/", async ({ page }) => {
	await page.goto("/works/cover-fixture/");
	await expect(page).toHaveScreenshot("cover-fixture.png", {
		maxDiffPixelRatio: 0.02,
		// Mask the picture element to absorb per-build hash changes in image URLs
		mask: [page.locator("picture")],
	});
});
