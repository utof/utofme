/**
 * Pointer gestures on the pet: pat, poke or carry.
 *
 * Why: one pure state machine fed with pointer positions, so "a click on the
 * head is one pat, a drag is not a pat" is a unit test and not a guess about
 * event order. The view translates DOM pointer events into {@link GestureInput}.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */

/**
 * An axis-aligned box in client pixels.
 *
 * Why: the pet's box, shared by the gesture and the docking maths.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * Where a point falls on the pet.
 *
 * Why: the head is for patting, the body for poking and carrying.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export type Zone = "head" | "body" | "outside";

/**
 * Gesture thresholds, in CSS pixels (and a share of the box for the head).
 *
 * Why: named and exported so the tests and the spec quote the same numbers.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export const GESTURE = {
	/** The head zone is this share of the box, from the top. */
	headShare: 0.46,
	/** …plus this many pixels above the box. */
	headHalo: 8,
	/** Pointer travel per extra pat while the press is held. */
	strokePx: 18,
	/** A body press that moves further than this becomes a carry. */
	carrySlop: 8,
	/** A head press that leaves the box by more than this becomes a carry. */
	escapePx: 24,
} as const;

/**
 * The zone of a point for a pet occupying `box`.
 *
 * Why: the top of the head is the patting target; a little air above it counts.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export function zoneAt(x: number, y: number, box: Box): Zone {
	if (x < box.x || x > box.x + box.w) return "outside";
	if (y < box.y - GESTURE.headHalo || y > box.y + box.h) return "outside";
	return y < box.y + box.h * GESTURE.headShare ? "head" : "body";
}

/**
 * A pointer event reduced to what the recogniser needs.
 *
 * Why: no DOM types, so the tests build inputs as plain objects.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export interface GestureInput {
	readonly type: "down" | "move" | "up" | "cancel";
	readonly x: number;
	readonly y: number;
}

/**
 * What a step recognised.
 *
 * Why: the view maps each to one effect (count pats, blink, move the pet).
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export type GestureOutput =
	| { readonly kind: "pat"; readonly count: number }
	| { readonly kind: "poke" }
	| { readonly kind: "carry-start" }
	| { readonly kind: "carry-move"; readonly dx: number; readonly dy: number }
	| { readonly kind: "carry-end" };

/**
 * The recogniser's memory between events.
 *
 * Why: immutable, so a test can replay any prefix of a gesture.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export interface GestureState {
	readonly phase: "idle" | "pat" | "press" | "carry";
	readonly startX: number;
	readonly startY: number;
	readonly lastX: number;
	readonly lastY: number;
	/** Travel since the last pat, px. */
	readonly travel: number;
}

/**
 * The state before any press.
 *
 * Why: the one starting value.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export const GESTURE_IDLE: GestureState = {
	phase: "idle",
	startX: 0,
	startY: 0,
	lastX: 0,
	lastY: 0,
	travel: 0,
};

function outsideBy(x: number, y: number, box: Box): number {
	const dx = Math.max(box.x - x, 0, x - (box.x + box.w));
	const dy = Math.max(box.y - y, 0, y - (box.y + box.h));
	return Math.max(dx, dy);
}

/**
 * Advances the recogniser by one pointer event.
 *
 * - press on the head → one pat at once, one more per {@link GESTURE.strokePx} of travel;
 * - press on the body, released in place → a poke;
 * - press on the body that moves, or a head press that leaves the box → a carry (no more pats).
 *
 * Why: `box` is the pet's box when the press began; the caller keeps it fixed for the gesture.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export function gestureStep(
	state: GestureState,
	input: GestureInput,
	box: Box,
): { readonly state: GestureState; readonly out: readonly GestureOutput[] } {
	const { x, y } = input;
	if (input.type === "down") {
		const zone = zoneAt(x, y, box);
		if (zone === "outside") return { state: GESTURE_IDLE, out: [] };
		const next: GestureState = {
			phase: zone === "head" ? "pat" : "press",
			startX: x,
			startY: y,
			lastX: x,
			lastY: y,
			travel: 0,
		};
		return { state: next, out: zone === "head" ? [{ kind: "pat", count: 1 }] : [] };
	}
	if (state.phase === "idle") return { state, out: [] };
	if (input.type === "cancel") {
		return { state: GESTURE_IDLE, out: state.phase === "carry" ? [{ kind: "carry-end" }] : [] };
	}
	if (input.type === "up") {
		if (state.phase === "carry") return { state: GESTURE_IDLE, out: [{ kind: "carry-end" }] };
		return { state: GESTURE_IDLE, out: state.phase === "press" ? [{ kind: "poke" }] : [] };
	}
	const dx = x - state.lastX;
	const dy = y - state.lastY;
	const moved: GestureState = { ...state, lastX: x, lastY: y };
	if (state.phase === "carry") return { state: moved, out: [{ kind: "carry-move", dx, dy }] };
	const becomesCarry =
		state.phase === "press"
			? Math.hypot(x - state.startX, y - state.startY) > GESTURE.carrySlop
			: outsideBy(x, y, box) > GESTURE.escapePx;
	if (becomesCarry) {
		return {
			state: { ...moved, phase: "carry", travel: 0 },
			out: [{ kind: "carry-start" }, { kind: "carry-move", dx, dy }],
		};
	}
	if (state.phase === "press") return { state: moved, out: [] };
	const travel = state.travel + Math.hypot(dx, dy);
	const count = Math.floor(travel / GESTURE.strokePx);
	return {
		state: { ...moved, travel: travel - count * GESTURE.strokePx },
		out: count > 0 ? [{ kind: "pat", count }] : [],
	};
}
