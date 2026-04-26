/**
 * Keyboard shortcut helpers for the Phase 2 FilterBar keyboard bindings.
 *
 * Why: a dedicated module keeps platform-specific modifier logic (Cmd vs Ctrl)
 * testable in isolation, decoupled from any Svelte or DOM lifecycle, and
 * Stryker-targetable as a unit.  `parseChord` and `isMod` are pure functions
 * with no navigator dependency — tests pass explicit platform overrides.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A parsed keyboard chord descriptor.
 *
 * Why: an explicit named interface lets `bindGlobalChord` and callers share
 * the same type without re-deriving it from the function signature.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
export interface ParsedChord {
	/** The key in lowercase (e.g. `"k"` for both `K` and `k`). */
	key: string;
	/** Whether the chord requires a platform-specific modifier (Cmd on mac, Ctrl elsewhere). */
	mod: boolean;
}

/**
 * Options accepted by `parseChord` and `bindGlobalChord`.
 *
 * Why: supplying an explicit `platform` override decouples tests from
 * `navigator.platform`, allowing pure unit tests with no real DOM.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
export interface ChordOptions {
	/**
	 * Override the platform used for `Mod` resolution.
	 * When omitted, `parseChord` detects from `navigator.userAgentData?.platform`
	 * or `navigator.platform`.
	 */
	platform?: "mac" | "others";
}

// ---------------------------------------------------------------------------
// isMod
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the event's modifier key matches the expected key for
 * the given platform: `metaKey` on `"mac"`, `ctrlKey` on `"others"`.
 *
 * Why: centralising the mac/others split here means `parseChord`'s `match`
 * and `bindGlobalChord`'s listener both use the same predicate, making the
 * platform logic Stryker-targetable in one place.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
export function isMod(
	e: Pick<KeyboardEvent, "metaKey" | "ctrlKey">,
	platform: "mac" | "others",
): boolean {
	return platform === "mac" ? e.metaKey : e.ctrlKey;
}

// ---------------------------------------------------------------------------
// detectPlatform
// ---------------------------------------------------------------------------

/**
 * Detects the current platform from browser navigator APIs.
 *
 * Why: isolated helper keeps the navigator dependency out of `parseChord`'s
 * signature and makes the fallback chain (platform string → "others")
 * testable in isolation. Uses `navigator.platform` (deprecated but widely
 * supported) rather than `navigator.userAgentData` to avoid a type cast —
 * `userAgentData` is not in the TypeScript `lib.dom.d.ts` definitions shipped
 * with the current Astro tsconfig, so accessing it would require a cast that
 * type-coverage flags as an untyped node.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
function detectPlatform(): "mac" | "others" {
	if (typeof navigator === "undefined") return "others";
	return navigator.platform.toLowerCase().startsWith("mac") ? "mac" : "others";
}

// ---------------------------------------------------------------------------
// parseChord
// ---------------------------------------------------------------------------

/**
 * Parses a chord specifier string like `"Mod+K"` or `"K"` into a
 * `ParsedChord` descriptor.
 *
 * Normalisation rules:
 * - The `Mod` token is case-insensitive (`mod+k` ≡ `Mod+K`).
 * - The key part is always lowercased in the returned object.
 * - Token order must be `Mod+Key` (modifier first); bare key is also valid.
 *
 * The `platform` option is forwarded to the returned chord's implicit match
 * context but does NOT affect the parsed shape — `parseChord` always returns
 * `{ key, mod }`.  Platform only matters at match-time (see `isMod`).
 *
 * Why: accepting an explicit `platform` override via `options` lets unit tests
 * exercise platform variants without touching `navigator`, keeping the helper
 * a pure function from the test's perspective.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
export function parseChord(spec: string, options?: ChordOptions): ParsedChord {
	// Suppress unused warning — platform stored for future match() attachment if needed.
	void options;
	const plusIdx = spec.indexOf("+");
	if (plusIdx !== -1) {
		const prefix = spec.slice(0, plusIdx);
		const key = spec.slice(plusIdx + 1);
		if (prefix.toLowerCase() === "mod") {
			return { key: key.toLowerCase(), mod: true };
		}
	}
	// Single-token bare key (e.g. "K" or "k")
	return { key: spec.toLowerCase(), mod: false };
}

// ---------------------------------------------------------------------------
// formatChord
// ---------------------------------------------------------------------------

/**
 * Serialises a `ParsedChord` back to its canonical string form.
 *
 * Canonical form: `Mod+<UPPERCASE_KEY>` when `mod` is true, `<UPPERCASE_KEY>`
 * otherwise.  This is the inverse of `parseChord` and is used in property
 * tests to verify the round-trip invariant.
 *
 * Why: a sibling `formatChord` function (rather than a `format()` method)
 * keeps the data shape a plain object, which is easier to spread/assert in
 * tests and avoids class-instance overhead.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
export function formatChord(parsed: ParsedChord): string {
	const upperKey = parsed.key.toUpperCase();
	return parsed.mod ? `Mod+${upperKey}` : upperKey;
}

// ---------------------------------------------------------------------------
// bindGlobalChord
// ---------------------------------------------------------------------------

/**
 * Attaches a `keydown` listener on `document` that fires `handler` whenever
 * the user presses the chord described by `spec`.
 *
 * **Client-only.** Throws immediately if called in an SSR/build-time context
 * where `document` is not defined.
 *
 * Why: failing fast with a clear message (rather than silently returning a
 * no-op teardown) surfaces mis-usage in build logs where a silent failure
 * would be invisible.  Mirrors the SSR guard in `writeState` (url-state.ts).
 *
 * Returns a teardown function.  Call it to remove the listener — required to
 * avoid leaks in Svelte `onDestroy` / React `useEffect` cleanup.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
export function bindGlobalChord(
	spec: string,
	handler: () => void,
	options?: ChordOptions,
): () => void {
	if (typeof document === "undefined") {
		throw new Error("bindGlobalChord is client-only; do not call from SSR/build-time code paths.");
	}
	const platform = options?.platform ?? detectPlatform();
	const parsed = parseChord(spec, options);

	const listener = (e: KeyboardEvent) => {
		const keyMatches = e.key.toLowerCase() === parsed.key;
		const modMatches = parsed.mod ? isMod(e, platform) : true;
		if (keyMatches && modMatches) {
			handler();
		}
	};

	document.addEventListener("keydown", listener);
	return () => {
		document.removeEventListener("keydown", listener);
	};
}
