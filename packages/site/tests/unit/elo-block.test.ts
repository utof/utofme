// @vitest-environment node
/**
 * `EloBlock` (F3): caption, SSR keyframe with the default claim, the strip, the 3v3 panel, the
 * no-JS data tables and exactly one `astro-island[client="visible"]` with props of at most 2 KB.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7 (AC7.4, AC16.3)
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import EloBlock from "../../src/components/article/EloBlock.astro";

let doc: Document;

beforeAll(async () => {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	const html = await c.renderToString(EloBlock, {
		props: { number: 6 },
		slots: { caption: "Caption words.", try: "switch maps." },
	});
	doc = parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
});

describe("EloBlock", () => {
	it("is a labelled figure with the number, caption and Try line", () => {
		const fig = doc.querySelector("figure#f3[data-figure]");
		expect(fig?.getAttribute("aria-labelledby")).toBe("f3-cap");
		expect(fig?.classList.contains("fig--wide")).toBe(true);
		expect(doc.querySelector("figcaption")?.textContent).toContain("Figure 6.");
		expect(doc.querySelector("figcaption em")?.textContent).toMatch(/Try:\s*switch maps\./);
	});

	it("has exactly one visible-hydrated island named Elo with props of at most 2 KB", () => {
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		const island = islands[0];
		expect(island?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(island?.getAttribute("opts") ?? "{}")).toMatchObject({ name: "Elo" });
		const props = island?.getAttribute("props") ?? "";
		expect(Buffer.byteLength(props, "utf8")).toBeLessThanOrEqual(2048);
		expect(props).toContain("elo/1");
		expect(props).not.toContain("data:application/json");
		expect(island?.querySelector(".fig-box")).not.toBeNull();
	});

	it("the keyframe already shows the claim: +96 (+94 to +98), as a role=img, in both layouts", () => {
		const svgs = [...doc.querySelectorAll("astro-island svg[role='img']")];
		expect(svgs).toHaveLength(2);
		for (const svg of svgs) {
			expect(svg.getAttribute("aria-label")).toContain("+96 (+94 to +98)");
			expect(svg.textContent).toContain("+96 (+94 to +98)");
			expect(svg.querySelector("[data-fact='elo.head.block2']")).not.toBeNull();
		}
	});

	it("lists the after-block-28 strip with each game named", () => {
		const items = [...doc.querySelectorAll(".el-after li")].map((li) => li.textContent ?? "");
		expect(items).toHaveLength(5);
		expect(items.some((t) => /\+29 in the snap game, −15 in today's game/.test(t))).toBe(true);
	});

	it("has a separate 3v3 panel with its own labelled graphic", () => {
		const panel = doc.querySelector(".el-panel svg[role='img']");
		expect(panel?.getAttribute("aria-label")).toContain("Different game");
		expect(panel?.querySelectorAll("[data-panel-line]")).toHaveLength(2);
	});

	it("AC7.4: the no-JS tables have one row per point of each map set", () => {
		const tables = [...doc.querySelectorAll("details table.el-table")];
		expect(tables.map((t) => t.querySelectorAll("tbody tr").length)).toEqual([10, 10, 3]);
		expect(doc.querySelector("details")?.textContent).toContain("+94 to +98");
	});
});
