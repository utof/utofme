/**
 * Why: Phase 3 ships dual-theme code blocks via Expressive Code.
 *      themes: ["github-light", "github-dark"] enables prefers-color-scheme auto-switch.
 *      Copy-button enabled per spec; word-wrap off.
 * @see packages/specs/plans/03-content-pipeline.md § Task 1
 * @see https://expressive-code.com/reference/configuration/ (fetched 2026-04-26)
 */
export default {
	themes: ["github-light", "github-dark"],
	frames: { showCopyToClipboardButton: true },
	useDarkModeMediaQuery: true,
	defaultProps: { wrap: false },
};
