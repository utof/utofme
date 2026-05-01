/**
 * Unit tests for sitemapFilter.
 *
 * Why: extracted filter must exactly replicate the inline predicate it replaced.
 * Key regression: includes("/search") was over-broad — /works/search-engine-design
 * would have been silently excluded. Regex /\/search\/?$/ is the fix.
 *
 * @see packages/site/src/lib/sitemap-filter.ts
 * @see https://github.com/utof/utofme/issues/58
 */
import { describe, expect, it } from "vitest";
import { sitemapFilter } from "../../src/lib/sitemap-filter.ts";

const BASE = "https://utof.me";

describe("sitemapFilter — excluded routes", () => {
	it("excludes /search exactly", () => {
		expect(sitemapFilter(`${BASE}/search`)).toBe(false);
	});

	it("excludes /search/ with trailing slash", () => {
		expect(sitemapFilter(`${BASE}/search/`)).toBe(false);
	});

	it("excludes /garden/graph/", () => {
		expect(sitemapFilter(`${BASE}/garden/graph/`)).toBe(false);
	});

	it("excludes /stats/", () => {
		expect(sitemapFilter(`${BASE}/stats/`)).toBe(false);
	});

	it("excludes .xml endpoints (sitemap, feed)", () => {
		expect(sitemapFilter(`${BASE}/sitemap-index.xml`)).toBe(false);
		expect(sitemapFilter(`${BASE}/feed.xml`)).toBe(false);
	});

	it("excludes .txt endpoints (robots)", () => {
		expect(sitemapFilter(`${BASE}/robots.txt`)).toBe(false);
	});
});

describe("sitemapFilter — allowed routes", () => {
	it("does not exclude /works/search-engine-design", () => {
		expect(sitemapFilter(`${BASE}/works/search-engine-design/`)).toBe(true);
	});

	it("does not exclude / (home)", () => {
		expect(sitemapFilter(`${BASE}/`)).toBe(true);
	});

	it("does not exclude /works/", () => {
		expect(sitemapFilter(`${BASE}/works/`)).toBe(true);
	});

	it("does not exclude /garden/some-note/", () => {
		expect(sitemapFilter(`${BASE}/garden/some-note/`)).toBe(true);
	});

	it("does not exclude /garden/welcome/", () => {
		expect(sitemapFilter(`${BASE}/garden/welcome/`)).toBe(true);
	});

	it("does not exclude a route with 'search' mid-path segment", () => {
		// Future-proofing: /research/, /searches/, /search-archive/ must not be excluded.
		expect(sitemapFilter(`${BASE}/research/`)).toBe(true);
		expect(sitemapFilter(`${BASE}/works/search-archive/`)).toBe(true);
	});
});
