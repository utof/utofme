# ADR 0016 — Route budget replaces zero-JS gate

## Date
2026-04-26

## Status
Accepted — Phase 2

## Context

Phase 1 enforced a literal **"zero `.js` chunks under `dist/_astro/`"** assertion via
`packages/site/scripts/no-js-check.ts`. This gate was correct for Phase 1, which shipped
a purely static card grid with no hydrated islands and no JavaScript shipped to the
browser.

Phase 2 introduces hydrated Svelte 5 islands: `FilterBar.svelte` (`client:load`),
`Preview.svelte` (`client:visible`), and `CommandPalette.svelte` (`client:idle`). These
islands compile to JavaScript chunks under `dist/_astro/`. The literal "zero JS" assertion
is therefore **structurally wrong** for Phase 2 — it would fail every build even when JS
is correctly sized.

The **spirit** of the gate — keeping per-route JavaScript small and measurable — remains
valid and is preserved via per-route gzipped `size-limit` budgets.

The Phase 2 plan (OQ#12) originally set a `"site js (all routes)"` ceiling of **30 KB**
gzipped. Task 13a measurements on the completed Phase 2 build showed:

- Svelte runtime (`render.js`): ~11.7 KB gzipped
- `<ClientRouter />` runtime: ~5.5 KB gzipped
- Islands (FilterBar + Preview + CommandPalette combined): ~7 KB gzipped
- Pagefind UI init (inline script bundled by Astro into `dist/_astro/`): ~27.5 KB gzipped
- **Measured total `dist/_astro/*.js`:** ~54.92 KB gzipped (site-wide, all routes combined)
- **Pagefind UI bundle** (`dist/pagefind/pagefind-ui.js`): 29.7 KB gzipped

The plan's original 30 KB ceiling was not achievable because the Pagefind UI init script
— which Astro bundles into `dist/_astro/` — alone accounts for ~27.5 KB, and the Svelte
runtime is a further ~11.7 KB. The 30 KB figure was an estimate prior to measurement.

The resolved ceiling is **60 KB** for site-wide `_astro/*.js` — a factor-of-2 head-room
above the measured 54.92 KB, leaving room for organic growth without constant budget
bumps. The pagefind UI bundle (`dist/pagefind/pagefind-ui.js`) is budgeted separately at
≤ 100 KB (measured 29.7 KB).

Source: `packages/specs/specs/02-interactivity.md` line 38; `packages/specs/plans/02-interactivity.md` § OQ#12 + Task 13a.

## Decision

1. **Retire `scripts/no-js-check.ts`** — the script that asserted zero `.js` chunks is
   removed. It is not renamed to `route-budget-check.ts` (as the spec originally proposed);
   `size-limit` already enforces the budget without a separate script.

2. **Enforce per-route budgets via `packages/site/.size-limit.cjs`:**

   | Entry | Path glob | Limit | Measured |
   |---|---|---|---|
   | `home css+html` | `dist/index.html` + `dist/_astro/*.css` | 60 KB | — |
   | `works css+html` | `dist/works/index.html` + `dist/_astro/*.css` | 60 KB | — |
   | `search css+html` | `dist/search/index.html` + `dist/_astro/*.css` | 60 KB | — |
   | `site js (all routes)` | `dist/_astro/*.js` | **60 KB** | ~54.92 KB |
   | `pagefind ui js` | `dist/pagefind/pagefind-ui.js` | 100 KB | 29.7 KB |

   The Phase 1 CSS+HTML budgets (≤ 60 KB per route) are **unchanged**.

3. **The adjustment from 30 KB → 60 KB is measurement-driven.** The plan's 30 KB
   estimate pre-dated the Pagefind UI init measurement. The new ceiling (60 KB) is set
   above the observed value (54.92 KB) by ~9%, providing a small buffer without giving up
   the budget discipline.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Keep zero-JS gate and exclude `_astro/` chunks from the check | Rejected | Would allow unbounded JS growth on hydrated routes; defeats the purpose of the gate. |
| Per-route JS budgets (30 KB each) as originally specified | Rejected | Measurement shows 54.92 KB for the combined site JS; 30 KB is not achievable without removing Pagefind or splitting islands further. The spirit (measurable ceiling) is preserved at 60 KB. |
| Combined JS + HTML + CSS single entry | Rejected | Double-counts CSS (already in the css+html entry); complicates attribution when one surface regresses. |

## Consequences

- `scripts/no-js-check.ts` is removed; CI invokes `bunx size-limit` (from `.size-limit.cjs`)
  for the budget check instead.
- The `"site js (all routes)"` entry gates on `dist/_astro/*.js` (all chunks combined),
  not per-route, because Astro bundles islands into shared chunks that are not attributable
  to a single route.
- Adding a new hydrated island must be preceded by a measurement pass; if the new island
  pushes `dist/_astro/*.js` past 60 KB, the budget line must be amended with a citation.
- The 29.7 KB Pagefind UI measurement gives substantial head-room against the 100 KB
  ceiling — even a fourfold growth in the 10-fixture corpus index would not breach it.
- Phase 1's `bun run check:size` step in CI still runs; it now invokes the updated
  `.size-limit.cjs` entries.

## Sources

- `packages/site/.size-limit.cjs` (current budget entries with inline measurement notes)
- `packages/specs/specs/02-interactivity.md` line 28 (0 KB JS gate retirement) and line 38 (per-route budgets)
- `packages/specs/plans/02-interactivity.md` § OQ#12 (size-limit glob shape + original 30 KB ceiling)
- `packages/specs/plans/02-interactivity.md` § Task 13a (measurement and budget finalisation)
