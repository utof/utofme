/**
 * Unit tests for the loop playback controller (P9-6, AC6.1) using a fake
 * IntersectionObserver and fake `play()`/`pause()`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type LoopDeps, mountLoops } from "../../../src/lib/loops/controller";

class FakeObserver implements IntersectionObserver {
	static last: FakeObserver | undefined;
	readonly root = null;
	readonly rootMargin: string;
	readonly scrollMargin = "";
	readonly thresholds: readonly number[] = [];
	targets = new Set<Element>();
	disconnected = false;
	constructor(
		public cb: IntersectionObserverCallback,
		public opts: IntersectionObserverInit,
	) {
		this.rootMargin = opts.rootMargin ?? "";
		FakeObserver.last = this;
	}
	observe(el: Element): void {
		this.targets.add(el);
	}
	unobserve(el: Element): void {
		this.targets.delete(el);
	}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
	disconnect(): void {
		this.disconnected = true;
	}
	fire(el: Element, isIntersecting: boolean): void {
		const rect = el.getBoundingClientRect();
		this.cb(
			[
				{
					target: el,
					isIntersecting,
					intersectionRatio: isIntersecting ? 1 : 0,
					time: 0,
					boundingClientRect: rect,
					intersectionRect: rect,
					rootBounds: null,
				},
			],
			this,
		);
	}
}

/** Fail loudly instead of asserting a type. */
function must<T>(v: T | undefined): T {
	if (v === undefined) throw new Error("expected a value");
	return v;
}

interface Harness {
	root: HTMLElement;
	videos: HTMLVideoElement[];
	play: Mock<() => Promise<void>>;
	pause: Mock<() => void>;
	state: { paused: boolean; saveData: boolean; fine: boolean; focusRing: boolean };
	deps: LoopDeps;
}

