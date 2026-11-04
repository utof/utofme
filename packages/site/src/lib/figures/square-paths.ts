/**
 * Path and label helpers for 28×28 square grids, shared by F5 (map stages) and F10 (roll a map).
 *
 * Why: F10 needs only these two helpers; while they lived in `map-stages.ts` the bundler shipped
 * F5's whole module in F10's closure (R10: 6.0 of 6.0 KB on its lab page).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-16 (R10)
 */

/**
 * SVG path data covering the squares for which `on(row, col)` holds, as rectangles `M x y h w v h
 * h-w` (the fill closes each one): horizontal runs per row, merged with the identical run in the
 * row above into one taller rectangle. Every square is covered exactly once.
 *
 * Why: the SSR keyframes carry walls for up to a dozen maps; merging vertically roughly halves
 * the path data compared with one rectangle per run (spec Risk 3: HTML size).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § Risks (3)
 */
export function mergedPath(
	rows: number,
	cols: number,
	on: (row: number, col: number) => boolean,
): string {
	type Open = { c: number; len: number; r0: number };
	let open = new Map<string, Open>();
	let d = "";
	for (let r = 0; r <= rows; r++) {
		const next = new Map<string, Open>();
		let c = 0;
		while (r < rows && c < cols) {
			if (!on(r, c)) {
				c++;
				continue;
			}
			const start = c;
			while (c < cols && on(r, c)) c++;
			const key = `${start}:${c - start}`;
			const prev = open.get(key);
			if (prev) open.delete(key);
			next.set(key, prev ?? { c: start, len: c - start, r0: r });
		}
		// Runs still open that did not continue into this row end here.
		for (const o of open.values()) d += `M${o.c} ${o.r0}h${o.len}v${r - o.r0}h-${o.len}`;
		open = next;
	}
	return d;
}

/**
 * The centre of a set of squares, in square units (x = column, y = row), for a label on a spawn
 * area.
 *
 * Why: spawns are tinted squares labelled "T" or "CT" so the meaning never rests on colour alone.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (colour plus shape)
 */
export function centroid(squares: ReadonlyArray<readonly [number, number]>): [number, number] {
	if (squares.length === 0) return [0, 0];
	const r = squares.reduce((a, [row]) => a + row, 0) / squares.length;
	const c = squares.reduce((a, [, col]) => a + col, 0) / squares.length;
	return [c + 0.5, r + 0.5];
}
