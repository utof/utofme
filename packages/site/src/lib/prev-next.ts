/**
 * Prev/next neighbours for a project page (newest-first order).
 *
 * Why: the project page links to adjacent projects as plain text. Order is
 * newest-first among non-fixture, non-draft works, so "prev" is the next-newer
 * entry and "next" the next-older. A fixture or unknown id has no neighbours.
 *
 * @see packages/specs/specs/09-project-view.md § P9-8 (anatomy item 7)
 */

/** Minimal entry shape needed for ordering. */
export interface NeighbourEntry {
	id: string;
	title: string;
	date: Date;
}

/**
 * Result of {@link prevNext}.
 *
 * Why: nullable ends make "no prev/next" explicit for the template.
 * @see packages/specs/specs/09-project-view.md § P9-8
 */
export interface Neighbours<E extends NeighbourEntry> {
	/** Next-newer entry, or `null` at the newest end. */
	prev: E | null;
	/** Next-older entry, or `null` at the oldest end. */
	next: E | null;
}

/**
 * Computes the neighbours of `id` within `entries` sorted newest-first.
 *
 * Why: ties on date break by id so the order is total and stable.
 *
 * @see packages/specs/specs/09-project-view.md § P9-8
 */
export function prevNext<E extends NeighbourEntry>(
	entries: readonly E[],
	id: string,
): Neighbours<E> {
	const sorted = [...entries].sort(
		(a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id),
	);
	const i = sorted.findIndex((e) => e.id === id);
	if (i < 0) return { prev: null, next: null };
	return { prev: sorted[i - 1] ?? null, next: sorted[i + 1] ?? null };
}
