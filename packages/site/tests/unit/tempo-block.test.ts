// @vitest-environment node
/**
 * `TempoBlock` (F4): caption, SSR keyframe (revealed, block 28), `<details>` table, the stamp and
 * exactly one `astro-island[client="visible"]` with props of at most 2 KB (AC8.3, AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import TempoBlock from "../../src/components/article/TempoBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(TempoBlock, {
		props: { number: 8 },
		slots: { caption: "Caption words.", try: "drag the marker." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("TempoBlock", () => {
	it("is a labelled figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f4[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f4-cap");
		expect(fig?.classList.contains("fig--wide")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 8.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*drag the marker\./);
	});

	it("AC8.3: carries the stamp with block, rerun date and round counts", () => {
		const stamp = doc.querySelector("[data-stamp]")?.textContent ?? "";
		expect(stamp).toBe(
			"Agents as measured on block 28 (5v5), 2026-11-04 rerun, 1,710 rounds; pros: 224 pro maps of 2026, 4,825 rounds",
		);
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "Tempo" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("tempo/1");
		expect(props).toMatch(/\.json/);
		expect(props).not.toContain("data:application/json");
	});

	it("renders the revealed keyframe (role=img) inside the island root, without curves", () => {
		const island = doc.querySelector("astro-island");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
		const img = island?.querySelector("[role='img']");
		expect(img?.getAttribute("aria-label")).toMatch(/9\.6.s.*22\.8.s/);
		expect(island?.textContent).toMatch(/22\.8.s \(22\.1 to 23\.6.s\)/);
		for (const p of Array.from(island?.querySelectorAll("path") ?? []))
			expect(p.getAttribute("d") ?? "", p.getAttribute("class") ?? "").not.toMatch(/[CcQqSsTtAa]/);
	});

	it("has a details table: 5 series x 3 metrics", () => {
		expect(doc.querySelector("details")).not.toBeNull();
		expect(doc.querySelectorAll("details tbody tr")).toHaveLength(15);
	});
});
