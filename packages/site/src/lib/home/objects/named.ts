/**
 * The named 3D objects: one entry per key a work's `icon` frontmatter may use.
 *
 * Why: adding an object is adding one entry to {@link NAMED_OBJECTS}; the works
 * schema, the renderer and the docs all read the keys from this record.
 *
 * @see packages/site/src/components/home/README.md
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import { box, cyl, ico, type ObjectDef, ring, torus } from "./mesh";

/**
 * Key → object. Coordinates are about ±1 around the origin, y up; `t` is seconds.
 *
 * Why: a plain record so `Object.keys` is the list of valid `icon` values.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export const NAMED_OBJECTS = {
	/** A smoke grenade and three puffs of smoke. */
	tactical(m, t) {
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
