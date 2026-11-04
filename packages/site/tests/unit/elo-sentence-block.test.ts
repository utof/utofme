// @vitest-environment node
/**
 * `EloSentenceBlock` (F13): the plain sentence renders on the server, in a real `<span>` box, with
 * no slider until hydration, inside one `client:visible` island with tiny props.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15 (AC15.5, AC16.3)
 */
import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import EloSentenceBlock from "../../src/components/article/EloSentenceBlock.astro";

describe("EloSentenceBlock", () => {
	it("renders the plain sentence, no slider, in one visible island", async () => {
		const c = await AstroContainer.create({
			renderers: await loadRenderers([getSvelteRenderer()]),
		});
		const html = await c.renderToString(EloSentenceBlock);
		const doc = parseHTML(`<!doctype html><html><body><p>${html}</p></body></html>`).document;
		const islands = doc.querySelectorAll("astro-island");
		expect(islands).toHaveLength(1);
		expect(islands[0]?.getAttribute("client")).toBe("visible");
		expect(JSON.parse(islands[0]?.getAttribute("opts") ?? "{}")).toMatchObject({
			name: "EloSentence",
		});
		expect(Buffer.byteLength(islands[0]?.getAttribute("props") ?? "", "utf8")).toBeLessThan(200);
		const text = (islands[0]?.textContent ?? "").replace(/\s+/g, " ").trim();
		expect(text).toBe("an agent rated +96 higher wins 63 % of rounds");
		expect(islands[0]?.querySelector("[role='slider']")).toBeNull();
		expect(islands[0]?.querySelector("span.es")).not.toBeNull();
	});
});
