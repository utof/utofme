/**
 * E2E smoke tests: all three RSS feed endpoints return 200, valid XML, ≥1 item.
 * Also validates the sitemap index, sitemap-0, and robots.txt endpoints.
 *
 * Why: build-time correctness of the endpoints (item shapes, sort order) is
 * covered by unit tests; these e2e tests confirm the Astro static-build
 * actually emits all three files and they are well-formed RSS feeds, plus
 * the sitemap and robots.txt are correctly generated per spec § AC #3 #4.
 *
 * @see packages/specs/specs/06-indieweb.md § Acceptance criteria #1 #2 #3 #4
 * @see packages/specs/plans/06-indieweb.md § Task 2 RED
 * @see packages/specs/plans/06-indieweb.md § Task 3 RED
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

test("/sitemap-index.xml lists /sitemap-0.xml", async ({ request }) => {
	const r = await request.get("/sitemap-index.xml");
	expect(r.status()).toBe(200);
	expect(await r.text()).toMatch(/sitemap-0\.xml/);
});

test("/sitemap-0.xml includes published routes and excludes blocklisted ones", async ({
	request,
}) => {
	const r = await request.get("/sitemap-0.xml");
	const body = await r.text();
	expect(body).toContain("https://utof.me/");
	expect(body).toContain("/works/code-2/");
	expect(body).toContain("/garden/welcome/");
	expect(body).not.toContain("/search");
	expect(body).not.toContain("/garden/graph/");
	expect(body).not.toContain("/stats/");
	// .xml/.txt endpoints must not pollute the sitemap.
	expect(body).not.toContain("/feed.xml");
	expect(body).not.toContain("/feed/works.xml");
	expect(body).not.toContain("/feed/garden.xml");
	expect(body).not.toContain("/sitemap-index.xml");
	expect(body).not.toContain("/robots.txt");
});

test("/robots.txt allows all and references sitemap-index", async ({ request }) => {
	const r = await request.get("/robots.txt");
	expect(r.status()).toBe(200);
	const body = await r.text();
	expect(body).toContain("User-agent: *");
	expect(body).toContain("Allow: /");
	expect(body).toContain("Sitemap: https://utof.me/sitemap-index.xml");
});
