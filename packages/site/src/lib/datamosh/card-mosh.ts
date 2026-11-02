/**
 * Hover datamosh for the home masonry cards: the DOM shell around the CPU kernel.
 *
 * Loaded lazily and ONLY when the `mosh` flag is on (see `src/lib/flags.ts` and the
 * `<script>` in `src/pages/index.astro`), or from the `/lab/datamosh/` playground.
 * While the pointer is over a card, ONE shared `<canvas>` is re-parented into that
 * card's `<li>`, laid over the `<img>`, and fed by the block-feedback kernel in
 * `engine.ts`: stale blocks of the card's own picture (or of the previously hovered
 * card) are dragged along the pointer path, never cleaned up until they heal.
 * The backing store is `round(CSS size x scale)` regardless of devicePixelRatio and
 * is stretched by CSS with `image-rendering: pixelated`; the coarse upscale is part
 * of the look and keeps cost flat across DPR 1 and 2.
 *
 * This shell mirrors `dither/card-dither.ts` (shared canvas, placement from the
 * img rect, pointer tracking, IntersectionObserver + visibility pausing,
 * `astro:before-swap` self-dispose, module singleton, `(pointer: fine)` gate) but
 * keeps its own loop: the kernel reports when it has `settled`, so the loop runs
 * until the smear has healed after the pointer leaves. Both gates
 * (`(pointer: fine)`, `prefers-reduced-motion: reduce`) are live: a `change` event
 * switches the effect off immediately.
 *
 * Animated GIF covers get real frames from `ImageDecoder` (see `gif-source.ts`); a
 * plain `drawImage` would only ever give frame 0.
 *
 * Why Canvas 2D only: the owner's Chrome has no GPU, so WebGL2 is unavailable and a
 * typed-array kernel is the product, not the fallback (ADR 0041).
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 * @see packages/site/src/lib/dither/card-dither.ts
 */
import { decodeMoshConfig, type MoshConfig } from "./config";
import { createFlashLimiter, createMoshEngine, type MoshEngine } from "./engine";
import { type GifSource, isGifUrl, startGifSource } from "./gif-source";

/**
 * Per-frame numbers handed to {@link MoshOptions.onFrame}.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface MoshFrameStats {
	backend: "2d";
	/** `engine.step` plus `putImageData`, ms. */
	kernelMs: number;
	activeBlocks: number;
	/** Internal (backing store) size, px. */
	width: number;
	height: number;
	/** `null` for stills. */
	gif: "imagedecoder" | "frame0" | null;
}

/**
 * Options for {@link mountCardMosh}.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface MoshOptions {
	/** Live config, read every frame (the playground mutates it). Default: `m-*` params of the URL. */
	config?: MoshConfig;
	/** Called once per kernel frame. */
	onFrame?: (stats: MoshFrameStats) => void;
}

/** Internal canvas side limits, px. */
const MIN_SIDE = 8;
const MAX_SIDE = 1200;
/** Pointer-velocity smoothing per kernel frame, and its clamp in internal px. */
const VELOCITY_SMOOTHING = 0.5;
const MAX_VELOCITY = 64;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const noop = (): void => {};

interface Target {
	card: Element;
	host: Element;
	img: HTMLImageElement;
	/** The cover is a GIF (stats report `gif`; frames come from `ImageDecoder`). */
	animated: boolean;
}

interface Mounted {
	grid: HTMLElement;
	dispose: () => void;
}

/** The currently mounted instance (module singleton; one grid at a time). */
let mounted: Mounted | null = null;

