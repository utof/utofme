/**
 * Figure motion rune module (AC4.5): truth table, event updates, dispose.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.5)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { motionState } from "../../src/lib/figure-motion.svelte";
import { MOTION_EVENT, MOTION_KEY, setMotionPaused } from "../../src/lib/motion";

type Listener = () => void;
function stubMedia(reduce: boolean) {
	const listeners = new Set<Listener>();
	const mq = {
		matches: reduce,
		media: "(prefers-reduced-motion: reduce)",
		addEventListener: vi.fn((_t: string, l: Listener) => listeners.add(l)),
		removeEventListener: vi.fn((_t: string, l: Listener) => listeners.delete(l)),
	};
	vi.stubGlobal("matchMedia", () => mq);
	return { mq, listeners };
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("motionState (AC4.5)", () => {
	const table: Array<[string | null, boolean, boolean]> = [
		[null, false, false],
		[null, true, true],
		["paused", false, true],
		["paused", true, true],
		["playing", false, false],
		["playing", true, false],
	];
	it.each(table)("stored %s × reduced %s → paused %s", (stored, reduce, want) => {
		stubMedia(reduce);
		if (stored) localStorage.setItem(MOTION_KEY, stored);
		const s = motionState();
		expect(s.paused).toBe(want);
		s.dispose();
	});
	it("follows the utofme:motion event", () => {
		stubMedia(false);
		const s = motionState();
		expect(s.paused).toBe(false);
		setMotionPaused(true);
		expect(s.paused).toBe(true);
		setMotionPaused(false);
		expect(s.paused).toBe(false);
		s.dispose();
	});
	it("follows the media query change when nothing is stored", () => {
		const { mq, listeners } = stubMedia(false);
		const s = motionState();
		mq.matches = true;
		for (const l of listeners) l();
		expect(s.paused).toBe(true);
		s.dispose();
	});
	it("dispose removes both listeners", () => {
		const { mq, listeners } = stubMedia(false);
		const spy = vi.spyOn(document, "removeEventListener");
		const s = motionState();
		expect(listeners.size).toBe(1);
		s.dispose();
		expect(listeners.size).toBe(0);
		expect(mq.removeEventListener).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(MOTION_EVENT, expect.any(Function));
		spy.mockRestore();
		document.dispatchEvent(new CustomEvent(MOTION_EVENT, { detail: { paused: true } }));
		expect(s.paused).toBe(false);
	});
});
