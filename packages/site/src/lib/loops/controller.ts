/**
 * Loop playback controller: plays `video[data-loop]` only while ≥ 25 % visible
 * and motion is not paused; reveals the video on its first `playing`.
 *
 * Why: loops are `preload="none"` with no `autoplay`, so nothing downloads or
 * decodes until the card is near the viewport. Disposal deliberately never
 * pauses (the `transition:persist`ed node must keep playing through a view
 * transition). Dependencies are injected so tests can fake them.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
 */
import { isMotionPaused, MOTION_EVENT } from "../motion";

/**
 * Injectable environment for `mountLoops`.
 *
 * Why: lets unit tests fake IntersectionObserver and motion state.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export interface LoopDeps {
	createObserver: (
		cb: IntersectionObserverCallback,
		opts: IntersectionObserverInit,
	) => IntersectionObserver;
	isPaused: () => boolean;
	saveData: () => boolean;
	doc: Document;
}

function defaultDeps(): LoopDeps {
	return {
		createObserver: (cb, opts) => new IntersectionObserver(cb, opts),
		isPaused: isMotionPaused,
		saveData: () =>
			(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
			true,
		doc: document,
	};
}

/**
 * Observe every `video[data-loop]` under `root`; returns a disposer.
 *
 * Why: policy `allowed = !paused && !saveData`; `play()` rejections (iOS Low
 * Power Mode) leave the poster showing. The disposer disconnects listeners only.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function mountLoops(root: ParentNode, deps: LoopDeps = defaultDeps()): () => void {
	const videos = [...root.querySelectorAll<HTMLVideoElement>("video[data-loop]")];
	const visible = new Set<HTMLVideoElement>();
	const cleanups: (() => void)[] = [];
	let disposed = false;

	const allowed = (): boolean => !deps.isPaused() && !deps.saveData();
	const start = (v: HTMLVideoElement): void => {
		v.play().catch(() => {
			/* NotAllowedError etc.: keep the poster */
		});
	};
	const sync = (): void => {
		const ok = allowed() && deps.doc.visibilityState !== "hidden";
		for (const v of videos) {
			if (ok && visible.has(v)) start(v);
			else v.pause();
		}
	};

	for (const v of videos) {
		const reveal = (): void => v.setAttribute("data-ready", "");
		v.addEventListener("playing", reveal, { once: true });
		cleanups.push(() => v.removeEventListener("playing", reveal));
	}

	const io = deps.createObserver(
		(entries) => {
			if (disposed) return;
			for (const e of entries) {
				const v = e.target;
				if (!(v instanceof HTMLVideoElement)) continue;
				if (e.isIntersecting) {
					visible.add(v);
					if (allowed() && deps.doc.visibilityState !== "hidden") start(v);
				} else {
					visible.delete(v);
					v.pause();
				}
			}
		},
		{ threshold: 0.25, rootMargin: "200px 0px" },
	);
	for (const v of videos) io.observe(v);

	const onChange = (): void => {
		if (!disposed) sync();
	};
	deps.doc.addEventListener(MOTION_EVENT, onChange);
	deps.doc.addEventListener("visibilitychange", onChange);
	cleanups.push(
		() => deps.doc.removeEventListener(MOTION_EVENT, onChange),
		() => deps.doc.removeEventListener("visibilitychange", onChange),
	);

	return () => {
		disposed = true;
		io.disconnect();
		for (const c of cleanups) c();
	};
}

let dispose: (() => void) | undefined;
let bound = false;

function remount(): void {
	dispose?.();
	dispose = mountLoops(document);
}

/**
 * Wire the controller to the page lifecycle (idempotent).
 *
 * Why: on a full load, no loop bytes are requested before window `load`; on
 * ClientRouter navigations it mounts at `astro:page-load` and disposes at
 * `astro:before-swap`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function bindLoops(): void {
	if (bound) return;
	bound = true;
	document.addEventListener("astro:before-swap", () => {
		dispose?.();
		dispose = undefined;
	});
	document.addEventListener("astro:page-load", remount);
	if (document.readyState === "complete") remount();
	else window.addEventListener("load", remount, { once: true });
}
