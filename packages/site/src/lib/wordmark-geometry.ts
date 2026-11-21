type Vertex = readonly [x: number, y: number];
type Contour = readonly Vertex[];
type Glyph = { x: number; y: number; contours: readonly Contour[] };

const glyphs: readonly Glyph[] = [
	{
		x: 0,
		y: 0,
		contours: [
			[
				[0, 0],
				[1, 0],
				[1, 4],
				[4, 4],
				[4, 0],
				[5, 0],
				[5, 5],
				[0, 5],
			],
		],
	},
	{
		x: 6,
		y: 0,
		contours: [
			[
				[0, 0],
				[1, 0],
				[1, 2],
				[3, 2],
				[3, 3],
				[1, 3],
				[1, 4],
				[5, 4],
				[5, 5],
				[0, 5],
			],
		],
	},
	{
		x: 0,
		y: 6,
		contours: [
			[
				[0, 0],
				[5, 0],
				[5, 5],
				[0, 5],
			],
			[
				[1, 1],
				[1, 4],
				[4, 4],
				[4, 1],
			],
		],
	},
	{
		x: 6,
		y: 6,
		contours: [
			[
				[0, 0],
				[5, 0],
				[5, 1],
				[1, 1],
				[1, 2],
				[3, 2],
				[3, 3],
				[1, 3],
				[1, 5],
				[0, 5],
			],
		],
	},
];

type Projection = (vertex: Vertex, previous: Vertex, next: Vertex) => Vertex;

function pathData({ contours }: Glyph, project: Projection): string {
	return contours
		.map((contour) => {
			const points = contour.map((vertex, index) => {
				const previous = contour.at(index - 1) ?? vertex;
				const next = contour[(index + 1) % contour.length] ?? vertex;
				const [x, y] = project(vertex, previous, next);
				return `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
			});
			return `M${points.join("L")}Z`;
		})
		.join("");
}

/** Why: the static logo and its hover variations share one set of contours. */
export const wordmarkGlyphs = glyphs.map((glyph) => ({
	...glyph,
	path: pathData(glyph, ([x, y]) => [glyph.x + x, glyph.y + y]),
}));

/** Why: the moving inset opens the stroke without moving the letter's silhouette. */
export function outlinePath(glyph: Glyph & { path: string }, amount: number): string {
	if (amount <= 0) return glyph.path;
	const inset = 0.5 - 0.32 * amount;
	const opening = pathData(glyph, ([x, y], [previousX, previousY], [nextX, nextY]) => [
		glyph.x + x - inset * Math.sign(nextY - previousY),
		glyph.y + y + inset * Math.sign(nextX - previousX),
	]);
	// The counter in the O winds in reverse so its inset expands outward.
	// SVG's evenodd fill cuts out the opening without painting over the page behind it.
	return glyph.path + opening;
}

function fitAxis(value: number, size: number): number {
	if (value <= 1) return value;
	if (value >= 4) return size + value - 5;
	return 1 + ((value - 1) * (size - 2)) / 3;
}

/** Why: adjacent letters trade space while preserving the outer frame and the gutters. */
export function stretchPath(glyph: Glyph, dx: number, dy: number): string {
	const width = 5 + (glyph.x === 0 ? dx : -dx);
	const height = 5 + (glyph.y === 0 ? dy : -dy);
	const x = glyph.x === 0 ? 0 : glyph.x + dx;
	const y = glyph.y === 0 ? 0 : glyph.y + dy;
	// Fit the inside of the glyph while keeping the outer strokes one unit thick.
	return pathData(glyph, ([px, py]) => [x + fitAxis(px, width), y + fitAxis(py, height)]);
}
