/**
 * The named 3D objects: one entry per key a work's `icon` frontmatter may use.
 *
 * Why: adding an object is adding one entry to {@link NAMED_OBJECTS}; the works
 * schema, the renderer and the docs all read the keys from this record.
 *
 * @see packages/site/src/components/home/README.md
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import { box, cone, cyl, ico, type Mesh, type ObjectDef, ring, torus, type Vec3 } from "./mesh";

/** A box with its long axis running between two joints. */
function segment(mesh: Mesh, from: Vec3, to: Vec3, width: number, depth: number, color: Vec3) {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const dz = to[2] - from[2];
	const center = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2] as const;
	const yaw = Math.atan2(dx, dz);
	const pitch = Math.atan2(Math.hypot(dx, dz), dy);
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const cp = Math.cos(pitch);
	const sp = Math.sin(pitch);
	const start = mesh.vertices.length;
	box(mesh, width, Math.hypot(dx, dy, dz), depth, [0, 0, 0], color);
	for (const [index, [x, y, z]] of mesh.vertices.slice(start).entries()) {
		const forward = y * sp + z * cp;
		mesh.vertices[start + index] = [
			center[0] + x * cy + forward * sy,
			center[1] + y * cp - z * sp,
			center[2] - x * sy + forward * cy,
		];
	}
}

const uniform: Vec3 = [121, 128, 89];
const vest: Vec3 = [155, 147, 106];
const gear: Vec3 = [55, 59, 58];
const face: Vec3 = [174, 134, 103];

/** An original helmeted infantry figure in a forward-leaning stance. */
function soldier(m: Mesh): void {
	const forwardKnee = [-0.2, -0.55, 0.39] as const;
	const rearKnee = [0.18, -0.52, -0.36] as const;
	segment(m, [-0.15, -0.18, -0.11], forwardKnee, 0.25, 0.29, uniform);
	segment(m, forwardKnee, [-0.22, -0.86, 0.3], 0.2, 0.21, uniform);
	segment(m, [0.15, -0.19, -0.14], rearKnee, 0.25, 0.29, uniform);
	segment(m, rearKnee, [0.24, -0.85, -0.64], 0.2, 0.21, uniform);
	box(m, 0.23, 0.17, 0.33, [-0.22, -0.87, 0.4], gear);
	box(m, 0.23, 0.17, 0.31, [0.24, -0.87, -0.54], gear);
	box(m, 0.44, 0.19, 0.31, [0, -0.16, -0.11], uniform);
	segment(m, [0, -0.15, -0.13], [0, 0.46, 0.07], 0.53, 0.33, uniform);
	segment(m, [0, -0.03, 0.035], [0, 0.39, 0.17], 0.48, 0.17, vest);
	box(m, 0.37, 0.15, 0.1, [0, 0.045, 0.18], gear);
	box(m, 0.36, 0.36, 0.17, [0, 0.17, -0.18], gear);

	box(m, 0.29, 0.28, 0.27, [0, 0.58, 0.19], face);
	cone(m, 0.23, 0.155, 0.2, 7, [0, 0.74, 0.18], uniform);
	box(m, 0.33, 0.08, 0.19, [0, 0.65, 0.29], gear);

	const nearElbow = [0.33, 0.24, 0.14] as const;
	const farElbow = [-0.28, 0.23, 0.38] as const;
	segment(m, [0.25, 0.4, 0.06], nearElbow, 0.18, 0.19, uniform);
	segment(m, nearElbow, [0.12, 0.4, 0.36], 0.13, 0.14, uniform);
	segment(m, [-0.25, 0.4, 0.06], farElbow, 0.17, 0.18, uniform);
	segment(m, farElbow, [0.1, 0.41, 0.61], 0.13, 0.14, uniform);
	box(m, 0.14, 0.13, 0.16, [0.12, 0.41, 0.37], gear);
	box(m, 0.14, 0.12, 0.16, [0.1, 0.42, 0.6], gear);

	// The prop is a simple silhouette that reads at the canvas's native resolution.
	box(m, 0.11, 0.11, 0.57, [0.12, 0.47, 0.43], gear);
	box(m, 0.055, 0.055, 0.29, [0.12, 0.49, 0.83], gear);
	box(m, 0.09, 0.14, 0.11, [0.12, 0.38, 0.52], gear);
}

