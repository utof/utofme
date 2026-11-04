// @vitest-environment node
/**
 * `FreePeekBlock` (F8): caption, the four-panel SSR strip (AC12.3), the stamp, `<details>` and
 * exactly one `astro-island[client="visible"]` with props of at most 2 KB (AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import FreePeekBlock from "../../src/components/article/FreePeekBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(FreePeekBlock, {
		props: { number: 10 },
		slots: { caption: "Caption words.", try: "step." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("FreePeekBlock", () => {
	it("is a labelled text-width figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f8[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f8-cap");
		expect(fig?.classList.contains("fig--text")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 10.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*step\./);
	});

	it("carries the stamp of the peek readout (block 28, 5v5)", () => {
		expect(doc.querySelector("figcaption [data-stamp]")?.textContent).toMatch(
			/block 28 \(5v5\), 2026-11-02/,
		);
	});

	it("AC12.3: the no-JS strip has four panels, each a labelled image, with the fact rate", () => {
		const panels = doc.querySelectorAll("astro-island li.fp-panel");
		expect(panels).toHaveLength(4);
		for (const p of Array.from(panels)) expect(p.querySelector("[role='img']")).not.toBeNull();
		expect(doc.querySelector("astro-island")?.textContent).toMatch(/hit 17.%/);
		expect(doc.querySelector("details")).not.toBeNull();
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "FreePeek" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("57");
		expect(props).toContain("64");
	});

	it("draws no curve commands", () => {
		for (const p of Array.from(doc.querySelectorAll("astro-island path")))
			expect(p.getAttribute("d") ?? "").not.toMatch(/[CcQqSsTtAa]/);
	});
});
