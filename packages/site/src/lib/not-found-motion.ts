import { isMotionPaused, MOTION_EVENT } from "./motion";
import { createErrorPainter } from "./not-found-art";
import { crossesInk, isOnInk, moveAxis } from "./not-found-collision";

const PAINT_INTERVAL = 30;
const MIN_SWIPE_SPEED = 130;
const MAX_SWIPE_SPEED = 1800;

interface Cursor {
	x: number;
	y: number;
	time: number;
	inside: boolean;
}

/**
 * Mount the floating 404 with a stationary layout slot and viewport-edge collisions.
 * Why: the viewport layer can move independently of the heading and return button.
 * The rasterized squares supply both the pointer sweep and the wall limits.
 */
export function mountNotFoundArt(
	slot: HTMLElement,
	canvas: HTMLCanvasElement,
): (() => void) | undefined {
	const plane = canvas.parentElement;
	const paint = createErrorPainter(canvas);
	if (!plane || !paint) return;

	const events = new AbortController();
	const { signal } = events;
	let raster = paint(0);
	let origin = slot.getBoundingClientRect();
	let x = origin.left;
	let y = origin.top;
	let vx = 0;
	let vy = 0;
	let width = 0;
	let height = 0;
	let scale = 1;
	let visible = false;
	let cursor: Cursor | undefined;
	let request = 0;
	let clock = 0;
	let lastTick = 0;
	let lastPaint = 0;
	let previousTransform = "";

	function place(delta: number): void {
		const horizontal = moveAxis(x, vx, delta, -raster.left * scale, width - raster.right * scale);
		const vertical = moveAxis(y, vy, delta, -raster.top * scale, height - raster.bottom * scale);
		x = horizontal.position;
		y = vertical.position;
		vx = horizontal.velocity;
		vy = vertical.velocity;
		const transform = `translate3d(${x}px, ${y}px, 0)`;
		if (transform !== previousTransform) {
			canvas.style.transform = transform;
			previousTransform = transform;
		}
	}

	const tick = (now: number): void => {
		request = requestAnimationFrame(tick);
		const delta = Math.max(0, Math.min(50, now - lastTick));
		lastTick = now;
		clock += delta;
		if (clock - lastPaint >= PAINT_INTERVAL) {
			lastPaint = clock;
			raster = paint(clock / 1000);
		}
		place(delta / 1000);
	};

	function sync(): void {
		if (visible && !document.hidden && !isMotionPaused()) {
			if (request) return;
			lastTick = performance.now();
			request = requestAnimationFrame(tick);
		} else {
			cancelAnimationFrame(request);
			request = 0;
			cursor = undefined;
		}
	}

	const measure = (): void => {
		const next = slot.getBoundingClientRect();
		x += next.left - origin.left;
		y += next.top - origin.top;
		origin = next;
		width = plane.clientWidth;
		height = plane.clientHeight;
		scale = origin.width / raster.columns;
		visible = scale > 0 && origin.bottom > 0 && origin.top < height;
		canvas.hidden = !visible;
		canvas.style.width = `${origin.width}px`;
		place(0);
		sync();
	};

	function swipe(event: PointerEvent): void {
		// Some browser input paths leave the device type empty for mouse movement.
		if (!request || !event.isPrimary || (event.pointerType && event.pointerType !== "mouse"))
			return;
		const previous = cursor;
		const to = { x: (event.clientX - x) / scale, y: (event.clientY - y) / scale };
		const inside = isOnInk(raster, to, 1);
		cursor = { x: event.clientX, y: event.clientY, time: event.timeStamp, inside };
		if (!previous || previous.inside || event.buttons !== 0) return;
		if (event.target instanceof Element && event.target.closest("a, button, input")) return;
		const dx = cursor.x - previous.x;
		const dy = cursor.y - previous.y;
		const distance = Math.hypot(dx, dy);
		const ms = Math.max(8, Math.min(64, cursor.time - previous.time));
		const speed = Math.min(MAX_SWIPE_SPEED, (distance * 1000) / ms);
		if (speed < MIN_SWIPE_SPEED) return;
		const from = { x: (previous.x - x) / scale, y: (previous.y - y) / scale };
		if (!crossesInk(raster, from, to)) return;
		const push = (speed * 0.82) / distance;
		vx = vx * 0.18 + dx * push;
		vy = vy * 0.18 + dy * push;
	}

	slot.querySelector("[data-404-letters]")?.setAttribute("hidden", "");
	measure();
	const observer = new ResizeObserver(measure);
	observer.observe(slot);
	observer.observe(plane);
	window.addEventListener("scroll", measure, { signal, passive: true });
	window.addEventListener("pointermove", swipe, { signal, passive: true });
	document.documentElement.addEventListener(
		"pointerleave",
		() => {
			cursor = undefined;
		},
		{ signal },
	);
	document.addEventListener(MOTION_EVENT, sync, { signal });
	document.addEventListener("visibilitychange", sync, { signal });
	return () => {
		events.abort();
		observer.disconnect();
		cancelAnimationFrame(request);
	};
}
