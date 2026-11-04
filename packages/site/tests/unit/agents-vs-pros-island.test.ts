/**
 * @vitest-environment happy-dom
 *
 * `AgentsVsPros.svelte` (F11): load, sort toggle, open a row, error + Retry, disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15 (AC15.1)
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentsVsProsRaw from "../../src/components/article/AgentsVsPros.svelte";

const DATA = readFileSync("src/data/article/agents_vs_pros.json", "utf8");
const SHAPE = { schema: "agents_vs_pros/1", keys: ["peek", "rows", "schema"] };
interface Props {
	src: string;
	shape: typeof SHAPE;
	prosMaps: string;
}

/**
 * Mounts the island imported through @astrojs/svelte (typegen wraps `.svelte` imports with
 * client-directive props, which `mount()` does not accept; runtime is identical).
 *
 * @issue utof/utofme#94
 */
function mountIt(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(AgentsVsProsRaw as Component<Props>, { target, props });
}
let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/agents_vs_pros.test${++urlN}.json`,
	shape: SHAPE,
	prosMaps: "224",
});
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const order = () =>
	Array.from(document.querySelectorAll("li.av-row")).map((r) => r.getAttribute("data-row"));
const text = () => (q(".fig-box")?.textContent ?? "").replaceAll(" ", " ");
const button = (label: string) =>
	Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
const click = (el: Element | null | undefined) => {
	el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
};

describe("AgentsVsPros island", () => {
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
		app = mountIt(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(order()).toHaveLength(11), { timeout: 2000 });
		flushSync();
	}

	it("opens sorted by gap with every row stamped; the sort toggle is pressed", async () => {
		await ready();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(order()[0]).toBe("flashes");
		expect(order()[1]).toBe("grenades");
		expect(button("Sort by gap")?.getAttribute("aria-pressed")).toBe("true");
		expect(document.querySelectorAll("[data-stamp]")).toHaveLength(11);
	});

	it("AC15.1: the toggle returns to the data's order and back", async () => {
		await ready();
		click(button("Sort by gap"));
		expect(order()[0]).toBe("openKill");
		expect(button("Sort by gap")?.getAttribute("aria-pressed")).toBe("false");
		click(button("Sort by gap"));
		expect(order()[0]).toBe("flashes");
	});

	it("opening the top row shows its definition and source; a second click closes it", async () => {
		await ready();
		const head = q<HTMLButtonElement>("li.av-row button.av-head");
		expect(head?.getAttribute("aria-expanded")).toBe("false");
		click(head);
		expect(head?.getAttribute("aria-expanded")).toBe("true");
		expect(text()).toContain("Flash grenades thrown per player per round.");
		expect(text()).toContain("Source: 3v3 agent readout; 224 pro maps of 2026.");
		click(head);
		expect(q(".av-detail")).toBeNull();
	});

	it("row heads are named buttons with both values", async () => {
		await ready();
		const label = q("li.av-row button.av-head")?.getAttribute("aria-label") ?? "";
		expect(label.replaceAll(" ", " ")).toBe(
			"Flashes per player-round, 3v3 agent · 2026-10-25: agent 0.012, pros 0.624",
		);
	});

	it("shows an error with Retry, then recovers", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountIt(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(button("Retry")).toBeDefined(), { timeout: 2000 });
		click(button("Retry"));
		await vi.waitFor(() => expect(order()).toHaveLength(11), { timeout: 2000 });
	});

	it("the disposer releases every live resource", async () => {
		await ready();
		const live = () => Number(document.documentElement.dataset.figuresLive ?? 0);
		expect(live()).toBeGreaterThan(0);
		if (!app) throw new Error("not mounted");
		unmount(app);
		app = null;
		expect(live()).toBe(0);
	});
});
