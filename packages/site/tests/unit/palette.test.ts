/**
 * Unit tests for the command-palette link builder and matcher.
 *
 * @see packages/specs/reviews/ui/breaker-desktop.md (B-04)
 */
import { describe, expect, it } from "vitest";
import { buildPaletteLinks, matchesLabel } from "../../src/lib/palette";

const work = (id: string, title: string, fixture = false) => ({ id, data: { title, fixture } });

describe("buildPaletteLinks", () => {
	it("maps works, notes and lab pages to titled URLs", () => {
		const links = buildPaletteLinks(
			[work("linsae", "Linsae")],
			[{ id: "welcome", data: { title: "Welcome" } }],
		);
		expect(links).toContainEqual({ id: "work:linsae", label: "Linsae", target: "/works/linsae/" });
		expect(links).toContainEqual({
			id: "note:welcome",
			label: "Garden: Welcome",
			target: "/garden/welcome/",
		});
		expect(links.some((l) => l.target === "/lab/datamosh/")).toBe(true);
	});

	it("drops fixture works", () => {
		const links = buildPaletteLinks([work("code-1", "Code 1", true), work("enth", "Enth")], []);
		expect(links.map((l) => l.id)).not.toContain("work:code-1");
		expect(links.map((l) => l.id)).toContain("work:enth");
	});

	it("ids are unique", () => {
		const links = buildPaletteLinks([work("a", "A")], [{ id: "a", data: { title: "A" } }]);
		expect(new Set(links.map((l) => l.id)).size).toBe(links.length);
	});
});

describe("matchesLabel", () => {
	it("matches substrings case-insensitively", () => {
		expect(matchesLabel("Linsae", "LINSAE")).toBe(true);
		expect(matchesLabel("Linsae", "zzz")).toBe(false);
	});
	it("matches initials and empty queries", () => {
		expect(matchesLabel("Go to home", "gth")).toBe(true);
		expect(matchesLabel("anything", "  ")).toBe(true);
	});
});
