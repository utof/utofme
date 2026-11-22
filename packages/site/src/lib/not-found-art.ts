import { createMesh, type Mesh, type Vec3 } from "./home/objects/mesh";
import { fillFaces, shadeMesh } from "./home/objects/render";
import type { InkGrid } from "./not-found-collision";

const FOUR = [
	"...##..",
	"..###..",
	".####..",
	"##.##..",
	"##.##..",
	"#######",
	"#######",
	"...##..",
	"...##..",
];
const ZERO = [
	"..###..",
	".#####.",
	"##...##",
	"##...##",
	"##...##",
	"##...##",
	"##...##",
	".#####.",
	"..###..",
];
const DIGITS = FOUR.map((row, i) => `${row}.${ZERO[i]}.${row}`);

/**
 * Why: the server-rendered ASCII fallback uses the same digit silhouettes as the mesh.
 */
export const ERROR_ASCII = DIGITS.map((row) => row.replaceAll(".", " ").replace(/./g, "$&$&")).join(
	"\n",
);

const COLUMNS = 120;
const ROWS = 60;
const TILE = 8;
const INK_SIDE = TILE - 1;
const CELL_WIDTH = 0.098;
const CELL_HEIGHT = 0.086;
const DEPTH = 0.175;
const FACE: Vec3 = [0, 0, 255];
const SIDE: Vec3 = [255, 0, 0];
const EDGE: Vec3 = [0, 255, 0];

function quad(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3): void {
	const i = mesh.vertices.length;
	mesh.vertices.push(a, b, c, d);
	mesh.faces.push({ a: i, b: i + 1, c: i + 2, color }, { a: i, b: i + 2, c: i + 3, color });
}

function digitMesh(): Mesh {
	const mesh = createMesh();
	const columns = DIGITS[0]?.length ?? 0;
	const solid = (x: number, y: number): boolean => DIGITS[y]?.[x] === "#";
	for (let row = 0; row < DIGITS.length; row++) {
		for (let col = 0; col < columns; col++) {
			if (!solid(col, row)) continue;
			const x = (col - columns / 2) * CELL_WIDTH;
			const y = (DIGITS.length / 2 - row) * CELL_HEIGHT + 0.112;
			const a: Vec3 = [x, y, -DEPTH];
			const b: Vec3 = [x + CELL_WIDTH, y, -DEPTH];
			const c: Vec3 = [x + CELL_WIDTH, y - CELL_HEIGHT, -DEPTH];
			const d: Vec3 = [x, y - CELL_HEIGHT, -DEPTH];
			const e: Vec3 = [x, y, DEPTH];
			const f: Vec3 = [x + CELL_WIDTH, y, DEPTH];
			const g: Vec3 = [x + CELL_WIDTH, y - CELL_HEIGHT, DEPTH];
			const h: Vec3 = [x, y - CELL_HEIGHT, DEPTH];
			quad(mesh, a, b, c, d, FACE);
			quad(mesh, e, f, g, h, FACE);
			if (!solid(col - 1, row)) quad(mesh, a, d, h, e, SIDE);
			if (!solid(col + 1, row)) quad(mesh, b, c, g, f, SIDE);
			if (!solid(col, row - 1)) quad(mesh, a, b, f, e, EDGE);
			if (!solid(col, row + 1)) quad(mesh, d, c, g, h, EDGE);
		}
	}
	return mesh;
}

const INKS = [
	{ paper: "#fb4fa9", ink: "#a90a59", glyph: "#" },
	{ paper: "#f245a5", ink: "#b71b6d", glyph: "%" },
	{ paper: "#ff6bbc", ink: "#d42580", glyph: "+" },
	{ paper: "#67cbbb", ink: "#146d66", glyph: "%" },
	{ paper: "#b2f7db", ink: "#148671", glyph: "+" },
	{ paper: "#d8fce5", ink: "#258776", glyph: ":" },
	{ paper: "#8b7bf4", ink: "#5943c7", glyph: "#" },
	{ paper: "#a99cfa", ink: "#7563de", glyph: "%" },
	{ paper: "#c3b7ff", ink: "#8d7ee6", glyph: "+" },
];

function makeTiles(): HTMLCanvasElement | null {
	const atlas = document.createElement("canvas");
	atlas.width = INKS.length * TILE;
	atlas.height = TILE;
	const context = atlas.getContext("2d");
	if (!context) return null;
	context.font = "bold 8px monospace";
	context.textBaseline = "top";
	for (const [index, { paper, ink, glyph }] of INKS.entries()) {
		const left = index * TILE;
		context.fillStyle = paper;
		context.fillRect(left, 0, INK_SIDE, INK_SIDE);
		context.fillStyle = ink;
		context.fillText(glyph, left + 1, -1);
	}
	return atlas;
}

/**
 * Create a painter for one 404 canvas, or keep the text fallback when canvas is unavailable.
 * Why: the site's existing mesh renderer projects into 120 × 60 cells. Each sample selects a
 * prepainted character tile, so the animation does no per-frame typesetting or DOM work.
 */
export function createErrorPainter(
	canvas: HTMLCanvasElement,
): ((seconds: number) => InkGrid) | null {
	const sample = document.createElement("canvas");
	sample.width = COLUMNS;
	sample.height = ROWS;
	const guide = sample.getContext("2d", { willReadFrequently: true });
	const output = canvas.getContext("2d");
	const tiles = makeTiles();
	if (!guide || !output || !tiles) return null;
	canvas.width = COLUMNS * TILE;
	canvas.height = ROWS * TILE;
	const mesh = digitMesh();
	const cells = new Uint8Array(COLUMNS * ROWS);
	return (seconds) => {
		const pose = {
			yaw: -0.42 * Math.cos(seconds * 0.88),
			pitch: -0.26 * Math.cos(seconds * 0.73 + 0.28),
			roll: 0.105 * Math.cos(seconds * 1.09 + 0.65),
			pop: 0,
		};
		guide.clearRect(0, 0, COLUMNS, ROWS);
		fillFaces(guide, shadeMesh(mesh, pose, COLUMNS, ROWS));
		const { data } = guide.getImageData(0, 0, COLUMNS, ROWS);
		output.clearRect(0, 0, canvas.width, canvas.height);
		cells.fill(0);
		let left = COLUMNS;
		let top = ROWS;
		let right = 0;
		let bottom = 0;
		for (let cell = 0; cell < cells.length; cell++) {
			const offset = cell * 4;
			if ((data[offset + 3] ?? 0) < 128) continue;
			const red = data[offset] ?? 0;
			const green = data[offset + 1] ?? 0;
			const blue = data[offset + 2] ?? 0;
			const group = blue >= red && blue >= green ? 6 : red >= green ? 0 : 3;
			const light = Math.max(red, green, blue);
			const tile = group + (light < 150 ? 0 : light < 201 ? 1 : 2);
			const column = cell % COLUMNS;
			const row = Math.floor(cell / COLUMNS);
			cells[cell] = 1;
			left = Math.min(left, column);
			top = Math.min(top, row);
			right = Math.max(right, column);
			bottom = row;
			output.drawImage(
				tiles,
				tile * TILE,
				0,
				INK_SIDE,
				INK_SIDE,
				column * TILE,
				row * TILE,
				INK_SIDE,
				INK_SIDE,
			);
		}
		const tileSize = INK_SIDE / TILE;
		return {
			columns: COLUMNS,
			rows: ROWS,
			cells,
			tileSize,
			left,
			top,
			right: right + tileSize,
			bottom: bottom + tileSize,
		};
	};
}
