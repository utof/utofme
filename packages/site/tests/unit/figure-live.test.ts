/**
 * Liveness registry (AC4.6): the count mirrors to `data-figures-live`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.6)
 */
import { describe, expect, it } from "vitest";
import { registerLive } from "../../src/lib/figure-live";

const live = () => document.documentElement.dataset["figuresLive"];

describe("registerLive (AC4.6)", () => {
	it("keeps data-figures-live equal to the live count", () => {
		const a = registerLive();
		expect(live()).toBe("1");
		const b = registerLive();
		expect(live()).toBe("2");
		a();
		expect(live()).toBe("1");
		b();
		expect(live()).toBe("0");
	});
	it("a double release is a no-op", () => {
		const a = registerLive();
		const b = registerLive();
		a();
		a();
		expect(live()).toBe("1");
		b();
		expect(live()).toBe("0");
	});
});
