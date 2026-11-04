// @vitest-environment node
/**
 * `Figure` and `Stamp`: numbering, caption, Try line, stamp, details, reserved box, widths.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Figures: common contract
 */
import { loadRenderers } from "astro:container";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Figure from "../../src/components/article/Figure.astro";
import Stamp from "../../src/components/article/Stamp.astro";

/** Drops scoped-style ids so attribute order and spacing are stable. */
function stripCid(html: string): string {
	return html.replace(/\sdata-astro-cid-[a-z0-9]+/g, "");
}

async function figure(
	props: Record<string, unknown>,
	slots: Record<string, string> = {},
): Promise<string> {
	const c = await AstroContainer.create({ renderers: await loadRenderers([]) });
	return stripCid(await c.renderToString(Figure, { props, slots }));
}

describe("Figure", () => {
	it("renders a labelled figure with the number, caption and body", async () => {
		const html = await figure(
			{ id: "f2", number: 3 },
			{ default: "<p>body</p>", caption: "A caption." },
		);
		expect(html).toMatch(/<figure id="f2"[^>]*data-figure/);
		expect(html).toContain('aria-labelledby="f2-cap"');
		expect(html).toContain('<figcaption id="f2-cap">');
		expect(html).toContain("Figure 3.");
		expect(html).toContain("A caption.");
		expect(html).toContain("<p>body</p>");
	});

	it("renders the Try line only with the try slot, italic, prefixed", async () => {
		const without = await figure({ id: "f1", number: 1 });
		expect(without).not.toContain("Try:");
		const html = await figure({ id: "f1", number: 1 }, { try: "drag the smoke." });
		expect(html).toMatch(/<em>\s*Try: drag the smoke\.\s*<\/em>/);
	});

	it("renders the Stamp from measuredOn, and none without it", async () => {
		expect(await figure({ id: "f9", number: 9 })).not.toContain("data-stamp");
		const n = await figure({ id: "f9", number: 9, measuredOn: 28 });
		expect(n).toContain("data-stamp");
		expect(n).toContain("as measured on block 28");
		const t = await figure({ id: "f9", number: 9, measuredOn: "block 20, Mirage" });
		expect(t).toContain("as measured on block 20, Mirage");
	});

	it("renders <details> only with the details slot", async () => {
		expect(await figure({ id: "f4", number: 8 })).not.toContain("<details");
		const html = await figure({ id: "f4", number: 8 }, { details: "<table></table>" });
		expect(html).toMatch(/<details[^>]*>\s*<summary>Data and description<\/summary>/);
		expect(html).toContain("<table></table>");
	});

	it("reserves the box from aspect and minBlock", async () => {
		const html = await figure({ id: "f2", number: 2, aspect: "1 / 1", minBlock: "24rem" });
		expect(html).toMatch(
			/class="fig-reserve"[^>]*style="aspect-ratio:1 \/ 1;min-block-size:24rem"/,
		);
		expect(await figure({ id: "f2", number: 2 })).not.toMatch(/fig-reserve[^>]*style=/);
	});

	it.each(["text", "wide", "full"] as const)("maps width %s to a fig--%s class", async (width) => {
		const html = await figure({ id: "fx", number: 1, width });
		expect(html).toMatch(new RegExp(`<figure[^>]*class="[^"]*\\bfig--${width}\\b`));
	});

	it("defaults to the text width", async () => {
		expect(await figure({ id: "fx", number: 1 })).toMatch(/class="[^"]*\bfig--text\b/);
	});
});

describe("Stamp", () => {
	it("formats a number as 'block N'", async () => {
		const c = await AstroContainer.create({ renderers: await loadRenderers([]) });
		const html = await c.renderToString(Stamp, { props: { measuredOn: 20 } });
		expect(html).toContain("as measured on block 20");
	});
});
