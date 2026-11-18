/**
 * The creature: Nib, a ringling (a small planet with a face), as data.
 *
 * Why: everything about how the pet looks is in this file: its mesh, built from
 * the home page's low-poly primitives, and one pose per mood. The view draws
 * whatever {@link buildCreature} returns with the shared software renderer, so
 * a different creature is a different version of this file and nothing else.
 *
 * Coordinates as in `lib/home/objects`: about ±1 around the origin, y up, the
 * face towards −z (the camera), the ground at y = {@link GROUND}.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 * @see packages/site/src/lib/home/objects/mesh.ts
 */
import { box, ico, type Mesh, ring, type Vec3 } from "../home/objects/mesh";
import type { Mood } from "./mood";

/**
 * Side of the creature's square canvas buffer, px (scaled up pixelated by CSS).
 *
 * Why: 48 keeps two-pixel pupils readable; the home objects use 32–56.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export const CANVAS_PX = 48;

/**
 * Where the mouth is on the canvas, as shares of its width and height.
 *
 * Why: the point that flying letters aim for.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export const MOUTH_AT = { x: 0.5, y: 0.66 } as const;

/** Height of the ground under the creature (where the renderer draws the shadow). */
const GROUND = -0.86;
/** How far the head leans back, radians. */
const FACE_TILT = 0.45;
const INK: Vec3 = [36, 35, 42];
const EYE: Vec3 = [243, 239, 226];
const RING: Vec3 = [181, 84, 60];
const TIP: Vec3 = [214, 169, 58];

/** Body colours along the diet ramp: [vowel share, colour]. */
const RAMP: readonly (readonly [number, Vec3])[] = [
	[0.2, [79, 154, 148]],
	[0.4, [127, 196, 160]],
	[0.56, [214, 169, 58]],
	[0.72, [224, 160, 168]],
];

/**
 * Everything that can vary in how the creature is drawn.
 *
 * Why: plain numbers, so a pose can be asserted in a test and interpolated later.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export interface CreaturePose {
	/** Pupils: −1 (left / down) … 1 (right / up). */
	readonly gazeX: number;
	readonly gazeY: number;
	/** Eyelids: 0 open … 1 closed. */
	readonly lids: number;
	/** Closed eyes drawn as raised lines (a happy squint) instead of low ones (sleep). */
	readonly squint: boolean;
	/** Mouth: 0 closed … 1 wide. */
	readonly mouth: number;
	/** Flattening: 0 none … 0.3 well squashed. */
	readonly squash: number;
	/** Feelers' angle from upright, radians: 0.1 perked … 1.9 drooping. */
	readonly feelers: number;
	readonly ringTilt: number;
	/** Height of the ring's centre. */
	readonly ringY: number;
	/** How far the body is off the ground. */
	readonly lift: number;
	/** Sideways offset (a head shake). */
	readonly sway: number;
	/** Feet: 0 planted … 1 dangling. */
	readonly feet: number;
	/** Overall size, 0.84 … 1. */
	readonly scale: number;
	readonly color: Vec3;
}

/**
 * What the pose depends on besides the mood.
 *
 * Why: the view owns the pointer and the saved state; the creature only needs these numbers.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export interface PoseInput {
	/** Seconds; drives the stepped movement. A constant gives a still figure. */
	readonly t: number;
	readonly gazeX: number;
	readonly gazeY: number;
	/** Text is selected: the mouth opens a little. */
	readonly selecting: boolean;
	readonly scale: number;
	/** Vowel share of the diet, 0 … 1. */
	readonly warmth: number;
}

/**
 * The body colour for a diet's vowel share: teal → mint → gold → pink.
 *
 * Why: piecewise linear over a fixed ramp taken from the home objects' palette.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export function bodyColor(warmth: number): Vec3 {
	const first = RAMP[0];
	const last = RAMP[RAMP.length - 1];
	if (!first || !last) return [127, 196, 160];
	if (!(warmth > first[0])) return first[1];
	for (let i = 1; i < RAMP.length; i++) {
		const a = RAMP[i - 1];
		const b = RAMP[i];
		if (!a || !b || warmth > b[0]) continue;
		const k = (warmth - a[0]) / (b[0] - a[0]);
		return [
			Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
			Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
			Math.round(a[1][2] + (b[1][2] - a[1][2]) * k),
		];
	}
	return last[1];
}

/** A blink: closed for a moment every few seconds. */
function blink(t: number): number {
	return t % 4.7 > 4.5 ? 1 : 0;
}

/**
 * The pose of a mood at time `t`.
 *
 * Why: one table of poses; the moods differ in eyes, mouth, feelers, ring and
 * stance, so each reads at 48 px without colour.
 *
 * @see packages/specs/specs/11-pet.md § "The creature" (States)
 */
