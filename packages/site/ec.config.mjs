/**
 * Why: Phase 3 ships dual-theme code blocks via Expressive Code.
 *      themes: ["github-light", "github-dark"] enables prefers-color-scheme auto-switch.
 *      Copy-button enabled per spec; word-wrap off.
 *
 *      Light-only MVP: `useDarkModeMediaQuery: false` stops EC from emitting the
 *      `@media (prefers-color-scheme: dark)` rules, so the dark theme only applies
 *      under `[data-theme='github-dark']` (an attribute nothing sets). Code blocks
 *      render github-light regardless of the OS preference. Flip back to `true`
 *      together with LIGHT_ONLY in src/lib/theme.ts.
 * @see packages/specs/plans/03-content-pipeline.md § Task 1
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 * @see https://expressive-code.com/reference/configuration/ (fetched 2026-04-26)
 */
export default {
	themes: ["github-light", "github-dark"],
	frames: { showCopyToClipboardButton: true },
	useDarkModeMediaQuery: false,
	defaultProps: { wrap: false },
};
