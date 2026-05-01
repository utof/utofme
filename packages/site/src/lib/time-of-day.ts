/**
 * Maps a local hour (0–23) to one of four time-of-day accent slots.
 *
 * Why: the canonical implementation lives here so it can be unit-tested via
 * fast-check property tests. The equivalent logic is inlined (duplicated) into
 * MetaHead.astro's `<script is:inline>` IIFE because inline scripts cannot
 * `import` from source modules at runtime. The unit tests here guard the
 * canonical form; the inline copy must be kept in sync manually.
 *
 * Hour ranges (UTC-agnostic — uses the visitor's local clock):
 *   5 ≤ h < 8  → "dawn"
 *   8 ≤ h < 17 → "day"
 *   17 ≤ h < 20 → "dusk"
 *   else        → "night"
 *
 * @see packages/specs/plans/07-atmosphere.md § T3 Implementation outline
 * @see packages/specs/specs/07-atmosphere.md § Success criteria #10
 */
export type Tod = "dawn" | "day" | "dusk" | "night";

/**
 * Maps a local hour (0–23) to a time-of-day slot.
 *
 * Why: pure function — no side effects, no Date() call — so it can be tested
 * exhaustively by fast-check without mocking.
 *
 * @see packages/specs/plans/07-atmosphere.md § T3 TDD red cases
 */
export function hourToTod(h: number): Tod {
	if (h >= 5 && h < 8) return "dawn";
	if (h >= 8 && h < 17) return "day";
	if (h >= 17 && h < 20) return "dusk";
	return "night";
}
