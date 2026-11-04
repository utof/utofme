// @vitest-environment node
/**
 * `NotebookBlock` (F7): caption, SSR keyframe with the legend counts, the static timeline with
 * the ten starred entries as a list and exactly one `astro-island[client="visible"]`
 * with props of at most 2 KB.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (AC11.5, AC16.3)
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import NotebookBlock from "../../src/components/article/NotebookBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(NotebookBlock, {
		props: { number: 11 },
		slots: { caption: "Caption words.", try: "filter to reverted." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("NotebookBlock", () => {
	it("is a labelled full-width figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f7[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f7-cap");
		expect(fig?.classList.contains("fig--full")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 11.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*filter to reverted\./);
	});
	it("has exactly one visible-hydrated island named Notebook with props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "Notebook" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("notebook/1");
		expect(props).toContain("notebook_parked/1");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
	});
	it("AC11.5: the keyframe lists the ten starred entries and counts the rest", () => {
		const island = doc.querySelector("astro-island");
		expect(island?.querySelectorAll(".nb-hl-list li")).toHaveLength(10);
		expect(island?.querySelector(".nb-hl-more")?.textContent).toContain("and 219 more entries");
	});
	it("the legend carries the outcome counts and the timeline box is reserved, not drawn", () => {
		const island = doc.querySelector("astro-island");
		const legend = (island?.querySelector(".nb-legend")?.textContent ?? "").replace(/\s+/g, " ");
		for (const c of ["kept 99", "reverted 41", "inconclusive 11", "parked 18", "tooling 60"])
			expect(legend).toContain(c);
		const ph = island?.querySelector(".nb-stage-ph");
		expect(ph?.getAttribute("style")).toMatch(/aspect-ratio:1000 \/ \d+/);
		expect(island?.querySelectorAll(".nb-mark")).toHaveLength(0);
	});
	it("ships no file name or private word in the markup", () => {
		const html = doc.documentElement.outerHTML;
		expect(html).not.toMatch(/\.(py|pkl|npz|sh)\b|journal|isaac|PARKED\.md/i);
	});
});
