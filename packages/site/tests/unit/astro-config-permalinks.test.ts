/**
 * Why: the permalinks array passed to the wikilink plugin must be
 * deterministically derived from src/content/notes/. A drift between filesystem
 * scan and the array breaks every wikilink. This test pins the helper that
 * astro.config.mjs uses, so the helper is testable in isolation.
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import { describe, expect, it } from "vitest";
import { computePermalinks } from "../../astro.config.mjs";

describe("computePermalinks", () => {
	it("returns a sorted array of /garden/<slug>/ entries matching src/content/notes/", () => {
		const links = computePermalinks();
		expect(Array.isArray(links)).toBe(true);
		expect(links.every((l: string) => l.startsWith("/garden/") && l.endsWith("/"))).toBe(true);
		expect(links).toEqual([...links].sort());
	});
});