function setup(n = 2, playImpl?: () => Promise<void>): Harness {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	const videos: HTMLVideoElement[] = [];
	const play = vi.fn<() => Promise<void>>(playImpl ?? (() => Promise.resolve()));
	const pause = vi.fn<() => void>();
	for (let i = 0; i < n; i++) {
		const v = document.createElement("video");
		v.setAttribute("data-loop", "");
		v.play = play;
		v.pause = pause;
		root.append(v);
		videos.push(v);
	}
	document.body.append(root);
	const state = { paused: false, saveData: false, fine: true, focusRing: true };
	const deps: LoopDeps = {
		createObserver: (cb, opts) => new FakeObserver(cb, opts),
		isPaused: () => state.paused,
		saveData: () => state.saveData,
		finePointer: () => state.fine,
		focusVisible: () => state.focusRing,
		doc: document,
	};
	return { root, videos, play, pause, state, deps };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("mountLoops", () => {
	beforeEach(() => {
		FakeObserver.last = undefined;
	});

	it("observes with threshold 0.25 and a 200px vertical margin", () => {
		const h = setup();
		mountLoops(h.root, h.deps);
		expect(FakeObserver.last?.opts?.threshold).toBe(0.25);
		expect(FakeObserver.last?.opts?.rootMargin).toBe("200px 0px");
		expect(FakeObserver.last?.targets.size).toBe(2);
	});

	it("plays only intersecting loops and pauses those that leave", () => {
		const h = setup();
		mountLoops(h.root, h.deps);
		const a = must(h.videos[0]);
		const b = must(h.videos[1]);
		must(FakeObserver.last).fire(a, true);
		expect(h.play).toHaveBeenCalledTimes(1);
		must(FakeObserver.last).fire(b, false);
		expect(h.pause).toHaveBeenCalledTimes(1);
		must(FakeObserver.last).fire(a, false);
		expect(h.pause).toHaveBeenCalledTimes(2);
	});

	it("does not play when motion is paused or saveData is on", () => {
		const h = setup();
		h.state.paused = true;
		mountLoops(h.root, h.deps);
		must(FakeObserver.last).fire(must(h.videos[0]), true);
		expect(h.play).not.toHaveBeenCalled();
		h.state.paused = false;
		h.state.saveData = true;
		must(FakeObserver.last).fire(must(h.videos[0]), true);
		expect(h.play).not.toHaveBeenCalled();
	});

	it("pausing leaves currentTime untouched; resuming plays the visible ones", () => {
		const h = setup();
		mountLoops(h.root, h.deps);
		const a = must(h.videos[0]);
		must(FakeObserver.last).fire(a, true);
		Object.defineProperty(a, "currentTime", { value: 1.5, writable: true });
		h.state.paused = true;
		document.dispatchEvent(new CustomEvent("utofme:motion", { detail: { paused: true } }));
		expect(h.pause).toHaveBeenCalled();
		expect(a.currentTime).toBe(1.5);
		h.play.mockClear();
		h.state.paused = false;
		document.dispatchEvent(new CustomEvent("utofme:motion", { detail: { paused: false } }));
		expect(h.play).toHaveBeenCalledTimes(1);
	});

	it("reveals the video (data-ready) on the first `playing` event only", () => {
		const h = setup(1);
		mountLoops(h.root, h.deps);
		const a = must(h.videos[0]);
		expect(a.hasAttribute("data-ready")).toBe(false);
		a.dispatchEvent(new Event("playing"));
		expect(a.hasAttribute("data-ready")).toBe(true);
	});

	it("a rejected play() leaves data-ready unset", async () => {
		const h = setup(1, () => Promise.reject(new DOMException("blocked", "NotAllowedError")));
		mountLoops(h.root, h.deps);
		const a = must(h.videos[0]);
		must(FakeObserver.last).fire(a, true);
		await flush();
		expect(a.hasAttribute("data-ready")).toBe(false);
	});

	it("dispose disconnects but never calls pause()", () => {
		const h = setup();
		const dispose = mountLoops(h.root, h.deps);
		must(FakeObserver.last).fire(must(h.videos[0]), true);
		h.pause.mockClear();
		dispose();
		expect(FakeObserver.last?.disconnected).toBe(true);
		expect(h.pause).not.toHaveBeenCalled();
		// events after dispose are ignored
		document.dispatchEvent(new CustomEvent("utofme:motion", { detail: { paused: true } }));
		expect(h.pause).not.toHaveBeenCalled();
	});

	it("hiding the page pauses all playing loops", () => {
		const h = setup();
		mountLoops(h.root, h.deps);
		must(FakeObserver.last).fire(must(h.videos[0]), true);
		h.pause.mockClear();
		Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(h.pause).toHaveBeenCalled();
		Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
	});
});

/** A home card wrapping one video, as `Card.astro` + `LoopMedia.astro` render it. */
function hoverSetup(mode: "hover" | "view" = "hover", withCard = true) {
	const h = setup(0);
	const v = document.createElement("video");
	v.setAttribute("data-loop", "");
	v.setAttribute("data-loop-play", mode);
	v.play = h.play;
	v.pause = h.pause;
	const card = document.createElement(withCard ? "a" : "div");
	if (withCard) card.className = "card";
	card.append(v);
	h.root.append(card);
	return { ...h, v, card };
}

describe("mountLoops: slideshow cards play on hover or focus only", () => {
	beforeEach(() => {
		FakeObserver.last = undefined;
	});

	it("never observes a hover video, so nothing plays at rest or when it scrolls into view", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		expect(FakeObserver.last?.targets.size).toBe(0);
		must(FakeObserver.last).fire(h.v, true);
		expect(h.play).not.toHaveBeenCalled();
	});

	it("plays on pointerenter, and on pointerleave pauses, rewinds to the poster frame and hides the video", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		h.card.dispatchEvent(new Event("pointerenter"));
		expect(h.play).toHaveBeenCalledTimes(1);
		h.v.dispatchEvent(new Event("playing"));
		expect(h.v.hasAttribute("data-ready")).toBe(true);
		Object.defineProperty(h.v, "currentTime", { value: 2.4, writable: true });
		h.card.dispatchEvent(new Event("pointerleave"));
		expect(h.pause).toHaveBeenCalledTimes(1);
		expect(h.v.currentTime).toBe(0);
		expect(h.v.hasAttribute("data-ready")).toBe(false);
	});

	it("is revealed again by every hover, not only the first", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		for (let i = 0; i < 2; i++) {
			h.card.dispatchEvent(new Event("pointerenter"));
			h.v.dispatchEvent(new Event("playing"));
			expect(h.v.hasAttribute("data-ready")).toBe(true);
			h.card.dispatchEvent(new Event("pointerleave"));
			expect(h.v.hasAttribute("data-ready")).toBe(false);
		}
		expect(h.play).toHaveBeenCalledTimes(2);
	});

	it("stays still on a coarse pointer, under paused motion and under saveData", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		h.state.fine = false;
		h.card.dispatchEvent(new Event("pointerenter"));
		h.card.dispatchEvent(new Event("focusin"));
		h.state.fine = true;
		h.state.paused = true;
		h.card.dispatchEvent(new Event("pointerenter"));
		h.state.paused = false;
		h.state.saveData = true;
		h.card.dispatchEvent(new Event("pointerenter"));
		expect(h.play).not.toHaveBeenCalled();
	});

	it("ignores touch pointers even on a device that also reports a fine pointer", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		const touch = new Event("pointerenter");
		Object.defineProperty(touch, "pointerType", { value: "touch" });
		h.card.dispatchEvent(touch);
		expect(h.play).not.toHaveBeenCalled();
	});

	it("plays while the card is keyboard-focused and keeps playing until both hover and focus are gone", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		h.card.dispatchEvent(new Event("focusin"));
		expect(h.play).toHaveBeenCalledTimes(1);
		h.card.dispatchEvent(new Event("pointerenter"));
		h.card.dispatchEvent(new Event("pointerleave"));
		expect(h.pause).not.toHaveBeenCalled();
		h.card.dispatchEvent(new Event("focusout"));
		expect(h.pause).toHaveBeenCalledTimes(1);
	});

	it("a mouse-click focus (no focus ring) does not count as keyboard focus", () => {
		const h = hoverSetup();
		h.state.focusRing = false;
		mountLoops(h.root, h.deps);
		h.card.dispatchEvent(new Event("focusin"));
		expect(h.play).not.toHaveBeenCalled();
	});

	it("'Pause motion' stops a playing hover loop and rewinds it; once the pointer has left, resuming plays nothing", () => {
		const h = hoverSetup();
		mountLoops(h.root, h.deps);
		h.card.dispatchEvent(new Event("pointerenter"));
		h.v.dispatchEvent(new Event("playing"));
		h.state.paused = true;
		document.dispatchEvent(new CustomEvent("utofme:motion", { detail: { paused: true } }));
		expect(h.pause).toHaveBeenCalled();
		expect(h.v.hasAttribute("data-ready")).toBe(false);
		h.card.dispatchEvent(new Event("pointerleave"));
		h.play.mockClear();
		h.state.paused = false;
		document.dispatchEvent(new CustomEvent("utofme:motion", { detail: { paused: false } }));
		expect(h.play).not.toHaveBeenCalled();
	});

	it("a rejected play() leaves the poster showing", async () => {
		const h = hoverSetup();
		h.play.mockImplementation(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
		mountLoops(h.root, h.deps);
		h.card.dispatchEvent(new Event("pointerenter"));
		await flush();
		expect(h.v.hasAttribute("data-ready")).toBe(false);
	});

	it("dispose removes the hover and focus listeners", () => {
		const h = hoverSetup();
		const dispose = mountLoops(h.root, h.deps);
		dispose();
		h.card.dispatchEvent(new Event("pointerenter"));
		h.card.dispatchEvent(new Event("focusin"));
		expect(h.play).not.toHaveBeenCalled();
	});

	it("a view-mode loop (montage / transcode / banner) keeps autoplaying in view", () => {
		const h = hoverSetup("view");
		mountLoops(h.root, h.deps);
		expect(FakeObserver.last?.targets.size).toBe(1);
		must(FakeObserver.last).fire(h.v, true);
		expect(h.play).toHaveBeenCalledTimes(1);
		h.card.dispatchEvent(new Event("pointerenter"));
		h.card.dispatchEvent(new Event("pointerleave"));
		expect(h.pause).not.toHaveBeenCalled();
	});

	it("a hover-mode video outside a card (the persisted node inside a banner) is managed like any loop", () => {
		const h = hoverSetup("hover", false);
		mountLoops(h.root, h.deps);
		expect(FakeObserver.last?.targets.size).toBe(1);
		must(FakeObserver.last).fire(h.v, true);
		expect(h.play).toHaveBeenCalledTimes(1);
	});
});
