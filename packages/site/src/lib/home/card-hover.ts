import { MOTION_EVENT } from "../motion";

const MAX_OFFSET = 6;
const OFFSET_PROPERTY = "--card-hover-offset";

/** Why: the link stays fixed so the moving artwork cannot change its own hover bounds. */
export function bindCardHover(grid: HTMLElement): () => void {
	const hover = matchMedia(
		"(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)",
	);
	const listeners = new AbortController();
	const { signal } = listeners;
	const root = document.documentElement;
	let active: HTMLAnchorElement | null = null;
	let pointer: PointerEvent | undefined;
	let frame = 0;

	function reset(): void {
		cancelAnimationFrame(frame);
		frame = 0;
		pointer = undefined;
		active?.style.removeProperty(OFFSET_PROPERTY);
		active = null;
	}

	function update(): void {
		frame = 0;
		if (!active || !pointer || root.hasAttribute("data-vt-morph")) return;

		const { left, top, width, height } = active.getBoundingClientRect();
		const x = (2 * (pointer.clientX - left)) / width - 1;
		const y = (2 * (pointer.clientY - top)) / height - 1;
		const offset = (axis: number) => MAX_OFFSET * Math.max(-1, Math.min(1, axis));
		active.style.setProperty(OFFSET_PROPERTY, `translate(${offset(x)}px, ${offset(y)}px)`);
	}

	grid.addEventListener(
		"pointermove",
		(event) => {
			if (event.pointerType !== "mouse" || !hover.matches || root.dataset["motion"] === "paused")
				return;

			const card =
				event.target instanceof Element
					? event.target.closest<HTMLAnchorElement>("a.ct-feat")
					: null;
			if (card !== active) reset();
			active = card;
			if (!active) return;

			pointer = event;
			if (!frame) frame = requestAnimationFrame(update);
		},
		{ passive: true, signal },
	);
	grid.addEventListener(
		"pointerout",
		(event) => {
			if (!active || event.pointerType !== "mouse") return;
			if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
			reset();
		},
		{ signal },
	);
	grid.addEventListener("pointercancel", reset, { signal });
	window.addEventListener("blur", reset, { signal });
	document.addEventListener(MOTION_EVENT, reset, { signal });
	hover.addEventListener("change", reset, { signal });

	return () => {
		reset();
		listeners.abort();
	};
}
