// @vitest-environment node
/**
 * `RollMapBlock` (F10): caption, the SSR v3 strip as one SVG with twelve maps (AC14.2), the
 * featured map, `<details>`, and exactly one `astro-island[client="visible"]` with props of at
 * most 2 KB that name both dataset URLs (AC3.4, AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */

import { loadRenderers } from "astro:container";
import { readFileSync } from "node:fs";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import RollMapBlock from "../../src/components/article/RollMapBlock.astro";
import { dataset } from "../../src/lib/article-data/maps_generated";
import { generatorMaps, likenessLine, seedLabel } from "../../src/lib/figures/roll-map";

let html = "";
let doc: Document;
const data = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/maps_generated.json", "utf8")),
);

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	html = await c.renderToString(RollMapBlock, {
		props: { number: 5 },
		slots: { caption: "Caption words.", try: "press New seed." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("RollMapBlock", () => {
	it("is a labelled wide figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f10[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f10-cap");
		expect(fig?.classList.contains("fig--wide")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 5.");
		expect(doc.querySelector("figcaption")?.textContent).toContain("Caption words.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*press New seed\./);
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB naming both datasets", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "RollMap" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("maps_generated/1");
		expect(props).toContain("maps_cs/1");
		expect(props).not.toContain("data:application/json");
	});

	it("the keyframe has the featured v3 map and one SVG strip with twelve maps (AC14.2)", () => {
		const island = doc.querySelector("astro-island");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
		const strip = island?.querySelector("svg.rm-strip-svg");
		expect(strip?.getAttribute("role")).toBe("img");
		expect(strip?.querySelectorAll("symbol")).toHaveLength(12);
		expect(strip?.querySelectorAll("use")).toHaveLength(12);
		const board = island?.querySelector("svg.rm-board");
		expect(board?.getAttribute("role")).toBe("img");
		expect(board?.querySelectorAll("use")).toHaveLength(1);
		expect(board?.getAttribute("aria-label")).toContain("v3");
		expect(board?.getAttribute("aria-label")).toContain(seedLabel(0, 12));
	});

	it("states the likeness the way the island does, for v3", () => {
		const island = doc.querySelector("astro-island");
		const note = (island?.querySelector(".rm-note")?.textContent ?? "").replace(/\s+/g, " ");
		expect(note).toContain(likenessLine(data, "v3"));
		expect(generatorMaps(data, "v3")).toHaveLength(12);
	});

	it("has the Data and description details", () => {
		const details = doc.querySelector("details.fig-details");
		expect(details?.querySelector("summary")?.textContent).toContain("Data and description");
		expect(details?.textContent).toMatch(/twelve/i);
	});

	it("embeds no JSON blob", () => {
		expect(html).not.toContain("application/json");
		expect(doc.querySelectorAll("img")).toHaveLength(0);
	});
});
