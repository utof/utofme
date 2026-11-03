# 0046 — Card → banner morph via `<ClientRouter />` and `transition:persist`

Status: accepted (phase 9, spec P9-9)

## Context
Clicking a home card opens `/works/<slug>/`, whose banner shows the same project media. Phase 2 (ADR 0015) gave every card a static `transition:name`, which pairs cards with nothing on the new page and, because each name must be unique per document, forces a name on every card at all times. Phase 9 wants one continuous motion: the clicked card's media frame grows into the banner. The site already runs `<ClientRouter />` site-wide, so the browser View Transitions API is available on navigation and Astro exposes `astro:before-preparation` / `astro:before-swap` / `astro:after-swap` ([Astro view transitions](https://docs.astro.build/en/guides/view-transitions/)).

## Decision
- **Names are attributes set at navigation time, not static scopes.** `src/lib/vt/hero-morph.ts` runs from `_BaseLayout.astro` once per document. On `astro:before-preparation` it marks only the clicked card's `[data-vt-frame]` with `data-vt-hero`, and the caption with `data-vt-cap`. On `astro:before-swap` it marks the banner frame in `newDocument`, only if the old document marked the same slug, so `hero` always exists in a pair (a duplicate or orphan name aborts or flattens the transition). Marks are cleared when `viewTransition.finished` settles or rejects.
- **CSS** (`src/styles/transitions.css`): `[data-vt-hero]` → `view-transition-name: hero`, `[data-vt-cap]` → `hero-cap`; group 450 ms `cubic-bezier(.2,.7,.2,1)`; old/new(hero) cover their box.
- **`hero` sits on the clipping wrapper** (`[data-vt-frame]`), never on the hover-scaled `<video>`/`<img>`, so the snapshot carries the clip and the zoom exactly as the visitor saw them. No zoom reset before capture.
- **Caption has its own name** (`hero-cap`, not the spec's `card-caption`) so it never stretches with the media: old fades out in 120 ms on Forward, new returns late on Back.
- **Back mirrors Forward.** Back from `/works/<slug>/` to `/` marks the visible banner (old document) and the card (new document).
- **`transition:persist`** keeps the CommandPalette island alive across swaps (ADR 0015, unchanged) and marks the loop `<video>` as a persist candidate (`LoopMedia`) so a playing loop is not restarted by a swap. The banner encode "upgrade" after the morph is deferred (issue list in `reports/09-close.md`).
- **Focus:** Forward focuses the project `<h1 tabindex="-1">` with `preventScroll`; Back focuses the originating card link.
- **Reduced motion:** Astro's kill switch lives in an inline `<style>` that is absent on pages whose CSS is emitted as an external file (every `/works/<slug>/`, `/garden/*`, `/search/`), and the destination page's stylesheet is the one the transition uses. The same `animation: none !important` rule is therefore duplicated in `transitions.css`.
- Dither/mosh hover canvases live outside the card and would freeze into the snapshot; `html[data-vt-morph]` hides them from preparation until `finished`.
- The only grid page is `/` (the `/works/` index was deleted and 301s to `/`), so `isGridPath` matches `/` only.

## Alternatives
- **Static `transition:name` per card and on the banner (Phase 2 scheme).** Rejected: every card on the page is named at all times, the names rarely pair, and a duplicate aborts the whole transition.
- **Name the `<video>`/`<img>` directly.** Rejected: the snapshot would lose the card's clipping and the hover zoom would pop.
- **Custom FLIP animation in JS (no View Transitions).** Rejected: duplicates what `<ClientRouter />` gives for free and needs bespoke handling of cross-document media and back navigation.
- **Option B (spec): keep the card's media node and re-parent it into the banner.** Rejected for this phase: Safari lacks `moveBefore`, so the controller would have to replay playback on every browser.

## Consequences
- Correctness depends on the attribute pairing; `tests/unit/hero-morph.test.ts` pins it and `tests/e2e/p09-morph.spec.ts` checks one hero per navigation, `ready` resolving and focus.
- Any new grid page must be added to `isGridPath` and its cards must carry `data-work-slug`, `[data-vt-frame]`, `[data-cap]` (see `Card.astro`).
- Deleting `transitions.css` also removes the morph and the reduced-motion copy; a second stylesheet cannot be dropped without moving those rules.
- Supersedes ADR 0015's per-card naming.

## Sources
- https://docs.astro.build/en/guides/view-transitions/
- https://developer.chrome.com/docs/web-platform/view-transitions/
- https://drafts.csswg.org/css-view-transitions-1/
- packages/specs/specs/09-project-view.md § P9-9
- packages/specs/reports/09-w5-page.md (decisions 1–5)
