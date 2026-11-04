import { describe, expect, it } from "vitest";
import { absoluteUrl, DEFAULT_OG_IMAGE, pageTitle } from "../../src/lib/seo";

describe("pageTitle", () => {
	it("uses the bare site name on the home page", () => {
		expect(pageTitle("utofme")).toBe("utofme");
	});
	it("appends the suffix to bare page titles", () => {
		expect(pageTitle("Garden")).toBe("Garden · utofme");
	});
	it("does not double an existing suffix", () => {
		expect(pageTitle("enth · utofme")).toBe("enth · utofme");
	});
	it("collapses an empty title to the site name", () => {
		expect(pageTitle(" ")).toBe("utofme");
	});
});

describe("absoluteUrl", () => {
	it("resolves paths against the site origin", () => {
		expect(absoluteUrl("/now/", "https://utof.me/")).toBe("https://utof.me/now/");
		expect(absoluteUrl(DEFAULT_OG_IMAGE, new URL("https://utof.me/"))).toBe(
			"https://utof.me/og-default.png",
		);
	});
	it("keeps absolute URLs", () => {
		expect(absoluteUrl("https://x.test/a.png", "https://utof.me/")).toBe("https://x.test/a.png");
	});
});
