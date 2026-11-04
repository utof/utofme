/**
 * @vitest-environment happy-dom
 *
 * `MapStages.svelte` (F5): load, default stage and map, slider and strip, map selector, motion,
 * error + Retry, disposer (AC9.1 logic side, AC16.5).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapStagesRaw from "../../src/components/article/MapStages.svelte";
import { dataset } from "../../src/lib/article-data/map_stages";
import {
	DEFAULT_MAP,
	mapTitle,
	STAGES,
	stageSummary,
	wallness,
} from "../../src/lib/figures/map-stages";

const DATA = readFileSync("src/data/article/map_stages.json", "utf8");
const data = dataset.projected.parse(JSON.parse(DATA));
const SHAPE = { schema: "map_stages/1", keys: ["maps", "schema"] };
const find = (name: string) => {
	const m = data.maps.find((x) => x.name === name);
	if (!m) throw new Error(`no ${name}`);
	return m;
};

interface Props {
	src: string;
	shape: typeof SHAPE;
	labelId: string;
}

/**
 * Mounts the island imported through @astrojs/svelte.
 *
 * Why: the integration's typegen wraps `.svelte` imports with client-directive props, which is
 * incompatible with Svelte's `mount()` signature; the runtime is identical (same cast as
 * `click-counter.test.ts`).
 *
 * @issue utof/utofme#94
 */
function mountIsland(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(MapStagesRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/map_stages.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f5-cap",
});

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const all = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const slider = () => q<HTMLInputElement>("input[type='range']");
const select = () => q<HTMLSelectElement>("select");
const readout = () => (q(".ms-readout")?.textContent ?? "").replace(/\s+/g, " ").trim();
const live = () => (q(".ms-live")?.textContent ?? "").replace(/\s+/g, " ").trim();
const key = (el: Element | null, k: string) => {
	el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	flushSync();
};
/** What a range input does on a key press: move the value, fire input and change. */
function step(el: HTMLInputElement | null, to: number): void {
	if (!el) return;
	el.value = String(to);
	el.dispatchEvent(new Event("input", { bubbles: true }));
	el.dispatchEvent(new Event("change", { bubbles: true }));
	flushSync();
}

