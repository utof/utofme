/**
 * @vitest-environment happy-dom
 *
 * `Elo.svelte` (F3): load, map-set toggle, keyboard cursor, markers and cards, error + Retry,
 * disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (AC7.2, AC7.3, AC7.5)
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EloRaw from "../../src/components/article/Elo.svelte";

const DATA = readFileSync("src/data/article/elo.json", "utf8");
const SHAPE = {
	schema: "elo/1",
	keys: ["after28", "compiled", "era3v3", "main", "markers", "schema"],
};

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
function mountElo(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(EloRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/elo.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f3-cap",
});

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const chip = (label: string) =>
	qa<HTMLButtonElement>("button.el-chip").find((b) => b.getAttribute("aria-label") === label);
const key = (el: Element | null, k: string) => {
	el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	flushSync();
};

describe("Elo island", () => {
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
		app = mountElo(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q("svg.el-svg")).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("shows the island root, requests the data once and swaps in the chart", async () => {
		app = mountElo(host, freshProps());
		flushSync();
		expect(q(".fig-box")).not.toBeNull();
		expect(q("svg.el-svg")).toBeNull();
		await vi.waitFor(() => expect(q("svg.el-svg")).not.toBeNull(), { timeout: 2000 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(q("svg.el-svg")?.getAttribute("role")).toBe("group");
		expect(q("svg.el-svg")?.getAttribute("aria-labelledby")).toBe("f3-cap");
	});

	it("default state: hand-made maps pressed, block 28 labelled +96 (+94 to +98), two bands", async () => {
		await ready();
		expect(chip("Hand-made CS maps")?.getAttribute("aria-pressed")).toBe("true");
		expect(chip("Generated test maps")?.getAttribute("aria-pressed")).toBe("false");
		expect(q("svg.el-svg")?.textContent).toContain("+96 (+94 to +98)");
		expect(qa("svg.el-svg [data-band]")).toHaveLength(2);
		expect(qa("svg.el-svg [data-point]")).toHaveLength(10);
	});

	it("AC7.5: the compiled toggle shows three points, the block-28 one reading +86", async () => {
		await ready();
		chip("Compiled CS maps")?.click();
		flushSync();
		expect(chip("Compiled CS maps")?.getAttribute("aria-pressed")).toBe("true");
		expect(qa("svg.el-svg [data-point]")).toHaveLength(3);
		expect(q("svg.el-svg")?.textContent).toContain("+86 (+84 to +89)");
		expect(q("#f3-live")?.textContent).toContain("3 readouts");
	});

	it("generated maps draw no whiskers or bands", async () => {
		await ready();
		chip("Generated test maps")?.click();
		flushSync();
		expect(qa("svg.el-svg [data-band], svg.el-svg [data-whisker]")).toHaveLength(0);
	});

	it("keyboard: focus reads block 28, ← steps to block 24 with its seeds, Home goes to block 2", async () => {
		await ready();
		const svg = q("svg.el-svg");
		svg?.dispatchEvent(new FocusEvent("focus"));
		flushSync();
		expect(svg?.textContent).toContain("Block 28: +96 Elo (90 % interval +94 to +98)");
		key(svg ?? null, "ArrowLeft");
		expect(svg?.textContent).toContain(
			"Block 24: +86 Elo (90 % interval +84 to +88); seeds +89 and +83",
		);
		expect(q("#f3-live")?.textContent).toContain("Block 24");
		key(svg ?? null, "Home");
		expect(svg?.textContent).toContain("Block 2: 0 Elo");
		key(svg ?? null, "End");
		expect(svg?.textContent).toContain("Block 28");
	});

	it("markers are buttons in tab order; the flash-kick one opens a card linking #nb-<id>", async () => {
		await ready();
		chip("Compiled CS maps")?.click();
		flushSync();
		const markers = qa<HTMLButtonElement>("button.el-mark");
		expect(markers).toHaveLength(3);
		const kick = markers.find((m) => m.dataset["marker"] === "F4");
		expect(kick?.tabIndex).toBe(0);
		expect(kick?.getAttribute("aria-label")).toContain(
			"+4 Elo vs control (90 % interval +3 to +6)",
		);
		kick?.click();
		flushSync();
		expect(kick?.getAttribute("aria-expanded")).toBe("true");
		const link = q<HTMLAnchorElement>(".el-card a");
		expect(link?.getAttribute("href")).toBe("#nb-p3-kick-fixed");
		expect(link?.textContent).toBe("In the notebook");
		key(q(".el-card"), "Escape");
		expect(q(".el-card")).toBeNull();
	});

	it("a failed load keeps the keyframe, says so and offers Retry", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountElo(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q(".el-fail")).not.toBeNull(), { timeout: 2000 });
		expect(q(".el-fail")?.textContent).toContain("Interactive version failed to load");
		q<HTMLButtonElement>(".el-fail button")?.click();
		await vi.waitFor(() => expect(q("svg.el-svg")).not.toBeNull(), { timeout: 2000 });
		expect(q(".el-fail")).toBeNull();
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
