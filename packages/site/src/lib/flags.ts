/**
 * Tiny URL/localStorage feature-flag helper.
 *
 * Why: experimental, off-by-default effects (e.g. the masonry hover dither) must
 * cost zero JS when disabled, so the check that decides whether to load them has
 * to be a few lines with no dependencies. The flag is switched by the URL and
 * persisted, so a reviewer can send `/?dither` once and keep seeing the effect.
 *
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 */

/** localStorage key prefix: flag `dither` lives at `utofme:dither` (value `"1"`). */
const KEY_PREFIX = "utofme:";

/**
 * Minimal storage surface the helper needs (satisfied by `Storage`).
 *
 * Why: structural type so unit tests can pass a plain in-memory object and so
 * callers never depend on the DOM `Storage` global.
 *
 * @see packages/site/tests/unit/flags.test.ts
 */
export interface FlagStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Resolve a boolean flag from the URL query, falling back to persisted state.
 *
 * `?name` or `?name=1` (any value other than `0`) turns the flag on and persists
 * `localStorage['utofme:<name>']='1'`; `?name=0` turns it off and clears the key;
 * with no such param the persisted value decides. Storage errors (Safari private
 * mode, sandboxed iframes) are swallowed — the URL param still works for that load.
 *
 * Why: see module header — zero-cost gate for experimental effects.
 *
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 */
export function resolveFlag(name: string, search: string, storage: FlagStorage | null): boolean {
	const key = `${KEY_PREFIX}${name}`;
	const params = new URLSearchParams(search);
	if (params.has(name)) {
		const on = params.get(name) !== "0";
		try {
			if (on) storage?.setItem(key, "1");
			else storage?.removeItem(key);
		} catch {
			// Storage unavailable: the param still applies to this page load.
		}
		return on;
	}
	try {
		return storage?.getItem(key) === "1";
	} catch {
		return false;
	}
}

/**
 * `window.localStorage` or `null` when access throws.
 *
 * Why: merely reading `window.localStorage` can throw (blocked cookies, sandboxed
 * iframe); callers pass the result straight to {@link resolveFlag}.
 *
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 */
export function browserStorage(): FlagStorage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
