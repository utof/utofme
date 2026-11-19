/**
 * Where the pet rests: on a side edge, fully out or tucked to a sliver.
 *
 * Why: the geometry of "never covers text or controls" is pure. The view only
 * answers one question per candidate ("is this box free?") by sampling the page.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2, 3)
 */
import type { Box } from "./gesture";

/**
 * Sliver widths tried, widest first, when the pet cannot be fully out; the last one always applies.
 *
 * Why: 40 px shows an eye and a feeler; 10 px is the least that can still be found and clicked.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export const PEEKS: readonly number[] = [40, 28, 16, 10];

/**
 * Distances kept from the viewport: from the side when out, from the top (sticky headers) and from the bottom.
 *
 * Why: one place for the three numbers the box maths needs.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export const INSET = { side: 12, top: 72, bottom: 12 } as const;

/**
 * The viewport and the pet's size and place on its edge.
 *
 * Why: everything {@link dockBox} needs, with no DOM.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export interface DockInput {
	readonly viewportW: number;
	readonly viewportH: number;
	/** Side of the pet's square box, px. */
	readonly size: number;
	readonly side: "left" | "right";
	/** 0 = as high as allowed, 1 = at the bottom. */
	readonly y: number;
}

function clamp01(v: number): number {
	return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/**
 * Top of the pet's box for a dock height `y` (0 … 1).
 *
 * Why: the box always stays inside the viewport, whatever was saved on a bigger screen.
 *
 * @see packages/specs/specs/11-pet.md § "Also in" (Carry)
 */
export function dockTop(input: DockInput): number {
	const room = Math.max(0, input.viewportH - input.size - INSET.top - INSET.bottom);
	const top = Math.min(INSET.top, Math.max(0, input.viewportH - input.size - INSET.bottom));
	return top + clamp01(input.y) * room;
}

/**
 * The pet's whole box when `visible` px of it show; `visible >= size` means fully out.
 *
 * Why: out sits {@link INSET.side} px in from the edge; tucked hangs past the edge.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export function dockBox(input: DockInput, visible: number): Box {
	const out = visible >= input.size;
	const shown = out ? input.size + INSET.side : Math.max(0, visible);
	const x = input.side === "right" ? input.viewportW - shown : shown - input.size;
	return { x, y: dockTop(input), w: input.size, h: input.size };
}

/**
 * The part of {@link dockBox} that is inside the viewport.
 *
 * Why: this is the area that must hold no text and no control.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export function visibleBox(input: DockInput, visible: number): Box {
	const box = dockBox(input, visible);
	const left = Math.max(0, box.x);
	const right = Math.min(input.viewportW, box.x + box.w);
	return { x: left, y: box.y, w: Math.max(0, right - left), h: box.h };
}

/**
 * The widest resting width whose box is free: `size` (out), else the first free
 * entry of {@link PEEKS}, else the narrowest.
 *
 * Why: the pet takes the room there is and never more.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export function choosePeek(size: number, isFree: (visible: number) => boolean): number {
	if (isFree(size)) return size;
	for (const peek of PEEKS) if (peek < size && isFree(peek)) return peek;
	return PEEKS[PEEKS.length - 1] ?? 0;
}

/**
 * The dock for a pet dropped with its centre at (`x`, `y`): the nearer side, the height clamped.
 *
 * Why: a carried pet always ends on an edge, so it cannot be left on the text.
 *
 * @see packages/specs/specs/11-pet.md § "Also in" (Carry)
 */
export function dropDock(
	x: number,
	y: number,
	viewportW: number,
	viewportH: number,
	size: number,
): { readonly side: "left" | "right"; readonly y: number } {
	const room = Math.max(1, viewportH - size - INSET.top - INSET.bottom);
	return {
		side: x < viewportW / 2 ? "left" : "right",
		y: clamp01((y - size / 2 - INSET.top) / room),
	};
}

/**
 * CSS selector of elements the pet must not rest on, besides any element with text of its own.
 *
 * Why: data, so the rule can be read (and extended) without reading the view.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2)
 */
export const OBSTACLES =
	"a,button,input,select,textarea,summary,label,img,picture,video,canvas,svg,iframe,figure,pre,table,[role],[tabindex]";
