/**
 * @vitest-environment happy-dom
 *
 * `Replay.svelte` (F1): load, keyboard, markers, See as, autoplay, error + Retry, disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (AC5.2, AC5.3, AC5.4)
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReplayRaw from "../../src/components/article/Replay.svelte";
import { formatSeconds } from "../../src/lib/figure-scale";

const NBSP = " ";
const DATA = readFileSync("src/data/article/replay_mirage.json", "utf8");
const SHAPE = {
	schema: "replay_mirage/1",
	keys: [
		"bomb",
		"endReason",
		"events",
		"fire",
		"firstContactTick",
		"map",
		"nTicks",
		"players",
		"schema",
		"sees",
		"smoke",
		"tickS",
		"winner",
	],
};

interface Props {
	src: string;
	shape: typeof SHAPE;
	labelId: string;
	pros: { s: number; text: string };
}

/**
 * Mounts the island imported through @astrojs/svelte.
 *
 * Why: the integration's typegen wraps `.svelte` imports with client-directive props, which is
 * incompatible with Svelte's `mount()` signature; the runtime is identical. The cast is isolated
 * here (same pattern as `click-counter.test.ts`).
 *
 * @issue utof/utofme#94
 */
function mountReplay(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(ReplayRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/replay_mirage.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f1-cap",
	pros: { s: 22.8, text: `22.8${NBSP}s` },
});

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const slider = () => q<HTMLInputElement>("input[type='range']");
const playButton = () => q<HTMLButtonElement>("button.rp-play");
const key = (el: Element | null, k: string, init: KeyboardEventInit = {}) => {
	el?.dispatchEvent(
		new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }),
	);
	flushSync();
};

