/**
 * Why: Phase 3 Task 4 — e2e tests for per-work detail pages at /works/<id>/.
 *      Nine cases covering route generation, draft exclusion, content, external
 *      links, accessibility, view-transition anchor, and body visibility.
 *      Task 8 adds cases 10–12: Expressive Code rendering, copy button, dual-theme.
 * @see packages/specs/plans/03-content-pipeline.md § Task 4
 * @see packages/specs/plans/03-content-pipeline.md § Task 8
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Production fixtures (non-draft): Phase 1 + Phase 2 + Task 8 (code-1 promoted).
// IDs are the file stems as resolved by Astro glob loader.
const PROD_IDS = [
	"code-1",
	"code-2",
	"math-2",
	"music-2",
	"video-2",
	"writing-2",
	"writing-3-no-summary",
] as const;

// Draft fixture IDs (draft: true in frontmatter).
// code-1 was promoted in Task 8; removed from DRAFT_IDS.
const DRAFT_IDS = ["math-1", "music-1", "video-1", "writing-1"] as const;

// ---------------------------------------------------------------------------
// Case 1 — every non-draft fixture has a page at /works/<id>/ (returns 200)
// ---------------------------------------------------------------------------

for (const id of PROD_IDS) {
	test(`1. /works/${id}/ returns 200`, async ({ page }) => {
		const res = await page.goto(`/works/${id}/`);
		expect(res?.status()).toBe(200);
	});
}

// ---------------------------------------------------------------------------
// Case 2 — draft fixtures do NOT generate static files in dist/
// ---------------------------------------------------------------------------

for (const id of DRAFT_IDS) {
	test(`2. draft /works/${id}/ not in dist`, () => {
		// Why: static build excludes drafts when PROD=true; verify no index.html.
		// This test is intentionally synchronous — no browser needed.
		const distPath = resolve(process.cwd(), "packages/site/dist/works", id, "index.html");
		expect(existsSync(distPath)).toBe(false);
	});
}

// ---------------------------------------------------------------------------
// Case 3 — <h1> matches the fixture's title (sampled: code-2)
// ---------------------------------------------------------------------------

test("3. <h1> matches title for code-2", async ({ page }) => {
	await page.goto("/works/code-2/");
	const h1 = page.locator("h1");
	await expect(h1).toHaveText("Hello world utility");
});

// ---------------------------------------------------------------------------
// Case 4 — <time datetime> matches the fixture's date (sampled: code-2)
// ---------------------------------------------------------------------------

test("4. <time datetime> matches date for code-2", async ({ page }) => {
	await page.goto("/works/code-2/");
	const time = page.locator("time");
	// date: 2026-03-15 → ISO string starts with "2026-03-15"
	await expect(time).toHaveAttribute("datetime", /^2026-03-15/);
});

// ---------------------------------------------------------------------------
// Case 5 — breadcrumb "← All works" links to /works/
// ---------------------------------------------------------------------------

test("5. breadcrumb ← All works links to /works/", async ({ page }) => {
	await page.goto("/works/code-2/");
	const breadcrumb = page.locator('[data-test="breadcrumb"]');
	await expect(breadcrumb).toBeVisible();
	await expect(breadcrumb).toHaveAttribute("href", "/works/");
});

// ---------------------------------------------------------------------------
// Case 6 — secondary external-URL link present iff fixture has URL field
// ---------------------------------------------------------------------------

test("6a. code-2 (has repo) shows external link", async ({ page }) => {
	await page.goto("/works/code-2/");
	const link = page.locator('[data-test="detail-external"]');
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute("href", "https://github.com/utof/hello-world");
});

test("6b. writing-2 (no external URL) has no external link", async ({ page }) => {
	await page.goto("/works/writing-2/");
	const link = page.locator('[data-test="detail-external"]');
	await expect(link).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Case 7 — Axe-core zero violations on sampled detail page
// ---------------------------------------------------------------------------

test("7. axe clean on /works/code-2/", async ({ page }) => {
	await page.goto("/works/code-2/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});

// ---------------------------------------------------------------------------
// Case 8 — transition:name="card-<id>" on exactly ONE element (the h1)
// ---------------------------------------------------------------------------

test("8. transition:name=card-code-2 on exactly one element", async ({ page }) => {
	await page.goto("/works/code-2/");
	// Astro renders transition:name as a style attribute with view-transition-name
	// OR as a data-astro-transition attribute; check all elements for the style value.
	const count = await page.evaluate(() => {
		const all = Array.from(document.querySelectorAll("*"));
		return all.filter((el) => {
			const vtn = getComputedStyle(el).getPropertyValue("view-transition-name").trim();
			return vtn === "card-code-2";
		}).length;
	});
	expect(count).toBe(1);
});

// ---------------------------------------------------------------------------
// Case 9 — body content visible for fixtures that have body paragraphs
// ---------------------------------------------------------------------------

for (const id of ["code-2", "writing-2", "music-2"] as const) {
	test(`9. /works/${id}/ has non-empty body paragraph`, async ({ page }) => {
		await page.goto(`/works/${id}/`);
		const firstPara = page.locator("article p").first();
		await expect(firstPara).not.toBeEmpty();
	});
}

// ---------------------------------------------------------------------------
// Cases 10–12 — Expressive Code rendering on /works/code-1/ (Task 8)
// code-1.mdx was promoted from draft in Task 8 and has a JS code fence.
// ---------------------------------------------------------------------------

// Case 10 — .expressive-code container is present and visible
test("10. /works/code-1/ has a visible .expressive-code block", async ({ page }) => {
	await page.goto("/works/code-1/");
	// Why: astro-expressive-code wraps every code fence in <div class="expressive-code">.
	// @see https://expressive-code.com/key-features/code-component/
	const ecBlock = page.locator(".expressive-code");
	await expect(ecBlock).toBeVisible();
});

// Case 11 — copy-to-clipboard button is present inside the EC frame
test("11. /works/code-1/ EC frame has a copy-to-clipboard button", async ({ page }) => {
	await page.goto("/works/code-1/");
	// Why: ec.config.mjs sets frames.showCopyToClipboardButton: true.
	// EC renders a <button> inside the frame header for copying.
	// @see https://expressive-code.com/key-features/code-component/
	const copyBtn = page.locator(".expressive-code button").first();
	await expect(copyBtn).toBeVisible();
});

// Case 12 — background colour differs between light and dark media preference
test("12. /works/code-1/ EC code-block background changes between light and dark", async ({
	page,
}) => {
	// Why: ec.config.mjs uses themes ["github-light","github-dark"] with
	// useDarkModeMediaQuery: true — EC emits separate CSS for each colour scheme
	// keyed on prefers-color-scheme. Emulating the media feature forces the
	// browser to load the correct theme stylesheet, so the computed background
	// of the <pre> element changes between emulations.
	// @see https://expressive-code.com/reference/configuration/ (fetched 2026-04-26)
	await page.goto("/works/code-1/");
	const preLocator = page.locator(".expressive-code pre");

	await page.emulateMedia({ colorScheme: "light" });
	const lightBg = await preLocator.evaluate((el) => getComputedStyle(el).backgroundColor);

	await page.emulateMedia({ colorScheme: "dark" });
	const darkBg = await preLocator.evaluate((el) => getComputedStyle(el).backgroundColor);

	// The two backgrounds must not be identical — the dual-theme swap is working.
	expect(lightBg).not.toBe(darkBg);
});
