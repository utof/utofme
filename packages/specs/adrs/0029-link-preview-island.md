# ADR 0029 — Hover link preview as Svelte 5 island with `client:idle` + delegated events

**Status:** accepted
**Date:** 2026-04-27 (Phase 5)

## Context

Garden note pages render wikilinks as `<a class="wikilink" data-target-slug="…">`.
The spec calls for a hover/focus preview card showing the linked note's title and
summary (≤ 240 chars). The card must appear within 200 ms, support keyboard focus,
dismiss on Escape, and respect `prefers-reduced-motion`.

Implementation options:

1. **Per-page Svelte island** — mount a `<LinkPreview>` island on every note page
   that might contain wikilinks.
2. **Global island in `_BaseLayout`** — a single `<LinkPreview>` island mounted
   once, listening for wikilink hover events site-wide via event delegation.
3. **CSS-only `:hover` tooltip** — pure CSS `::after` content blocks with the
   preview text. Cannot support dynamic positioning or content from a JSON payload.
4. **Runtime fetch** — island fetches `/garden/<slug>/preview.json` on hover.
   Adds network latency; requires a runtime API route.

## Decision

Option 2: a single global Svelte 5 island in `_BaseLayout.astro`, loaded with
`client:idle`. Implemented in `src/components/LinkPreview.svelte` (commit `b3ca478`,
Phase 5 Task 10).

Key implementation choices:

**`client:idle` over `client:visible`:** the island must be ready *before* the user
hovers over a wikilink. `client:visible` only activates when the component's
placeholder enters the viewport — a wikilink in the hero area could be hovered
before a `client:visible` island (mounted in the `<body>`) scrolls into view.
`client:idle` defers to `requestIdleCallback`, which fires promptly after first
paint without competing with it.

**Delegated `mouseover`/`focusin` (not `mouseenter`/`focus`):** `mouseenter` does
not bubble — document-level delegation requires `mouseover`/`mouseout`. `focusin`
bubbles (unlike `focus`). The handler uses `event.target.closest("a.wikilink
[data-target-slug]")` to filter events. Documented in spec line 265 and corrected
in the Opus spec review (v2, 2026-04-27). Commit `b3ca478` implements the
`mouseover` delegation; commit `2665604` (Task 10 fixup) corrects the
`@floating-ui/dom` middleware order (offset → flip → shift, per the floating-ui
tutorial).

**Inlined JSON payload over runtime fetch:** `note-previews.json` is embedded in
the page as `<script type="application/json" id="note-previews">` at server render
time. The island reads the DOM node on mount — no network request, no cache miss,
no CORS. The island stays within the global 420 KB site-js cap because
`@floating-ui/dom` is ~10 KB gzip and the island itself is small.

**`@floating-ui/dom` for positioning:** `computePosition(ref, floating, {
placement: "top", middleware: [offset(8), flip(), shift()] })`. This is the same
library used by headless-ui components and well-tested for overlay positioning
without viewport overflow.

## Alternatives considered

- **Per-page island** — more DOM nodes, more hydration overhead. Not significantly
  simpler than a global delegated island; ruled out.
- **CSS-only tooltip** — cannot support multi-line dynamic content or programmatic
  dismissal (Escape key). Ruled out.
- **Runtime fetch** — adds latency, requires a Worker route (breaks the static-only
  invariant). Ruled out.
- **`client:visible`** — would require the placeholder to enter the viewport before
  activation; the island wrapper is in `<body>`, and on a short page a wikilink
  could be hovered before the island activates. `client:idle` is safer.

## Consequences

- `+` Single island instance serves all garden pages; no per-route registration.
- `+` No network request on hover — preview data is already inlined in the page.
- `+` `prefers-reduced-motion` suppresses the fade-in (card appears instantly).
- `+` Stays within the existing 420 KB global site-js cap.
- `−` `client:idle` defers activation; on a very slow device the idle callback may
  fire late, delaying the first hover response. Acceptable trade-off against
  delaying first paint.
- `−` The `mouseover` delegation fires on every mouse movement within a wikilink
  subtree (not just entry). Filtered cheaply by `closest()`.

## Sources

- [Phase 5 spec § Hover link previews](../specs/05-garden.md#hover-link-previews-batch-54)
- [@floating-ui/dom tutorial — middleware order](https://floating-ui.com/docs/tutorial)
- [MDN — focusin event (bubbles, unlike focus)](https://developer.mozilla.org/en-US/docs/Web/API/Element/focusin_event)
- [Astro client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives)
