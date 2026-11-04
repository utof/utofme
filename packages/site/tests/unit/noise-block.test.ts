// @vitest-environment node
/**
 * `NoiseBlock` (F9): caption, SSR keyframe with the default sentence and the static dot plot, the
 * `<details>` list and exactly one `astro-island[client="visible"]` with props of at most 2 KB.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13 (AC13.3, AC16.3)
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import NoiseBlock from "../../src/components/article/NoiseBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(NoiseBlock, {
		props: { number: 7 },
		slots: { caption: "Caption words.", try: "drag the rounds." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("NoiseBlock", () => {
	it("is a labelled figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f9[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f9-cap");
		expect(fig?.classList.contains("fig--text")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 7.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*drag the rounds\./);
	});
	it("has exactly one visible-hydrated island named Noise with props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "Noise" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("noise/1");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
	});
	it("AC13.3: the keyframe is the dot plot at 8,000 rounds with the default sentence", () => {
		const island = doc.querySelector("astro-island");
		expect(
			(island?.querySelector(".nz-sentence")?.textContent ?? "").replace(/\s+/g, " ").trim(),
		).toBe("With 2 seeds, an effect smaller than ±9.3 Elo is noise.");
		const svgs = [...(island?.querySelectorAll("svg[role='img']") ?? [])];
		expect(svgs).toHaveLength(2);
		for (const svg of svgs) {
			expect(svg.querySelectorAll("[data-dot]").length).toBeGreaterThan(30);
			expect(svg.querySelectorAll("[data-threshold]")).toHaveLength(2);
			expect(svg.textContent).toContain("tournament noise, 90 %: ±6.4");
		}
	});
	it("the details list every group of dots as text", () => {
		const items = [...doc.querySelectorAll("details .nz-list li")];
		expect(items).toHaveLength(3);
		expect(items[2]?.textContent).toContain("Changes I adopted");
	});
});
