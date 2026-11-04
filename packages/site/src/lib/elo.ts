/**
 * Elo arithmetic for the article figures.
 *
 * Why: F3, F9 and F13 quote the project's own numbers (8,000 rounds per pair → ±3.88 Elo;
 * detectable effects 4.4 and 9.3), so the formulas live in one tested place.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.4)
 */

/**
 * Win probability for an Elo difference `d`: `1 / (1 + 10^(−d/400))`.
 *
 * Why: the standard logistic Elo curve.
 *
 * @see https://en.wikipedia.org/wiki/Elo_rating_system#Mathematical_details
 */
export function winProbability(d: number): number {
	return 1 / (1 + 10 ** (-d / 400));
}

/**
 * Elo difference for a win probability `p`: `400 · log10(p / (1 − p))`.
 *
 * Why: the inverse of `winProbability`.
 *
 * @see https://en.wikipedia.org/wiki/Elo_rating_system#Mathematical_details
 */
export function eloForWinProbability(p: number): number {
	return 400 * Math.log10(p / (1 - p));
}

/**
 * Standard deviation, in Elo, of one estimate from `rounds` independent rounds (delta method):
 * `400 / (ln 10 · p(1−p)) · √(p(1−p) / rounds)`. 8,000 rounds per pair → 3.88.
 *
 * Why: the head-to-head uncertainty the page prints.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.4)
 */
export function binomialEloSd(rounds: number, p = 0.5): number {
	const v = p * (1 - p);
	return (400 / (Math.LN10 * v)) * Math.sqrt(v / rounds);
}

/**
 * Minimum detectable effect: `factor · sd / √seeds`; the default 2.49 is the project's rule
 * (80 % power, one-sided 5 %).
 *
 * Why: F9 and F13 explain why a 4-Elo change needs more than one seed.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.4)
 */
export function mde(sd: number, seeds: number, factor = 2.49): number {
	return (factor * sd) / Math.sqrt(seeds);
}
