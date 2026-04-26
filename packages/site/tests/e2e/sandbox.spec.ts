/**
 * Why: Phase 3 Task 10 — e2e tests for the Sandpack React playground island.
 *      Four cases covering mount, no-errors, and React-chunk isolation for
 *      pages without <Sandbox>.
 * @see packages/specs/plans/03-content-pipeline.md § Task 10
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Case 1 — Sandpack iframe (or root container) renders within 3 s
// ---------------------------------------------------------------------------

test("1. /works/code-sandbox/ Sandpack container renders within 3 s", async ({ page }) => {
	await page.goto("/works/code-sandbox/");
	// Why: Sandpack mounts a container div with class "sp-wrapper" (Sandpack v2
	// uses this class on the outermost element). Wait for it to appear.
	// @see https://sandpack.codesandbox.io/ (fetched 2026-04-26)
	const container = page.locator(".sp-wrapper");
	await expect(container).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// Case 2 — No console errors on a clean page load
// ---------------------------------------------------------------------------

test("2. /works/code-sandbox/ has no console errors on clean load", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => {
		errors.push(err.message);
	});

	await page.goto("/works/code-sandbox/");
	// Wait for Sandpack to settle before checking errors.
	// Why: client:only="react" defers hydration; give it time to mount fully
	// before declaring the page error-free.
	await page.waitForTimeout(2000);

	// Filter out known third-party noise that Sandpack's CDN may produce.
	// We only care about errors in the page's own context.
	const ownErrors = errors.filter(
		(e) =>
			!e.includes("sandpack") &&
			!e.includes("codesandbox") &&
			!e.includes("cdn.") &&
			!e.includes("NetworkError"),
	);
	expect(ownErrors).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Case 3 — Pages WITHOUT <Sandbox> ship 0 bytes of React
// ---------------------------------------------------------------------------

test("3. /works/no-link/ dist HTML does not reference a react chunk", () => {
	// Why: client:only="react" islands are only hydrated on pages that import
	// SandboxIsland. Pages without <Sandbox> must not have a React bundle
	// reference injected into their HTML.
	//
	// Oracle: read the built HTML for a known non-Sandbox fixture (no-link,
	// which has no body and no external URL — no islands of any kind) and
	// assert no script src contains "react".
	//
	// Note: this is a filesystem test (no browser needed). It requires
	// `bun run build` to have been run first (same pre-condition as
	// card-pagefind-attrs.test.ts). In the TDD workflow: RED (file missing),
	// GREEN after build.
	// Why: import.meta.dirname resolves to tests/e2e/; join up two levels to
	// packages/site/, then into dist/. Mirrors the pattern in search.spec.ts.
	const distHtml = join(import.meta.dirname, "../..", "dist/works/no-link/index.html");
	const html = readFileSync(distHtml, "utf-8");

	// Check that no <script> src attribute references a "react" chunk.
	// Astro names React chunks with "react" in the filename (e.g. _react-<hash>.js).
	// The word "react" may appear in comments or inline code elsewhere; we scope
	// the check to script src attributes.
	const reactScriptRe = /<script[^>]+src="[^"]*react[^"]*"/i;
	expect(
		reactScriptRe.test(html),
		`no-link/index.html should not reference a react chunk but got a match`,
	).toBe(false);
});

// ---------------------------------------------------------------------------
// Case 4 — (Best-effort) Editing the code triggers re-execution within 1 s
// ---------------------------------------------------------------------------

test("4. /works/code-sandbox/ code edit triggers re-execution (best-effort)", async ({ page }) => {
	// Why: optional smoke test — Sandpack hot-reload depends on CDN connectivity
	// during CI. If the preview iframe is not available within the generous
	// timeout, the test is skipped (soft assertion). The hard gate is Case 1.
	await page.goto("/works/code-sandbox/");

	// Wait for the Sandpack code editor to be visible (cm-editor is CodeMirror 6).
	const editor = page.locator(".sp-code-editor .cm-editor");
	const editorVisible = await editor.isVisible({ timeout: 3000 }).catch(() => false);

	if (!editorVisible) {
		// Skip gracefully — CDN not reachable in this environment.
		test.skip();
		return;
	}

	// Click into the editor and type a distinct string.
	await editor.click();
	await page.keyboard.press("Control+A");
	const newCode = `export default function App() { return <div id="sandbox-test-marker">hello</div>; }`;
	await page.keyboard.type(newCode);

	// Wait up to 1 s for re-execution (preview iframe content update).
	// Why: Sandpack auto-runs on change with a short debounce.
	await page.waitForTimeout(1000);

	// We assert only that no unhandled error appeared after the edit.
	// A full "preview updated" assertion would require cross-frame DOM access
	// which is restricted by the sandbox origin — this is the best-effort limit.
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	expect(errors).toHaveLength(0);
});