/**
 * Attach the hover datamosh to a masonry grid; returns an idempotent dispose fn.
 *
 * Mounting the same grid twice is a no-op; mounting a new grid disposes the previous
 * one. Also disposes itself on Astro's `astro:before-swap`, so view-transition
 * navigations never leak the canvas, observers or a GIF decoder. The effect itself
 * is gated live on `(pointer: fine)` and `prefers-reduced-motion`; touch pointers
 * are ignored.
 *
 * Why: the effect is an opt-in experiment (flag `mosh`); keeping it in one lazily
 * imported module makes "off" cost nothing.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function mountCardMosh(grid: HTMLElement, options: MoshOptions = {}): () => void {
	if (mounted?.grid === grid) return mounted.dispose;
	mounted?.dispose();
	const teardown = setup(grid, options);
	const dispose = (): void => {
		teardown();
		document.removeEventListener("astro:before-swap", dispose);
		if (mounted?.dispose === dispose) mounted = null;
	};
	mounted = { grid, dispose };
	document.addEventListener("astro:before-swap", dispose, { once: true });
	return dispose;
}

function setup(grid: HTMLElement, options: MoshOptions): () => void {
	const config = options.config ?? decodeMoshConfig(window.location.search);
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	const work = document.createElement("canvas");
	const workCtx = work.getContext("2d", { willReadFrequently: true });
	if (!ctx || !workCtx) return noop;

	canvas.setAttribute("aria-hidden", "true");
	canvas.setAttribute("data-mosh-backend", "2d");
	Object.assign(canvas.style, {
		position: "absolute",
		display: "none",
		pointerEvents: "none",
		zIndex: "1",
		imageRendering: "pixelated",
		opacity: "0",
	});

	const fine = window.matchMedia("(pointer: fine)");
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
	const allowed = (): boolean => fine.matches && !reduce.matches;

	const limiter = createFlashLimiter();
	const images = new WeakMap<Uint8ClampedArray<ArrayBuffer>, ImageData>();
	const view = { cssW: 1, cssH: 1 };
	const pointer = { x: 0, y: 0, inside: false };
	const stepPointer = { x: 0, y: 0 };
	const velocity = { x: 0, y: 0 };
	const last = { x: 0, y: 0, set: false };

	let engine: MoshEngine | null = null;
	let target: Target | null = null;
	let gif: GifSource | null = null;
	let gifMode: MoshConfig["gifSource"] | null = null;
	/** The overlay canvas holds a picture worth seeding the next card from. */
	let hasFrame = false;
	let needsReload = false;
	let visible = true;
	let raf = 0;
	let enteredAt = 0;
	let leftAt = 0;
	let nextDue = 0;
	let lastStepAt = 0;
	let opacity = 0;
	let resizeObserver: ResizeObserver | null = null;
	let intersection: IntersectionObserver | null = null;

	const hide = (): void => {
		canvas.style.display = "none";
		canvas.style.opacity = "0";
		opacity = 0;
	};

	const closeGif = (): void => {
		gif?.close();
		gif = null;
		gifMode = null;
	};

	const sideFor = (cssSize: number): number =>
		clamp(Math.round(cssSize * config.scale), MIN_SIDE, MAX_SIDE);

	/** Draw into the work canvas at `w x h` and read it back. Throws on a tainted source. */
	const grab = (
		w: number,
		h: number,
		draw: (c: CanvasRenderingContext2D) => void,
	): Uint8ClampedArray => {
		if (work.width !== w) work.width = w;
		if (work.height !== h) work.height = h;
		workCtx.imageSmoothingEnabled = true;
		workCtx.imageSmoothingQuality = "high";
		workCtx.clearRect(0, 0, w, h);
		draw(workCtx);
		return workCtx.getImageData(0, 0, w, h).data;
	};

	const measure = (): void => {
		if (!target) return;
		const rect = target.img.getBoundingClientRect();
		view.cssW = Math.max(1, rect.width);
		view.cssH = Math.max(1, rect.height);
	};

	const place = (): void => {
		if (!target) return;
		const imgRect = target.img.getBoundingClientRect();
		const hostRect = target.host.getBoundingClientRect();
		Object.assign(canvas.style, {
			left: `${imgRect.left - hostRect.left}px`,
			top: `${imgRect.top - hostRect.top}px`,
			width: `${Math.max(1, imgRect.width)}px`,
			height: `${Math.max(1, imgRect.height)}px`,
		});
	};

	const startGif = (): void => {
		if (!target?.animated || !engine) return;
		gif?.close();
		gifMode = config.gifSource;
		const live = engine;
		gif = startGifSource({
			img: target.img,
			width: live.width,
			height: live.height,
			mode: config.gifSource,
			onFrame: (rgba) => {
				if (engine === live) live.setSource(rgba);
			},
		});
	};

	/**
	 * (Re)build the engine for the bound card at the current size.
	 *
	 * `enter` seeds per `config.seed` (the cut between cards); `resize` carries the
	 * current overlay picture over to the new size instead. Returns false (and leaves
	 * the plain card) when the source cannot be read, e.g. a tainted image.
	 */
	const load = (now: number, reason: "enter" | "resize"): boolean => {
		if (!target) return false;
		const w = sideFor(view.cssW);
		const h = sideFor(view.cssH);
		const { img } = target;
		let previous: Uint8ClampedArray | null = null;
		let cut = false;
		let source: Uint8ClampedArray;
		try {
			if (hasFrame && (reason === "resize" || config.seed === "previous")) {
				// Read the old frame BEFORE the overlay canvas is resized (which clears it).
				previous = grab(w, h, (c) => c.drawImage(canvas, 0, 0, w, h));
				cut = reason === "enter";
			} else if (config.seed === "none" && reason === "enter") {
				previous = new Uint8ClampedArray(w * h * 4);
			}
			source = grab(w, h, (c) => c.drawImage(img, 0, 0, w, h));
		} catch (error) {
			// e.g. a tainted (cross-origin) image: getImageData throws a SecurityError.
			console.warn("[mosh] image sampling failed:", error);
			return false;
		}
		if (!engine || engine.width !== w || engine.height !== h) {
			engine = createMoshEngine(w, h, Math.random, limiter);
		} else {
			engine.reset();
		}
		canvas.width = w;
		canvas.height = h;
		place();
		target.host.appendChild(canvas);
		engine.setSource(source);
		engine.seed(previous, cut ? { nowMs: now, flashCap: config.flashCap } : undefined);
		needsReload = false;
		last.set = false;
		velocity.x = 0;
		velocity.y = 0;
		hasFrame = false;
		startGif();
		return true;
	};

	const bind = (card: Element, now: number): boolean => {
		const img = card.querySelector("img");
		if (!img?.complete || img.naturalWidth === 0) return false;
		closeGif();
		target = {
			card,
			host: card.closest("li") ?? card,
			img,
			animated: isGifUrl(img.currentSrc || img.src),
		};
		pointer.inside = false;
		visible = true;
		measure();
		if (!load(now, "enter")) {
			target = null;
			hide();
			return false;
		}
		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver(() => {
			measure();
			place();
			needsReload = true;
			wake();
		});
		resizeObserver.observe(img);
		intersection?.disconnect();
		intersection = new IntersectionObserver((entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			if (visible) {
				nextDue = 0;
				lastStepAt = 0;
				wake();
				return;
			}
			// Scrolled away: drop the overlay so a stale frame never reappears on return.
			pointer.inside = false;
			closeGif();
			hide();
		});
		intersection.observe(img);
		return true;
	};

	const present = (eng: MoshEngine): void => {
		const bytes = eng.output;
		let data = images.get(bytes);
		if (!data) {
			data = new ImageData(bytes, eng.width, eng.height);
			images.set(bytes, data);
		}
		ctx.putImageData(data, 0, 0);
		if (config.overlay) drawOverlay(ctx, eng);
		hasFrame = true;
	};

	const frame = (now: number): void => {
		raf = 0;
		// Why: also polled here, not only via `change` events: a `.matches` read that lands
		// between a media-feature change and its event delivery makes the browser drop the event.
		if (!allowed()) {
			stop();
			return;
		}
		if (!target || !visible || document.hidden) return;
		const gap = 1000 / Math.max(1, config.fps);
		if (now < nextDue - 1) {
			raf = requestAnimationFrame(frame);
			return;
		}
		nextDue = Math.max(nextDue + gap, now - gap);

		if (
			needsReload ||
			!engine ||
			engine.width !== sideFor(view.cssW) ||
			engine.height !== sideFor(view.cssH)
		) {
			if (!load(now, "resize")) {
				target = null;
				pointer.inside = false;
				hide();
				return;
			}
		}
		const eng = engine;
		if (!eng) return;
		if (target.animated && gifMode !== config.gifSource && pointer.inside) startGif();

		const dtMs = lastStepAt ? now - lastStepAt : 1000 / 60;
		lastStepAt = now;

		if (pointer.inside) {
			const ix = pointer.x * (eng.width / view.cssW);
			const iy = pointer.y * (eng.height / view.cssH);
			if (last.set) {
				velocity.x = clamp(
					velocity.x + (ix - last.x - velocity.x) * VELOCITY_SMOOTHING,
					-MAX_VELOCITY,
					MAX_VELOCITY,
				);
				velocity.y = clamp(
					velocity.y + (iy - last.y - velocity.y) * VELOCITY_SMOOTHING,
					-MAX_VELOCITY,
					MAX_VELOCITY,
				);
			}
			last.x = ix;
			last.y = iy;
			last.set = true;
			stepPointer.x = ix;
			stepPointer.y = iy;
		} else {
			velocity.x *= VELOCITY_SMOOTHING;
			velocity.y *= VELOCITY_SMOOTHING;
			last.set = false;
		}
		const leaveProgress = pointer.inside ? 0 : clamp((now - leftAt) / config.recoverMs, 0, 1);

		const started = performance.now();
		const result = eng.step(
			{
				nowMs: now,
				dtMs,
				pointer: pointer.inside ? stepPointer : null,
				velocity,
				leaveProgress,
				msSinceEnter: now - enteredAt,
			},
			config,
		);
		if (result.changed || config.overlay) present(eng);
		const kernelMs = performance.now() - started;

		const goal = pointer.inside ? 1 : 0;
		const tau = Math.max(1, (pointer.inside ? config.enterMs : config.recoverMs) / 3);
		opacity += (goal - opacity) * (1 - Math.exp(-dtMs / tau));
		canvas.style.opacity = opacity.toFixed(3);

		options.onFrame?.({
			backend: "2d",
			kernelMs,
			activeBlocks: result.activeBlocks,
			width: eng.width,
			height: eng.height,
			gif: target.animated ? (gif?.kind ?? "frame0") : null,
		});

		if (pointer.inside || !result.settled || leaveProgress < 1 || opacity > 0.02) {
			raf = requestAnimationFrame(frame);
			return;
		}
		// Healed and faded: nothing left to show.
		closeGif();
		hide();
		lastStepAt = 0;
		nextDue = 0;
	};

	function wake(): void {
		if (!raf && target && allowed() && visible && !document.hidden) {
			raf = requestAnimationFrame(frame);
		}
	}

	const enter = (now: number): void => {
		if (pointer.inside) return;
		pointer.inside = true;
		enteredAt = now;
		last.set = false;
		place();
		canvas.style.display = "block";
		if (target?.animated && !gif) startGif();
	};

	const leave = (now: number): void => {
		if (pointer.inside) {
			pointer.inside = false;
			leftAt = now;
		}
		wake();
	};

	function stop(): void {
		cancelAnimationFrame(raf);
		raf = 0;
		pointer.inside = false;
		closeGif();
		hide();
	}

	const onMove = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || !allowed()) return;
		const now = performance.now();
		const hit = event.target instanceof Element ? event.target.closest(".card") : null;
		if (!hit || !grid.contains(hit)) {
			leave(now);
			return;
		}
		if (target?.card !== hit && !bind(hit, now)) {
			leave(now);
			return;
		}
		if (!target) return;
		// Why: read the img rect, not the canvas — the canvas is display:none after a fade-out.
		const rect = target.img.getBoundingClientRect();
		pointer.x = event.clientX - rect.left;
		pointer.y = event.clientY - rect.top;
		enter(now);
		wake();
	};

	const onLeave = (): void => leave(performance.now());
	const onVisibility = (): void => {
		lastStepAt = 0;
		nextDue = 0;
		wake();
	};
	const onGate = (): void => {
		if (!allowed()) stop();
	};

	grid.addEventListener("pointermove", onMove, { passive: true });
	grid.addEventListener("pointerleave", onLeave);
	document.addEventListener("visibilitychange", onVisibility);
	fine.addEventListener("change", onGate);
	reduce.addEventListener("change", onGate);

	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(raf);
		grid.removeEventListener("pointermove", onMove);
		grid.removeEventListener("pointerleave", onLeave);
		document.removeEventListener("visibilitychange", onVisibility);
		fine.removeEventListener("change", onGate);
		reduce.removeEventListener("change", onGate);
		resizeObserver?.disconnect();
		intersection?.disconnect();
		closeGif();
		canvas.remove();
		engine = null;
		target = null;
		work.width = 0;
		work.height = 0;
	};
}

