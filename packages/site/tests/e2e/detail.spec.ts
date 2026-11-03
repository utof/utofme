/**
 * Why: Phase 3 Task 4 — e2e tests for per-work detail pages at /works/<id>/.
 *      Nine cases covering route generation, draft exclusion, content, external
 *      links, accessibility, view-transition anchor, and body visibility.
 *      Task 8 adds cases 10–12: Expressive Code rendering, copy button, light-only theme.
 *      Task 9 adds cases 13–15: Svelte 5 Counter island embedded in MDX, state isolation.
 *      Task 10 adds code-sandbox to PROD_IDS (Sandpack fixture).
 * @see packages/specs/plans/03-content-pipeline.md § Task 4
 * @see packages/specs/plans/03-content-pipeline.md § Task 8
 * @see packages/specs/plans/03-content-pipeline.md § Task 9
 * @see packages/specs/plans/03-content-pipeline.md § Task 10
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Production fixtures (non-draft): Phase 1 + Phase 2 + Task 8 (code-1 promoted)
// + Task 9 (writing-mdx-island) + Task 10 (code-sandbox).
// IDs are the file stems as resolved by Astro glob loader.
const PROD_IDS = [
	"code-1",
	"code-2",
	"math-2",
	"music-2",
	"video-2",
	"writing-2",
	"writing-3-no-summary",
	"writing-mdx-island",
	"code-sandbox",
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

// Case 12 — light-only: the code-block background is the same under light and dark media preference
test("12. /works/code-1/ EC code-block stays light under a dark colour-scheme preference", async ({
	page,
}) => {
	// Why: the site is light-only (ADR 0040). ec.config.mjs still lists
	// ["github-light","github-dark"] but sets `useDarkModeMediaQuery: false`, so EC
	// no longer emits the `@media (prefers-color-scheme: dark)` block and the dark
	// theme only applies under `[data-theme='github-dark']`, which nothing sets.
	// Emulating each colour scheme must therefore leave the computed background of
	// the <pre> unchanged, and it must be a light colour. (Previously this case
	// asserted the two backgrounds DIFFER — the dual-theme swap.)
	// @see https://expressive-code.com/reference/configuration/ (fetched 2026-04-26)
	// @see packages/specs/adrs/0040-light-only-masonry-home.md
	await page.goto("/works/code-1/");
	const preLocator = page.locator(".expressive-code pre");

	await page.emulateMedia({ colorScheme: "light" });
	const lightBg = await preLocator.evaluate((el) => getComputedStyle(el).backgroundColor);

	await page.emulateMedia({ colorScheme: "dark" });
	const darkBg = await preLocator.evaluate((el) => getComputedStyle(el).backgroundColor);

	expect(darkBg).toBe(lightBg);

	// And the shared background really is the light theme's, not a dark one that merely
	// stopped changing: every RGB channel is bright.
	const channels = (lightBg.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
	expect(channels).toHaveLength(3);
	for (const channel of channels) {
		expect(channel).toBeGreaterThan(200);
	}
});

// ---------------------------------------------------------------------------
// Cases 13–15 — Svelte 5 Counter island in MDX on /works/writing-mdx-island/
// (Task 9) Two Counter instances demonstrate per-island state isolation.
// ---------------------------------------------------------------------------

// Case 13 — two distinct counter instances render with different data-counter-id values
test("13. /works/writing-mdx-island/ has two counter instances with distinct ids", async ({
	page,
}) => {
	await page.goto("/works/writing-mdx-island/");
	// Why: Counter.svelte renders with client:visible; wait for hydration.
	const counters = page.locator("button[data-counter-id]");
	await expect(counters).toHaveCount(2);

	const id0 = await counters.nth(0).getAttribute("data-counter-id");
	const id1 = await counters.nth(1).getAttribute("data-counter-id");
	// Each island must produce a distinct id — $props.id() guarantees this.
	expect(id0).toBeTruthy();
	expect(id1).toBeTruthy();
	expect(id0).not.toBe(id1);
});

/**
 * Navigate to the MDX island page and return the two Counter buttons once BOTH
 * islands have hydrated.
 *
 * Why: the SSR markup already contains the buttons, so `toHaveCount(2)` passes
 * before `client:visible` hydration; a click in that window is silently lost
 * ("count: 2" after three clicks) whenever the machine is slow. Astro removes the
 * `ssr` attribute from `<astro-island>` when it hydrates (runtime/server/astro-island.js),
 * and `client:visible` only hydrates once the island is scrolled into view, so each
 * button is scrolled into view first.
 *
 * @see https://docs.astro.build/en/reference/directives-reference/#clientvisible
 */
async function hydratedCounters(page: import("@playwright/test").Page) {
	await page.goto("/works/writing-mdx-island/");
	const counters = page.locator("button[data-counter-id]");
	await expect(counters).toHaveCount(2);
	await counters.nth(0).scrollIntoViewIfNeeded();
	await counters.nth(1).scrollIntoViewIfNeeded();
	await expect(page.locator("astro-island:not([ssr]):has(button[data-counter-id])")).toHaveCount(2);
	return counters;
}

// Case 14 — click counter A 3× → A shows 3, B shows 0 (no state sharing)
test("14. clicking counter A 3× shows A=3, B=0", async ({ page }) => {
	const counters = await hydratedCounters(page);

	const counterA = counters.nth(0);
	// Click counter A three times.
	await counterA.click();
	await counterA.click();
	await counterA.click();

	// Counter A text should contain "3", counter B text should contain "0".
	const textA = await counterA.textContent();
	const textB = await counters.nth(1).textContent();
	expect(textA).toMatch(/:\s*3\b/);
	expect(textB).toMatch(/:\s*0\b/);
});

// Case 15 — click counter B 2× → B shows 2, A remains at 3 (no state leak)
test("15. clicking counter B 2× shows B=2, A still 3 (no state leak)", async ({ page }) => {
	// Why: state test must start from a fresh navigation so A is back at 0,
	// then we replicate the A=3 state before asserting B isolation.
	const counters = await hydratedCounters(page);

	const counterA = counters.nth(0);
	const counterB = counters.nth(1);

	// Bring A to 3.
	await counterA.click();
	await counterA.click();
	await counterA.click();

	// Now click B twice.
	await counterB.click();
	await counterB.click();

	// B must show 2, A must still show 3.
	const textA = await counterA.textContent();
	const textB = await counterB.textContent();
	expect(textA).toMatch(/:\s*3\b/);
	expect(textB).toMatch(/:\s*2\b/);
});
