/**
 * Software renderer for the home-page objects: project, shade, sort, fill.
 *
 * Why: the canvases are 32-56 px wide and scaled up with `image-rendering:
 * pixelated`, so a painter's-algorithm 2D fill of a few dozen triangles is all
 * that is needed (no WebGL context per project). `shadeMesh` is pure so the
 * maths is unit-tested without a canvas.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import type { Mesh } from "./mesh";

/**
 * How one frame is posed.
 *
 * Why: grouped so the loop passes one object per canvas.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface Pose {
	/** Rotation about the vertical axis, radians. */
	readonly yaw: number;
	/** 1 → 0 while a just-opened object bounces; 0 = at rest. */
	readonly pop: number;
}

/**
 * A triangle ready to fill: integer pixel corners, a CSS colour, and its depth.
 *
 * Why: the pure output of {@link shadeMesh}.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface ShadedFace {
	readonly points: readonly [number, number, number, number, number, number];
	readonly fill: string;
	readonly depth: number;
}

const PITCH = -0.52;
const CAMERA = 4.4;
const LIGHT = [-0.42, 0.72, -0.55] as const;
/** Brightness is quantised to this many steps: the flat, banded look. */
const SHADE_STEPS = 5;

/**
 * How much a popping object squashes its ground shadow (0 at rest).
 *
 * Why: shared by the projection and the shadow so they move together.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function popBounce(pop: number): number {
	return pop > 0 ? Math.abs(Math.sin(pop * 9)) * pop : 0;
}

/**
 * Projects and shades a mesh for a `width × height` canvas. Faces come back
 * far-to-near, so filling them in order hides the hidden ones.
 *
 * Why: pure (no canvas), so tests can check ordering, bounds and colours.
 *
 * @see https://en.wikipedia.org/wiki/Painter%27s_algorithm
 */
export function shadeMesh(mesh: Mesh, pose: Pose, width: number, height: number): ShadedFace[] {
	const { yaw, pop } = pose;
	const bounce = popBounce(pop);
	const squash = pop > 0 ? 1 + 0.2 * Math.sin(pop * 18) * pop : 1;
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const cp = Math.cos(PITCH);
	const sp = Math.sin(PITCH);
	const scale = width * 0.35;

	const projected = mesh.vertices.map(([px, py, pz]) => {
		const x = (px * cy + pz * sy) * (2 - squash);
		const z = -px * sy + pz * cy;
		const y = py * squash + bounce * 0.5;
		const y2 = y * cp - z * sp;
		const z2 = y * sp + z * cp;
		const d = CAMERA / (CAMERA + z2);
		return {
			sx: Math.round(width / 2 + x * d * scale),
			sy: Math.round(height * 0.56 - y2 * d * scale),
			x,
			y: y2,
			z: z2,
		};
	});

	const out: ShadedFace[] = [];
	for (const face of mesh.faces) {
		const a = projected[face.a];
		const b = projected[face.b];
		const c = projected[face.c];
		if (!a || !b || !c) continue;
		const ux = b.x - a.x;
		const uy = b.y - a.y;
		const uz = b.z - a.z;
		const vx = c.x - a.x;
		const vy = c.y - a.y;
		const vz = c.z - a.z;
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
		const lit = Math.abs((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / len);
		const shade = Math.round((0.45 + 0.55 * lit) * SHADE_STEPS) / SHADE_STEPS;
		const [r, g, bl] = face.color;
		out.push({
			points: [a.sx, a.sy, b.sx, b.sy, c.sx, c.sy],
			fill: `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(bl * shade)})`,
			depth: (a.z + b.z + c.z) / 3,
		});
	}
	return out.sort((p, q) => q.depth - p.depth);
}

/**
 * Clears the canvas and draws the ground shadow and the mesh.
 *
 * Why: the only function that touches a 2D context; a missing context is a no-op.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D
 */
export function drawObject(canvas: HTMLCanvasElement, mesh: Mesh, pose: Pose): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const { width, height } = canvas;
	ctx.clearRect(0, 0, width, height);
	const scale = width * 0.35;
	ctx.fillStyle = "rgba(36,35,42,0.2)";
	ctx.beginPath();
	ctx.ellipse(
		width / 2,
		height * 0.86,
		scale * (0.95 - popBounce(pose.pop) * 0.25),
		scale * 0.2,
		0,
		0,
		Math.PI * 2,
	);
	ctx.fill();
	ctx.lineWidth = 1;
	for (const face of shadeMesh(mesh, pose, width, height)) {
		const [x1, y1, x2, y2, x3, y3] = face.points;
		ctx.fillStyle = face.fill;
		ctx.strokeStyle = face.fill;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.lineTo(x3, y3);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
}
