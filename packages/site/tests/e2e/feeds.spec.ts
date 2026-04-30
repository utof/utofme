/**
 * E2E smoke tests: all three RSS feed endpoints return 200, valid XML, ≥1 item.
 *
 * Why: build-time correctness of the endpoints (item shapes, sort order) is
 * covered by unit tests; these e2e tests confirm the Astro static-build
 * actually emits all three files and they are well-formed RSS feeds.
 *
 * @see packages/specs/specs/06-indieweb.md § Acceptance criteria #1 #2
 * @see packages/specs/plans/06-indieweb.md § Task 2 RED
 */
import { expect, test } from "@playwright/test";

const FEEDS = ["/feed.xml", "/feed/works.xml", "/feed/garden.xml"];

for (const path of FEEDS) {
	test(`${path} returns 200 and parseable XML`, async ({ request, page }) => {
		const r = await request.get(path);
		expect(r.status()).toBe(200);
		const ct = r.headers()["content-type"] ?? "";
		expect(ct).toMatch(/xml/i);
		const body = await r.text();
		// Verify parseable by browser DOMParser (no parsererror element).
		const ok = await page.evaluate((b) => {
			const doc = new DOMParser().parseFromString(b, "text/xml");
			return !doc.querySelector("parsererror");
		}, body);
		expect(ok).toBe(true);
		// Has at least one <item> — zero-item feeds are spec-invalid at this phase
		// because all three collections have committed fixtures.
		expect(body).toMatch(/<item>/);
	});
}
