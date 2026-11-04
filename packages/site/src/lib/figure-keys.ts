/**
 * Shared keyboard helpers for figure islands.
 *
 * Why: draggable things move with arrows (1 step, Shift = 5) and groups use a roving tabindex.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (keyboard contract in "Figures: common contract")
 */

/**
 * Arrow key → `[dx, dy]` (y grows downward, as on screen); Shift multiplies by 5. `null` for any
 * other key.
 *
 * Why: one mapping for tokens, smokes and sliders.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4
 */
export function arrowDelta(
	event: Pick<KeyboardEvent, "key" | "shiftKey">,
): [number, number] | null {
	const n = event.shiftKey ? 5 : 1;
	switch (event.key) {
		case "ArrowUp":
			return [0, -n];
		case "ArrowDown":
			return [0, n];
		case "ArrowLeft":
			return [-n, 0];
		case "ArrowRight":
			return [n, 0];
		default:
			return null;
	}
}

/**
 * Next focus index in a roving-tabindex group of `count` items: Right/Down step forward, Left/Up
 * back (both wrap), Home and End jump; any other key keeps `index`.
 *
 * Why: only one item of a group is tabbable; arrows move within it.
 *
 * @see https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex
 */
export function rovingTabindex(count: number, index: number, key: string): number {
	if (count <= 0) return 0;
	switch (key) {
		case "ArrowRight":
		case "ArrowDown":
			return (index + 1) % count;
		case "ArrowLeft":
		case "ArrowUp":
			return (index - 1 + count) % count;
		case "Home":
			return 0;
		case "End":
			return count - 1;
		default:
			return index;
	}
}
