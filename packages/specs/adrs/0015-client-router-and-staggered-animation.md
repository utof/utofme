# ADR 0015 — `<ClientRouter />` + staggered animation: native CSS over JS animation lib

## Date
2026-04-26

## Status
Accepted — Phase 2

## Context

Phase 2 introduces two animation surfaces:

1. **Cross-route morphing** — navigating between `/`, `/works`, and `/search` should feel
   like a connected experience rather than a hard page reload.
2. **Card stagger on first paint** — the card grid on `/` and `/works` should animate in
   with a staggered entrance so cards don't all appear simultaneously.

Astro 6 ships `<ClientRouter />` (imported from `astro:transitions`) which enables
browser-native **View Transitions API** for cross-document navigation. Cards that carry a
`transition:name` attribute get cross-route morph transitions when their slug matches
between two pages.

Three JS animation libraries were considered as alternatives to a CSS-only approach:

- **Motion One** — small (< 3 KB) but adds a JS import chain and requires a choreography
  step to sequence the stagger at runtime.
- **Framer Motion** — React-centric; Svelte support is limited and adds significant bundle
  weight.
- **GSAP** — powerful but large; licensing terms change for commercial use; overkill for
  a stagger entrance.

The CSS-only approach — `animation-delay: calc(var(--i) * 30ms)` applied per card with
a CSS counter via inline `style="--i: N"` — delivers the stagger at zero JS overhead and
is fully server-renderable at build time.

Accessibility: `@media (prefers-reduced-motion: reduce)` disables the stagger via
`animation: none`. The browser-native View Transitions API auto-disables cross-route
morphing under `prefers-reduced-motion` without author CSS. Both surfaces are covered by
Playwright assertions in `tests/e2e/transitions.spec.ts`.

Source: `packages/specs/specs/02-interactivity.md` line 236; `packages/specs/plans/02-interactivity.md` § OQ#4 + Task 12.

## Decision

Enable `<ClientRouter />` site-wide in `packages/site/src/layouts/_BaseLayout.astro` and
use CSS-only animation for the card stagger:

- **`<ClientRouter />`** — imported from `astro:transitions`, placed inside `<head>`.
  Enables SPA-style navigation across all routes.
- **`transition:name`** on `Card.astro` — each card's outer shell gets a
  `transition:name={entry.slug}` attribute, allowing Astro's view-transition mechanism to
  morph matching cards across route changes.
- **CSS stagger** — `animation-delay: calc(var(--i) * 30ms)` on `.card` with
  `--i` set inline per card index. The `@keyframes` entrance is a simple
  `opacity: 0 → 1` + `translate(0, 8px) → translate(0, 0)`.
- **`@media (prefers-reduced-motion: reduce)`** — sets `animation: none` on `.card`
  and the Preview popover animation in the same block.

`<CommandPalette>` uses `transition:persist` so the Svelte island is not unmounted during
route swaps — the `⌘K` listener attaches once and persists for the session.

FilterBar (`client:load`, NOT `transition:persist`) is re-instantiated by Astro on each
route arrival; its `$effect` lifecycle handles attach/teardown atomically. This was
verified by the `astro:after-swap` timing research in plan OQ#4.

Visual-regression baselines for `/`, `/works`, and `/search` were re-recorded inside
Task 12 (the same task that mounts `<ClientRouter />`).

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Motion One | Rejected | JS import chain adds bundle weight; CSS-only stagger is sufficient for this use case. |
| Framer Motion | Rejected | React-centric; Svelte support limited; significant bundle overhead. |
| GSAP | Rejected | Bundle size + commercial licensing concern; overkill for a stagger entrance animation. |
| No cross-route transitions (no `<ClientRouter />`) | Rejected | Hard page reloads create a disjointed experience; `<ClientRouter />` + View Transitions is native and zero extra JS beyond the Astro router itself. |

## Consequences

- `<ClientRouter />` ships ~5.5 KB gzipped (part of the `"site js (all routes)"` budget in
  `.size-limit.cjs` — ceiling 60 KB; measured combined JS ~54.92 KB gzipped).
- Visual-regression baselines must be re-recorded whenever `<ClientRouter />` is first
  enabled, because Astro injects `<style data-astro-transition-scope="...">` elements.
- `astro:after-swap` listeners are **not** needed for FilterBar because it is re-mounted
  per route (not persisted). If a future island uses `transition:persist` AND manages
  external event listeners, it must tear them down in `astro:before-swap`.
- `tests/e2e/transitions.spec.ts` includes a listener-leak probe: it navigates `/` →
  `/works` → `/` and asserts that no duplicate `popstate` or `urlstate:change` handlers
  accumulate.
- The "Toggle theme" action in `CommandPalette.svelte` is stubbed (visible but disabled)
  until Phase 6 ships theme persistence per the general-plan phase numbering.

## Sources

- https://docs.astro.build/en/guides/view-transitions/ (fetched 2026-04-26)
- https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API (browser-native VT; auto-disables under reduced-motion)
- `packages/specs/specs/02-interactivity.md` line 236 (ClientRouter + staggered animation ADR entry)
- `packages/specs/plans/02-interactivity.md` § OQ#4 (after-swap timing), OQ#11 (visual-regression baseline re-record), Task 12
- `packages/site/src/layouts/_BaseLayout.astro` (ClientRouter mount site; line 65)
- `packages/site/.size-limit.cjs` (site js ≤ 60 KB entry)
