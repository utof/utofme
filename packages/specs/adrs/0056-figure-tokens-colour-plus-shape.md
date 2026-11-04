# 0056 — Figure tokens and the colour-plus-shape rule

Status: accepted (phase 10, spec P10-2)

## Context
The research article draws data for two teams, two player series and five experiment outcomes, plus smoke, fire and map areas. The site accent shifts with the time of day (ADR 0038), so it cannot encode data. The site is light-only (ADR 0040) and its text must clear WCAG 1.4.3 (4.5:1) with data marks at 1.4.11 (3:1); colour must never be the only channel (1.4.1).

## Decision
- A `/* Figures */` block in the light `:root` of `src/styles/tokens.css` holds the figure palette (`--color-ct`, `-t`, `-smoke`, `-smoke-fill`, `-fire`, `-map-*`, `-pro`, `-bot`, five `-outcome-*`, and `--ci-band-alpha: 0.18`). Dark values are TODO comments, inert while the site is light-only.
- Contrast is computed in a unit test on unrounded floats with `src/lib/contrast.ts` (`parseHex` added): every label colour is at least 4.5:1 on `#fff` and `#fafafa`; CT/T lines are at least 3:1 against their CI band (series colour at 0.18 alpha over white); walls are at least 3:1 against the floor; the smoke edge is 3.01:1 against the smoke-fill composite.
- `src/lib/figure-marks.ts` gives every keyed colour a shape: CT circle, T triangle, pros diamond, bots square; outcomes filled circle (kept), cross (reverted), hollow circle (inconclusive), triangle-down (parked), small square (infra). Smoke is a solid disc with a dashed edge and fire a hatched area, so T and fire never share a mark type.
- `src/components/article/**` may not use `--color-accent` or hex literals (grep test); it uses only these tokens.

## Alternatives
- **Use the accent for one series.** Rejected: it changes with the time of day, so the same figure would change meaning.
- **Colour alone with a legend.** Fails 1.4.1 and fails for greyscale printing.
- **A palette package or chart library.** Rejected with the no-chart-library decision (OD-6); four hues and five shapes do not need one.
- **Per-figure local colours.** Drift between figures and no single place to verify contrast.

## Consequences
- A palette change is a one-file edit that the contrast test re-verifies.
- The smoke edge-versus-fill margin is thin (3.01:1); the test pins it so a fill change cannot slip below 3:1.
- Dark mode needs its own derivation when light-only is lifted.

## Sources
- https://www.w3.org/TR/WCAG22/#use-of-color
- https://www.w3.org/TR/WCAG22/#non-text-contrast
- https://www.w3.org/TR/WCAG22/#contrast-minimum
