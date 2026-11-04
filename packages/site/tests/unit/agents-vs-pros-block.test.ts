// @vitest-environment node
/**
 * `AgentsVsProsBlock` (F11): caption, SSR keyframe with eleven rows each carrying its stamp, the
 * details table (AC15.2) and exactly one `astro-island[client="visible"]` with props of at most
 * 2 KB (AC16.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import AgentsVsProsBlock from "../../src/components/article/AgentsVsProsBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(AgentsVsProsBlock, {
		props: { number: 9 },
		slots: { caption: "Caption words.", try: "sort." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("AgentsVsProsBlock", () => {
	it("is a labelled figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f11[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f11-cap");
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 9.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*sort\./);
	});

	it("AC15.1: the keyframe has eleven rows, each with a stamp, sorted by gap (flashes first)", () => {
		const rows = Array.from(doc.querySelectorAll("astro-island li.av-row"));
		expect(rows).toHaveLength(11);
		for (const r of rows)
			expect(r.querySelector("[data-stamp]")?.textContent).toMatch(
				/block 28 · 5v5|3v3 agent · 2026-10-25/,
			);
		expect(rows[0]?.getAttribute("data-row")).toBe("flashes");
		expect(doc.querySelector("astro-island [role='img']")).not.toBeNull();
	});

	it("AC15.2: the details table has one row per data row", () => {
		expect(doc.querySelectorAll("details tbody tr")).toHaveLength(11);
	});

	it("has exactly one visible-hydrated island with decoded props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({
			name: "AgentsVsPros",
		});
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("agents_vs_pros/1");
		expect(props).not.toContain("data:application/json");
	});

	it("draws no curve commands", () => {
		for (const p of Array.from(doc.querySelectorAll("astro-island path")))
			expect(p.getAttribute("d") ?? "").not.toMatch(/[CcQqSsTtAa]/);
	});
});
