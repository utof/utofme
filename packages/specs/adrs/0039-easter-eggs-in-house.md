# ADR 0039 — Easter eggs in-house, no third-party libraries

**Status:** accepted
**Date:** 2026-05-01 (Phase 7)

## Context

Phase 7 ships two easter eggs:

1. **Konami code** (↑↑↓↓←→←→BA) — toggles `[data-konami]` on `<html>`, which
   `tokens.css` keys a rainbow accent animation on.
2. **Click counter** on `/` — increments a localStorage key on each hero-area
   click; at milestone counts a CSS class triggers a reaction.

The question was whether to reach for existing npm packages
(`konami-code`, `easter-egg-trigger`, or similar) or hand-roll.

Bundle sub-caps (Phase 7 spec §T4): Konami inline script ≤ 600 B raw;
click-counter island ≤ 1 KB gzip.

## Decision

Both features are hand-rolled; no third-party library is introduced.

- **Konami listener** — inline `<script is:inline>` in `_BaseLayout.astro`.
  Tracks a `sequence` index; on `keydown` advances or resets the index; toggles
  `document.documentElement.dataset.konami` when the full sequence matches.
  Gates on `e.repeat` so held arrow keys do not auto-advance the sequence (added
  post-spec-review). Actual size: **529 B raw** (≤ 600 B cap).
- **Click counter** — Svelte 5 island with synchronous localStorage init in
  `<script>` top-level (not inside `$effect`) to avoid timing issues in
  happy-dom unit tests. Actual size: within ≤ 1 KB gzip cap.

## Alternatives

- **`konami-code` npm package** (~3 KB minified, last published 2017).
  Unmaintained for nearly a decade; adds a dependency for ≤ 25 LOC of trivial
  sequence-matching logic. Wrong trade-off. Rejected.
- **`easter-egg-trigger` / similar packages.** Same critique — all surveyed
  packages in this space are either unmaintained, oversized for two triggers, or
  both. Rejected.

## Consequences

- No new runtime dependencies; lockfile unchanged.
- The `e.repeat` guard (post-review addition) is the only non-obvious behaviour
  in the Konami handler; it is explained with an inline comment.
- The Konami rainbow animation in `tokens.css` lacks a `prefers-reduced-motion`
  opt-out. Filed as nit issue utof/utofme#107 — non-blocking; queued for the
  next a11y sweep.
- Click-counter localStorage key (`"utofme:clicks"`) follows the existing
  namespace convention (`"utofme:theme"`).

## Sources

- [`npm view konami-code time`](https://www.npmjs.com/package/konami-code) —
  last publish 2017-03-04 (confirming unmaintained status)
- [MDN — `KeyboardEvent.repeat`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat)
- [MDN — `localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- T4 commit `79d8223`; Phase 7 spec §T4
