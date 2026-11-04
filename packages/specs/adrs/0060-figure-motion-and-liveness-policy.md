# 0060 — Figure motion and liveness policy

Status: accepted (phase 10)

## Context

- WCAG 2.2.2 needs a page-level way to pause moving content; the site already has "Pause motion" (`utofme:motion`, localStorage, `prefers-reduced-motion` fallback).
- Svelte's `prefersReducedMotion` only reflects the OS and would ignore the site toggle.
- Islands start rAF loops, observers and listeners; leaks after ClientRouter navigations would be invisible without a counter.

## Decision

- One rune module, `figure-motion.svelte.ts`, exposes `motionState()` (`paused`, `dispose`), seeded from `isMotionPaused()` and updated by the `utofme:motion` event and the media-query change. Pause motion wins over the OS preference.
- Only F1 autoplays, once; no figure flashes.
- `figure-live.ts` counts live resource groups (`registerLive()` returns an idempotent release) and mirrors the count to `<html data-figures-live>`; e2e asserts "0" after three ClientRouter round trips.

## Alternatives

- **Svelte `prefersReducedMotion`.** Rejected: ignores the site's explicit toggle.
- **Per-figure motion code.** Rejected: five copies of the same truth table.
- **No registry; trust disposers.** Rejected: leaks would go unnoticed until a user reports jank.

## Consequences

- Islands must call `dispose()` and the `registerLive` release in their teardown.
- The attribute is always present (a number only), so it is observable in production too.

## Sources

- https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- packages/specs/specs/10-tactical-arena-article.md § P10-4 (AC4.5, AC4.6)
