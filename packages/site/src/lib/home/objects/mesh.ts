/**
 * Low-poly mesh type and the primitives every home-page object is built from.
 *
 * Why: the catalogue home draws a small spinning object per project on a 2D
 * canvas. Meshes are plain arrays (no 3D library, no runtime dependency): a
 * handful of triangles each, rebuilt per frame so parts can bob with time.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */

/**
 * A point or an RGB colour (0-255 per channel).
 *
 * Why: one tuple type for both keeps the primitives' signatures short.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export type Vec3 = readonly [number, number, number];

/**
 * A triangle: three vertex indices and a flat colour.
 *
 * Why: flat shading per face is the low-poly look.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface Face {
	readonly a: number;
	readonly b: number;
	readonly c: number;
	readonly color: Vec3;
}

/**
 * Vertices and triangles of one object. Unit scale: about ±1 around the origin, y up.
 *
 * Why: mutable so primitives append to one mesh.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface Mesh {
	readonly vertices: Vec3[];
	readonly faces: Face[];
}

/**
 * Draws one object into a mesh at time `t` (seconds).
 *
 * Why: the registry maps a key to one of these; `t` lets parts move.
 *
 * @see packages/site/src/lib/home/objects/named.ts
 */
export type ObjectDef = (mesh: Mesh, t: number) => void;

const TAU = Math.PI * 2;

/**
 * An empty mesh.
 *
 * Why: the one constructor, so callers never share arrays by accident.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function createMesh(): Mesh {
	return { vertices: [], faces: [] };
}

function add(mesh: Mesh, vertices: readonly Vec3[], triangles: readonly Vec3[], color: Vec3): void {
	const offset = mesh.vertices.length;
	for (const v of vertices) mesh.vertices.push(v);
	for (const [a, b, c] of triangles) {
		mesh.faces.push({ a: a + offset, b: b + offset, c: c + offset, color });
	}
}

const BOX_CORNERS: readonly Vec3[] = [
	[-1, -1, -1],
	[1, -1, -1],
	[1, 1, -1],
	[-1, 1, -1],
	[-1, -1, 1],
	[1, -1, 1],
	[1, 1, 1],
	[-1, 1, 1],
];
const BOX_TRIANGLES: readonly Vec3[] = [
	[0, 2, 1],
	[0, 3, 2],
	[4, 5, 6],
	[4, 6, 7],
	[0, 1, 5],
	[0, 5, 4],
	[3, 6, 2],
	[3, 7, 6],
	[1, 2, 6],
	[1, 6, 5],
	[0, 4, 7],
	[0, 7, 3],
];

/**
 * A box of size `w × h × d` centred at `center`, turned `yaw` radians about the y axis.
 *
 * Why: slabs, chips, pins and beams.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function box(
	mesh: Mesh,
	w: number,
	h: number,
	d: number,
	center: Vec3,
	color: Vec3,
	yaw = 0,
): void {
	const cs = Math.cos(yaw);
	const sn = Math.sin(yaw);
	const vertices = BOX_CORNERS.map(([sx, sy, sz]): Vec3 => {
		const x = (sx * w) / 2;
		const z = (sz * d) / 2;
		return [x * cs + z * sn + center[0], (sy * h) / 2 + center[1], -x * sn + z * cs + center[2]];
	});
	add(mesh, vertices, BOX_TRIANGLES, color);
}

/**
 * A truncated cone along y: radius `r1` at the bottom, `r2` at the top, `n` sides, capped.
 *
 * Why: `r2 = 0` is a cone or pyramid; `r1 = r2` is a cylinder (see {@link cyl}).
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function cone(
	mesh: Mesh,
	r1: number,
	r2: number,
	h: number,
	n: number,
	center: Vec3,
	color: Vec3,
	cap: Vec3 = color,
): void {
	const vertices: Vec3[] = [];
	const side: Vec3[] = [];
	const caps: Vec3[] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * TAU;
		vertices.push(
			[Math.cos(a) * r1 + center[0], -h / 2 + center[1], Math.sin(a) * r1 + center[2]],
			[Math.cos(a) * r2 + center[0], h / 2 + center[1], Math.sin(a) * r2 + center[2]],
		);
	}
	vertices.push(
		[center[0], -h / 2 + center[1], center[2]],
		[center[0], h / 2 + center[1], center[2]],
	);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		side.push([2 * i, 2 * i + 1, 2 * j + 1], [2 * i, 2 * j + 1, 2 * j]);
		caps.push([2 * n, 2 * j, 2 * i], [2 * n + 1, 2 * i + 1, 2 * j + 1]);
	}
	add(mesh, vertices, side, color);
	add(mesh, vertices, caps, cap);
}

/**
 * A capped cylinder along y.
 *
 * Why: shorthand for {@link cone} with equal radii.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function cyl(
	mesh: Mesh,
	r: number,
	h: number,
	n: number,
	center: Vec3,
	color: Vec3,
	cap: Vec3 = color,
): void {
	cone(mesh, r, r, h, n, center, color, cap);
}

const PHI = 1.618;
const ICO_CORNERS: readonly Vec3[] = [
	[-1, PHI, 0],
	[1, PHI, 0],
	[-1, -PHI, 0],
	[1, -PHI, 0],
	[0, -1, PHI],
	[0, 1, PHI],
	[0, -1, -PHI],
	[0, 1, -PHI],
	[PHI, 0, -1],
	[PHI, 0, 1],
	[-PHI, 0, -1],
	[-PHI, 0, 1],
];
const ICO_TRIANGLES: readonly Vec3[] = [
	[0, 11, 5],
	[0, 5, 1],
	[0, 1, 7],
	[0, 7, 10],
	[0, 10, 11],
	[1, 5, 9],
	[5, 11, 4],
	[11, 10, 2],
	[10, 7, 6],
	[7, 1, 8],
	[3, 9, 4],
	[3, 4, 2],
	[3, 2, 6],
	[3, 6, 8],
	[3, 8, 9],
	[4, 9, 5],
	[2, 4, 11],
	[6, 2, 10],
	[8, 6, 7],
	[9, 8, 1],
];

/**
 * An icosahedron of radius `r`: the low-poly ball.
 *
 * Why: 20 faces read as a sphere at 32-56 px.
 *
 * @see https://en.wikipedia.org/wiki/Regular_icosahedron#Cartesian_coordinates
 */
