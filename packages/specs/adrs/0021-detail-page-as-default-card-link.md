# ADR 0021 — Detail page as default card link

## Status

Accepted — Phase 3. **Amends ADR 0011** (Phase 1: card click target strategy).

## Date

2026-04-26

## Context

ADR 0011 defined two card link states:

- **`<a href={externalUrl}>`** when a type-specific external URL is present, using priority chain `repo → youtube → listen → arxiv → pdf`.
- **`<article>`** (no link) when no external URL exists.

ADR 0011 explicitly noted: *"Phase 3 will introduce per-work detail pages and replace `<article>` cards with detail-page `<a href="/works/{slug}">` links."*

Phase 3 ships `/works/[slug]/` detail pages (Task 4). Every fixture that has a non-empty MDX/MD body now has a real destination URL. The question becomes: **when a detail page exists, should it take precedence over the external URL, or should the external URL remain the primary card link?**

### Constraints

1. **Not all fixtures have body content.** Some work entries are thin metadata records (title, date, type, external links only). Those entries have `body === undefined` or `body.trim() === ""`. For these, no detail page is generated; the Phase 1 link logic still applies.

2. **The external URL chain must survive.** Works with `repo`, `youtube`, etc. should still be navigable to the external destination. The question is whether that navigation stays on the card or moves to the detail page.

3. **Mutation-testability is a constraint (spec § Critical modules).** The link-selection logic must be in pure TypeScript, not embedded in `.astro` template conditionals, so Stryker can target it.

### Card.astro before Phase 3

```ts
// Phase 1 (ADR 0011)
function externalUrlFor(d: WorkEntry): string | undefined {
  if (d.type === "code" && d.repo) return d.repo;
  if (d.type === "video" && d.youtube) return d.youtube;
  if (d.type === "music" && d.listen) return d.listen;
  if (d.type === "math") return d.arxiv ?? d.pdf;
  return undefined;
}
const Tag = href ? "a" : "article";
```

This logic was duplicated in `Card.astro`. Phase 3 moves it to `lib/works.ts:cardHref` (Task 3) so that `Card.astro` becomes a thin caller.

## Decision

**Cards link to the detail page when `hasBody(entry) === true`; otherwise fall back to the Phase 1 external-URL chain; otherwise `<article>` (no link).**

The decision is implemented in `packages/site/src/lib/works.ts:cardHref`:

```ts
export function cardHref(entry: IdDataEntry): string {
  if (hasBody(entry)) return detailUrl(entry);           // → /works/<id>/
  const d = entry.data;
  if (d.type === "code" && d.repo) return d.repo;
  if (d.type === "video" && d.youtube) return d.youtube;
  if (d.type === "music" && d.listen) return d.listen;
  if (d.type === "math") return d.arxiv ?? d.pdf ?? "";
  return "";
}
```

`hasBody` is the pinned predicate: `typeof entry.body === "string" && entry.body.trim().length > 0`.

`Card.astro` is a thin caller:

```astro
const href = cardHref(entry);
const Tag = href ? "a" : "article";
```

When `href` starts with `/works/`, `Card.astro` emits `data-test="card-link-detail"`. When `href` is an external URL, it emits `data-test="card-link-external"`. Both are asserted in `tests/e2e/cards.spec.ts`.

### External URL on the detail page

Works that have both body content AND an external URL (`repo`, `youtube`, etc.) expose the external link as a secondary "open external" `<a>` in the detail-page header (`_WorkLayout.astro`). The Phase 1 priority chain (`repo → youtube → listen → arxiv → pdf`) is preserved there. This ensures the external destination is always reachable without requiring a card click; the card now navigates to the richer in-site detail view.

## Alternatives

### Keep external URL as primary card link; detail page is secondary

Rejected. The detail page is the richer experience (MDX body, code blocks, cover image). For entries that have body content, routing the card click to the external URL — bypassing the detail page — hides the in-site content. The detail page is the default; external is the opt-in from inside the detail page.

### Always link cards to the detail page (even if body is empty)

Rejected. For entries without body content, the detail page renders a sparse shell (title, date, no body). This is a worse user experience than routing directly to the external URL. The `hasBody` gate ensures detail pages receive card traffic only when they have something to show.

### Render both links on the card (detail page + external)

Rejected. Two interactive elements on a card create ambiguous click targets and an accessibility anti-pattern (the card's outer hit area would need to be a non-interactive container, with two inner links in a small space). The detail-page-first strategy with the external link on the detail page preserves a clean single-tap-target card UX while remaining fully keyboard-accessible.

### Move `cardHref` logic into `Card.astro` (not `lib/works.ts`)

Rejected. `.astro` files are excluded from Stryker's mutation testing scope. The spec (§ Critical modules) requires `cardHref`, `hasBody`, and `detailUrl` to be Stryker-targetable. Centralising in `lib/works.ts` makes them pure TS functions with fast-check property tests and Stryker mutation scores.

## Consequences

- `lib/works.ts` gains three new exports: `hasBody`, `detailUrl`, `cardHref`. All three are mutation-tested (Stryker nightly). `cardHref` replaces the inline `externalUrlFor` helper that previously lived in `Card.astro`.
- `Card.astro` is simplified to a thin caller: `const href = cardHref(entry)`.
- The Phase 1 `externalUrlFor` function in `Card.astro` is removed (Task 6). The priority chain logic is now in `cardHref`.
- Works with both body and an external URL expose the external URL in the detail-page header, not on the card. This is a deliberate UX change accepted in Phase 3.
- Works without body and without any external URL render `<article>` (no link). This is unchanged from ADR 0011.
- `tests/e2e/cards.spec.ts` is extended (Task 6) to assert three branches:
  - Body fixture → `<a href^="/works/" data-test="card-link-detail">`.
  - No-body fixture with `repo` → `<a href={repo} data-test="card-link-external">`.
  - No-body, no-external fixture → `<article>` (no link).
- Axe-core zero violations on all three card states (verified in `cards.spec.ts`).
- ADR 0011's external-URL priority chain is **preserved** for no-body cards and for the secondary link on detail pages. No behaviour changes for works without body content.

## Sources

- `packages/specs/adrs/0011-card-click-target-strategy.md` (amended)
- `packages/site/src/lib/works.ts` — `hasBody`, `detailUrl`, `cardHref` implementation
- `packages/site/src/components/Card.astro` — thin caller (Task 6, commit `f0f6bce`)
- `packages/site/tests/e2e/cards.spec.ts` — three-branch e2e assertion (Task 6)
- Phase 3 Task 3 commit `a3bf3e5` (lib/works.ts additions + property tests)
- Phase 3 Task 6 commit `f0f6bce` (Card.astro flip + cards.spec.ts extension)
- `packages/specs/specs/03-content-pipeline.md` § "Functional — `/works/[slug]` detail page" (card-link requirements)
