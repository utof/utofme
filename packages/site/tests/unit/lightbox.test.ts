/**
 * Gallery lightbox: index stepping and dialog wiring.
 *
 * @see packages/specs/reviews/ui/polish.md (P-03)
 */
import { describe, expect, it } from "vitest";
import { installLightbox, stepIndex } from "../../src/lib/lightbox.ts";

/** Returns `v` or throws: a typed stand-in for `!`. */
function must<T>(v: T | null | undefined): T {
	if (v == null) throw new Error("missing element");
	return v;
}

describe("stepIndex", () => {
	it("wraps both ways", () => {
		expect(stepIndex(0, -1, 3)).toBe(2);
		expect(stepIndex(2, 1, 3)).toBe(0);
		expect(stepIndex(1, 1, 3)).toBe(2);
		expect(stepIndex(0, 1, 0)).toBe(0);
	});
});

describe("installLightbox", () => {
	function setup() {
		document.body.innerHTML = `
			<button data-zoom data-full="/a.png" data-alt="A" data-caption="cap a"></button>
			<button data-zoom data-full="/b.png" data-alt="B" data-caption="cap b"></button>
			<dialog class="lightbox"><figure><img alt=""><figcaption></figcaption></figure>
			<button data-close></button><button data-step="1"></button></dialog>`;
		const dialog = must(document.querySelector<HTMLDialogElement>("dialog"));
		// happy-dom lacks showModal/close semantics we need; stub minimally.
		dialog.showModal = () => dialog.setAttribute("open", "");
		dialog.close = () => {
			dialog.removeAttribute("open");
			dialog.dispatchEvent(new Event("close"));
		};
		installLightbox();
		return dialog;
	}
	it("opens with the clicked image + caption, steps, and returns focus", () => {
		const dialog = setup();
		const [a, b] = document.querySelectorAll<HTMLButtonElement>("button[data-zoom]");
		must(b).click();
		expect(dialog.hasAttribute("open")).toBe(true);
		expect(must(dialog.querySelector("img")).getAttribute("src")).toBe("/b.png");
		expect(must(dialog.querySelector("figcaption")).textContent).toBe("cap b");
		dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(must(dialog.querySelector("img")).getAttribute("src")).toBe("/a.png");
		must(dialog.querySelector<HTMLElement>("[data-close]")).click();
		expect(dialog.hasAttribute("open")).toBe(false);
		expect(document.activeElement).toBe(a);
	});
});