describe("MapStages island", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.dispatchEvent(new Event("astro:before-swap"));
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
	});

	async function ready(): Promise<void> {
		app = mountIsland(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("shows the island root, requests the data once and swaps in the controls", async () => {
		app = mountIsland(host, freshProps());
		flushSync();
		expect(q(".fig-box")).not.toBeNull();
		expect(slider()).toBeNull();
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("default: the final stage of Mirage, slider at 3, its counted summary", async () => {
		await ready();
		const mirage = find(DEFAULT_MAP);
		expect(slider()?.min).toBe("0");
		expect(slider()?.max).toBe("3");
		expect(slider()?.value).toBe("3");
		expect(slider()?.getAttribute("aria-label")).toBe("Stage");
		expect(slider()?.getAttribute("aria-valuetext")).toBe(stageSummary(mirage, 3));
		expect(readout()).toBe(stageSummary(mirage, 3));
		expect(select()?.value).toBe(DEFAULT_MAP);
		expect(select()?.getAttribute("aria-label") ?? q("label")?.textContent).toBeTruthy();
	});

	it("the map selector lists the five maps by display name", async () => {
		await ready();
		const options = all<HTMLOptionElement>("select option");
		expect(options.map((o) => o.value)).toEqual(data.maps.map((m) => m.name));
		expect(options.map((o) => o.textContent?.trim())).toEqual(
			data.maps.map((m) => mapTitle(m.name)),
		);
	});

	it("the strip has four stop buttons, each with its counted value; the current one is marked", async () => {
		await ready();
		const mirage = find(DEFAULT_MAP);
		const buttons = all<HTMLButtonElement>("button.ms-stop");
		expect(buttons).toHaveLength(4);
		buttons.forEach((b, i) => {
			expect(b.textContent).toContain(STAGES[i]?.title);
			expect(b.getAttribute("aria-label") ?? b.textContent).toContain(
				String(stageSummary(mirage, i).match(/\d+/)?.[0]),
			);
			expect(b.getAttribute("aria-current") === "true").toBe(i === 3);
		});
	});

	it("each stop shows its counted value as the slider moves (AC9.1)", async () => {
		await ready();
		const mirage = find(DEFAULT_MAP);
		for (const i of [0, 1, 2, 3]) {
			step(slider(), i);
			expect(readout(), `stop ${i}`).toBe(stageSummary(mirage, i));
			expect(slider()?.getAttribute("aria-valuetext")).toBe(stageSummary(mirage, i));
			expect(live()).toContain(stageSummary(mirage, i));
		}
	});

	it("clicking a strip stop moves the slider and the readout", async () => {
		await ready();
		const mirage = find(DEFAULT_MAP);
		all<HTMLButtonElement>("button.ms-stop")[0]?.click();
		flushSync();
		expect(slider()?.value).toBe("0");
		expect(readout()).toBe(stageSummary(mirage, 0));
		expect(all<HTMLButtonElement>("button.ms-stop")[0]?.getAttribute("aria-current")).toBe("true");
	});

	it("choosing another map recounts at the current stop", async () => {
		await ready();
		const sel = select();
		if (!sel) throw new Error("no select");
		sel.value = "de_inferno";
		sel.dispatchEvent(new Event("change", { bubbles: true }));
		flushSync();
		expect(readout()).toBe(stageSummary(find("de_inferno"), 3));
		expect(live()).toContain("Inferno");
	});

	it("draws one square per cell at the stop's wall opacity", async () => {
		await ready();
		const w = wallness(find(DEFAULT_MAP), 3);
		const cells = all<SVGRectElement>("svg.ms-board rect.ms-cell");
		expect(cells).toHaveLength(28 * 28);
		for (const i of [0, 29, 28 * 14 + 14, 28 * 27 + 27]) {
			expect(Number(cells[i]?.getAttribute("opacity"))).toBeCloseTo(w[i] ?? 0, 6);
		}
		step(slider(), 0);
		const f = wallness(find(DEFAULT_MAP), 0);
		for (const i of [0, 29, 28 * 14 + 14]) {
			expect(
				Number(all<SVGRectElement>("svg.ms-board rect.ms-cell")[i]?.getAttribute("opacity")),
			).toBeCloseTo(f[i] ?? 0, 6);
		}
	});

	it("the board is a labelled image of the current stop", async () => {
		await ready();
		const board = q("svg.ms-board");
		expect(board?.getAttribute("role")).toBe("img");
		expect(board?.getAttribute("aria-label")).toContain(stageSummary(find(DEFAULT_MAP), 3));
		expect(board?.getAttribute("aria-label")).toContain("Mirage");
	});

	it("keys on the slider keep native behaviour (no handler swallows arrows)", async () => {
		await ready();
		const ev = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
		slider()?.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(false);
		key(slider(), "Home");
	});

	it("a failed load keeps the keyframe, shows the note and Retry, and Retry loads", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountIsland(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q(".ms-fail")).not.toBeNull(), { timeout: 2000 });
		expect(q(".ms-fail")?.textContent).toContain("Interactive version failed to load");
		expect(slider()).toBeNull();
		[...document.querySelectorAll("button")]
			.find((b) => /Retry/.test(b.textContent ?? ""))
			?.click();
		flushSync();
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
		expect(q(".ms-fail")).toBeNull();
	});

	it("the fetch is a live resource while in flight and everything is released on unmount (AC16.5)", async () => {
		const count = () => document.documentElement.dataset["figuresLive"];
		app = mountIsland(host, freshProps());
		flushSync();
		expect(Number(count())).toBeGreaterThan(0);
		await vi.waitFor(() => expect(slider()).not.toBeNull(), { timeout: 2000 });
		expect(count()).toBe("0");
		if (app) unmount(app);
		app = null;
		expect(count()).toBe("0");
	});
});