export function poseFor(mood: Mood, input: PoseInput): CreaturePose {
	const { t } = input;
	const base: CreaturePose = {
		gazeX: 0,
		gazeY: 0,
		lids: 0,
		squint: false,
		mouth: 0,
		squash: 0,
		feelers: 0.5,
		ringTilt: 0.3 + 0.06 * Math.sin(t * 1.6),
		ringY: -0.22,
		lift: 0,
		sway: 0,
		feet: 0,
		scale: input.scale,
		color: bodyColor(input.warmth),
	};
	switch (mood) {
		case "asleep":
			return { ...base, lids: 1, squash: 0.1, feelers: 1.75, ringTilt: 0, ringY: -0.5 };
		case "idle":
			return { ...base, lids: blink(t) };
		case "curious":
			return {
				...base,
				gazeX: input.gazeX,
				gazeY: input.gazeY,
				lids: blink(t),
				mouth: input.selecting ? 0.45 : 0,
				feelers: 0.15,
			};
		case "patted":
			return {
				...base,
				lids: 1,
				squint: true,
				squash: Math.floor(t * 9) % 2 === 0 ? 0.22 : 0.13,
				feelers: 1.3,
				ringTilt: 0.18,
			};
		case "eating":
			return {
				...base,
				lids: 0.3,
				mouth: Math.floor(t * 9) % 2 === 0 ? 1 : 0.15,
				feelers: 0.3,
			};
		case "full":
			return {
				...base,
				gazeX: -0.9,
				lids: 0.35,
				feelers: 0.9,
				sway: Math.sin(t * 8) * 0.06,
				squash: 0.05,
			};
		case "happy":
			return {
				...base,
				lids: 1,
				squint: true,
				feelers: 0.2,
				ringTilt: 0.3 + 0.2 * Math.sin(t * 6),
				lift: Math.abs(Math.sin(t * 7)) * 0.12,
			};
		case "held":
			return {
				...base,
				gazeY: -0.6,
				mouth: 0.3,
				feelers: 0.1,
				ringTilt: 0.75,
				lift: 0.16,
				feet: 1,
			};
	}
}

function shade(color: Vec3, k: number): Vec3 {
	return [Math.round(color[0] * k), Math.round(color[1] * k), Math.round(color[2] * k)];
}

/**
 * Appends the creature in `pose` to `mesh`.
 *
 * Why: the same contract as the home page's objects (append triangles to a
 * mesh), so `drawObject` renders it unchanged.
 *
 * @see packages/site/src/lib/home/objects/render.ts
 */
export function buildCreature(mesh: Mesh, pose: CreaturePose): void {
	const start = mesh.vertices.length;
	const body = pose.color;
	const dark = shade(body, 0.62);

	// Feet and the ring stay level; everything after `tiltFrom` leans back with the head.
	const footY = -0.76 - pose.feet * 0.06;
	box(mesh, 0.26, 0.2, 0.34, [-0.3, footY, -0.08], dark);
	box(mesh, 0.26, 0.2, 0.34, [0.3, footY, -0.08], dark);
	ring(mesh, 0.84, 1.06, 12, pose.ringY, RING, pose.ringTilt);

	// The ball. Its top is the head: nothing sits on the crown.
	const tiltFrom = mesh.vertices.length;
	ico(mesh, 0.76, [0, 0, 0], body);

	// Feelers: two stalks at the sides of the crown, a ball on each.
	const reach = 0.46;
	for (const side of [-1, 1]) {
		const bx = side * 0.3;
		const by = 0.56;
		const tx = bx + side * Math.sin(pose.feelers) * reach;
		const ty = by + Math.cos(pose.feelers) * reach;
		box(mesh, 0.1, 0.1, 0.1, [(bx * 2 + tx) / 3, (by * 2 + ty) / 3, 0.1], dark);
		box(mesh, 0.1, 0.1, 0.1, [(bx + tx * 2) / 3, (by + ty * 2) / 3, 0.1], dark);
		ico(mesh, 0.14, [tx, ty, 0.1], TIP);
	}

	// Face: eyes, pupils, lids, mouth. Each layer sits a little nearer the camera.
	const eyeY = 0.1;
	const eyeH = 0.34;
	const closed = pose.lids >= 0.95;
	for (const side of [-1, 1]) {
		const ex = side * 0.28;
		if (closed && pose.squint) {
			// A happy squint: a caret of three blocks.
			box(mesh, 0.1, 0.08, 0.06, [ex, eyeY + 0.08, -0.66], INK);
			box(mesh, 0.1, 0.08, 0.06, [ex - 0.1, eyeY, -0.66], INK);
			box(mesh, 0.1, 0.08, 0.06, [ex + 0.1, eyeY, -0.66], INK);
			continue;
		}
		if (closed) {
			box(mesh, 0.3, 0.07, 0.06, [ex, eyeY - 0.08, -0.66], INK);
			continue;
		}
		box(mesh, 0.3, eyeH, 0.08, [ex, eyeY, -0.62], EYE);
		box(
			mesh,
			0.15,
			0.18,
			0.06,
			[ex + pose.gazeX * 0.07, eyeY + pose.gazeY * 0.07 - 0.02, -0.68],
			INK,
		);
		if (pose.lids > 0) {
			const lidH = eyeH * pose.lids;
			box(mesh, 0.32, lidH, 0.06, [ex, eyeY + eyeH / 2 - lidH / 2, -0.72], body);
		}
	}
	const mouthH = 0.07 + 0.2 * pose.mouth;
	box(mesh, 0.16 + 0.1 * pose.mouth, mouthH, 0.06, [0, -0.22 - mouthH / 2, -0.66], INK);

	// The head leans back, so the face looks up at the visitor (and catches the light).
	const cs = Math.cos(FACE_TILT);
	const sn = Math.sin(FACE_TILT);
	for (let i = tiltFrom; i < mesh.vertices.length; i++) {
		const v = mesh.vertices[i];
		if (v) mesh.vertices[i] = [v[0], v[1] * cs - v[2] * sn, v[1] * sn + v[2] * cs];
	}

	// Stance: squash towards the ground, scale about the ground point, then lift and sway.
	const flat = 1 - pose.squash;
	const wide = 1 + pose.squash * 0.6;
	for (let i = start; i < mesh.vertices.length; i++) {
		const v = mesh.vertices[i];
		if (!v) continue;
		mesh.vertices[i] = [
			v[0] * wide * pose.scale + pose.sway,
			(v[1] - GROUND) * flat * pose.scale + GROUND + pose.lift,
			v[2] * wide * pose.scale,
		];
	}
}
