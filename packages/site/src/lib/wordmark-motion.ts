import { isMotionPaused, MOTION_EVENT } from "./motion";

const MODES = ["block-flip", "pixel-assembly", "signal-sweep"] as const;
type Mode = (typeof MODES)[number];
type Point = { x: number; y: number };
type Pixel = Point & { element: SVGRectElement };

const GRID_SIZE = 11;
const RADIUS = 4.2;
const SWEEP_COLORS = ["#ffa746", "#ee7c30", "#b75527", "#74402b"] as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Why: computing pointer motion in the resting 11×11 grid keeps it proportional at any size. */
export function bindWordmark(mark: HTMLAnchorElement): () => void {
	const svg = mark.querySelector("svg");
	const layer = svg?.querySelector<SVGGElement>("[data-wordmark-pixels]");
	if (!svg || !layer) return () => {};

	const tiles = Array.from(
		svg.querySelectorAll<SVGPathElement>("[data-wordmark-tile]"),
		(element) => ({
			element,
			x: Number(element.dataset["x"]),
			y: Number(element.dataset["y"]),
		}),
	);
	const pixels: Pixel[] = [];
	let sweepEnd = 0;
	const listeners = new AbortController();
	const { signal } = listeners;
	const hover = matchMedia("(any-hover: hover) and (any-pointer: fine)");
	let frame = 0;
	let mode: Mode | undefined;
	let previousMode: Mode | undefined;
	let pointer: PointerEvent | undefined;

	function makePixels(): void {
		for (const tile of tiles) {
			const grid = tile.element.dataset["grid"] ?? "";
			for (let index = 0; index < grid.length; index++) {
				if (grid[index] !== "1") continue;
				const x = tile.x + (index % 5);
				const y = tile.y + Math.floor(index / 5);
				const element = document.createElementNS("http://www.w3.org/2000/svg", "rect");
				element.setAttribute("x", String(x));
				element.setAttribute("y", String(y));
				element.setAttribute("width", "1");
				element.setAttribute("height", "1");
				layer?.append(element);
				pixels.push({ x, y, element });
				sweepEnd = Math.max(sweepEnd, x + y);
			}
		}
	}

	function reset(): void {
		if (!mode) return;
		cancelAnimationFrame(frame);
		frame = 0;
		pointer = undefined;
		mode = undefined;
		delete mark.dataset["wordmarkMode"];
		for (const { element } of tiles) {
			element.style.removeProperty("transform");
			element.style.removeProperty("filter");
		}
		for (const { element } of pixels) {
			element.style.removeProperty("transform");
			element.style.removeProperty("fill");
		}
	}

	function renderFlip(point: Point): void {
		for (const tile of tiles) {
			const dx = point.x - tile.x - 2.5;
			const dy = point.y - tile.y - 2.5;
			const proximity = Math.max(0, 1 - Math.hypot(dx, dy) / 9);
			const hinge = tile.x === 0 ? 38 : -38;
			const yaw = (hinge + clamp(dx, -4, 4) * 7) * proximity;
			const pitch = clamp(-dy * 12, -42, 42) * proximity;
			const edge = 0.65 * Math.sin((yaw * Math.PI) / 180);
			tile.element.style.transform = `perspective(22px) rotateX(${pitch}deg) rotateY(${yaw}deg)`;
			tile.element.style.filter = `drop-shadow(${-edge}px ${Math.abs(edge) * 0.38}px 0 #365bdd)`;
		}
	}

	function renderAssembly(point: Point): void {
		for (const pixel of pixels) {
			const dx = pixel.x + 0.5 - point.x;
			const dy = pixel.y + 0.5 - point.y;
			const distance = Math.hypot(dx, dy);
			const force = 2.1 * Math.max(0, 1 - distance / RADIUS) ** 1.4;
			// Soften the center so crossing the middle of a pixel cannot snap it across the pointer.
			const scale = force / Math.max(distance, 0.75);
			pixel.element.style.transform = `translate(${scale * dx}px, ${scale * dy}px)`;
			pixel.element.style.fill = force > 0.55 ? "#6f8c52" : "";
		}
	}

	function renderSweep(point: Point): void {
		const center = (clamp(point.x, 0, GRID_SIZE) / GRID_SIZE) * sweepEnd;
		for (const pixel of pixels) {
			const step = Math.floor(Math.abs(pixel.x + pixel.y - center) / 1.12);
			pixel.element.style.fill = SWEEP_COLORS[step] ?? "";
		}
	}

	function paint(): void {
		frame = 0;
		if (!mode || !pointer || !svg) return;
		const { left, top, width, height } = svg.getBoundingClientRect();
		if (!width || !height) return;
		const point = {
			x: ((pointer.clientX - left) * GRID_SIZE) / width,
			y: ((pointer.clientY - top) * GRID_SIZE) / height,
		};
		if (mode === "block-flip") renderFlip(point);
		else if (mode === "pixel-assembly") renderAssembly(point);
		else renderSweep(point);
	}

	function move(event: PointerEvent): void {
		if (event.pointerType !== "mouse" || !hover.matches) return;
		if (!mode) {
			if (isMotionPaused() || document.documentElement.dataset["motion"] === "paused") return;
			const options = MODES.filter((candidate) => candidate !== previousMode);
			mode = options[Math.floor(Math.random() * options.length)] ?? MODES[0];
			previousMode = mode;
			if (mode !== "block-flip" && !pixels.length) makePixels();
			mark.dataset["wordmarkMode"] = mode;
			mark.dataset["wordmarkRenderer"] = mode === "block-flip" ? "blocks" : "pixels";
		}
		pointer = event;
		if (!frame) frame = requestAnimationFrame(paint);
	}

	mark.addEventListener("pointerenter", move, { passive: true, signal });
	mark.addEventListener("pointermove", move, { passive: true, signal });
	mark.addEventListener("pointerleave", reset, { signal });
	mark.addEventListener("pointercancel", reset, { signal });
	window.addEventListener("blur", reset, { signal });
	document.addEventListener(MOTION_EVENT, reset, { signal });
	hover.addEventListener("change", reset, { signal });

	return () => {
		reset();
		listeners.abort();
	};
}
