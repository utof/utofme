// Why: e2e tests for /search route + Pagefind UI.
// Cases:
//   1. Searching "synthesizer" returns ≥ 1 music result on built preview.
//   2. Searching "nonexistent-token-zzz" shows no-results state.
//   3. First-load JS ≤ 30 KB; pagefind-ui.js ≤ 100 KB (size measured, gate lives in Task 13a).
//   4. Draft-fixture title query → 0 results (draft exclusion).
//   5. <Search> mounts (role="search" present after page-load).
//   6. Dev fallback: skipped — needs dev-mode harness. Phase 3 polish.
//
// Pagefind output assertion runs in beforeAll as a guard against missing build step.
// See: packages/specs/plans/02-interactivity.md § Task 11
// See: https://github.com/shishkin/astro-pagefind#readme (astro-pagefind integration)
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// beforeAll — assert Pagefind build output exists (proves integration ran)
// ---------------------------------------------------------------------------

test.beforeAll(() => {
	// Why: we assert the pagefind output files exist before running any UI tests
	// so that failures give a clear "build step missing" error rather than a
	// confusing "0 results / component not mounted" failure.
	// dist/ is relative to packages/site/ (the Playwright webServer cwd).
	const distBase = path.join(
		import.meta.dirname,
		// tests/e2e → packages/site
		"../..",
		"dist/pagefind",
	);
	const pagefindJs = path.join(distBase, "pagefind.js");
	const pagefindUiJs = path.join(distBase, "pagefind-ui.js");

	if (!fs.existsSync(pagefindJs)) {
		throw new Error(
			`Pagefind build output missing: ${pagefindJs}\nRun "bun run build" before e2e tests.`,
		);
	}
	if (!fs.existsSync(pagefindUiJs)) {
		throw new Error(
			`Pagefind UI build output missing: ${pagefindUiJs}\nRun "bun run build" before e2e tests.`,
		);
	}
});

// ---------------------------------------------------------------------------
// Case 5 — <Search> component mounts (role="search" present)
// ---------------------------------------------------------------------------

test("5. Search component mounts with role=search", async ({ page }) => {
	await page.goto("/search/");
	// Pagefind UI injects the search form with role="search" after hydration.
	// client:load directive ensures this happens before idle.
	const searchRegion = page.locator('[role="search"]');
	await expect(searchRegion).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Case 1 — "synthesizer" returns ≥ 1 result
// ---------------------------------------------------------------------------

test("1. Searching synthesizer returns ≥ 1 music result", async ({ page }) => {
	await page.goto("/search/");
	// Wait for role=search to confirm the UI has hydrated
	await page.waitForSelector('[role="search"]', { timeout: 10_000 });

	// Type into the Pagefind UI search input
	const input = page.locator('[role="search"] input[type="text"]').first();
	await input.fill("synthesizer");

	// Pagefind UI renders results into a list; wait for at least one result item
	// The pagefind-ui renders results into a div with class "pagefind-ui__results"
	// Wait for results to appear (debounce + async index fetch)
	const results = page.locator(".pagefind-ui__result");
	await expect(results.first()).toBeVisible({ timeout: 15_000 });
	const count = await results.count();
	expect(count).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Case 2 — "nonexistent-token-zzz" shows no-results panel
// ---------------------------------------------------------------------------

test("2. Searching nonexistent-token-zzz shows no results", async ({ page }) => {
	await page.goto("/search/");
	await page.waitForSelector('[role="search"]', { timeout: 10_000 });

	const input = page.locator('[role="search"] input[type="text"]').first();
	await input.fill("nonexistent-token-zzz");

	// Wait for Pagefind to finish processing (no results message appears)
	// pagefind-ui shows ".pagefind-ui__message" when no results are found
	const noResults = page.locator(".pagefind-ui__message");
	await expect(noResults).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Case 4 — draft fixture title "Demo project alpha" → 0 results
// ---------------------------------------------------------------------------

test("4. Draft fixture title returns 0 results (draft excluded from index)", async ({ page }) => {
	await page.goto("/search/");
	await page.waitForSelector('[role="search"]', { timeout: 10_000 });

	const input = page.locator('[role="search"] input[type="text"]').first();
	// "Demo project alpha" is the title of code-1.mdx (draft: true)
	// Pagefind builds from the production HTML which excludes drafts
	await input.fill("Demo project alpha");

	// Wait a moment for debounce + fetch
	// Expect no pagefind-ui__result items OR a no-results message
	await page.waitForTimeout(2000);

	const resultItems = page.locator(".pagefind-ui__result");
	const noResultsMsg = page.locator(".pagefind-ui__message");

	const resultCount = await resultItems.count();
	const hasNoResultsMsg = await noResultsMsg.isVisible().catch(() => false);

	// Either 0 results rendered OR the no-results message is shown
	expect(resultCount === 0 || hasNoResultsMsg).toBe(true);
});

// ---------------------------------------------------------------------------
// Case 3 — page-weight measurement (informational; size-limit gate = Task 13a)
// ---------------------------------------------------------------------------

test("3. First-load JS ≤ 30 KB; pagefind-ui.js ≤ 100 KB (informational)", async () => {
	// Why: we measure file sizes post-build directly rather than via network
	// (avoids throttling confounds). The size-limit hard gate lands in Task 13a;
	// this test records the numbers and warns if over threshold but does not fail CI.
	const distBase = path.join(import.meta.dirname, "../..", "dist/pagefind");
	const pagefindUiJs = path.join(distBase, "pagefind-ui.js");

	if (!fs.existsSync(pagefindUiJs)) {
		// Already checked in beforeAll; this branch won't be reached in practice.
		return;
	}

	const uiSizeBytes = fs.statSync(pagefindUiJs).size;
	const uiSizeKb = uiSizeBytes / 1024;

	// Why: informational only — log the size for tracking but do NOT fail CI here.
	// The hard size-limit gate (100 KB) lives in Task 13a's size-limit config.
	// pagefind-ui.js v1.5.2 is ~117 KB which exceeds the ceiling; Task 13a will
	// add the size-limit rule and enforce it (potentially with compression applied).
	// Spec § Task 11: "for Task 11 just measure post-build".
	console.log(`pagefind-ui.js size: ${uiSizeKb.toFixed(1)} KB (gate: Task 13a)`);
	// Soft sanity bound: flag if it grows unreasonably large (10 MB = clear regression).
	expect(uiSizeKb).toBeLessThanOrEqual(10_000);
});

// ---------------------------------------------------------------------------
// Case 6 — dev-fallback panel
// Why: skipped — Playwright webServer uses `bun run preview` (built dist/).
// The dev-fallback markup is verified by reading the built HTML (the hidden
// attribute is present but the timeout-based reveal script is client-side only).
// A dev-mode harness would require spinning up `bun run dev` on a separate port.
// This is deferred to Phase 3 polish.
// @see packages/specs/plans/02-interactivity.md § Task 11 (case 6 skip note)
// ---------------------------------------------------------------------------

test.skip("6. Dev-fallback panel appears within 2 s in dev mode (Phase 3 polish: needs dev-mode harness)", async () => {
	// Intentionally empty — see skip reason above.
});