/** A stand-in observer that records its callback so a test can drive visibility. */
class StubObserver implements IntersectionObserver {
	readonly root = null;
	readonly rootMargin = "";
	readonly scrollMargin = "";
	readonly thresholds: readonly number[] = [];
	disconnected = false;
	constructor(readonly cb: IntersectionObserverCallback) {}
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {
		this.disconnected = true;
	}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

let io: StubObserver | null = null;
function enterView(ratio: number): void {
	if (!io) return;
	const rect = document.body.getBoundingClientRect();
	io.cb(
		[
			{
				boundingClientRect: rect,
				intersectionRatio: ratio,
				intersectionRect: rect,
				isIntersecting: ratio > 0,
				rootBounds: null,
				target: document.body,
				time: 0,
			},
		],
		io,
	);
	flushSync();
}

describe("Replay island", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.dispatchEvent(new Event("astro:before-swap"));
		localStorage.clear();
		host = document.createElement("div");
		document.body.appendChild(host);
		app = null;
		io = null;
		fetchMock = vi.fn(async () => new Response(DATA, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal(
			"IntersectionObserver",
			class extends StubObserver {
				constructor(cb: IntersectionObserverCallback) {
					super(cb);
					io = this;
				}
			},
		);
		vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
	});

	afterEach(() => {
		if (app) unmount(app);
		host.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	async function ready(): Promise<void> {
		app = mountReplay(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("shows the island root, requests the data once and swaps in the controls", async () => {
		app = mountReplay(host, freshProps());
		flushSync();
		expect(q(".fig-box")).not.toBeNull();
		expect(slider()).toBeNull();
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const canvas = q("canvas");
		expect(canvas?.getAttribute("role")).toBe("img");
		expect(canvas?.closest("button, input, select")).toBeNull(); // controls sit outside it
	});

	it("starts at first contact: slider, time label and status line", async () => {
		await ready();
		expect(slider()?.min).toBe("0");
		expect(slider()?.max).toBe("72");
		expect(slider()?.value).toBe("9");
		expect(slider()?.getAttribute("aria-label")).toBe("Time");
		expect(slider()?.getAttribute("aria-valuetext")).toBe(formatSeconds(9 * 0.8));
		expect(slider()?.title).toMatch(/9/);
		expect(q(".rp-clock")?.textContent).toBe(formatSeconds(9 * 0.8));
		expect(q(".rp-status")?.textContent).toContain(`7.2${NBSP}s · 5 attackers, 5 defenders alive`);
		expect(playButton()?.textContent).toMatch(/Play/);
	});

	it("keyboard: arrows move one tick, Shift five, Home and End jump (AC5.2)", async () => {
		await ready();
		const s = slider();
		key(s, "ArrowRight");
		expect(s?.value).toBe("10");
		key(s, "ArrowLeft");
		key(s, "ArrowLeft");
		expect(s?.value).toBe("8");
		key(s, "ArrowRight", { shiftKey: true });
		expect(s?.value).toBe("13");
		key(s, "End");
		expect(s?.value).toBe("72");
		key(s, "Home");
		expect(s?.value).toBe("0");
	});

	it("keyboard: Space toggles play and pause; [ and ] step through the events", async () => {
		await ready();
		key(slider(), " ");
		expect(playButton()?.textContent).toMatch(/Pause/);
		key(slider(), " ");
		expect(playButton()?.textContent).toMatch(/Play/);
		playButton()?.click(); // a button keeps its own Space/Enter activation
		flushSync();
		expect(playButton()?.textContent).toMatch(/Pause/);
		playButton()?.click();
		flushSync();
		key(slider(), "]");
		expect(slider()?.value).toBe("24"); // first kill after first contact (9)
		key(slider(), "[");
		expect(slider()?.value).toBe("9");
	});

	it("the First contact marker sets the time label to the dataset's value (AC5.2)", async () => {
		await ready();
		key(slider(), "End");
		const marker = [...document.querySelectorAll<HTMLButtonElement>("button.rp-marker")].find((b) =>
			/First contact/.test(b.getAttribute("aria-label") ?? ""),
		);
		expect(marker).toBeDefined();
		marker?.click();
		flushSync();
		expect(slider()?.value).toBe("9");
		expect(q(".rp-clock")?.textContent).toBe(formatSeconds(9 * 0.8));
		expect(marker?.getAttribute("aria-label")).toContain(formatSeconds(9 * 0.8));
	});

	it("has one marker button per event tick (two kills share tick 24) and the pros' dashed marker", async () => {
		await ready();
		const buttons = [...document.querySelectorAll("button.rp-marker")];
		expect(buttons).toHaveLength(12);
		expect(
			buttons.filter((b) =>
				/Attacker 1 .*; |; .*Attacker 5/.test(b.getAttribute("aria-label") ?? ""),
			).length,
		).toBe(1);
		expect(q(".rp-pros-label")?.textContent).toBe(`Pros' median first contact, about 22.8${NBSP}s`);
		expect(q(".rp-pros")?.getAttribute("style")).toMatch(/left:\s*39\.\d+%/);
	});

	it("See as: the radio group changes the view and says what the fog hides", async () => {
		await ready();
		const radios = [...document.querySelectorAll<HTMLInputElement>("input[name='rp-view']")];
		expect(radios.map((r) => r.value)).toEqual(["all", "T", "CT"]);
		expect(radios[0]?.checked).toBe(true);
		const defenders = radios[2];
		defenders?.click();
		flushSync();
		expect(defenders?.checked).toBe(true);
		expect(q(".rp-status")?.textContent).toMatch(/Defenders see \d of \d attackers/);
		radios[0]?.click();
		flushSync();
		expect(q(".rp-status")?.textContent).not.toMatch(/Defenders see/);
	});

	it("speed select offers 0.5×, 1× and 2×", async () => {
		await ready();
		const opts = [...document.querySelectorAll<HTMLOptionElement>("select.rp-speed option")];
		expect(opts.map((o) => o.value)).toEqual(["0.5", "1", "2"]);
		expect(q<HTMLSelectElement>("select.rp-speed")?.value).toBe("1");
	});

	it("the events list follows the scrub position", async () => {
		await ready();
		const items = () => [...document.querySelectorAll("ol.rp-events > li")];
		expect(items()).toHaveLength(13);
		const current = () => items().find((i) => i.getAttribute("aria-current") === "step");
		expect(current()?.textContent).toMatch(/First contact/);
		key(slider(), "End");
		expect(current()?.textContent).toMatch(/Round ends/);
	});

	it("announces the status line on scrub end, not on every tick of playback", async () => {
		await ready();
		const live = q(".rp-live");
		expect(live?.getAttribute("aria-live")).toBe("polite");
		key(slider(), "ArrowRight");
		expect(live?.textContent).toContain(`8.0${NBSP}s`);
		const before = live?.textContent;
		key(slider(), " ");
		await vi.advanceTimersByTimeAsync(400);
		flushSync();
		expect(live?.textContent).toBe(before);
	});

	describe("autoplay (AC5.3, AC5.4)", () => {
		it("does not start below half in view; starts once at half and stops at the end", async () => {
			await ready();
			enterView(0.4);
			expect(playButton()?.textContent).toMatch(/Play/);
			enterView(0.6);
			expect(playButton()?.textContent).toMatch(/Pause/);
			expect(slider()?.value).toBe("0");
			await vi.advanceTimersByTimeAsync(3300);
			flushSync();
			expect(Number(slider()?.value)).toBeGreaterThanOrEqual(3);
			expect(Number(slider()?.value)).toBeLessThanOrEqual(5);
		});

		it("any interaction cancels it for good", async () => {
			await ready();
			enterView(1);
			expect(playButton()?.textContent).toMatch(/Pause/);
			key(slider(), "ArrowRight");
			expect(playButton()?.textContent).toMatch(/Play/);
			enterView(0.2);
			enterView(1);
			expect(playButton()?.textContent).toMatch(/Play/);
		});

		it("never starts under paused motion; the board stays at first contact", async () => {
			localStorage.setItem("utofme:motion", "paused");
			await ready();
			enterView(1);
			expect(playButton()?.textContent).toMatch(/Play/);
			expect(slider()?.value).toBe("9");
			await vi.advanceTimersByTimeAsync(2000);
			expect(slider()?.value).toBe("9");
		});

		it("Pause motion during playback stops it at once", async () => {
			await ready();
			enterView(1);
			expect(playButton()?.textContent).toMatch(/Pause/);
			localStorage.setItem("utofme:motion", "paused");
			document.dispatchEvent(new CustomEvent("utofme:motion", { detail: { paused: true } }));
			flushSync();
			expect(playButton()?.textContent).toMatch(/Play/);
		});
	});

	describe("errors and cleanup", () => {
		it("a failed load keeps the keyframe, says so and offers Retry", async () => {
			fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
			app = mountReplay(host, freshProps());
			flushSync();
			await vi.waitFor(() => expect(q(".rp-fail")).not.toBeNull(), { timeout: 2000 });
			expect(q(".rp-fail")?.textContent).toContain("Interactive version failed to load");
			expect(slider()).toBeNull();
			q<HTMLButtonElement>(".rp-fail button")?.click();
			await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
			expect(q(".rp-fail")).toBeNull();
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it("a data file with the wrong schema is a shape error, not a crash", async () => {
			fetchMock.mockImplementationOnce(
				async () => new Response('{"schema":"other/1"}', { status: 200 }),
			);
			app = mountReplay(host, freshProps());
			flushSync();
			await vi.waitFor(() => expect(q(".rp-fail")).not.toBeNull(), { timeout: 2000 });
		});

		it("the disposer releases every registered live resource", async () => {
			await ready();
			enterView(1);
			expect(Number(document.documentElement.dataset["figuresLive"])).toBeGreaterThan(0);
			if (app) unmount(app);
			app = null;
			flushSync();
			expect(document.documentElement.dataset["figuresLive"]).toBe("0");
			expect(io?.disconnected).toBe(true);
		});
	});
});
