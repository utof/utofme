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
	state: { paused: boolean; saveData: boolean };
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
	const state = { paused: false, saveData: false };
	const deps: LoopDeps = {
		createObserver: (cb, opts) => new FakeObserver(cb, opts),
		isPaused: () => state.paused,
		saveData: () => state.saveData,
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