/** Debug overlay (`config.overlay`): block grid, stale/lost shading and the vector field. */
function drawOverlay(ctx: CanvasRenderingContext2D, engine: MoshEngine): void {
	const { size, cols, rows, mvx, mvy, stale, lost } = engine.blocks;
	ctx.save();
	for (let by = 0; by < rows; by++) {
		for (let bx = 0; bx < cols; bx++) {
			const bi = by * cols + bx;
			if (lost[bi] === 1) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
				ctx.fillRect(bx * size, by * size, size, size);
			} else if (stale[bi] === 1) {
				ctx.fillStyle = "rgba(255, 0, 128, 0.14)";
				ctx.fillRect(bx * size, by * size, size, size);
			}
		}
	}
	ctx.strokeStyle = "rgba(0, 140, 255, 0.4)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let bx = 0; bx <= cols; bx++) {
		ctx.moveTo(bx * size + 0.5, 0);
		ctx.lineTo(bx * size + 0.5, engine.height);
	}
	for (let by = 0; by <= rows; by++) {
		ctx.moveTo(0, by * size + 0.5);
		ctx.lineTo(engine.width, by * size + 0.5);
	}
	ctx.stroke();
	ctx.strokeStyle = "#f0f";
	ctx.beginPath();
	for (let by = 0; by < rows; by++) {
		for (let bx = 0; bx < cols; bx++) {
			const bi = by * cols + bx;
			const vx = mvx[bi] ?? 0;
			const vy = mvy[bi] ?? 0;
			if (vx === 0 && vy === 0) continue;
			const cx = bx * size + size / 2;
			const cy = by * size + size / 2;
			ctx.moveTo(cx, cy);
			ctx.lineTo(cx + vx, cy + vy);
		}
	}
	ctx.stroke();
	ctx.restore();
}
