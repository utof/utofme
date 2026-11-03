/**
 * Unit tests for `src/lib/motion.ts` (P9-6 "Pause motion").
 *
 * @see packages/specs/specs/09-project-view.md § P9-6 (AC6.2 truth table)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	isMotionPaused,
	MOTION_EVENT,
	MOTION_KEY,
	resolvePaused,
	setMotionPaused,
} from "../../src/lib/motion";

function stubReducedMotion(reduce: boolean): void {
	vi.stubGlobal("matchMedia", (q: string) => ({
		matches: q.includes("reduce") ? reduce : false,
		media: q,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
}

describe("resolvePaused truth table (storage × reduced motion)", () => {
	const cases: [string | null, boolean, boolean][] = [
		[null, false, false],
		[null, true, true],
		["paused", false, true],
		["paused", true, true],
		["playing", false, false],
		["playing", true, false],
		["garbage", false, false],
		["garbage", true, true],
	];
	for (const [stored, reduced, expected] of cases) {
		it(`stored=${String(stored)} reduced=${reduced} → paused=${expected}`, () => {
			expect(resolvePaused(stored, reduced)).toBe(expected);
		});
	}
});

describe("isMotionPaused / setMotionPaused", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.removeAttribute("data-motion");
		stubReducedMotion(false);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("defaults to playing without reduced motion, paused with it", () => {
		expect(isMotionPaused()).toBe(false);
		stubReducedMotion(true);
		expect(isMotionPaused()).toBe(true);
	});

	it("persists the choice, mirrors it on <html>, and dispatches the event", () => {
		const seen: boolean[] = [];
		const on = (e: Event) => {
			if (!("detail" in e)) return;
			const d = e.detail;
			seen.push(typeof d === "object" && d !== null && "paused" in d && d.paused === true);
		};
		document.addEventListener(MOTION_EVENT, on);
		setMotionPaused(true);
		expect(localStorage.getItem(MOTION_KEY)).toBe("paused");
		expect(document.documentElement.dataset["motion"]).toBe("paused");
		expect(isMotionPaused()).toBe(true);
		setMotionPaused(false);
		expect(localStorage.getItem(MOTION_KEY)).toBe("playing");
		expect(document.documentElement.dataset["motion"]).toBe("playing");
		document.removeEventListener(MOTION_EVENT, on);
		expect(seen).toEqual([true, false]);
	});

	it("a stored 'playing' overrides reduced motion", () => {
		stubReducedMotion(true);
		setMotionPaused(false);
		expect(isMotionPaused()).toBe(false);
	});

	it("survives unavailable storage", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked");
		});
		expect(isMotionPaused()).toBe(false);
		vi.restoreAllMocks();
	});
});
