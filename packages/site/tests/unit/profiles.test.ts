import { describe, expect, it } from "vitest";
import { profiles } from "../../src/lib/profiles.ts";

describe("profiles registry", () => {
	it("is non-empty", () => expect(profiles.length).toBeGreaterThan(0));

	it("every URL is https", () => {
		for (const p of profiles) expect(p.url).toMatch(/^https:\/\//);
	});

	it("URLs are unique", () => {
		const urls = profiles.map((p) => p.url);
		expect(new Set(urls).size).toBe(urls.length);
	});
});
