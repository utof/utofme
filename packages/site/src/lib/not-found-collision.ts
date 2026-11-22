/** Why: rendering, cursor contact, and wall contact share one frame's occupied tiles. */
export interface InkGrid {
	readonly columns: number;
	readonly rows: number;
	readonly cells: Uint8Array;
	/** Side length of the painted square, in cell units, excluding the gutter. */
	readonly tileSize: number;
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

/** Why: the sweep takes coordinates in the frame's cell units. */
export interface InkPoint {
	readonly x: number;
	readonly y: number;
}

/**
 * Why: the tile gutter is transparent for contact. While a pointer is already on
 * a digit, it must leave its cell before it can start another outside swipe.
 */
export function isOnInk(grid: InkGrid, point: InkPoint, tileSize = grid.tileSize): boolean {
	const column = Math.floor(point.x);
	const row = Math.floor(point.y);
	return (
		column >= 0 &&
		column < grid.columns &&
		row >= 0 &&
		row < grid.rows &&
		point.x - column < tileSize &&
		point.y - row < tileSize &&
		grid.cells[row * grid.columns + column] === 1
	);
}

function axisInterval(
	from: number,
	to: number,
	min: number,
	max: number,
): readonly [number, number] {
	const delta = to - from;
	if (delta === 0) return from >= min && from < max ? [-Infinity, Infinity] : [Infinity, -Infinity];
	const a = (min - from) / delta;
	const b = (max - from) / delta;
	return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Whether a cursor segment enters a painted square from outside the artwork.
 * Why: a canvas box includes the digit holes, gutters, and surrounding blank space.
 * Checking only the endpoint would also miss fast swipes that pass between pointer events.
 * A Chromium 147 probe hit blank space with elementFromPoint and missed a full
 * pass-through with isPointInPath at both endpoints.
 * @see https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-ispointinpath-dev
 * @see https://www.w3.org/TR/cssom-view-1/#dom-document-elementfrompoint
 */
export function crossesInk(grid: InkGrid, from: InkPoint, to: InkPoint): boolean {
	const { columns, cells, tileSize } = grid;
	if (isOnInk(grid, from)) return false;

	const left = Math.max(grid.left, Math.floor(Math.min(from.x, to.x)));
	const top = Math.max(grid.top, Math.floor(Math.min(from.y, to.y)));
	const right = Math.min(Math.floor(grid.right), Math.floor(Math.max(from.x, to.x)));
	const bottom = Math.min(Math.floor(grid.bottom), Math.floor(Math.max(from.y, to.y)));
	for (let row = top; row <= bottom; row++) {
		const [enterY, leaveY] = axisInterval(from.y, to.y, row, row + tileSize);
		if (Math.max(0, enterY) >= Math.min(1, leaveY)) continue;
		for (let column = left; column <= right; column++) {
			if (!cells[row * columns + column]) continue;
			const [enterX, leaveX] = axisInterval(from.x, to.x, column, column + tileSize);
			if (Math.max(0, enterX, enterY) < Math.min(1, leaveX, leaveY)) return true;
		}
	}
	return false;
}

/**
 * Move with drag and bounce within a single axis's current painted limits.
 * Why: the pose changes the limits each frame, independently of the cursor and velocity.
 */
export function moveAxis(
	position: number,
	velocity: number,
	seconds: number,
	min: number,
	max: number,
): { position: number; velocity: number } {
	if (min >= max) return { position: (min + max) / 2, velocity: 0 };
	const next = position + velocity * seconds;
	const speed = velocity * Math.exp(-1.65 * seconds);
	const slowed = Math.abs(speed) > 7 ? speed : 0;
	if (next <= min) return { position: min, velocity: slowed < 0 ? -slowed * 0.72 : slowed };
	if (next >= max) return { position: max, velocity: slowed > 0 ? -slowed * 0.72 : slowed };
	return { position: next, velocity: slowed };
}
