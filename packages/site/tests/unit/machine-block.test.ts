// @vitest-environment node
/**
 * `MachineBlock` (F6): caption, SSR keyframe with the highlighted training loop and the "4 / 9"
 * counter, a `<dl>` of the 18 boxes (AC10.2), an `<ol>` of the 9 stages and exactly one
 * `astro-island[client="visible"]` with props of at most 2 KB.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10 (AC10.2, AC16.3)
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import MachineBlock from "../../src/components/article/MachineBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(MachineBlock, {
		props: { number: 4 },
		slots: { caption: "Caption words.", try: "press Next." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("MachineBlock", () => {
	it("is a labelled full-width figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f6[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f6-cap");
		expect(fig?.classList.contains("fig--full")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 4.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*press Next\./);
	});
	it("has exactly one visible-hydrated island named Machine with props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "Machine" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("architecture/1");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
	});
	it("the keyframe draws all 18 boxes and 27 arrows in both layouts, stage 4 highlighted, counter 4 / 9", () => {
		const island = doc.querySelector("astro-island");
		const svgs = [...(island?.querySelectorAll("svg[role='img']") ?? [])];
		expect(svgs).toHaveLength(2);
		for (const svg of svgs) {
			expect(svg.querySelectorAll(".mc-node")).toHaveLength(18);
			expect(svg.querySelectorAll(".mc-edge")).toHaveLength(27);
			expect(svg.querySelectorAll(".mc-node.on").length).toBeGreaterThan(2);
			expect(svg.querySelector(".mc-node.on")?.textContent).toBeTruthy();
		}
		expect(island?.querySelector(".mc-count")?.textContent?.trim()).toBe("4 / 9");
		expect(island?.querySelector(".mc-title")?.textContent).toBe("4. Train");
	});
	it("AC10.2: the no-JS dl lists the 18 boxes and the ol the 9 stages", () => {
		expect(doc.querySelectorAll("details dl dt")).toHaveLength(18);
		expect(doc.querySelectorAll("details dl dd")).toHaveLength(18);
		expect(doc.querySelectorAll("details ol li")).toHaveLength(9);
	});
	it("ships no file name, path or private word in the markup", () => {
		const html = doc.documentElement.outerHTML;
		expect(html).not.toMatch(/\.(py|pkl|npz|sh)\b|journal|isaac|release asset/i);
	});
});
