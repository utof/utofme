/**
 * Gallery lightbox: a native `<dialog>` that shows one gallery still at full
 * resolution with its caption.
 *
 * Why: gallery figures sit in a ~600 px column, so UI screenshots with small
 * text need an enlarge step. A native `<dialog>` gives focus trapping, Esc and
 * the top layer for free; this module only adds backdrop click, arrow-key
 * stepping and focus return to the thumbnail. No dependency, ~1 KB gzipped.
 *
 * @see packages/specs/reviews/ui/polish.md (P-03)
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
 */

/**
 * Returns the index reached by stepping `delta` from `index` in a list of
 * `count`, wrapping at both ends (0 when the list is empty).
 *
 * Why: arrow keys loop through the gallery instead of dead-ending.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
 */
export function stepIndex(index: number, delta: number, count: number): number {
	if (count <= 0) return 0;
	return (((index + delta) % count) + count) % count;
}

/**
 * Wires every `[data-zoom]` button under `root` to the `dialog.lightbox`.
 *
 * Why: idempotent (a `data-lightbox-bound` flag) because it runs on every
 * `astro:page-load`; re-binding would open the dialog twice per click.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
 */
export function installLightbox(root: ParentNode = document): void {
	const dialog = root.querySelector<HTMLDialogElement>("dialog.lightbox");
	if (!dialog || dialog.dataset["lightboxBound"] === "1") return;
	dialog.dataset["lightboxBound"] = "1";
	const buttons = [...root.querySelectorAll<HTMLButtonElement>("button[data-zoom]")];
	const img = dialog.querySelector<HTMLImageElement>("img");
	const cap = dialog.querySelector<HTMLElement>("figcaption");
	if (!img || !cap || buttons.length === 0) return;
	let current = 0;
	let opener: HTMLButtonElement | undefined;

	const show = (i: number): void => {
		const b = buttons[i];
		if (!b) return;
		current = i;
		opener = b;
		img.src = b.dataset["full"] ?? "";
		img.alt = b.dataset["alt"] ?? "";
		cap.textContent = b.dataset["caption"] ?? "";
	};

	buttons.forEach((b, i) => {
		b.addEventListener("click", () => {
			show(i);
			dialog.showModal();
		});
	});
	dialog.addEventListener("click", (e) => {
		// Why: the dialog box is the backdrop's hit target; the figure inside is not.
		const t = e.target;
		if (t === dialog || (t instanceof Element && t.closest("[data-close]"))) dialog.close();
	});
	dialog.addEventListener("keydown", (e) => {
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			show(stepIndex(current, e.key === "ArrowRight" ? 1 : -1, buttons.length));
		}
	});
	dialog.addEventListener("close", () => {
		img.removeAttribute("src");
		opener?.focus();
	});
	for (const n of dialog.querySelectorAll<HTMLElement>("[data-step]")) {
		n.addEventListener("click", () =>
			show(stepIndex(current, Number(n.dataset["step"]), buttons.length)),
		);
	}
}
