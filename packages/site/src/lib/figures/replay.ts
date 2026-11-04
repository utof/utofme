/**
 * Pure logic of figure F1 (replay of a real round): fog, ghosts, markers, interpolation and the
 * autoplay state machine. DOM-free and Zod-free so the island and the dataset module share it.
 *
 * Why: the island stays a thin canvas shell; everything a test can decide lives here (AC5.1).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
 */

/** A `[observer, target]` pair from the replay's `sees` table.
 *
 * Why: one name for the pair shape used by the dataset, the fog code and the tests.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `replay_mirage`)
 */
export type SeesPair = readonly [number, number];

/**
 * The first tick with a cross-team `sees` pair, or `null` when no tick has one. Same-team pairs
 * are ignored, so the raw source table and the shipped (already filtered) table give one answer.
 *
 * Why: "first contact" is the figure's default view and the caption's number (AC5.1); deriving
 * it from the pairs keeps prose, dataset and figure on one value.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5 (AC5.1)
 */
export function firstContactTick(
	sees: readonly (readonly SeesPair[])[],
	sides: readonly string[],
): number | null {
	for (let t = 0; t < sees.length; t++) {
		const pairs = sees[t] ?? [];
		if (pairs.some(([a, b]) => sides[a] !== sides[b])) return t;
	}
	return null;
}
