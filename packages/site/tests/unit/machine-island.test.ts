/**
 * @vitest-environment happy-dom
 *
 * `Machine.svelte` (F6): load, stage walk (Next x9, Previous), hover/focus readouts, keyboard,
 * error + Retry, disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10 (AC10.1)
 */
import { readFileSync } from "node:fs";
import { type Component, flushSync, mount as svelteMount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MachineRaw from "../../src/components/article/Machine.svelte";

const DATA = readFileSync("src/data/article/architecture.json", "utf8");
const SHAPE = { schema: "architecture/1", keys: ["edges", "groups", "nodes", "schema"] };

interface Props {
	src: string;
	shape: typeof SHAPE;
	labelId: string;
}

/**
 * Mounts the island imported through @astrojs/svelte (see replay-island.test.ts for why the cast
 * is isolated here).
 *
 * @issue utof/utofme#94
 */
function mountMachine(target: HTMLElement, props: Props): ReturnType<typeof svelteMount> {
	return svelteMount(MachineRaw as Component<Props>, { target, props });
}

let urlN = 0;
const freshProps = (): Props => ({
	src: `/_astro/architecture.test${++urlN}.json`,
	shape: SHAPE,
	labelId: "f6-cap",
});
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const all = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];
const counter = () => q("[data-stage-count]")?.textContent?.trim();
const button = (name: string) =>
	all<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === name);
const node = (id: string) => q<SVGGElement>(`[data-node="${id}"]`);
const readoutText = () => q("[data-readout]")?.textContent ?? "";

function click(el: Element | null | undefined): void {
	el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	flushSync();
}
function key(el: Element | null | undefined, k: string): void {
	el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	flushSync();
}

describe("Machine island", () => {
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
		app = mountMachine(host, freshProps());
		flushSync();
		await vi.waitFor(() => expect(node("env")).not.toBeNull(), { timeout: 2000 });
		flushSync();
	}

	it("default state: all 18 boxes and 27 arrows, stage 4 / 9 (Train) highlighted", async () => {
		await ready();
		expect(all("[data-node]")).toHaveLength(18);
		expect(all("[data-edge]")).toHaveLength(27);
		expect(counter()).toBe("4 / 9");
		expect(q("svg")?.getAttribute("role")).toBe("group");
		expect(node("train")?.classList.contains("on")).toBe(true);
		expect(node("v2d")?.classList.contains("on")).toBe(false);
		expect(readoutText()).toContain("4. Train");
	});

	it("AC10.1: focusing each of the 18 boxes shows its blurb, receives and sends", async () => {
		await ready();
		for (const el of all<SVGGElement>("[data-node]")) {
			el.dispatchEvent(new FocusEvent("focus"));
			flushSync();
			const t = readoutText();
			expect(t).toContain(el.getAttribute("aria-label") ?? "?");
			expect(t).toContain("Receives:");
			expect(t).toContain("Sends:");
		}
	});

	it("an arrow's focus shows its flow sentence", async () => {
		await ready();
		q("[data-edge='env>train']")?.dispatchEvent(new FocusEvent("focus"));
		flushSync();
		expect(readoutText()).toContain("1.31 M decisions");
	});

	it("AC10.1: Next x9 reaches 9 / 9 (and stops), Previous returns to 1 / 9", async () => {
		await ready();
		for (let i = 0; i < 9; i++) click(button("Next"));
		expect(counter()).toBe("9 / 9");
		expect(button("Next")?.disabled).toBe(true);
		for (let i = 0; i < 9; i++) click(button("Previous"));
		expect(counter()).toBe("1 / 9");
		expect(button("Previous")?.disabled).toBe(true);
		expect(readoutText()).toContain("1. Write the job");
	});

	it("each stage highlights its boxes", async () => {
		await ready();
		click(button("Next"));
		expect(counter()).toBe("5 / 9");
		expect(node("backup")?.classList.contains("on")).toBe(true);
		expect(node("league")?.classList.contains("on")).toBe(false);
	});

	it("keyboard: arrows step between connected boxes, Enter pins, Escape releases", async () => {
		await ready();
		const env = node("env");
		env?.focus();
		flushSync();
		key(env, "ArrowDown");
		await vi.waitFor(() => expect(document.activeElement).toBe(node("bots")));
		key(node("bots"), "Enter");
		expect(node("bots")?.getAttribute("aria-pressed")).toBe("true");
		key(node("bots"), "Escape");
		expect(node("bots")?.getAttribute("aria-pressed")).toBe("false");
	});

	it("moving to another stage clears a pinned readout", async () => {
		await ready();
		key(node("gen"), "Enter");
		expect(readoutText()).toContain("Map generator");
		click(button("Next"));
		expect(readoutText()).toContain("5. Save");
	});

	it("hover shows the blurb and leaving restores the stage", async () => {
		await ready();
		node("tour")?.dispatchEvent(new PointerEvent("pointerenter"));
		flushSync();
		expect(readoutText()).toContain("Tournament");
		node("tour")?.dispatchEvent(new PointerEvent("pointerleave"));
		flushSync();
		expect(readoutText()).toContain("4. Train");
	});

	it("shows an error with Retry and recovers", async () => {
		fetchMock.mockImplementationOnce(async () => new Response("no", { status: 500 }));
		app = mountMachine(host, freshProps());
		flushSync();
		await vi.waitFor(() =>
			expect(host.textContent).toContain("Interactive version failed to load"),
		);
		fetchMock.mockImplementation(async () => new Response(DATA, { status: 200 }));
		click(button("Retry"));
		await vi.waitFor(() => expect(node("env")).not.toBeNull(), { timeout: 2000 });
	});

	it("unmounting releases every live registration", async () => {
		await ready();
		if (app) unmount(app);
		app = null;
		expect(document.documentElement.dataset.figuresLive ?? "0").toBe("0");
	});
});
