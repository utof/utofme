/**
 * Scales, ticks and number formatting for the article's figures and the `<N>` component.
 *
 * Rounding happens exactly once, half away from zero on the binary value (`toFixed`), so a value
 * stored as printed (facts) can never be rounded twice. Output uses en-US grouping, U+2212 for the
 * minus sign and U+00A0 between a number and its unit.
 *
 * Why: prose and figures print the same fact through the same functions, so they cannot disagree
 * in the last digit (spec P10-17); pure and DOM-free so it is unit- and property-tested.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */

const MINUS = "−";
const NBSP = " ";

/**
 * Formats `v` with exactly `digits` decimals: rounded once (half away from zero on the binary
 * value), thousands grouped with commas, U+2212 minus; a value that rounds to zero has no sign.
 *
 * Why: `74.65` must print "74.7" and `1.005` "1.00" in every figure and in prose.
 *
 * @throws RangeError for a non-finite `v`, `|v| ≥ 1e21` or `digits` outside 0–20.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function formatNumber(v: number, digits: number): string {
	if (!Number.isFinite(v) || Math.abs(v) >= 1e21) throw new RangeError(`cannot format ${v}`);
	if (!Number.isInteger(digits) || digits < 0 || digits > 20) {
		throw new RangeError(`digits out of range: ${digits}`);
	}
	const fixed = Math.abs(v).toFixed(digits);
	const [int = "0", frac] = fixed.split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const body = frac === undefined ? grouped : `${grouped}.${frac}`;
	return v < 0 && /[1-9]/.test(fixed) ? `${MINUS}${body}` : body;
}

/**
 * Like {@link formatNumber} with an explicit "+" for positive values; zero (also after rounding)
 * has no sign.
 *
 * Why: Elo deltas read "+96", not "96".
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function formatSigned(v: number, digits: number): string {
	const s = formatNumber(v, digits);
	return v > 0 && /[1-9]/.test(s) ? `+${s}` : s;
}

/**
 * Options of {@link formatInterval}.
 *
 * Why: keeps the spec's three-argument signature while allowing the Elo form.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export interface IntervalOptions {
	/** Print both ends with {@link formatSigned} ("+94 to +98"). Default `false`. */
	readonly signed?: boolean;
}

/**
 * "lo to hi" at `digits` decimals; `{ signed: true }` gives the Elo form "+94 to +98".
 *
 * Why: the spec signature has three arguments; the plan's "+94 to +98" example needs the sign, so
 * it is an optional fourth (a tempo interval "22.1 to 23.6" must not gain plus signs).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function formatInterval(
	lo: number,
	hi: number,
	digits: number,
	opts: IntervalOptions = {},
): string {
	const f = opts.signed === true ? formatSigned : formatNumber;
	return `${f(lo, digits)} to ${f(hi, digits)}`;
}

/**
 * Seconds with one decimal, joined to the unit with U+00A0 ("7.2 s").
 *
 * Why: the article's unit is the second (1 tick = 0.8 s); ticks only appear in hover text.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function formatSeconds(s: number): string {
	return `${formatNumber(s, 1)}${NBSP}s`;
}

/**
 * A proportion as a percentage: `formatNumber(p × 100, digits)` from the raw value (no double
 * rounding), then U+00A0 and "%".
 *
 * Why: 0.6347 must print "63 %" whether it was computed or stored.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function formatPercent(p: number, digits: number): string {
	return `${formatNumber(p * 100, digits)}${NBSP}%`;
}

/**
 * A linear scale: call it to map a domain value, `invert` to go back.
 *
 * Why: pointer handlers need the inverse mapping without a chart library (ADR 0053).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export interface LinearScale {
	(x: number): number;
	/** The domain value for a range value. */
	invert(y: number): number;
}

/**
 * A linear scale from `domain` to `range` (either may be reversed; values outside extrapolate).
 * A zero-width domain maps everything to the range midpoint and inverts to the domain value.
 *
 * Why: figures draw in SVG/canvas pixels without a chart library (ADR 0053); pointer positions
 * need `invert`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function linear(
	domain: readonly [number, number],
	range: readonly [number, number],
): LinearScale {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const dd = d1 - d0;
	const rr = r1 - r0;
	const scale = (x: number): number => (dd === 0 ? (r0 + r1) / 2 : r0 + ((x - d0) / dd) * rr);
	const invert = (y: number): number => (rr === 0 || dd === 0 ? d0 : d0 + ((y - r0) / rr) * dd);
	return Object.assign(scale, { invert });
}

/**
 * Round tick values inside `[min, max]`, about `count` of them: steps of 1, 2 or 5 × 10ⁿ, computed
 * from integers so `0.1 + 0.2` drift never reaches the axis. Swapped bounds are accepted; invalid
 * input or `count < 1` gives `[]`; `min == max` gives `[min]`.
 *
 * Why: axes need readable numbers without a chart library (ADR 0053).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-4 (`figure-scale.ts`)
 */
export function ticks(min: number, max: number, count: number): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max) || !(count >= 1)) return [];
	const lo = Math.min(min, max);
	const hi = Math.max(min, max);
	if (lo === hi) return [lo];
	const raw = (hi - lo) / count;
	const power = Math.floor(Math.log10(raw));
	const err = raw / 10 ** power;
	const factor = err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.sqrt(2) ? 2 : 1;
	const out: number[] = [];
	if (power >= 0) {
		const step = factor * 10 ** power;
		for (let i = Math.ceil(lo / step); i <= Math.floor(hi / step); i++) out.push(i * step);
	} else {
		const inv = 10 ** -power / factor;
		for (let i = Math.ceil(lo * inv); i <= Math.floor(hi * inv); i++) out.push(i / inv);
	}
	return out;
}
