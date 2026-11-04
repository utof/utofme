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

/** Shape published by LoopMedia in `data-banner-sources`. */
interface BannerRendition {
	width: number;
	height: number;
	sources: { url: string; type: string }[];
}

function isUnknownArray(x: unknown): x is readonly unknown[] {
	return Array.isArray(x);
}

function isSource(s: unknown): s is { url: string; type: string } {
	return (
		typeof s === "object" &&
		s !== null &&
		"url" in s &&
		typeof s.url === "string" &&
		"type" in s &&
		typeof s.type === "string"
	);
}

/**
 * Parse a frame's `data-banner-sources` attribute; `null` when absent or malformed.
 *
 * Why: the attribute is the only copy of the banner sources left on a page whose
 * `<video>` was replaced by the persisted card node.
 *
 * @see packages/specs/reports/ui-fix-banner.md (D-02)
 */
export function parseBannerSources(raw: string | null | undefined): BannerRendition | null {
	if (!raw) return null;
	try {
		const v: unknown = JSON.parse(raw);
		if (typeof v !== "object" || v === null) return null;
		if (!("width" in v && typeof v.width === "number")) return null;
		if (!("height" in v && typeof v.height === "number")) return null;
		if (!("sources" in v && isUnknownArray(v.sources) && v.sources.length > 0)) return null;
		const sources: { url: string; type: string }[] = [];
		for (const s of v.sources) {
			if (!isSource(s)) return null;
			sources.push({ url: s.url, type: s.type });
		}
		return { width: v.width, height: v.height, sources };
	} catch {
		return null;
	}
}

/**
 * After a card → banner morph, replace the persisted 768 px card `<video>` with the
 * 1920 px banner rendition.
 *
 * Why: `transition:persist` keeps the card node (and its card sources) alive through
 * the morph, so the banner would otherwise play an upscaled card loop (D-02). The
 * banner video is inserted ABOVE the card one, hidden until its first `playing`
 * (the controller reveals it), starts at the card video's `currentTime`, and the card
 * video is removed only then, so there is no black frame, jump or restart. When motion
 * is paused (or Save-Data is on) the card video is dropped at once and the sharp banner
 * poster shows. The new node has no persist id: going Back therefore mounts the card's
 * own card-rendition video instead of dragging the 1080p one onto the grid.
 *
 * @see packages/specs/reports/ui-fix-banner.md (D-02)
 */
export function upgradeBannerLoops(root: ParentNode, deps: LoopDeps = defaultDeps()): void {
	for (const frame of root.querySelectorAll<HTMLElement>("[data-banner-sources]")) {
		const old = frame.querySelector<HTMLVideoElement>('video[data-loop][data-loop-size="card"]');
		const banner = parseBannerSources(frame.getAttribute("data-banner-sources"));
		if (!old || !banner) continue;
		const next = old.cloneNode(false);
		if (!(next instanceof HTMLVideoElement)) continue;
		for (const a of ["data-ready", "data-astro-transition-persist"]) next.removeAttribute(a);
		next.setAttribute("data-loop-size", "banner");
		next.setAttribute("width", String(banner.width));
		next.setAttribute("height", String(banner.height));
		for (const s of banner.sources) {
			const el = frame.ownerDocument.createElement("source");
			el.setAttribute("src", s.url);
			el.setAttribute("type", s.type);
			next.append(el);
		}
		const at = old.currentTime;
		if (at > 0) next.currentTime = at;
		frame.append(next);
		if (deps.isPaused() || deps.saveData()) {
			old.remove();
			continue;
		}
		let removed = false;
		const drop = (): void => {
			if (removed) return;
			removed = true;
			old.remove();
		};
		// Why: one frame after `playing` so the banner video has painted before the card one goes.
		const settle = (): void => {
			if (next.requestVideoFrameCallback) next.requestVideoFrameCallback(drop);
			else setTimeout(drop, 100);
			setTimeout(drop, 500);
		};
		next.addEventListener(
			"playing",
			() => {
				// Why: loading took a few hundred ms, so re-align with the card loop before it goes.
				if (Math.abs(old.currentTime - next.currentTime) > 0.1) {
					next.addEventListener("seeked", settle, { once: true });
					next.currentTime = old.currentTime;
					setTimeout(drop, 500);
				} else settle();
			},
			{ once: true },
		);
	}
}

let dispose: (() => void) | undefined;
let bound = false;

function remount(): void {
	upgradeBannerLoops(document);
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
