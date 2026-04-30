/**
 * @vitest-environment happy-dom
 *
 * Unit tests for CustomCursor.svelte.
 *
 * Why: covers the reduced-motion gate and rAF scheduling in isolation
 * (no browser needed). The e2e layer (atmosphere.spec.ts) covers the
 * negative case: JS not downloaded on coarse-pointer devices.
 *
 * @see packages/specs/specs/07-atmosphere.md § T1
 * @see packages/specs/plans/07-atmosphere.md § T1 TDD red cases
 */
import { type Component, flushSync, mount as svelteMount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomCursorRaw from "../../src/components/CustomCursor.svelte";

/**
 * Mounts a Svelte component imported through @astrojs/svelte.
 *
 * Why: @astrojs/svelte wraps .svelte imports with PropsWithClientDirectives,
 * making the type incompatible with Svelte's mount() signature. The runtime
 * behaviour is identical — only the static type diverges due to the integration's
 * typegen. This wrapper isolates the cast so type-coverage sees a fully-typed
 * call site rather than a bare `unknown` annotation.
 *
 * @issue utof/utofme#88
 */
function mountSvelteInTest(
	component: typeof CustomCursorRaw,
	target: HTMLElement,
): ReturnType<typeof svelteMount> {
	return svelteMount(component as Component<Record<string, never>>, { target });
}

/** Build a matchMedia stub returning the given `matches` value. */
function makeMatchMedia(matches: boolean) {
	return vi.fn().mockReturnValue({
		matches,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	});
}

describe("CustomCursor", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 0);
	});

	afterEach(() => {
		container.remove();
		vi.restoreAllMocks();
		document.body.innerHTML = "";
	});

	it("early-returns when prefers-reduced-motion matches", () => {
		vi.stubGlobal(
			"matchMedia",
			makeMatchMedia(true), // reduced-motion: reduce
		);

		mountSvelteInTest(CustomCursorRaw, container);

		expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();

		vi.unstubAllGlobals();
	});

	it("schedules rAF when motion-OK and pointer:fine", () => {
		vi.stubGlobal(
			"matchMedia",
			makeMatchMedia(false), // reduced-motion: no-preference
		);

		mountSvelteInTest(CustomCursorRaw, container);
		// flushSync flushes Svelte 5 $effect microtask queue synchronously.
		// Without it, the $effect callback hasn't run yet when we assert.
		flushSync();

		expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

		vi.unstubAllGlobals();
	});

	it("renders [data-cursor] in the DOM when motion-OK", () => {
		vi.stubGlobal(
			"matchMedia",
			makeMatchMedia(false), // motion OK
		);

		mountSvelteInTest(CustomCursorRaw, container);
		flushSync();

		expect(container.querySelector("[data-cursor]")).not.toBeNull();

		vi.unstubAllGlobals();
	});
});
