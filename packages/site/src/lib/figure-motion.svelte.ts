/**
 * Reactive "Pause motion" state for figure islands.
 *
 * Why: a rune module so islands read `state.paused` reactively. It is deliberately not Svelte's
 * `prefersReducedMotion`: the site's Pause motion toggle must win over the OS preference.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.5)
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
import { isMotionPaused, MOTION_EVENT } from "./motion";

/**
 * Live motion state; call once per island and `dispose` in its teardown.
 *
 * Why: seeded from `isMotionPaused()`, updated on the `utofme:motion` document event and on the
 * `prefers-reduced-motion` media change (which matters only while nothing is stored).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.5)
 */
export function motionState(): { readonly paused: boolean; dispose(): void } {
	let paused = $state(isMotionPaused());
	const refresh = (): void => {
		paused = isMotionPaused();
	};
	const mq =
		typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
	document.addEventListener(MOTION_EVENT, refresh);
	mq?.addEventListener("change", refresh);
	return {
		get paused() {
			return paused;
		},
		dispose() {
			document.removeEventListener(MOTION_EVENT, refresh);
			mq?.removeEventListener("change", refresh);
		},
	};
}
