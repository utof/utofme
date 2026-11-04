// @vitest-environment node
/**
 * `ReplayBlock` (F1): caption, SSR keyframe with its 6-frame strip, `<details>`, the stamp and
 * exactly one `astro-island[client="visible"]` with props of at most 2 KB (AC5.5, AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import ReplayBlock from "../../src/components/article/ReplayBlock.astro";

let html = "";
let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	html = await c.renderToString(ReplayBlock, {
		props: { number: 1 },
		slots: { caption: "Caption words.", try: "press play." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("ReplayBlock", () => {
	it("is a labelled figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f1[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f1-cap");
		expect(fig?.classList.contains("fig--wide")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 1.");
		expect(doc.querySelector("figcaption")?.textContent).toContain("Caption words.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*press play\./);
	});

	it("carries the stamp for the head's round (OD-4)", () => {
		const stamp = doc.querySelector("[data-stamp]")?.textContent ?? "";
		expect(stamp).toMatch(/block 28 \(5v5\), self-play, recorded 2026-11-04/);
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "Replay" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("replay_mirage");
		expect(props).toContain("replay_mirage/1");
		expect(props).toMatch(/\.json/);
		expect(props).not.toContain("data:application/json");
	});

	it("renders the keyframe inside the island: board at first contact with role=img", () => {
		const island = doc.querySelector("astro-island");
		const board = island?.querySelector("svg[role='img'][data-board]");
		expect(board).not.toBeNull();
		const label = board?.getAttribute("aria-label") ?? "";
		expect(label).toContain("7.2");
		expect(label).toMatch(/Defender \d sees Attacker \d|Attacker \d sees Defender \d/);
		expect(island?.querySelector(".fig-box")).not.toBeNull();
	});

	it("draws the walls once as a symbol and reuses them in every frame", () => {
		expect(doc.querySelectorAll("symbol")).toHaveLength(1);
		expect(doc.querySelectorAll("use").length).toBeGreaterThanOrEqual(7);
	});

	it("has the 6-frame strip labelled in seconds, in time order", () => {
		const frames = [...doc.querySelectorAll("ol.rp-strip > li")];
		expect(frames).toHaveLength(6);
		const text = frames.map((f) => f.querySelector("span")?.textContent?.trim() ?? "");
		expect(text[0]).toMatch(/^0\.0 s/);
		expect(text[1]).toMatch(/^7\.2 s .*contact/i);
		for (const f of frames) expect(f.querySelector("svg[role='img']")).not.toBeNull();
		const secs = text.map((t) => Number.parseFloat(t));
		expect(secs).toEqual([...secs].sort((a, b) => a - b));
	});

	it("has the Data and description details with the events list", () => {
		const details = doc.querySelector("details.fig-details");
		expect(details?.querySelector("summary")?.textContent).toContain("Data and description");
		const items = [...(details?.querySelectorAll("ol.rp-events > li") ?? [])];
		expect(items.length).toBe(13);
		expect(items.map((i) => i.textContent).join(" ")).toMatch(/First contact/);
		expect(items.at(-1)?.textContent).toMatch(/Round ends: attackers win/);
	});

	it("embeds no JSON and no ids or ticks in the text", () => {
		expect(html).not.toContain("application/json");
		expect(html).not.toMatch(/\bpid\b|\btick\b/i);
		expect(doc.querySelector("script[type='application/json']")).toBeNull();
	});
});