/**
 * Key → object. Coordinates are about ±1 around the origin, y up; `t` is seconds.
 *
 * Why: a plain record so `Object.keys` is the list of valid `icon` values.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export const NAMED_OBJECTS = {
	tactical: soldier,
	/** Alternate Tactical Arena object, a smoke grenade and three puffs. */
	"tactical-smoke"(m, t) {
		cyl(m, 0.34, 0.8, 8, [-0.35, -0.3, 0], [125, 138, 74], [60, 66, 40]);
		cyl(m, 0.14, 0.2, 6, [-0.35, 0.2, 0], [51, 50, 58]);
		ico(m, 0.42, [0.3, 0.25 + Math.sin(t * 2) * 0.05, 0.1], [226, 222, 214]);
		ico(m, 0.34, [0.62, 0.62 + Math.sin(t * 2 + 1) * 0.05, -0.2], [206, 202, 196]);
		ico(m, 0.27, [0.15, 0.8 + Math.sin(t * 2 + 2) * 0.05, 0.25], [238, 234, 226]);
	},
	/** A chip with two rows of pins. */
	eeg(m) {
		box(m, 1.5, 0.3, 1.0, [0, 0, 0], [51, 50, 58]);
		box(m, 0.5, 0.06, 0.3, [0.3, 0.18, 0.1], [214, 169, 58]);
		for (let i = 0; i < 5; i++) {
			box(m, 0.14, 0.3, 0.22, [-0.6 + i * 0.3, -0.18, 0.6], [200, 200, 204]);
			box(m, 0.14, 0.3, 0.22, [-0.6 + i * 0.3, -0.18, -0.6], [200, 200, 204]);
		}
	},
	/** A synth knob. */
	enth(m) {
		cyl(m, 0.8, 0.45, 12, [0, -0.25, 0], [51, 50, 58], [70, 69, 80]);
		cyl(m, 0.55, 0.4, 12, [0, 0.15, 0], [224, 160, 168], [240, 190, 196]);
		box(m, 0.12, 0.08, 0.5, [0, 0.39, 0.28], [36, 35, 42]);
	},
	/** A wormhole throat with a ball passing through. */
	throat(m, t) {
		torus(m, 0.72, 0.34, 10, 6, [79, 154, 148], [63, 95, 122]);
		ico(m, 0.24, [0, Math.sin(t * 1.6) * 0.12, 0], [181, 84, 60]);
	},
	/** A black hole, its disc and an orbiting body. */
	gravity(m, t) {
		ico(m, 0.46, [0, 0, 0], [36, 35, 42]);
		ring(m, 0.72, 0.98, 12, 0, [127, 179, 214], 0.35);
		ico(
			m,
			0.15,
			[Math.cos(t * 1.8) * 1.22, Math.sin(t * 1.8) * 0.42, Math.sin(t * 1.8) * 1.14],
			[214, 169, 58],
		);
	},
	/** A stack of note cards. */
	linsae(m) {
		box(m, 1.3, 0.1, 1.6, [0, -0.36, 0], [238, 230, 207], 0.25);
		box(m, 1.3, 0.1, 1.6, [0, -0.12, 0], [214, 169, 58], -0.12);
		box(m, 1.3, 0.1, 1.6, [0, 0.12, 0], [243, 239, 226], 0.4);
		box(m, 0.9, 0.04, 0.12, [0.05, 0.2, 0.3], [85, 101, 125], 0.4);
		box(m, 0.6, 0.04, 0.12, [-0.1, 0.2, 0.0], [85, 101, 125], 0.4);
	},
	/** A point source and three spreading wave fronts. */
	maxwell(m, t) {
		ico(m, 0.2, [0, 0.15 + Math.sin(t * 3) * 0.1, 0], [36, 35, 42]);
		ring(m, 0.3, 0.5, 10, Math.sin(t * 3 - 0.8) * 0.14, [181, 84, 60]);
		ring(m, 0.62, 0.82, 12, Math.sin(t * 3 - 1.6) * 0.14, [85, 101, 180]);
		ring(m, 0.94, 1.12, 14, Math.sin(t * 3 - 2.4) * 0.14, [181, 84, 60]);
	},
} satisfies Record<string, ObjectDef>;
