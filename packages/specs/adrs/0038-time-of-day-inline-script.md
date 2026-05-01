# ADR 0038 — Time-of-day extends the Phase-6 head inline-script

**Status:** accepted
**Date:** 2026-05-01 (Phase 7)

## Context

Phase 7 atmosphere adds dawn / day / dusk / night accent shifts driven by the
visitor's local time. The accent is applied via a `[data-tod]` attribute on
`<html>` (`"dawn"` | `"day"` | `"dusk"` | `"night"`), which CSS custom-property
overrides key in on.

The attribute **must be set before first paint** to avoid a flash of the default
(day) accent on visitors whose local time falls outside the day window. Any
post-hydration approach (Svelte island, `client:load`) would arrive too late.

Phase 6 already ships a head-injected IIFE in `inlineThemeScript()`
(`packages/site/src/lib/theme.ts`) that runs synchronously to set `[data-theme]`.
Phase 7 spec §T3 sub-cap for the additional bytes: ≤ 200 B raw net growth.

## Decision

Extend the existing Phase-6 IIFE in `inlineThemeScript()`. The IIFE's internal
structure was refactored from:

```
if (stored) { ...; return; }
var d = new Date(); ...
```

to an `if/else` branch so that the time-of-day block runs **unconditionally**
regardless of which theme branch executes:

```
if (stored) { ... } else { ... }
var d = new Date();
document.documentElement.setAttribute("data-tod", ...);
```

The refactor is behaviour-preserving for Phase-6 theme logic (verified: Phase-6
theme e2e suite remained green after the change). Net additional bytes: **~134 B
raw**, within the ≤ 200 B sub-cap.

A canonical `hourToTod(hour: number)` function lives in
`src/lib/time-of-day.ts` and is covered by unit tests + a fast-check property
test. The inlined ternary in `theme.ts` duplicates this mapping (TypeScript
`import` is unavailable at inline-script runtime) and was verified correct by
manual simulation across all 24 hours at spec-write.

## Alternatives

- **Separate `<script is:inline>` tag for ToD.** Pays ~30 B of HTML parser
  overhead for a second `<script>` tag with no functional gain. Also duplicates
  the `new Date()` call. Rejected.
- **Svelte island (`client:load`).** Site-js bundle entry cost plus hydration
  delay means the attribute arrives post-paint — causes a flash of day accent
  for dawn/dusk/night visitors. Ruled out by the pre-paint requirement. Rejected.

## Consequences

- One IIFE now handles both theme **and** ToD — single `<script>` tag, single
  closure, single `new Date()` call.
- The if/else restructure means future maintainers must understand that both
  branches complete before the ToD block runs; the early-`return` pattern is
  gone.
- The inlined hour→ToD mapping in `theme.ts` is a maintenance sync hazard: if
  `hourToTod()` boundaries change, the inline ternary must be updated manually.
  Mitigated by the unit test on the canonical function (changes there are easy
  to spot) and a comment in `theme.ts` pointing to `time-of-day.ts`.

## Sources

- ADR 0035 — Theme persistence as inline `<script is:inline>` (Phase 6)
- [Astro `is:inline` directive](https://docs.astro.build/en/reference/directives-reference/#isinline)
- T3 commit `2075d60`; Phase 7 spec §T3
