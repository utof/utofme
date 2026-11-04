# 0053 — Hand-rolled SVG / canvas figures, no chart library

Status: accepted (phase 10)

## Context

- The article has 11 interactive figures (F1–F11, F13) on a page whose first-view JS budget is 40 KB gzip; each figure is a lazily hydrated island with its own budget.
- Every figure needs custom marks (colour plus shape), a text equivalent and keyboard control; none is a stock chart.
- `CLAUDE.md` gates new dependencies; the shared maths (grid, sight, Elo, scales) already live in `src/lib`.

## Decision

Figures are Svelte 5 islands drawing SVG (or canvas for F1) over small pure helpers in `src/lib` (`grid`, `sight`, `elo`, `figure-scale`, `figure-marks`, `figure-keys`, `figure-motion.svelte`, `figure-live`, `figure-link`). No chart or scale library is added. The island root carries `.fig-box`; every figure ships a no-JS fallback (keyframe plus text).

## Alternatives

- **d3 (scale/shape/axis).** Rejected: size per island and a new dependency for functions that are ~20 lines each (`linear`, `ticks`).
- **Chart.js / uPlot.** Rejected: canvas-only charts cannot carry per-mark focus, shapes or text equivalents without rewriting most of them.
- **Static images only.** Rejected: the claims are interactive by design.

## Consequences

- Each helper is unit- and property-tested; there is no library to upgrade.
- Axis and tick behaviour is ours to maintain (covered by `figure-scale` tests).
- Per-island budgets stay small enough for the `labFigure` and `article` classes.

## Sources

- packages/specs/specs/10-tactical-arena-article.md § P10-4
- https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
