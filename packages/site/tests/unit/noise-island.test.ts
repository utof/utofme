/**
 * @vitest-environment happy-dom
 *
 * `Noise.svelte` (F9): load, rounds slider, seeds selector, design toggle, error + Retry, disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13 (AC13.2)
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NoiseRaw from "../../src/components/article/Noise.svelte";

const DATA = readFileSync("src/data/article/noise.json", "utf8");
const SHAPE = { schema: "noise/1", keys: ["effects", "nulls", "rules", "schema"] };

interface Props {
	src: string;
	shape: typeof SHAPE;
	labelId: string;
}

/**
 * Mounts the island imported through @astrojs/svelte (see replay-island.test.ts for why the
 * cast is isolated here).
 *
 * @issue utof/utofme#94
 */
function mountNoise(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(NoiseRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/noise.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f9-cap",
});
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const bandWidth = () => Number(q("svg [data-band]")?.getAttribute("width"));
const sentenceText = () => q(".nz-sentence")?.textContent ?? "";

function setRange(v: number): void {
	const r = q<HTMLInputElement>("input[type='range']");
	if (!r) return;
	r.value = String(v);
	r.dispatchEvent(new Event("input", { bubbles: true }));
	flushSync();
}
function setSeeds(v: number): void {
	const s = q<HTMLSelectElement>("select");
	if (!s) return;
	s.value = String(v);
	s.dispatchEvent(new Event("change", { bubbles: true }));
	flushSync();
}

describe("Noise island", () => {
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
		app = mountNoise(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q("input[type='range']")).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("default state: 8,000 rounds, 2 seeds, independent, ±9.3", async () => {
		await ready();
		expect(q<HTMLInputElement>("input[type='range']")?.value).toBe("8000");
		expect(q<HTMLInputElement>("input[type='range']")?.getAttribute("aria-label")).toBe(
			"Rounds per pair",
		);
		expect(q<HTMLSelectElement>("select")?.value).toBe("2");
		expect(sentenceText()).toBe("With 2 seeds, an effect smaller than ±9.3 Elo is noise.");
		const pressed = [...document.querySelectorAll("button.nz-chip")].find(
			(b) => b.getAttribute("aria-pressed") === "true",
		);
		expect(pressed?.textContent).toBe("Independent seeds");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("AC13.2: rounds down to 1,000 widens the band to about ±18.1", async () => {
		await ready();
		const before = bandWidth();
		setRange(1000);
		expect(bandWidth()).toBeGreaterThan(before * 2.5);
		expect(q("svg")?.textContent).toContain("±18.1");
		expect(q(".nz-sr[aria-live]")?.textContent).toContain("±18.1");
	});

	it("AC13.2: seeds 2 → 1 raises N from ±9.3 to ±13.2", async () => {
		await ready();
		setSeeds(1);
		expect(sentenceText()).toBe("With 1 seed, an effect smaller than ±13.2 Elo is noise.");
		expect(q("svg")?.textContent).toContain("±13.2");
	});

	it("the design toggle switches to same seed (±4.4 at two seeds)", async () => {
		await ready();
		const same = [...document.querySelectorAll<HTMLButtonElement>("button.nz-chip")].find(
			(b) => b.textContent === "Same seed",
		);
		same?.click();
		flushSync();
		expect(same?.getAttribute("aria-pressed")).toBe("true");
		expect(sentenceText()).toContain("±4.4");
	});

	it("a failed load keeps the keyframe, says so and offers Retry", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountNoise(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q(".nz-fail")).not.toBeNull(), { timeout: 2000 });
		q<HTMLButtonElement>(".nz-fail button")?.click();
		await vi.waitFor(() => expect(q("input[type='range']")).not.toBeNull(), { timeout: 2000 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("the disposer releases every registered live resource", async () => {
		await ready();
		expect(Number(document.documentElement.dataset["figuresLive"])).toBeGreaterThan(0);
		if (app) unmount(app);
		app = null;
		flushSync();
		expect(document.documentElement.dataset["figuresLive"]).toBe("0");
	});
});
