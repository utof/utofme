/**
 * @vitest-environment happy-dom
 *
 * `FreePeek.svelte` (F8): default state, stepping, keyboard, snap fire, Real CS, reset, disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12 (AC12.2)
 */
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FreePeekRaw from "../../src/components/article/FreePeek.svelte";

const NB = " ";
interface Props {
	hitNoSnap: string;
	hitSnap: string;
	tickrate?: number;
}

/**
 * Mounts the island imported through @astrojs/svelte (typegen wraps `.svelte` imports with
 * client-directive props, which `mount()` does not accept; runtime is identical).
 *
 * @issue utof/utofme#94
 */
function mountIt(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(FreePeekRaw as Component<Props>, { target, props });
}
const props = (): Props => ({ hitNoSnap: `17${NB}%`, hitSnap: `57${NB}%`, tickrate: 64 });
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const text = () => (q(".fig-box")?.textContent ?? "").replaceAll(NB, " ").replace(/\s+/g, " ");
const button = (label: string) =>
	Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
const click = (el: Element | null | undefined) => {
	el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
};
const key = (el: Element | null, k: string) => {
	el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	flushSync();
};
const misses = () => document.querySelectorAll(".fp-miss").length;
const hits = () => document.querySelectorAll(".fp-hit").length;

describe("FreePeek island", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;

	beforeEach(() => {
		host = document.createElement("div");
		document.body.appendChild(host);
		app = mountIt(host, props());
		flushSync();
	});
	afterEach(() => {
		if (app) unmount(app);
		host.remove();
	});

	it("default: after one out-and-back the miss marker sits on the vacated tile", () => {
		expect(q(".fig-box")).not.toBeNull();
		expect(misses()).toBe(1);
		expect(hits()).toBe(0);
		expect(text()).toContain(
			"Tick 2: the peeker steps back to tile 3; the shot lands on tile 4, now empty.",
		);
		expect(text()).toContain("A one-tick peek is hit 17 % of the time.");
	});

	it("AC12.2: the Try path (step out, step back, then snap fire) shows both fact values", () => {
		click(button("Reset"));
		expect(misses()).toBe(0);
		click(button("Step out"));
		click(button("Step back"));
		expect(misses()).toBe(1);
		click(button("Snap fire"));
		expect(button("Snap fire")?.getAttribute("aria-pressed")).toBe("true");
		expect(text()).toContain("Hit 57 % of the time (was 17 %).");
		expect(hits()).toBe(1);
		expect(text()).toContain("snap fire hits it on tile 4");
	});

	it("keyboard: the arrows on the focused corridor step out and back", () => {
		const board = q(".fp-board");
		key(board, "ArrowRight");
		expect(text()).toContain("Tick 3: the peeker steps out to tile 4");
		key(board, "ArrowLeft");
		expect(text()).toContain("Tick 4: the peeker steps back to tile 3");
		expect(board?.getAttribute("role")).toBe("group");
		expect(board?.getAttribute("tabindex")).toBe("0");
	});

	it("step out is disabled at the far end and step back behind the corner", () => {
		for (let i = 0; i < 6; i++) click(button("Step out"));
		expect(button("Step out")?.hasAttribute("disabled")).toBe(true);
		click(button("Reset"));
		for (let i = 0; i < 4; i++) click(button("Step back"));
		expect(button("Step back")?.hasAttribute("disabled")).toBe(true);
	});

	it("Real CS refines the timeline with the derived window", () => {
		expect(text()).toContain("Each mark is one 0.8 s tick");
		click(button("Real CS"));
		expect(text()).toContain("one check every 15.6 ms, 51 of them inside each tick");
		expect(document.querySelectorAll(".fp-fine").length).toBe(2);
	});

	it("Real CS without a cited tick rate states no number", () => {
		if (app) unmount(app);
		host.replaceChildren();
		app = mountIt(host, { hitNoSnap: `17${NB}%`, hitSnap: `57${NB}%` });
		flushSync();
		click(button("Real CS"));
		expect(text()).toContain("Real Counter-Strike checks many times per tick");
		expect(text()).not.toMatch(/\d+ ms/);
	});

	it("the disposer releases every live resource", () => {
		const live = () => Number(document.documentElement.dataset.figuresLive ?? 0);
		expect(live()).toBeGreaterThan(0);
		if (!app) throw new Error("not mounted");
		unmount(app);
		app = null;
		expect(live()).toBe(0);
	});
});
