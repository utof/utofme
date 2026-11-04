// @vitest-environment node
/**
 * `MapStagesBlock` (F5): caption, four small multiples as SSR SVGs (AC9.2), `<details>` table,
 * and exactly one `astro-island[client="visible"]` with props of at most 2 KB (AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */

import { loadRenderers } from "astro:container";
import { readFileSync } from "node:fs";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import MapStagesBlock from "../../src/components/article/MapStagesBlock.astro";
import { dataset } from "../../src/lib/article-data/map_stages";
import { DEFAULT_MAP, STAGES, stageCount, stageSummary } from "../../src/lib/figures/map-stages";

let html = "";
let doc: Document;
const data = dataset.projected.parse(
	JSON.parse(readFileSync("src/data/article/map_stages.json", "utf8")),
);
const mirage = data.maps.find((m) => m.name === DEFAULT_MAP);
if (!mirage) throw new Error("no Mirage");

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	html = await c.renderToString(MapStagesBlock, {
		props: { number: 3 },
		slots: { caption: "Caption words.", try: "slide back to the floor shares." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("MapStagesBlock", () => {
	it("is a labelled wide figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f5[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f5-cap");
		expect(fig?.classList.contains("fig--wide")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 3.");
		expect(doc.querySelector("figcaption")?.textContent).toContain("Caption words.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(
			/Try:\s*slide back to the floor shares\./,
		);
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "MapStages" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("map_stages/1");
		expect(props).toMatch(/\.json/);
		expect(props).not.toContain("data:application/json");
	});

	it("the keyframe is four small multiples, each an SVG image with its counted value (AC9.2)", () => {
		const island = doc.querySelector("astro-island");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
		const svgs = island?.querySelectorAll("svg") ?? [];
		expect(svgs).toHaveLength(4);
		[...svgs].forEach((svg, i) => {
			expect(svg.getAttribute("role")).toBe("img");
			expect(svg.getAttribute("aria-label")).toBe(`Mirage. ${stageSummary(mirage, i)}`);
		});
		const items = [...(island?.querySelectorAll("ol.ms-multi > li") ?? [])];
		expect(items).toHaveLength(4);
		items.forEach((li, i) => {
			expect(li.textContent).toContain(STAGES[i]?.title);
			expect(li.textContent).toContain(String(stageCount(mirage, i)));
		});
	});

	it("has the Data and description details with a counts table for all five maps", () => {
		const details = doc.querySelector("details.fig-details");
		expect(details?.querySelector("summary")?.textContent).toContain("Data and description");
		const rows = [...(details?.querySelectorAll("tbody tr") ?? [])];
		expect(rows).toHaveLength(data.maps.length);
		data.maps.forEach((m, i) => {
			const cells = [...(rows[i]?.querySelectorAll("td") ?? [])].map((c) => c.textContent?.trim());
			expect(cells).toEqual([0, 1, 2, 3].map((s) => String(stageCount(m, s))));
		});
	});

	it("carries no radar picture, no stage-1 data and no JSON blob", () => {
		expect(html).not.toContain("application/json");
		expect(html).not.toMatch(/radar_floor|stage 1\b/i);
		expect(doc.querySelectorAll("img")).toHaveLength(0);
	});
});
