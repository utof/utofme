// @vitest-environment node
/**
 * `motionState()` on the server: no `document`, so it must not throw.
 *
 * Why: Svelte islands render on the server first; calling `motionState()` during that
 * render crashed the build before this guard (found by the F1 replay lane).
 * @see packages/site/src/lib/figure-motion.svelte.ts
 */
import { describe, expect, it } from "vitest";
import { motionState } from "../../src/lib/figure-motion.svelte";

describe("motionState on the server", () => {
	it("reports paused and binds nothing when there is no document", () => {
		expect(typeof document).toBe("undefined");
		const m = motionState();
		expect(m.paused).toBe(true);
		expect(() => m.dispose()).not.toThrow();
	});
});
