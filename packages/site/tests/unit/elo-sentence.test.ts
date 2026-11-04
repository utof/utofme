/**
 * @vitest-environment happy-dom
 *
 * `EloSentence.svelte` (F13): the percentage is one rounding of the raw win probability, the
 * number becomes a slider after mount, arrows and drag move it.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15 (AC15.4)
 */
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EloSentenceRaw from "../../src/components/article/EloSentence.svelte";

const NBSP = " ";

interface Props {
	initial: number;
}

/**
 * Mounts the island imported through @astrojs/svelte (see replay-island.test.ts for why the
 * cast is isolated here).
 *
 * @issue utof/utofme#94
 */
function mountSentence(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(EloSentenceRaw as Component<Props>, { target, props });
}

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const slider = () => q<HTMLElement>("[role='slider']");
const key = (k: string, init: KeyboardEventInit = {}) => {
	slider()?.dispatchEvent(
		new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }),
	);
	flushSync();
};
const pointer = (type: string, x: number) => {
	const e = new Event(type, { bubbles: true, cancelable: true });
	Object.assign(e, { clientX: x, pointerId: 1 });
	slider()?.dispatchEvent(e);
	flushSync();
};

describe("EloSentence", () => {
	let host: HTMLSpanElement;
	let app: ReturnType<typeof svelteMount> | null;

	beforeEach(() => {
		host = document.createElement("span");
		document.body.appendChild(host);
		app = null;
	});
	afterEach(() => {
		if (app) unmount(app);
		host.remove();
	});

	it.each([
		[96, "+96", `63${NBSP}%`],
		[0, "0", `50${NBSP}%`],
		[-96, "−96", `37${NBSP}%`],
		[100, "+100", `64${NBSP}%`],
	])("AC15.4: %i reads %s and %s", (d, num, pct) => {
		app = mountSentence(host, { initial: d });
		flushSync();
		expect(slider()?.textContent).toBe(num);
		const flat = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
		expect(flat(host.textContent)).toBe(flat(`an agent rated ${num} higher wins ${pct} of rounds`));
		expect(host.textContent).toContain(pct);
	});

	it("is a slider named 'Elo difference' with the spec's ARIA values", () => {
		app = mountSentence(host, { initial: 96 });
		flushSync();
		const s = slider();
		expect(s?.getAttribute("aria-label")).toBe("Elo difference");
		expect(s?.getAttribute("aria-valuemin")).toBe("-400");
		expect(s?.getAttribute("aria-valuemax")).toBe("400");
		expect(s?.getAttribute("aria-valuenow")).toBe("96");
		expect(s?.getAttribute("aria-valuetext")).toBe("+96 Elo");
		expect(s?.getAttribute("tabindex")).toBe("0");
	});

	it("AC15.5: ArrowRight ×4 reads +100 and 64 %; Shift moves by 10; Home and End clamp", () => {
		app = mountSentence(host, { initial: 96 });
		flushSync();
		for (let i = 0; i < 4; i++) key("ArrowRight");
		expect(slider()?.textContent).toBe("+100");
		expect(host.textContent).toContain(`64${NBSP}%`);
		key("ArrowLeft", { shiftKey: true });
		expect(slider()?.textContent).toBe("+90");
		key("End");
		expect(slider()?.getAttribute("aria-valuenow")).toBe("400");
		key("ArrowRight");
		expect(slider()?.getAttribute("aria-valuenow")).toBe("400");
		key("Home");
		expect(slider()?.getAttribute("aria-valuenow")).toBe("-400");
	});

	it("a horizontal drag moves the value, 2 px per Elo, and stops on release", () => {
		app = mountSentence(host, { initial: 0 });
		flushSync();
		pointer("pointerdown", 100);
		pointer("pointermove", 140);
		expect(slider()?.getAttribute("aria-valuenow")).toBe("20");
		pointer("pointerup", 140);
		pointer("pointermove", 300);
		expect(slider()?.getAttribute("aria-valuenow")).toBe("20");
	});
});
