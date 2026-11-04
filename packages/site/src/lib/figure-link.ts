/**
 * "Linked numbers": prose numbers highlight the matching marks in a figure.
 *
 * Why: decorative only; every value is also in the figure's text equivalents.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.6)
 */

/**
 * Hovering (or focusing) a prose `<data data-fact="k">` adds `.is-linked` to every
 * `[data-fact="k"]` inside `root`; leaving removes it. Returns the disposer, which also clears
 * any mark still lit.
 *
 * Why: one delegated listener pair on `document` instead of one per number.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.6)
 */
export function linkFacts(root: Element): () => void {
	let lit: Element[] = [];
	const clear = (): void => {
		for (const el of lit) el.classList.remove("is-linked");
		lit = [];
	};
	const factOf = (e: Event): string | null => {
		const t = e.target;
		if (!(t instanceof Element)) return null;
		const d = t.closest("data[data-fact]");
		return d && !root.contains(d) ? d.getAttribute("data-fact") : null;
	};
	const on = (e: Event): void => {
		const key = factOf(e);
		if (key === null) return;
		clear();
		lit = [...root.querySelectorAll("[data-fact]")].filter(
			(el) => el.getAttribute("data-fact") === key,
		);
		for (const el of lit) el.classList.add("is-linked");
	};
	const off = (e: Event): void => {
		if (factOf(e) !== null) clear();
	};
	const pairs: Array<[string, (e: Event) => void]> = [
		["mouseover", on],
		["focusin", on],
		["mouseout", off],
		["focusout", off],
	];
	for (const [type, fn] of pairs) document.addEventListener(type, fn);
	return () => {
		for (const [type, fn] of pairs) document.removeEventListener(type, fn);
		clear();
	};
}
