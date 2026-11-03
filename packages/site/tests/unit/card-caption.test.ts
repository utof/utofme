/**
 * Unit tests for `captionParts` (card caption text, P9-7).
 *
 * @see packages/specs/specs/09-project-view.md § P9-7 (Structure)
 */
import { describe, expect, it } from "vitest";
import { captionParts, coverLoop } from "../../src/lib/card-caption";

const base = { title: "T", date: new Date("2025-06-01T00:00:00Z"), stack: ["a", "b", "c", "d"] };

describe("captionParts", () => {
	it("description prefers lede over summary; meta is year · first 3 stack items", () => {
		const p = captionParts({ ...base, lede: "lede", summary: "sum" });
		expect(p.description).toBe("lede");
		expect(p.meta).toBe("2025 · a · b · c");
	});
	it("falls back to summary, and omits the description when both are absent", () => {
		expect(captionParts({ ...base, summary: "sum" }).description).toBe("sum");
		expect(captionParts({ ...base }).description).toBeUndefined();
	});
	it("shows a started–date year range when started differs", () => {
		const p = captionParts({ ...base, started: new Date("2023-01-01T00:00:00Z") });
		expect(p.meta.startsWith("2023–2025")).toBe(true);
	});
	it("meta is just the year with no stack", () => {
		expect(captionParts({ title: "T", date: base.date }).meta).toBe("2025");
	});
});

describe("coverLoop", () => {
	it("reads loop slug structurally", () => {
		expect(coverLoop({ loop: "x" })).toBe("x");
		expect(coverLoop({})).toBeUndefined();
		expect(coverLoop(undefined)).toBeUndefined();
	});
});
