/**
 * Loop playback controller: plays `video[data-loop]` only while ≥ 25 % visible
 * and motion is not paused; reveals the video on its first `playing`.
 *
 * A slideshow card (`data-loop-play="hover"` inside a `.card`) is the exception: it stays on its
 * poster at rest and plays only while the card is hovered or keyboard-focused on a fine pointer,
 * then pauses, rewinds and hides the video again. Real motion (montage / transcode) and every
 * banner keep the in-view autoplay.
 *
 * Why: loops are `preload="none"` with no `autoplay`, so nothing downloads or
 * decodes until the card is near the viewport. Disposal deliberately never
 * pauses (the `transition:persist`ed node must keep playing through a view
 * transition). A slideshow is a sequence of screenshots, which reads as noise when it moves
 * unprompted and is perfectly legible on a still. Dependencies are injected so tests can fake them.
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
	/** `(hover: hover) and (pointer: fine)`: whether hover-played loops may play at all. */
	finePointer: () => boolean;
	/** Whether `el` shows a keyboard focus ring (`:focus-visible`); a mouse click on a link does not. */
	focusVisible: (el: Element) => boolean;
	doc: Document;
}

function defaultDeps(): LoopDeps {
	return {
		createObserver: (cb, opts) => new IntersectionObserver(cb, opts),
		isPaused: isMotionPaused,
		saveData: () =>
			(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
			true,
		finePointer: () => matchMedia("(hover: hover) and (pointer: fine)").matches,
		focusVisible: (el) => {
			try {
				return el.matches(":focus-visible");
			} catch {
				// Engines without :focus-visible: treat any focus as keyboard focus.
				return true;
			}
		},
		doc: document,
	};
}

/**
 * Options for `mountLoops`.
 *
 * Why: during a Back morph only the hero card's loop may decode (M3-10); the rest
 * mount after the transition, staggered so seven decoders do not start in one frame.
 *
 * @see packages/specs/reports/ui3-fix-morph.md (M3-10)
 */
export interface MountOptions {
	/** Only manage videos this returns true for. */
	only?: (v: HTMLVideoElement) => boolean;
	/** Delay each successive loop's first `play()` by this many ms. */
	stagger?: number;
}

/**
 * Observe every `video[data-loop]` under `root`; returns a disposer.
 *
 * Why: policy `allowed = !paused && !saveData`; `play()` rejections (iOS Low
 * Power Mode) leave the poster showing. The disposer disconnects listeners only.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
export function mountLoops(
	root: ParentNode,
	deps: LoopDeps = defaultDeps(),
	opts: MountOptions = {},
): () => void {
	const all = [...root.querySelectorAll<HTMLVideoElement>("video[data-loop]")].filter(
		(v) => opts.only?.(v) ?? true,
	);
	// Why: only a card video is hover-played; the persisted node inside a banner keeps the in-view rule.
	const hoverHost = (v: HTMLVideoElement): HTMLElement | null =>
		v.dataset["loopPlay"] === "hover" ? v.closest<HTMLElement>(".card") : null;
	const videos = all.filter((v) => hoverHost(v) === null);
	const hoverVideos = all.filter((v) => hoverHost(v) !== null);
	const visible = new Set<HTMLVideoElement>();
	const cleanups: (() => void)[] = [];
	let disposed = false;

	const allowed = (): boolean => !deps.isPaused() && !deps.saveData();
	let started = 0;
	const play = (v: HTMLVideoElement): void => {
		v.play().catch(() => {
			/* NotAllowedError etc.: keep the poster */
		});
	};
	const start = (v: HTMLVideoElement): void => {
		const gap = opts.stagger ?? 0;
		if (gap <= 0 || !v.paused) {
			play(v);
			return;
		}
		const delay = started++ * gap;
		setTimeout(() => {
			if (!disposed && visible.has(v) && allowed()) play(v);
		}, delay);
	};

	// Slideshow cards: `hovered` / `focused` per video; `on` marks a video this controller started.
	const hover = new Map<HTMLVideoElement, { hovered: boolean; focused: boolean; on: boolean }>();
	const wantsPlay = (v: HTMLVideoElement): boolean => {
		const st = hover.get(v);
		return (
			st !== undefined &&
			(st.hovered || st.focused) &&
			allowed() &&
			deps.finePointer() &&
			deps.doc.visibilityState !== "hidden"
		);
	};
	const stop = (v: HTMLVideoElement): void => {
		const st = hover.get(v);
		if (!st?.on) return;
		st.on = false;
		v.pause();
		v.currentTime = 0;
		v.removeAttribute("data-ready");
	};
	const updateHover = (v: HTMLVideoElement): void => {
		const st = hover.get(v);
		if (!st) return;
		if (wantsPlay(v)) {
			st.on = true;
			play(v);
		} else stop(v);
	};
	const sync = (): void => {
		const ok = allowed() && deps.doc.visibilityState !== "hidden";
		for (const v of videos) {
			if (ok && visible.has(v)) start(v);
			else v.pause();
		}
		for (const v of hoverVideos) updateHover(v);
	};

	for (const v of videos) {
		// Why: the banner upgrade video reveals itself once re-aligned and painted (M3-02).
		const reveal = (): void => {
			if (!v.hasAttribute("data-upgrade")) v.setAttribute("data-ready", "");
		};
		v.addEventListener("playing", reveal, { once: true });
		cleanups.push(() => v.removeEventListener("playing", reveal));
	}
	for (const v of hoverVideos) {
		const host = hoverHost(v);
		if (!host) continue;
		hover.set(v, { hovered: false, focused: false, on: false });
		const set = (patch: { hovered?: boolean; focused?: boolean }) => (): void => {
			const st = hover.get(v);
			if (!st || disposed) return;
			Object.assign(st, patch);
			updateHover(v);
		};
		const enter = (e: Event): void => {
			// Why: a touch pointer fires `pointerenter` too; those cards stay still.
			if ("pointerType" in e && e.pointerType === "touch") return;
			set({ hovered: true })();
		};
		// Why: `:focus-visible` so a mouse click on the link does not count as keyboard focus.
		const focusIn = (): void => {
			if (deps.focusVisible(host)) set({ focused: true })();
		};
		const reveal = (): void => v.setAttribute("data-ready", "");
		const handlers: [string, EventListener][] = [
			["pointerenter", enter],
			["pointerleave", set({ hovered: false })],
			["focusin", focusIn],
			["focusout", set({ focused: false })],
		];
		for (const [name, fn] of handlers) {
			host.addEventListener(name, fn);
			cleanups.push(() => host.removeEventListener(name, fn));
		}
		v.addEventListener("playing", reveal);
		cleanups.push(() => v.removeEventListener("playing", reveal));
	}

	const io = deps.createObserver(
		(entries) => {
			if (disposed) return;
			for (const e of entries) {
				const v = e.target;
				if (!(v instanceof HTMLVideoElement) || hover.has(v)) continue;
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
		for (const a of ["data-ready", "data-astro-transition-persist", "data-loop-play"])
			next.removeAttribute(a);
		next.setAttribute("data-loop-size", "banner");
		next.setAttribute("width", String(banner.width));
		next.setAttribute("height", String(banner.height));
		for (const s of banner.sources) {
			const el = frame.ownerDocument.createElement("source");
			el.setAttribute("src", s.url);
			el.setAttribute("type", s.type);
			next.append(el);
		}
		next.setAttribute("data-upgrade", "");
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
		// Why (M3-02): reveal only once the banner is on the card loop's frame and has painted,
		// then fade over `--loop-resolve` so the 768 → 1920 px sharpness step reads as a resolve.
		let revealed = false;
		const reveal = (): void => {
			if (revealed) return;
			revealed = true;
			next.setAttribute("data-ready", "");
			setTimeout(drop, 220);
		};
		const painted = (): void => {
			if (next.requestVideoFrameCallback) next.requestVideoFrameCallback(reveal);
			else setTimeout(reveal, 50);
		};
		setTimeout(reveal, 900);
		next.addEventListener(
			"playing",
			() => {
				if (Math.abs(old.currentTime - next.currentTime) > 0.1) {
					next.addEventListener("seeked", painted, { once: true });
					// Predictive: the card loop keeps advancing while the seek completes.
					next.currentTime = old.currentTime + 0.12;
				} else painted();
			},
			{ once: true },
		);
	}
}

/** Back-navigation resume point: the banner's time, applied to that card's loop. */
let resume: { slug: string; t: number } | null = null;

function applyResume(): HTMLVideoElement | null {
	const r = resume;
	resume = null;
	if (!r) return null;
	const v = document.querySelector<HTMLVideoElement>(
		`[data-work-slug="${CSS.escape(r.slug)}"] video[data-loop]`,
	);
	if (!v) return null;
	if (r.t > 0) v.currentTime = r.t;
	return v;
}

let dispose: (() => void) | undefined;
let bound = false;

function remount(): void {
	upgradeBannerLoops(document);
	dispose?.();
	const hero = applyResume();
	const vt = document.activeViewTransition;
	if (hero && vt) {
		// Back morph in flight (M3-10): only the hero loop decodes; the rest start afterwards.
		dispose = mountLoops(document, defaultDeps(), { only: (v) => v === hero });
		const later = (): void => {
			dispose?.();
			dispose = mountLoops(document, defaultDeps(), { stagger: 50 });
		};
		vt.finished.then(later, later);
		return;
	}
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
	document.addEventListener("astro:before-preparation", (e) => {
		// M3-08: remember where the banner was so Back resumes the card loop there.
		const from = "from" in e && e.from instanceof URL ? e.from : null;
		const dir = "direction" in e ? e.direction : null;
		const slug = from ? /^\/works\/([^/]+)\/?$/.exec(from.pathname)?.[1] : undefined;
		const v = document.querySelector<HTMLVideoElement>(".banner video[data-loop]");
		resume =
			dir === "back" && slug && v ? { slug: decodeURIComponent(slug), t: v.currentTime } : null;
	});
	document.addEventListener("astro:page-load", remount);
	if (document.readyState === "complete") remount();
	else window.addEventListener("load", remount, { once: true });
}
