/**
 * Linked numbers (AC4.6): hover on a prose fact marks figure marks with the same key.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.6)
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { linkFacts } from "../../src/lib/figure-link";

function m(id: string): HTMLElement {
	const el = document.getElementById(id);
	if (!el) throw new Error(`missing #${id}`);
	return el;
}

let root: HTMLElement;
let prose: HTMLElement;
beforeEach(() => {
	document.body.innerHTML = `
		<p><data id="p" data-fact="elo.head.block2" value="96">+96</data> and <data id="q" data-fact="other">x</data></p>
		<div id="root"><span id="m1" data-fact="elo.head.block2"></span><span id="m2" data-fact="other"></span><span id="m3"></span></div>`;
	root = m("root");
	prose = m("p");
});
afterEach(() => {
	document.body.innerHTML = "";
});

describe("linkFacts (AC4.6)", () => {
	it("hover adds and leave removes .is-linked on matching marks only", () => {
		const off = linkFacts(root);
		prose.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		expect(m("m1").classList.contains("is-linked")).toBe(true);
		expect(m("m2").classList.contains("is-linked")).toBe(false);
		prose.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
		expect(m("m1").classList.contains("is-linked")).toBe(false);
		off();
	});
	it("focus works like hover", () => {
		const off = linkFacts(root);
		prose.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		expect(m("m1").classList.contains("is-linked")).toBe(true);
		prose.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
		expect(m("m1").classList.contains("is-linked")).toBe(false);
		off();
	});
	it("the disposer removes its listeners and any left-over mark", () => {
		const off = linkFacts(root);
		prose.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		off();
		expect(m("m1").classList.contains("is-linked")).toBe(false);
		prose.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		expect(m("m1").classList.contains("is-linked")).toBe(false);
	});
});
