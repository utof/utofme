/**
 * Site-wide "Pause motion" state (WCAG 2.2.2 pause/stop/hide).
 *
 * Why: looping media runs > 5 s, so users need a persistent, page-level control.
 * Stored in `localStorage["utofme:motion"]` (`"paused"` | `"playing"`); when the
 * key is absent the state follows `prefers-reduced-motion`, so reduced-motion
 * users get posters by default and can opt in. Mirrored on `<html data-motion>`
 * so CSS (hover zoom) can react without JS, and broadcast as `utofme:motion`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 * @see https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
 */

/** localStorage key holding `"paused"` or `"playing"`. */
export const MOTION_KEY = "utofme:motion";
/**
 * `document` CustomEvent name fired on every change; `detail: { paused: boolean }`.
 *
 * Why: decouples the toggle button from the loop controller.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export const MOTION_EVENT = "utofme:motion";

function readStored(): string | null {
	try {
		return localStorage.getItem(MOTION_KEY);
	} catch {
		return null;
	}
}

function prefersReducedMotion(): boolean {
	return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Pure truth table: stored value × reduced-motion → paused.
 *
 * Why: AC6.2 checks it exhaustively. An explicit `"paused"`/`"playing"` wins;
 * anything else defers to the OS preference.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function resolvePaused(stored: string | null, reducedMotion: boolean): boolean {
	if (stored === "paused") return true;
	if (stored === "playing") return false;
	return reducedMotion;
}

/**
 * Whether loops should currently be paused.
 *
 * Why: the controller and the toggle read one source of truth.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function isMotionPaused(): boolean {
	return resolvePaused(readStored(), prefersReducedMotion());
}

/**
 * Reflect the current state on `<html data-motion>`.
 *
 * Why: CSS hook (hover zoom) and re-applied after ClientRouter swaps, which drop it.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function syncMotionAttribute(doc: Document = document): void {
	doc.documentElement.dataset["motion"] = isMotionPaused() ? "paused" : "playing";
}

/**
 * Persist an explicit choice, mirror it on `<html>` and notify listeners.
 *
 * Why: the toggle button is the only writer.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function setMotionPaused(paused: boolean): void {
	try {
		localStorage.setItem(MOTION_KEY, paused ? "paused" : "playing");
	} catch {
		/* storage blocked: the in-memory attribute below still applies for this page */
	}
	document.documentElement.dataset["motion"] = paused ? "paused" : "playing";
	document.dispatchEvent(new CustomEvent(MOTION_EVENT, { detail: { paused } }));
}
