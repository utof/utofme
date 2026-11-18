/**
 * "One row open at a time" for the home page's expandable project rows.
 *
 * Why: rows are native `<details name="…">` elements, which browsers already
 * keep exclusive (and which work with no JS at all). Browsers without the
 * `name` attribute (before Chromium 120, Safari 17.2, Firefox 130) would let
 * several rows stay open and break the dense grid, so this closes the others.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details#name
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */

/**
 * Closes every open row in `all` except `opened`.
 *
 * Why: pure DOM in, DOM out, so it is unit-tested with happy-dom.
 *
 * @see packages/site/tests/unit/home-rows.test.ts
 */
export function closeOthers(opened: HTMLDetailsElement, all: ArrayLike<HTMLDetailsElement>): void {
	for (const row of Array.from(all)) {
		if (row !== opened && row.open) row.open = false;
	}
}

/**
 * Keeps at most one `details[data-home-row]` open under `root`; returns a disposer.
 *
 * Why: `toggle` does not bubble, so one capture listener on the root replaces a
 * listener per row.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/toggle_event
 */
export function bindExclusiveRows(root: ParentNode = document): () => void {
	const onToggle = (event: Event): void => {
		const row = event.target;
		if (!(row instanceof HTMLDetailsElement) || !row.open) return;
		if (row.dataset["homeRow"] === undefined) return;
		closeOthers(row, root.querySelectorAll<HTMLDetailsElement>("details[data-home-row]"));
	};
	root.addEventListener("toggle", onToggle, true);
	return () => root.removeEventListener("toggle", onToggle, true);
}
