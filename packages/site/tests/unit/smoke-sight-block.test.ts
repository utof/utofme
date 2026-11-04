// @vitest-environment node
/**
 * `SmokeSightBlock` (F2): caption, SSR keyframe with both counts, `<details>`, and exactly one
 * `astro-island[client="visible"]` with props of at most 2 KB (AC6.4, AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import SmokeSightBlock from "../../src/components/article/SmokeSightBlock.astro";
import data from "../../src/data/article/maps_cs.json";
import {
	addSmoke,
	MAP_NAME,
	readout,
	START_TOKENS,
	SUGGESTED_SMOKE,
	startBoard,
} from "../../src/lib/figures/smoke-sight";
import { parseRows } from "../../src/lib/grid";

let html = "";
let doc: Document;
const mirage = data.maps.find((m) => m.name === MAP_NAME);
if (!mirage) throw new Error("maps_cs has no Mirage");
const map = parseRows(mirage.rows);

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	html = await c.renderToString(SmokeSightBlock, {
		props: { number: 2 },
		slots: { caption: "Caption words.", try: "drop a smoke on the ghost." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("SmokeSightBlock", () => {
	it("is a labelled wide figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f2[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f2-cap");
		expect(fig?.classList.contains("fig--wide")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 2.");
		expect(doc.querySelector("figcaption")?.textContent).toContain("Caption words.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(
			/Try:\s*drop a smoke on the ghost\./,
		);
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "SmokeSight" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("maps_cs/1");
		expect(props).toMatch(/\.json/);
		expect(props).not.toContain("data:application/json");
	});

	it("the keyframe shows the suggested smoke placed and both counts (AC6.4)", () => {
		const base = readout(map, startBoard());
		const withSmoke = readout(map, addSmoke(map, startBoard(), SUGGESTED_SMOKE));
		const island = doc.querySelector("astro-island");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
		const text = (island?.querySelector(".ss-readout")?.textContent ?? "")
			.replace(/\s+/g, " ")
			.trim();
		expect(text).toBe(`Enemy sightlines: ${withSmoke.count} (was ${base.count} with no smoke)`);
		const svg = island?.querySelector("svg[role='img']");
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute("aria-label")).toContain(String(withSmoke.count));
		expect(svg?.getAttribute("aria-label")).toContain(String(base.count));
		expect(island?.querySelectorAll("[data-token]")).toHaveLength(START_TOKENS.length);
		expect(island?.querySelectorAll("[data-smoke-disc]")).toHaveLength(1);
		expect(island?.querySelectorAll("path.ss-line, line.ss-line")).toHaveLength(withSmoke.count);
	});

	it("has the Data and description details with the rule and the keyboard help", () => {
		const details = doc.querySelector("details.fig-details");
		expect(details?.querySelector("summary")?.textContent).toContain("Data and description");
		const text = details?.textContent ?? "";
		expect(text).toMatch(/arrow keys/i);
		expect(text).toMatch(/1 in 7/);
	});

	it("embeds no JSON blob", () => {
		expect(html).not.toContain("application/json");
		expect(doc.querySelector("script[type='application/json']")).toBeNull();
	});
});
