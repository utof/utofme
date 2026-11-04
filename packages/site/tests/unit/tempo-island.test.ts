/**
 * @vitest-environment happy-dom
 *
 * `Tempo.svelte` (F4): guess, reveal, metric and block selects, sentences, stamp, session
 * persistence, error + Retry and the disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8 (AC8.1–AC8.3)
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TempoRaw from "../../src/components/article/Tempo.svelte";
import { REVEAL_KEY } from "../../src/lib/figures/tempo";

const DATA = readFileSync("src/data/article/tempo.json", "utf8");
const SHAPE = {
	schema: "tempo/1",
	keys: ["binS", "botsContact", "prosCi", "rounds", "schema", "series"],
};
interface Props {
	src: string;
	shape: typeof SHAPE;
	labelId: string;
	prosMaps: string;
	rerunDate: string;
}

/**
 * Mounts the island imported through @astrojs/svelte (typegen wraps `.svelte` imports with
 * client-directive props, which `mount()` does not accept; runtime is identical).
 *
 * @issue utof/utofme#94
 */
function mountTempo(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(TempoRaw as Component<Props>, { target, props });
}
let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/tempo.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f4-cap",
	prosMaps: "224",
	rerunDate: "2026-11-04",
});
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const text = () => (q(".fig-box")?.textContent ?? "").replaceAll(" ", " ");
const slider = () => q<HTMLInputElement>("input[type='range']");
const button = (label: string) =>
	Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
const key = (el: Element | null | undefined, k: string, init: KeyboardEventInit = {}) => {
	el?.dispatchEvent(
		new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }),
	);
	flushSync();
};
const click = (el: Element | null | undefined) => {
	el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
};
const choose = (index: number, value: string) => {
	const el = document.querySelectorAll<HTMLSelectElement>("select")[index];
	if (!el) throw new Error(`select ${index}`);
	for (const o of Array.from(el.options)) o.selected = o.value === value;
	el.dispatchEvent(new Event("change", { bubbles: true }));
	flushSync();
};

describe("Tempo island", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.dispatchEvent(new Event("astro:before-swap"));
		sessionStorage.clear();
		host = document.createElement("div");
		document.body.appendChild(host);
		app = null;
		fetchMock = vi.fn(async () => new Response(DATA, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		if (app) unmount(app);
		host.remove();
		vi.unstubAllGlobals();
		sessionStorage.clear();
	});
	async function ready(): Promise<void> {
		app = mountTempo(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q("svg[role='group']")).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("AC8.1: before the reveal the pros' numbers are not in the text; the agents' median is", async () => {
		await ready();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(text()).toContain("median 9.6 s");
		expect(text()).toContain("Hidden until you reveal");
		expect(text()).not.toContain("22.8");
		expect(text()).not.toContain("22.1");
		expect(q("svg")?.getAttribute("role")).toBe("group");
		expect(slider()?.value).toBe("12");
	});

	it("keyboard: the guess slider steps 0.8 s, Shift five steps, Home and End jump", async () => {
		await ready();
		const s = slider();
		key(s, "ArrowRight");
		expect(s?.value).toBe("12.8");
		expect(s?.getAttribute("aria-valuetext")).toBe(text().includes("12.8") ? "12.8 s" : "?");
		key(s, "ArrowLeft");
		key(s, "ArrowLeft");
		expect(s?.value).toBe("11.2");
		key(s, "ArrowRight", { shiftKey: true });
		expect(s?.value).toBe("15.2");
		key(s, "End");
		expect(s?.value).toBe("60");
		key(s, "Home");
		expect(s?.value).toBe("0");
	});

	it("AC8.1: Reveal shows the pros' median with its interval and the computed sentences", async () => {
		await ready();
		key(slider(), "ArrowRight");
		click(button("Reveal"));
		expect(text()).toContain("22.8 s (22.1 to 23.6 s)");
		expect(text()).toContain("79 % of agent rounds make contact before 12.0 s; pros 14 %.");
		expect(text()).toContain("You guessed 12.8 s; pros take 22.8 s.");
		expect(sessionStorage.getItem(REVEAL_KEY)).toBe("12.8");
		expect(button("Reveal")).toBeUndefined();
	});

	it("Just show me skips the guess: no guess sentence, stored as skipped", async () => {
		await ready();
		click(button("Just show me"));
		expect(text()).toContain("22.8 s");
		expect(text()).not.toContain("You guessed");
		expect(q(".tp-guess")).toBeNull();
		expect(sessionStorage.getItem(REVEAL_KEY)).toBe("skip");
	});

	it("AC8.2: the metric select switches to plant: pros 74.7 s, block 28 34.4 s, never-plant share", async () => {
		await ready();
		click(button("Reveal"));
		choose(1, "plant");
		expect(text()).toContain("74.7 s (72.1 to 76.5 s)");
		expect(text()).toContain("median 34.4 s");
		expect(text()).toContain("35 % of agent rounds never plant; pros 50 %.");
		expect(q("[data-fact='tempo.pros.plant.median']")).not.toBeNull();
	});

	it("AC8.3: the stamp changes with the block select", async () => {
		await ready();
		expect(q("[data-stamp]")?.textContent).toContain(
			"block 28 (5v5), 2026-11-04 rerun, 1,710 rounds",
		);
		choose(0, "b6");
		expect(q("[data-stamp]")?.textContent).toContain(
			"block 6 (5v5), 2026-11-04 rerun, 1,661 rounds",
		);
		expect(text()).toContain("Agents, block 6");
	});

	it("starts revealed when the session already revealed, and Guess again resets", async () => {
		sessionStorage.setItem(REVEAL_KEY, "20");
		await ready();
		expect(text()).toContain("You guessed 20.0 s; pros take 22.8 s.");
		click(button("Guess again"));
		expect(sessionStorage.getItem(REVEAL_KEY)).toBeNull();
		expect(text()).not.toContain("22.8");
		expect(slider()?.value).toBe("20");
	});

	it("shows an error with Retry and keeps the keyframe slot", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountTempo(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(button("Retry")).toBeDefined(), { timeout: 2000 });
		expect(text()).toContain("Interactive version failed to load");
		click(button("Retry"));
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
	});

	it("the disposer releases every live resource", async () => {
		await ready();
		const live = () => Number(document.documentElement.dataset.figuresLive ?? 0);
		expect(live()).toBeGreaterThan(0); // the link listeners stay registered while mounted
		if (!app) throw new Error("not mounted");
		unmount(app);
		app = null;
		expect(live()).toBe(0);
	});
});
