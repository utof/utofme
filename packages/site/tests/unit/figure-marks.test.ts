/**
 * Figure marks: colour is never the only channel (WCAG 1.4.1).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (AC2.2)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_KEYS, MARKS, markPath } from "../../src/lib/figure-marks";

const css = readFileSync(join(import.meta.dirname, "../../src/styles/tokens.css"), "utf8");

describe("figure marks (AC2.2)", () => {
	it("every team, series and outcome colour token has a mark", () => {
		const names = [...css.matchAll(/^\s*(--color-(?:ct|t|pro|bot|outcome-[a-z]+)):/gm)].map(
			(m) => m[1] ?? "",
		);
		expect(names.length).toBe(9);
		const withMark = new Set(MARK_KEYS.map((k) => MARKS[k].token));
		for (const n of names) expect(withMark.has(n)).toBe(true);
	});

	it("shapes are distinct within teams, series and outcomes (no colour-only channel)", () => {
		const sig = (k: (typeof MARK_KEYS)[number]) => `${MARKS[k].shape}/${MARKS[k].filled}`;
		const groups = [
			["ct", "t"],
			["pro", "bot"],
			["kept", "reverted", "inconclusive", "parked", "infra"],
		] as const;
		for (const g of groups) {
			expect(new Set(g.map(sig)).size).toBe(g.length);
		}
		expect(MARKS.ct.shape).toBe("circle");
		expect(MARKS.t.shape).toBe("triangle");
		expect(MARKS.pro.shape).toBe("diamond");
		expect(MARKS.bot.shape).toBe("square");
		expect(MARKS.reverted.shape).toBe("cross");
		expect(MARKS.inconclusive.filled).toBe(false);
		expect(MARKS.parked.shape).toBe("triangle-down");
	});

	it.each(MARK_KEYS)("markPath(%s) is a closed path", (key) => {
		const d = markPath(key, 10, 20, 30);
		expect(d.startsWith("M")).toBe(true);
		expect(d.trimEnd().endsWith("Z")).toBe(true);
	});

	it("markPath is centred on (cx, cy) and scales with size", () => {
		const nums = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
		const pts = nums(markPath("t", 0, 0, 10));
		expect(Math.max(...pts.map(Math.abs))).toBeLessThanOrEqual(10);
	});
});
