/**
 * @vitest-environment happy-dom
 *
 * Unit tests for ClickCounter.svelte.
 *
 * Why: covers localStorage init, increment + persist, badge visibility timing,
 * and synchronous-init pattern (no $effect needed for initial count) in
 * isolation without a browser.
 *
 * @see packages/specs/specs/07-atmosphere.md § T4
 * @see packages/specs/plans/07-atmosphere.md § T4 TDD red cases
 */
import { type Component, flushSync, mount as svelteMount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClickCounterRaw from "../../src/components/ClickCounter.svelte";

/**
 * Mounts a Svelte component imported through @astrojs/svelte.
 *
 * Why: @astrojs/svelte wraps .svelte imports with PropsWithClientDirectives,
 * making the type incompatible with Svelte's mount() signature. The runtime
 * behaviour is identical — only the static type diverges due to the integration's
 * typegen. This wrapper isolates the cast so type-coverage sees a fully-typed
 * call site rather than a bare `unknown` annotation.
 *
 * @issue utof/utofme#94
 */
function mountSvelteInTest(
	component: typeof ClickCounterRaw,
	target: HTMLElement,
): ReturnType<typeof svelteMount> {
	return svelteMount(component as Component<Record<string, never>>, { target });
}

const STORAGE_KEY = "utofme:slash-clicks";

describe("ClickCounter", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		localStorage.clear();
	});

	afterEach(() => {
		container.remove();
		vi.restoreAllMocks();
		vi.useRealTimers();
		document.body.innerHTML = "";
		localStorage.clear();
	});

	it("starts at 0 when localStorage clear", () => {
		mountSvelteInTest(ClickCounterRaw, container);
		flushSync();

		const span = container.querySelector("span");
		expect(span?.textContent?.trim()).toBe("0");
	});

	it("increments and persists on click", () => {
		mountSvelteInTest(ClickCounterRaw, container);
		flushSync();

		const btn = container.querySelector("button");
		expect(btn).not.toBeNull();

		btn?.click();
		flushSync();
		btn?.click();
		flushSync();
		btn?.click();
		flushSync();

		const span = container.querySelector("span");
		expect(span?.textContent?.trim()).toBe("3");
		expect(localStorage.getItem(STORAGE_KEY)).toBe("3");
	});

	it("hides badge 1.2s after last click", () => {
		vi.useFakeTimers();

		mountSvelteInTest(ClickCounterRaw, container);
		flushSync();

		const btn = container.querySelector("button");
		btn?.click();
		flushSync();

		// After click the badge should be visible (has 'visible' class)
		const span = container.querySelector("span");
		expect(span?.classList.contains("visible")).toBe(true);

		// Advance to 1199 ms — still visible
		vi.advanceTimersByTime(1199);
		flushSync();
		expect(span?.classList.contains("visible")).toBe(true);

		// Advance 2 more ms (total 1201 ms) — should be hidden
		vi.advanceTimersByTime(2);
		flushSync();
		expect(span?.classList.contains("visible")).toBe(false);
	});

	it("loads existing count from localStorage", () => {
		// Set storage BEFORE render — covers synchronous-init pattern
		localStorage.setItem(STORAGE_KEY, "5");

		mountSvelteInTest(ClickCounterRaw, container);
		flushSync();

		const span = container.querySelector("span");
		expect(span?.textContent?.trim()).toBe("5");
	});
});
