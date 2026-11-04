/**
 * @vitest-environment happy-dom
 *
 * `RollMap.svelte` (F10): load of both datasets, New seed, generator toggle, thumbnails, compare
 * with Mirage, error + Retry, disposer (AC14.1 logic side, AC16.5).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RollMapRaw from "../../src/components/article/RollMap.svelte";
import { dataset } from "../../src/lib/article-data/maps_generated";
import {
	DEFAULT_GENERATOR,
	GENERATORS,
	generatorMaps,
	likenessLine,
	mapShapes,
	seedLabel,
} from "../../src/lib/figures/roll-map";

const GEN = readFileSync("src/data/article/maps_generated.json", "utf8");
const CS = readFileSync("src/data/article/maps_cs.json", "utf8");
const data = dataset.projected.parse(JSON.parse(GEN));
const GEN_SHAPE = { schema: "maps_generated/1", keys: ["csLikeness", "generators", "schema"] };
const CS_SHAPE = { schema: "maps_cs/1", keys: ["maps", "schema"] };

interface Props {
	src: string;
	shape: typeof GEN_SHAPE;
	compareSrc: string;
	compareShape: typeof CS_SHAPE;
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
	return svelteMount(RollMapRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => {
	urlN += 1;
	return {
		src: `/_astro/maps_generated.test${urlN}.json`,
		shape: GEN_SHAPE,
		compareSrc: `/_astro/maps_cs.test${urlN}.json`,
		compareShape: CS_SHAPE,
		labelId: "f10-cap",
	};
};

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const all = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const text = (sel: string) => (q(sel)?.textContent ?? "").replace(/\s+/g, " ").trim();
const newSeed = () =>
	[...document.querySelectorAll("button")].find((b) => /New seed/.test(b.textContent ?? ""));
const boards = () => all<SVGSVGElement>("svg.rm-board");
const wallsOf = (svg: Element | undefined) => svg?.querySelector(".rm-wall")?.getAttribute("d");

describe("RollMap island", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.dispatchEvent(new Event("astro:before-swap"));
		host = document.createElement("div");
		document.body.appendChild(host);
		app = null;
		fetchMock = vi.fn(async (url: string) =>
			String(url).includes("maps_cs")
				? new Response(CS, { status: 200 })
				: new Response(GEN, { status: 200 }),
		);
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
		await vi.waitFor(() => expect(newSeed()).toBeDefined(), { timeout: 2000 });
		flushSync();
	}

	it("shows the island root, requests each dataset once and swaps in the controls", async () => {
		app = mountIsland(host, freshProps());
		flushSync();
		expect(q(".fig-box")).not.toBeNull();
		expect(newSeed()).toBeUndefined();
		await vi.waitFor(() => expect(newSeed()).toBeDefined(), { timeout: 2000 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("default: v3 map 1 of 12 with the v3 strip of twelve thumbnails", async () => {
		await ready();
		const maps = generatorMaps(data, DEFAULT_GENERATOR);
		expect(text(".rm-label")).toContain(seedLabel(0, 12));
		expect(boards()).toHaveLength(1);
		expect(wallsOf(boards()[0])).toBe(mapShapes(maps[0] ?? []).walls);
		const thumbs = all<HTMLButtonElement>("button.rm-thumb");
		expect(thumbs).toHaveLength(12);
		thumbs.forEach((t, i) => {
			expect(t.getAttribute("aria-label")).toBe(`Map ${i + 1} of 12`);
			expect(t.getAttribute("aria-current") === "true").toBe(i === 0);
			expect(t.querySelector("path.rm-wall")?.getAttribute("d")).toBe(
				mapShapes(maps[i] ?? []).walls,
			);
		});
		const radios = all<HTMLInputElement>("input[type='radio']");
		expect(radios.map((r) => r.value)).toEqual(GENERATORS.map((g) => g.id));
		expect(radios.find((r) => r.checked)?.value).toBe("v3");
	});

	it("New seed shows the next map and its label, and wraps after twelve (AC14.1)", async () => {
		await ready();
		const maps = generatorMaps(data, "v3");
		const first = wallsOf(boards()[0]);
		newSeed()?.click();
		flushSync();
		expect(text(".rm-label")).toContain(seedLabel(1, 12));
		expect(wallsOf(boards()[0])).toBe(mapShapes(maps[1] ?? []).walls);
		expect(wallsOf(boards()[0])).not.toBe(first);
		expect(text(".rm-live")).toContain("map 2 of 12");
		for (let i = 0; i < 11; i++) newSeed()?.click();
		flushSync();
		expect(text(".rm-label")).toContain(seedLabel(0, 12));
		expect(wallsOf(boards()[0])).toBe(first);
	});

	it("choosing a generator changes the strip and keeps the map number; the likeness line follows (AC14.1)", async () => {
		await ready();
		newSeed()?.click();
		flushSync();
		const v1 = all<HTMLInputElement>("input[type='radio']").find((r) => r.value === "v1");
		v1?.click();
		flushSync();
		const maps = generatorMaps(data, "v1");
		expect(text(".rm-label")).toContain(seedLabel(1, 12));
		expect(wallsOf(boards()[0])).toBe(mapShapes(maps[1] ?? []).walls);
		expect(all("button.rm-thumb")[3]?.querySelector("path.rm-wall")?.getAttribute("d")).toBe(
			mapShapes(maps[3] ?? []).walls,
		);
		expect(text(".rm-note")).toContain(likenessLine(data, "v1"));
		all<HTMLInputElement>("input[type='radio']")
			.find((r) => r.value === "v2")
			?.click();
		flushSync();
		expect(text(".rm-note")).toContain(likenessLine(data, "v2"));
	});

	it("a thumbnail selects its map", async () => {
		await ready();
		all<HTMLButtonElement>("button.rm-thumb")[6]?.click();
		flushSync();
		expect(text(".rm-label")).toContain(seedLabel(6, 12));
		expect(all("button.rm-thumb")[6]?.getAttribute("aria-current")).toBe("true");
		expect(all("button.rm-thumb")[0]?.getAttribute("aria-current")).toBeNull();
	});

	it("Compare with Mirage puts the real map beside it and takes it away again", async () => {
		await ready();
		const box = q<HTMLInputElement>("input[type='checkbox']");
		expect(box?.disabled).toBe(false);
		box?.click();
		flushSync();
		expect(boards()).toHaveLength(2);
		expect(boards()[1]?.getAttribute("aria-label")).toContain("Mirage");
		expect(text(".rm-live")).toContain("Mirage");
		box?.click();
		flushSync();
		expect(boards()).toHaveLength(1);
	});

	it("the board is a labelled image of the current map", async () => {
		await ready();
		expect(boards()[0]?.getAttribute("role")).toBe("img");
		expect(boards()[0]?.getAttribute("aria-label")).toContain("v3");
		expect(boards()[0]?.getAttribute("aria-label")).toContain("map 1 of 12");
	});

	it("a failed load keeps the keyframe, shows the note and Retry, and Retry loads", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountIsland(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q(".rm-fail")).not.toBeNull(), { timeout: 2000 });
		expect(q(".rm-fail")?.textContent).toContain("Interactive version failed to load");
		expect(newSeed()).toBeUndefined();
		[...document.querySelectorAll("button")]
			.find((b) => /Retry/.test(b.textContent ?? ""))
			?.click();
		flushSync();
		await vi.waitFor(() => expect(newSeed()).toBeDefined(), { timeout: 2000 });
		expect(q(".rm-fail")).toBeNull();
	});

	it("a failed Mirage request leaves the figure working with Compare disabled", async () => {
		fetchMock.mockImplementation(async (url: string) =>
			String(url).includes("maps_cs")
				? new Response("no", { status: 500 })
				: new Response(GEN, { status: 200 }),
		);
		await ready();
		expect(q<HTMLInputElement>("input[type='checkbox']")?.disabled).toBe(true);
		expect(q(".rm-fail")).toBeNull();
	});

	it("everything is released on unmount (AC16.5)", async () => {
		const count = () => document.documentElement.dataset["figuresLive"];
		app = mountIsland(host, freshProps());
		flushSync();
		expect(Number(count())).toBeGreaterThan(0);
		await vi.waitFor(() => expect(newSeed()).toBeDefined(), { timeout: 2000 });
		expect(count()).toBe("0");
		if (app) unmount(app);
		app = null;
		expect(count()).toBe("0");
	});
});