export function ico(mesh: Mesh, r: number, center: Vec3, color: Vec3): void {
	const s = r / Math.sqrt(1 + PHI * PHI);
	add(
		mesh,
		ICO_CORNERS.map(([x, y, z]): Vec3 => [x * s + center[0], y * s + center[1], z * s + center[2]]),
		ICO_TRIANGLES,
		color,
	);
}

/**
 * A flat ring (annulus) around the y axis at height `y`, tipped `tilt` radians.
 *
 * Why: orbits, discs and wave fronts.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function ring(
	mesh: Mesh,
	inner: number,
	outer: number,
	n: number,
	y: number,
	color: Vec3,
	tilt = 0,
): void {
	const ct = Math.cos(tilt);
	const st = Math.sin(tilt);
	const vertices: Vec3[] = [];
	const triangles: Vec3[] = [];
	for (let i = 0; i < n; i++) {
		const a = (i / n) * TAU;
		for (const r of [inner, outer]) {
			const x = Math.cos(a) * r;
			const z = Math.sin(a) * r;
			vertices.push([x, y + z * st, z * ct]);
		}
	}
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		triangles.push([2 * i, 2 * i + 1, 2 * j + 1], [2 * i, 2 * j + 1, 2 * j]);
	}
	add(mesh, vertices, triangles, color);
}

/**
 * A torus around the y axis: major radius `major`, tube radius `minor`,
 * `nu` segments around and `nv` around the tube, segments alternating two colours.
 *
 * Why: the striped doughnut (a wormhole throat, a wheel).
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function torus(
	mesh: Mesh,
	major: number,
	minor: number,
	nu: number,
	nv: number,
	colorA: Vec3,
	colorB: Vec3,
): void {
	for (let i = 0; i < nu; i++) {
		const vertices: Vec3[] = [];
		const triangles: Vec3[] = [];
		for (let di = 0; di < 2; di++) {
			const a = ((i + di) / nu) * TAU;
			for (let j = 0; j < nv; j++) {
				const b = (j / nv) * TAU;
				const r = major + minor * Math.cos(b);
				vertices.push([r * Math.cos(a), minor * Math.sin(b), r * Math.sin(a)]);
			}
		}
		for (let j = 0; j < nv; j++) {
			const j2 = (j + 1) % nv;
			triangles.push([j, nv + j, nv + j2], [j, nv + j2, j2]);
		}
		add(mesh, vertices, triangles, i % 2 ? colorB : colorA);
	}
}
