/**
 * The generic fallback object: one of eight shapes in three palette colours,
 * all picked from a seed.
 *
 * Why: a project without an `icon` still gets a stable, distinct object (the
 * seed is derived from its slug), so nobody has to model one before publishing.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import { box, cone, cyl, ico, type Mesh, type ObjectDef, ring, torus, type Vec3 } from "./mesh";

const PALETTE: readonly Vec3[] = [
	[201, 163, 107],
	[125, 138, 74],
	[181, 84, 60],
	[85, 101, 125],
	[79, 154, 148],
	[214, 169, 58],
	[127, 179, 214],
	[224, 160, 168],
	[150, 120, 170],
	[51, 50, 58],
];
const DARK: Vec3 = [51, 50, 58];

type Shape = (m: Mesh, t: number, a: Vec3, b: Vec3, c: Vec3, seed: number) => void;

const SHAPES: readonly Shape[] = [
	// Stepped tower.
	(m, _t, a, b, c) => {
		box(m, 1.1, 0.5, 1.1, [0, -0.4, 0], a);
		box(m, 0.8, 0.45, 0.8, [0, 0.08, 0], b, 0.5);
		box(m, 0.45, 0.4, 0.45, [0, 0.5, 0], c, 0.2);
	},
	// Rocket.
	(m, _t, a, b) => {
		cyl(m, 0.5, 0.7, 8, [0, -0.3, 0], a);
		cone(m, 0.62, 0, 0.8, 8, [0, 0.45, 0], b);
	},
	// Ring on a post.
	(m, _t, a, b, c) => {
		torus(m, 0.6, 0.24, 8, 5, a, b);
		box(m, 0.4, 1.3, 0.4, [0, 0, 0], c, 0.4);
	},
	// Planet.
	(m, _t, a, b) => {
		ico(m, 0.6, [0, 0, 0], a);
		ring(m, 0.85, 1.05, 10, 0, b, 0.5);
	},
	// Pyramid on a slab.
	(m, _t, a, b) => {
		box(m, 1.3, 0.25, 1.3, [0, -0.55, 0], a);
		cone(m, 0.8, 0, 1.1, 4, [0, 0.12, 0], b);
	},
	// Molecule.
	(m, _t, a, b, c) => {
		ico(m, 0.42, [-0.45, -0.2, 0], a);
		ico(m, 0.36, [0.4, -0.25, 0.2], b);
		ico(m, 0.3, [0, 0.4, -0.1], c);
		box(m, 0.08, 0.08, 0.9, [0, -0.1, 0], DARK, 1.2);
	},
	// Gear.
	(m, _t, a, b, c) => {
		cyl(m, 0.75, 0.22, 10, [0, 0, 0], a, b);
		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			box(m, 0.24, 0.22, 0.3, [Math.cos(angle) * 0.86, 0, Math.sin(angle) * 0.86], a, -angle);
		}
		cyl(m, 0.22, 0.4, 6, [0, 0, 0], c);
	},
	// Gate with a floating ball.
	(m, t, a, b, c, seed) => {
		box(m, 0.3, 1.1, 0.3, [-0.5, -0.1, 0], a);
		box(m, 0.3, 1.1, 0.3, [0.5, -0.1, 0], a);
		box(m, 1.5, 0.3, 0.4, [0, 0.58, 0], b);
		ico(m, 0.22, [0, -0.1 + Math.sin(t * 2 + seed) * 0.08, 0], c);
	},
];

/**
 * Number of distinct generic shapes.
 *
 * Why: tests cover every shape without knowing the list.
 *
 * @see packages/site/tests/unit/home-objects.test.ts
 */
export const GENERIC_SHAPE_COUNT = SHAPES.length;

function color(index: number): Vec3 {
	return PALETTE[index % PALETTE.length] ?? DARK;
}

/**
 * The generic object for a seed (any integer; its absolute value is used).
 *
 * Why: shape = `seed mod 8`, colours from three different strides through the palette.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function genericObject(seed: number): ObjectDef {
	const s = Math.abs(Math.trunc(seed)) || 1;
	const shape = SHAPES[s % SHAPES.length];
	return (mesh, t) => shape?.(mesh, t, color(s), color(s * 3 + 4), color(s * 7 + 1), s);
}
