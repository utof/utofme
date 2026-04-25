# ADR 0011 — Card click target strategy

## Date
2026-04-26

## Status
Accepted

## Context

Phase 1 ships a heterogeneous card grid (`/` and `/works`) where cards represent five
work types: `code`, `video`, `music`, `math`, `writing`. Some cards carry an external
URL field (`repo`, `youtube`, `listen`, `arxiv`, `pdf`); others carry none.

The card outer shell is a single HTML element that is the visual click/tap target. That
element must be either a keyboard-accessible `<a>` (when there is a destination) or a
non-interactive semantic container (when there is no destination).

Phase 3 will introduce per-work detail pages and replace `<article>` cards with
detail-page `<a href="/works/{slug}">` links. Phase 1 must not block that migration.

## Decision

Render the card outer shell as:

- **`<a href={externalUrl}>`** when an external URL is present in the card's data,
  using the priority chain `repo → youtube → listen → arxiv → pdf` (first non-null wins).
- **`<article>`** (no `href`, no `<a>` wrapper) when no external URL field is present.

No `href="#"` placeholder. No `aria-disabled`. No client-side JS.

Implemented in `packages/site/src/components/Card.astro` via:
```ts
function externalUrlFor(d: WorkEntry): string | undefined {
  if (d.type === "code" && d.repo) return d.repo;
  if (d.type === "video" && d.youtube) return d.youtube;
  if (d.type === "music" && d.listen) return d.listen;
  if (d.type === "math") return d.arxiv ?? d.pdf;
  return undefined;
}
const Tag = href ? "a" : "article";
```

## Alternatives

| Option | Status | Reason |
|---|---|---|
| `href="#"` placeholder on all cards | Rejected | Creates a keyboard-accessible link with no destination. Triggers WCAG 2.2 SC 2.1.1 risk and Axe violation under `link-name` / `empty-heading` rules. |
| `aria-disabled="true"` non-link | Rejected | Announces the element as a link to screen-reader users but performs no action on activation — confusing AT interaction pattern; violates the principle that interactive semantics must match behaviour. |
| Single `<a>` with `href` always set | Rejected | Phase 1 has no detail routes; using `href="#"` or a stub URL forces a placeholder that Axe flags and that breaks the 0-KB-JS gate if handled in JS. |

## Consequences

- Cards with an external URL are tab-focusable in source order; cards without one are
  not in the tab sequence (intentional — no link = nothing to activate).
- Focus ring is visible on `<a>` cards via `a.card:focus-visible { outline: 1px solid currentColor }`.
- Zero JS shipped (the `Tag` selection is static Astro server-render logic).
- Axe-core passes zero violations (`href="#"` anti-pattern is absent).
- Phase 3 replaces `<article>` cards with `<a href="/works/{slug}">` without changing
  the `Card.astro` outer shell contract — the `externalUrlFor` logic is additive.
- `math` cards without `arxiv` or `pdf` render as `<article>` and gain a detail link in Phase 3.

## Sources

- https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html (fetched 2026-04-25)
- packages/specs/specs/01-card-grid-mvp.md § Card visual contract
- packages/specs/plans/01-card-grid-mvp.md § Open-question resolutions OQ#11
