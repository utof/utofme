/**
 * One shared animation loop for every object canvas on the home page.
 *
 * Why: a page lists dozens of projects, each with a canvas. One
 * `requestAnimationFrame` loop at ~14 fps draws only the canvases an
 * `IntersectionObserver` reports on screen, redraws resting ones every fifth
 * tick, and stops entirely when none is visible, the tab is hidden or motion is
 * paused (the site's "Pause motion" toggle, which also follows
 * `prefers-reduced-motion`). Paused canvases still get one still frame.
 *
 * Markup contract: `<canvas data-home-obj data-seed="123" [data-obj="key"] [data-big]>`.
 * The canvas spins faster while its closest `[data-obj-host]` is hovered or holds focus.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
 */
import { isMotionPaused, MOTION_EVENT } from "../../motion";
import { buildObject } from "./registry";
import { drawObject } from "./render";

/** Minimum milliseconds between ticks (~14 fps: the stepped look, and cheap). */
const TICK_MS = 72;
/** Resting objects redraw once every this many ticks. */
const REST_EVERY = 5;
const REST_SPEED = 0.6;
const LIVELY_EXTRA_SPEED = 1.6;
const POP_DECAY = 1.4;

/**
 * Whether a canvas needs a redraw on this tick.
 *
 * Why: lively (hovered, focused, expanded or popping) canvases draw every tick;
 * resting ones every fifth, staggered by index so they do not all land on one frame.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function shouldDraw(tick: number, index: number, lively: boolean, drawn: boolean): boolean {
	return lively || !drawn || (tick + index) % REST_EVERY === 0;
}

interface CanvasState {
	readonly index: number;
	readonly key: string | undefined;
	readonly seed: number;
	readonly big: boolean;
	readonly host: Element | null;
	extra: number;
	pop: number;
	drawn: boolean;
}

/**
 * Starts the loop for every `canvas[data-home-obj]` under `root`; returns a disposer.
 *
 * Why: called on `astro:page-load` and disposed on `astro:before-swap`, so
 * ClientRouter navigations neither leak observers nor animate a detached page.
 *
 * @see https://docs.astro.build/en/guides/view-transitions/#lifecycle-events
 */
export function mountObjects(root: ParentNode = document): () => void {
	const states = new Map<HTMLCanvasElement, CanvasState>();
	const visible = new Set<HTMLCanvasElement>();
	let raf = 0;
	let last = -1;
	let t = 0;
	let tick = 0;
	let disposed = false;

	let index = 0;
	for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas[data-home-obj]")) {
		states.set(canvas, {
			index: index++,
			key: canvas.dataset["obj"] || undefined,
			seed: Number(canvas.dataset["seed"]) || 1,
			big: canvas.dataset["big"] !== undefined,
			host: canvas.closest("[data-obj-host]"),
			extra: 0,
			pop: 0,
			drawn: false,
		});
	}

	const draw = (canvas: HTMLCanvasElement, state: CanvasState): void => {
		const yaw = t * REST_SPEED + state.extra + state.seed * 0.9;
		drawObject(canvas, buildObject(state.key, state.seed, t), { yaw, pop: state.pop });
		state.drawn = true;
	};

	const frame = (now: number): void => {
		raf = requestAnimationFrame(frame);
		if (last >= 0 && now - last < TICK_MS) return;
		const dt = last < 0 ? 0 : Math.min(0.2, (now - last) / 1000);
		last = now;
		tick++;
		t += dt;
		for (const canvas of visible) {
			const state = states.get(canvas);
			if (!state) continue;
			const lively =
				state.big || state.pop > 0 || (state.host?.matches(":hover, :focus-within") ?? false);
			if (lively) state.extra += dt * LIVELY_EXTRA_SPEED;
			state.pop = Math.max(0, state.pop - dt * POP_DECAY);
			if (shouldDraw(tick, state.index, lively, state.drawn)) draw(canvas, state);
		}
	};

	const sync = (): void => {
		const run = !disposed && visible.size > 0 && !document.hidden && !isMotionPaused();
		if (run && !raf) {
			last = -1;
			raf = requestAnimationFrame(frame);
		} else if (!run && raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
	};

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!(entry.target instanceof HTMLCanvasElement)) continue;
				const state = states.get(entry.target);
				if (!state) continue;
				if (entry.isIntersecting) {
					visible.add(entry.target);
				} else {
					visible.delete(entry.target);
				}
			}
			sync();
		},
		{ rootMargin: "40px" },
	);
	// Why: one still frame for every canvas up front (a few dozen triangles each), so no
	// object is ever blank: not before it scrolls into view, not in a full-page capture.
	for (const [canvas, state] of states) {
		draw(canvas, state);
		observer.observe(canvas);
	}

	// Why: `toggle` does not bubble, hence the capture listener. A just-opened row's big object bounces once.
	const onToggle = (event: Event): void => {
		const details = event.target;
		if (!(details instanceof HTMLDetailsElement) || !details.open) return;
		const canvas = details.querySelector<HTMLCanvasElement>("canvas[data-home-obj][data-big]");
		const state = canvas ? states.get(canvas) : undefined;
		if (state && !isMotionPaused()) state.pop = 1;
	};
	const onMotion = (): void => {
		sync();
	};

	root.addEventListener("toggle", onToggle, true);
	document.addEventListener("visibilitychange", onMotion);
	document.addEventListener(MOTION_EVENT, onMotion);

	return () => {
		disposed = true;
		observer.disconnect();
		visible.clear();
		sync();
		root.removeEventListener("toggle", onToggle, true);
		document.removeEventListener("visibilitychange", onMotion);
		document.removeEventListener(MOTION_EVENT, onMotion);
	};
}
