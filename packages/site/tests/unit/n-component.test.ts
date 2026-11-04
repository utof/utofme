// @vitest-environment node
/**
 * `<N k="…">` prints a keyed fact at its stored precision (spec P10-17, AC17.1).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17 (`<N>`)
 */
import { loadRenderers } from "astro:container";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import N from "../../src/components/article/N.astro";

const NBSP = " ";
const MINUS = "−";

async function render(props: Record<string, unknown>): Promise<string> {
	const c = await AstroContainer.create({ renderers: await loadRenderers([]) });
	return c.renderToString(N, { props });
}

describe("<N>", () => {
	it("renders <data class=n value data-fact> with the formatted number", async () => {
		const html = await render({ k: "tempo.pros.contact.median" });
		expect(html).toMatch(/^<data [^>]*>22\.8 s<\/data>$/);
		expect(html).toContain('class="n"');
		expect(html).toContain('value="22.8"');
		expect(html).toContain('data-fact="tempo.pros.contact.median"');
	});
	it("prints at the stored digits and sign", async () => {
		expect(await render({ k: "elo.head.block2" })).toContain(">+96</data>");
		expect(await render({ k: "elo.3v3.to5v5" })).toContain(`>${MINUS}94</data>`);
		expect(await render({ k: "tempo.pros.plant.median" })).toContain(`>74.7${NBSP}s</data>`);
	});
	it("ci appends the interval", async () => {
		expect(await render({ k: "elo.head.block2", ci: true })).toContain(">+96 (+94 to +98)</data>");
		expect(await render({ k: "tempo.pros.contact.median", ci: true })).toContain(
			`>22.8${NBSP}s (22.1 to 23.6)</data>`,
		);
	});
	it("alt prints the approved wording but keeps the machine value", async () => {
		const html = await render({ k: "sight.grid.extra", alt: true });
		expect(html).toContain(">1 in 7</data>");
		expect(html).toContain('value="14.6"');
	});
	it("a fact measured on a line gets the 'as measured on' title", async () => {
		const html = await render({ k: "agents.b28.holder" });
		expect(html).toMatch(/title="as measured on block 28 \(5v5\), \d{4}-\d{2}-\d{2}"/);
		expect(await render({ k: "util.agent.grenades" })).toMatch(
			/title="as measured on the 3v3 line, 2026-10-25"/,
		);
	});
	it("a fact without measuredOn has no title", async () => {
		expect(await render({ k: "elo.head.block2" })).not.toContain("title=");
	});
	it("an unknown key fails the build", async () => {
		await expect(render({ k: "no.such.key" })).rejects.toThrow(/unknown fact key/);
	});
	it("ci on a fact without an interval fails the build", async () => {
		await expect(render({ k: "net.params", ci: true })).rejects.toThrow(/interval/);
	});
});
