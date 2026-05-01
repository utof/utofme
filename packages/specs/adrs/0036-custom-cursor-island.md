# ADR 0036 — Custom cursor as `client:media`-gated Svelte 5 island

**Status:** accepted
**Date:** 2026-05-01 (Phase 7)

## Context

Phase 7 atmosphere polish ships a pointer-following cursor trail for fine-pointer
visitors. Two design questions arose:

1. **Where does the JS live?** Inline script vs. Svelte island vs. vanilla JS file.
2. **How is it gated off touch / coarse-pointer devices?** The cursor element
   is meaningless on touch screens and its animation loop wastes CPU there.

Additionally, the cursor animation must respect `prefers-reduced-motion` — the
lerp loop should not run when the visitor has requested reduced motion in their OS
settings.

Bundle budget: ≤ 1.5 KB gzip (Phase 7 spec §T1).

## Decision

Implement `CustomCursor.svelte` as a Svelte 5 runes island hydrated via
`client:media="(pointer: fine)"`. The `(pointer: fine)` media query means the
component JavaScript is **not downloaded at all** on coarse-pointer (touch) devices —
the browser evaluates the media query before fetching the chunk.

Inside the component, a `$effect` checks `window.matchMedia("(prefers-reduced-motion: reduce)")`.
If reduced motion is active the effect returns early, leaving the cursor element
hidden. CSS uses `mix-blend-mode: difference` so the cursor is visible against
both light and dark themes without reading any CSS custom property at runtime.

Actual bundle cost: **534 B gzip** (well under the 1.5 KB cap).

## Alternatives

- **(a) Inline raw JS in `_BaseLayout.astro`.** ≥ 60 LOC of pointer math, lerp
  logic, and RAF cleanup is unwieldy as an inline string. Loses Svelte `$state`
  ergonomics and makes unit-testing harder. Rejected.
- **(b) `client:visible`.** Fires once the cursor element scrolls into the
  viewport — wrong semantics for a cursor that must be present from the first
  pointer event. Rejected.
- **(c) `client:idle`.** Downloads on coarse-pointer devices too; wastes bytes on
  touch-primary visitors. Rejected.

## Consequences

- Cursor JS is verified absent on coarse-pointer via Playwright network listener
  in `tests/e2e/atmosphere.spec.ts`.
- The positive case (cursor renders on a fine-pointer desktop) is covered by a
  happy-dom unit test only — no chrome-desktop Playwright project exists in this
  repo. This gap was explicitly accepted at spec review (Phase 7 spec §T1
  acceptance criterion 1).
- Site-js cap: 534 B well under the 1.5 KB sub-cap; overall cap headroom
  unchanged.
- Future maintainers must not remove the `client:media` directive without
  re-auditing touch-device network cost.

## Sources

- [Astro `client:media` directive](https://docs.astro.build/en/reference/directives-reference/#clientmedia)
  (verified context7 2026-05-01)
- [MDN — `pointer` media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer)
- [MDN — `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- T1 commit `bb4a97f`; Phase 7 spec §T1
