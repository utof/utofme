/**
 * @vitest-environment happy-dom
 *
 * `Notebook.svelte` (F7): load, chips (AC11.2), Enter opens a card, `#nb-<id>` opens it (AC11.3),
 * the parked drawer fetches only when opened (AC11.6), phone list, keyboard, error + Retry.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotebookRaw from "../../src/components/article/Notebook.svelte";

const DATA = readFileSync("src/data/article/notebook.json", "utf8");
const PARKED = readFileSync("src/data/article/notebook_parked.json", "utf8");
const SHAPE = { schema: "notebook/1", keys: ["entries", "schema"] };
const PSHAPE = { schema: "notebook_parked/1", keys: ["parked", "schema"] };

interface Props {
	src: string;
	shape: typeof SHAPE;
	parkedSrc: string;
	parkedShape: typeof PSHAPE;
	labelId: string;
}

/**
 * Mounts the island imported through @astrojs/svelte (see replay-island.test.ts for why the cast
 * is isolated here).
 *
 * @issue utof/utofme#94
 */
function mountNotebook(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(NotebookRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => {
	urlN += 1;
	return {
		src: `/_astro/notebook.test${urlN}.json`,
		shape: SHAPE,
		parkedSrc: `/_astro/notebook_parked.test${urlN}.json`,
		parkedShape: PSHAPE,
		labelId: "f7-cap",
	};
};
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const all = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const chip = (name: string) =>
	all<HTMLButtonElement>(".nb-chip").find((b) => b.textContent?.trim() === name);
const marks = () => all("[data-mark]");

function click(el: Element | null | undefined): void {
	el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
}
function key(el: Element | null | undefined, k: string): void {
	el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	flushSync();
}

describe("Notebook island", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;
	let fetchMock: ReturnType<typeof vi.fn>;
	const requested: string[] = [];

	beforeEach(() => {
		document.dispatchEvent(new Event("astro:before-swap"));
		host = document.createElement("div");
		document.body.appendChild(host);
		app = null;
		requested.length = 0;
		location.hash = "";
		fetchMock = vi.fn(async (u: string) => {
			requested.push(String(u));
			return new Response(String(u).includes("notebook_parked") ? PARKED : DATA, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		if (app) unmount(app);
		host.remove();
		vi.unstubAllGlobals();
		location.hash = "";
	});

	async function ready(): Promise<void> {
		app = mountNotebook(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(marks().length).toBeGreaterThan(0), { timeout: 2000 });
		flushSync();
	}

	it("default state: all 229 marks, ten starred, legend counts, one tab stop", async () => {
		await ready();
		expect(marks()).toHaveLength(229);
		expect(all(".nb-ring")).toHaveLength(10);
		expect((q(".nb-legend")?.textContent ?? "").replace(/\s+/g, " ")).toContain("kept 99");
		expect(all("[data-mark][tabindex='0']")).toHaveLength(1);
		expect(q("svg.nb-svg")?.getAttribute("role")).toBe("group");
		expect(all(".nb-hl-list li")).toHaveLength(10);
	});

	it("AC11.2: the kept chip shows only kept marks; reverted shows 41; clearing restores all", async () => {
		await ready();
		click(chip("kept"));
		expect(chip("kept")?.getAttribute("aria-pressed")).toBe("true");
		expect(marks()).toHaveLength(99);
		expect(all(".nb-mark:not(.nb-kept)")).toHaveLength(0);
		click(chip("kept"));
		click(chip("reverted"));
		expect(marks()).toHaveLength(41);
		click(chip("reverted"));
		expect(marks()).toHaveLength(229);
	});

	it("outcome and area chips combine", async () => {
		await ready();
		click(chip("kept"));
		click(chip("learner"));
		const n = marks().length;
		expect(n).toBeGreaterThan(0);
		expect(n).toBeLessThan(99);
	});

	it("AC11.2: Enter on a mark opens its card with the metric line; Escape closes it", async () => {
		await ready();
		const m = q("[data-mark='p2-lr1e4']");
		key(m, "Enter");
		const card = q("#nb-p2-lr1e4");
		expect(card).not.toBeNull();
		expect(card?.textContent).toContain("Learning rate 1e-4 at plateau");
		expect(card?.textContent).toMatch(/CS Elo vs lr 3e-4: \+9/);
		expect(card?.textContent).toContain("2026-10-20");
		expect(m?.getAttribute("aria-expanded")).toBe("true");
		key(m, "Escape");
		expect(q("#nb-p2-lr1e4")).toBeNull();
	});

	it("keyboard: arrows rove along the row; the focused mark is the only tab stop", async () => {
		await ready();
		const first = q<SVGGElement>("[data-mark][tabindex='0']");
		const id = first?.getAttribute("data-mark") ?? "";
		key(first, "ArrowRight");
		await vi.waitFor(() => {
			const now = q("[data-mark][tabindex='0']")?.getAttribute("data-mark");
			expect(now).not.toBe(id);
		});
		expect(all("[data-mark][tabindex='0']")).toHaveLength(1);
	});

	it("AC11.3: loading with #nb-<id> opens that card", async () => {
		location.hash = "#nb-p3-flash-arc";
		await ready();
		await vi.waitFor(() => expect(q("#nb-p3-flash-arc")).not.toBeNull());
		expect(q("#nb-p3-flash-arc")?.textContent).toContain("Flash self-blind diagnosis");
	});

	it("hashchange opens a card, clearing filters that would hide it", async () => {
		await ready();
		click(chip("reverted"));
		location.hash = "#nb-p3-kick-fixed";
		window.dispatchEvent(new HashChangeEvent("hashchange"));
		flushSync();
		await vi.waitFor(() => expect(q("#nb-p3-kick-fixed")).not.toBeNull());
		expect(marks()).toHaveLength(229);
	});

	it("an unknown hash opens nothing", async () => {
		location.hash = "#nb-nope";
		await ready();
		expect(all(".nb-card")).toHaveLength(0);
	});

	it("AC11.6: the parked data is requested only after the drawer opens, once", async () => {
		await ready();
		expect(requested.filter((u) => u.includes("notebook_parked"))).toHaveLength(0);
		const d = q<HTMLDetailsElement>("details.nb-drawer");
		if (d) d.open = true;
		d?.dispatchEvent(new Event("toggle"));
		await vi.waitFor(() => expect(all(".nb-pk li").length).toBe(74), { timeout: 2000 });
		expect(q(".nb-pk")?.textContent).toContain("Reopen if");
		d?.dispatchEvent(new Event("toggle"));
		flushSync();
		expect(requested.filter((u) => u.includes("notebook_parked"))).toHaveLength(1);
	});

	it("shows an error with Retry and recovers", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountNotebook(host, freshProps());
		flushSync();
		await vi.waitFor(() =>
			expect(host.textContent).toContain("Interactive version failed to load"),
		);
		fetchMock.mockImplementation(async () => new Response(DATA, { status: 200 }));
		click(host.querySelector<HTMLButtonElement>(".nb-retry"));
		await vi.waitFor(() => expect(marks().length).toBe(229), { timeout: 2000 });
	});

	it("unmounting releases every live registration", async () => {
		await ready();
		if (app) unmount(app);
		app = null;
		expect(document.documentElement.dataset.figuresLive ?? "0").toBe("0");
	});
});

describe("Notebook island, phone layout", () => {
	let host: HTMLDivElement;
	let app: ReturnType<typeof svelteMount> | null;

	beforeEach(() => {
		document.dispatchEvent(new Event("astro:before-swap"));
		host = document.createElement("div");
		document.body.appendChild(host);
		app = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(DATA, { status: 200 })),
		);
		vi.stubGlobal(
			"matchMedia",
			vi.fn((query: string) => ({
				matches: query.includes("700px"),
				media: query,
				addEventListener: () => {},
				removeEventListener: () => {},
			})),
		);
	});
	afterEach(() => {
		if (app) unmount(app);
		host.remove();
		vi.unstubAllGlobals();
	});

	it("AC11.4: shows the list with the ten starred entries first, 20 at a time", async () => {
		app = mountNotebook(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(all(".nb-item").length).toBeGreaterThan(0), { timeout: 2000 });
		expect(q("svg.nb-svg")).toBeNull();
		const items = all(".nb-item");
		expect(items).toHaveLength(20);
		expect(items.slice(0, 10).every((i) => i.textContent?.includes("★"))).toBe(true);
		expect(items.slice(10).some((i) => i.textContent?.includes("★"))).toBe(false);
		click(all<HTMLButtonElement>("button").find((b) => b.textContent === "Show 20 more"));
		expect(all(".nb-item")).toHaveLength(40);
	});

	it("opening an item shows its card inline", async () => {
		app = mountNotebook(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(all(".nb-item").length).toBeGreaterThan(0), { timeout: 2000 });
		click(all(".nb-item")[0]);
		expect(all(".nb-card")).toHaveLength(1);
		expect(q(".nb-card")?.textContent).toContain("Zero-shot on CS maps");
	});
});
