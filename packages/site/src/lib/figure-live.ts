/**
 * Registry of live island resources (rAF loops, observers, listeners, fetches).
 *
 * Why: the e2e suite asserts `figuresLive` returns to "0" after ClientRouter round trips, which
 * proves islands clean up. The attribute is always on and carries a number only.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.6)
 */

let count = 0;

function mirror(): void {
	if (typeof document !== "undefined")
		document.documentElement.dataset["figuresLive"] = String(count);
}

/**
 * Register one live resource group and get its release function. Releasing twice is a no-op.
 *
 * Why: each island calls it once per resource group and releases in its disposer.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.6)
 */
export function registerLive(): () => void {
	let released = false;
	count += 1;
	mirror();
	return () => {
		if (released) return;
		released = true;
		count -= 1;
		mirror();
	};
}
