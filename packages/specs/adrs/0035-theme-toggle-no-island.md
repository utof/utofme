# ADR 0035 — Theme persistence as inline `<script is:inline>`, not a Svelte island

**Status:** accepted
**Date:** 2026-04-30 (Phase 6 close)

## Context

Phase 5 left the global site-js cap at 13 KB headroom (406.54 / 420 KB,
issue utof/utofme#45). A Svelte 5 runes island for theme would consume
4–8 KB plus Svelte runtime cost, and would race the LinkPreview hydration
on slow networks (visible flash-of-unstyled-content).

The theme implementation needs to:
1. Apply the user's previous choice (or `prefers-color-scheme`) before any
   stylesheet computes — no flash of wrong theme on load.
2. Cycle `light → dark → system → light` from a button click.
3. Persist across navigations + sessions (localStorage).

## Decision

Two small inline scripts, both `is:inline`:

- **Head-injected first-paint script** in `MetaHead.astro` (budget: ≤ 800 B;
  **actual: 454 B**). Reads `localStorage["utofme:theme"]`, falls back to
  `prefers-color-scheme`. Sets `<html data-theme>` and (when system)
  `data-theme-source="system"`. Runs synchronously before any stylesheet.
- **Toggle button click handler** in `ThemeToggle.astro` (budget: ≤ 600 B;
  **actual: 511 B**). Cycles `light → dark → system → light`. Removes
  the localStorage key on entering system to delegate back to the OS
  preference.

CSS uses both `:root[data-theme="dark"]` (specific) and
`@media (prefers-color-scheme: dark)` (fallback for crawlers / no-JS).
The `data-theme` selector wins on specificity when JS runs.

`src/lib/theme.ts` exposes the script logic as importable functions for
unit testing in happy-dom; the inline scripts are kept in lock-step with
the helper.

## Alternatives considered

- **Svelte island with `client:load`.** Eats 4–8 KB of the cap; still races
  first paint because hydration is not synchronous. Rejected — would push
  site-js over 420 KB.
- **Server-side theme cookie.** Requires SSR — out of scope (ADR 0004
  static-only).
- **No theme toggle, `prefers-color-scheme` only.** Punts; user can't
  override the OS choice (e.g. dark-mode OS but light-mode reading).
  Rejected as a UX regression.

## Consequences

- No new bundled JS — site-js cap unchanged at 406.54 KB through Phase 6.
- Inline scripts must be hand-maintained alongside `theme.ts`; a unit test
  exercises the helper in happy-dom and a Playwright e2e exercises the
  inline path in a real browser.
- Visual-regression baselines doubled (light + dark variants) — extra disk
  cost in CI.

## Sources

- [Astro `is:inline` directive](https://docs.astro.build/en/reference/directives-reference/#isinline)
- [web.dev — `prefers-color-scheme`](https://web.dev/articles/prefers-color-scheme)
- [MDN — `Window.matchMedia`](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia)
- [Phase 6 spec § Theme persistence — inline-script architecture](../specs/06-indieweb.md)
