/**
 * @vitest-environment happy-dom
 *
 * `SmokeSight.svelte` (F2): load, tokens and names, keyboard moves, smokes, sampled points,
 * error + Retry, and the disposer (AC6.2, AC6.3 logic side, AC16.5).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmokeSightRaw from "../../src/components/article/SmokeSight.svelte";
import data from "../../src/data/article/maps_cs.json";
import {
	addSmoke,
	MAP_NAME,
	moveToken,
	readout,
	readoutText,
	START_TOKENS,
	SUGGESTED_SMOKE,
	startBoard,
	tileText,
	tokenLabel,
} from "../../src/lib/figures/smoke-sight";
import { parseRows } from "../../src/lib/grid";

const DATA = readFileSync("src/data/article/maps_cs.json", "utf8");
const SHAPE = { schema: "maps_cs/1", keys: ["maps", "schema"] };
const mirage = data.maps.find((m) => m.name === MAP_NAME);
if (!mirage) throw new Error("maps_cs has no Mirage");
const map = parseRows(mirage.rows);

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
	return svelteMount(SmokeSightRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/maps_cs.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f2-cap",
});

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const all = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const tokens = () => all<SVGGElement>("g[data-token]");
const smokes = () => all<SVGGElement>("g[data-smoke]");
const readoutEl = () => q(".ss-readout");
const liveEl = () => q(".ss-live");
const key = (el: Element | null | undefined, k: string, init: KeyboardEventInit = {}) => {
	el?.dispatchEvent(
		new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }),
	);
	flushSync();
};
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

describe("SmokeSight island", () => {
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
		await vi.waitFor(() => expect(q("svg[role='application']")).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("shows the island root, requests the data once and swaps in the board", async () => {
		app = mountIsland(host, freshProps());
		flushSync();
		expect(q(".fig-box")).not.toBeNull();
		expect(q("svg[role='application']")).toBeNull();
		await vi.waitFor(() => expect(q("svg[role='application']")).not.toBeNull(), { timeout: 2000 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("the board is a labelled application with a role description (common contract)", async () => {
		await ready();
		const board = q("svg[role='application']");
		expect(board?.getAttribute("aria-roledescription")).toBe("smoke board");
		expect(board?.getAttribute("aria-labelledby")).toBe("f2-cap");
		const described = board?.getAttribute("aria-describedby") ?? "";
		expect(described).not.toBe("");
		expect(document.getElementById(described)).not.toBeNull();
	});

	it("default state: no smoke, every sightline counted, the ghost smoke offered", async () => {
		await ready();
		const start = startBoard();
		const r = readout(map, start);
		expect(norm(readoutEl()?.textContent)).toBe(readoutText(r, 0));
		expect(smokes()).toHaveLength(0);
		expect(all("[data-ghost]")).toHaveLength(1);
		expect(all("path.ss-line, line.ss-line")).toHaveLength(r.count);
	});

	it("ten tokens, each focusable with its own name (CT circle, T triangle)", async () => {
		await ready();
		const names = tokens().map((t) => t.getAttribute("aria-label"));
		expect(names).toEqual(START_TOKENS.map(tokenLabel).map((n) => expect.stringContaining(n)));
		for (const t of tokens()) {
			expect(t.getAttribute("tabindex")).toBe("0");
			expect(t.getAttribute("role")).toBe("button");
		}
		expect(all("g[data-token] path[data-shape='circle']")).toHaveLength(5);
		expect(all("g[data-token] path[data-shape='triangle']")).toHaveLength(5);
	});

	it("an arrow key moves the focused token one tile and the live region says so (AC6.2 keyboard)", async () => {
		await ready();
		const i = START_TOKENS.findIndex((t) => t.side === "t" && t.n === 2);
		const moved = moveToken(map, startBoard(), i, 0, -1);
		expect(moved).not.toBe(startBoard());
		const t = tokens()[i];
		key(t, "ArrowLeft");
		const m = moved.tokens[i];
		if (!m) throw new Error("moved token missing");
		expect(tokens()[i]?.getAttribute("aria-label")).toContain(tileText([m.r, m.c]));
		expect(norm(liveEl()?.textContent)).toContain(`T 2 moved to ${tileText([m.r, m.c])}`);
		expect(norm(liveEl()?.textContent)).toContain(readoutText(readout(map, moved), 0));
	});

	it("Shift moves five tiles at most, stopping at walls", async () => {
		await ready();
		const i = START_TOKENS.findIndex((t) => t.side === "t" && t.n === 2);
		key(tokens()[i], "ArrowUp", { shiftKey: true });
		const expected = moveToken(map, startBoard(), i, -5, 0).tokens[i];
		if (!expected) throw new Error("no token");
		expect(tokens()[i]?.getAttribute("aria-label")).toContain(tileText([expected.r, expected.c]));
	});

	it("Add smoke drops the suggested smoke; the count falls and the live region compares with the base (AC6.2)", async () => {
		await ready();
		const base = readout(map, startBoard());
		const add = [...document.querySelectorAll("button")].find((b) =>
			/Add smoke/.test(b.textContent ?? ""),
		);
		expect(add).toBeDefined();
		add?.click();
		flushSync();
		expect(smokes()).toHaveLength(1);
		const board = addSmoke(map, startBoard());
		expect(board.smokes[0]).toEqual(SUGGESTED_SMOKE);
		const r = readout(map, board);
		expect(r.count).toBeLessThan(base.count);
		expect(norm(readoutEl()?.textContent)).toBe(readoutText(r, 1));
		expect(norm(liveEl()?.textContent)).toContain(readoutText(r, 1));
		expect(smokes()[0]?.getAttribute("aria-label")).toContain(tileText(SUGGESTED_SMOKE));
	});

	it("clicking the ghost drops a smoke exactly there", async () => {
		await ready();
		q<SVGGElement>("[data-ghost]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		flushSync();
		expect(smokes()).toHaveLength(1);
		expect(smokes()[0]?.getAttribute("aria-label")).toContain(tileText(SUGGESTED_SMOKE));
	});

	it("arrows move a focused smoke, Delete removes it, S adds one at the focused tile, three at most", async () => {
		await ready();
		const t0 = tokens()[0];
		key(t0, "s");
		expect(smokes()).toHaveLength(1);
		const first = smokes()[0];
		const before = first?.getAttribute("aria-label");
		key(first, "ArrowLeft");
		expect(smokes()[0]?.getAttribute("aria-label")).not.toBe(before);
		key(tokens()[1], "s");
		key(tokens()[2], "s");
		key(tokens()[3], "s");
		expect(smokes()).toHaveLength(3);
		key(smokes()[1], "Delete");
		expect(smokes()).toHaveLength(2);
	});

	it("R turns the focused token and announces the direction; Enter says whom it sees", async () => {
		await ready();
		const i = 0;
		const before = START_TOKENS[i]?.facing ?? 0;
		key(tokens()[i], "r");
		expect(norm(liveEl()?.textContent)).toMatch(/now faces /);
		key(tokens()[i], "Enter");
		expect(norm(liveEl()?.textContent)).toMatch(/sees .*; seen by /);
		expect(before).toBeGreaterThanOrEqual(0);
	});

	it("Reset restores the start board", async () => {
		await ready();
		key(tokens()[0], "s");
		key(tokens()[5], "ArrowLeft");
		const reset = [...document.querySelectorAll("button")].find((b) =>
			/Reset/.test(b.textContent ?? ""),
		);
		reset?.click();
		flushSync();
		expect(smokes()).toHaveLength(0);
		expect(norm(readoutEl()?.textContent)).toBe(readoutText(readout(map, startBoard()), 0));
		expect(tokens().map((t) => t.getAttribute("aria-label"))).toEqual(
			START_TOKENS.map((t) => expect.stringContaining(tokenLabel(t))),
		);
	});

	it("Show sampled points draws dot paths and toggles back off", async () => {
		await ready();
		expect(all("path.ss-dots")).toHaveLength(0);
		const box = q<HTMLInputElement>("input[type='checkbox']");
		expect(box).not.toBeNull();
		box?.click();
		flushSync();
		expect(all("path.ss-dots").length).toBeGreaterThan(0);
		box?.click();
		flushSync();
		expect(all("path.ss-dots")).toHaveLength(0);
	});

	it("a failed load keeps the keyframe, shows the note and Retry, and Retry loads", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountIsland(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(q(".ss-fail")).not.toBeNull(), { timeout: 2000 });
		expect(q(".ss-fail")?.textContent).toContain("Interactive version failed to load");
		expect(q("svg[role='application']")).toBeNull();
		const retry = [...document.querySelectorAll("button")].find((b) =>
			/Retry/.test(b.textContent ?? ""),
		);
		retry?.click();
		flushSync();
		await vi.waitFor(() => expect(q("svg[role='application']")).not.toBeNull(), { timeout: 2000 });
		expect(q(".ss-fail")).toBeNull();
	});

	it("the disposer releases every registerLive (AC16.5)", async () => {
		await ready();
		const live = () => document.documentElement.dataset["figuresLive"];
		expect(Number(live())).toBeGreaterThan(0);
		if (app) unmount(app);
		app = null;
		expect(live()).toBe("0");
	});
});
