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
	// Bumped on every show() so a slow decode never overwrites a newer choice.
	let ticket = 0;
	let clearTimer: ReturnType<typeof setTimeout> | undefined;

	const warm = (j: number): void => {
		const src = buttons[stepIndex(j, 0, buttons.length)]?.dataset["full"];
		if (src) new Image().src = src;
	};

	/**
	 * Loads and decodes the image for button `i`, then swaps image, size and caption
	 * in one go (so the caption never leads the picture). Opens the dialog on the
	 * first call. Why: the old code opened a caption-only strip that snapped to size
	 * when the image arrived (M3-06) and showed the next caption over the previous
	 * picture while stepping (M3-07). A slow connection falls back after 250 ms.
	 */
	const show = async (i: number): Promise<void> => {
		const b = buttons[i];
		if (!b) return;
		const mine = ++ticket;
		const full = b.dataset["full"] ?? "";
		const pre = new Image();
		pre.src = full;
		await Promise.race([
			("decode" in pre ? pre.decode() : Promise.resolve()).catch(() => undefined),
			new Promise<void>((r) => setTimeout(r, 250)),
		]);
		if (mine !== ticket) return;
		clearTimeout(clearTimer);
		current = i;
		opener = b;
		const w = Number(b.dataset["w"]);
		const h = Number(b.dataset["h"]);
		const nw = w > 0 ? w : pre.naturalWidth;
		const nh = h > 0 ? h : pre.naturalHeight;
		if (nw > 0 && nh > 0) {
			img.style.setProperty("--w", String(nw));
			img.style.setProperty("--ar", String(nw / nh));
		}
		img.src = full;
		img.alt = b.dataset["alt"] ?? "";
		cap.textContent = b.dataset["caption"] ?? "";
		if (!dialog.open) dialog.showModal();
		warm(i + 1);
		warm(i - 1);
	};

	buttons.forEach((b, i) => {
		b.addEventListener("click", () => void show(i));
	});
	dialog.addEventListener("click", (e) => {
		// Why: the dialog box is the backdrop's hit target; the figure inside is not.
		const t = e.target;
		if (t === dialog || (t instanceof Element && t.closest("[data-close]"))) dialog.close();
	});
	dialog.addEventListener("keydown", (e) => {
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			void show(stepIndex(current, e.key === "ArrowRight" ? 1 : -1, buttons.length));
		}
	});
	dialog.addEventListener("close", () => {
		ticket++;
		opener?.focus();
		// Why: keep the picture until the 120 ms exit fade has finished.
		clearTimeout(clearTimer);
		clearTimer = setTimeout(() => img.removeAttribute("src"), 200);
	});
	for (const n of dialog.querySelectorAll<HTMLElement>("[data-step]")) {
		n.addEventListener(
			"click",
			() => void show(stepIndex(current, Number(n.dataset["step"]), buttons.length)),
		);
	}
}
