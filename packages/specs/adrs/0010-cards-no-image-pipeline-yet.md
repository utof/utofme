# ADR 0010 — Cards: no image pipeline yet (cover schema-only in Phase 1)

## Status

Accepted — Phase 1. **MUST** (promoted per spec line 16: "ADR 0010 (MUST) documents this
deferral"). No Phase 1 card component may render an `<img>` for a cover image; any agent
or developer who encounters this ADR must treat that constraint as non-negotiable until
Phase 3.4 lands and explicitly supersedes this ADR.

## Date

2026-04-26

## Context

Phase 1 ships a 10-card heterogeneous grid on `/` and `/works`. Each card has a per-type
CSS thumb (Tasks 5 / 7) and a uniform outer shell (Task 5). The content schema
(`src/content.config.ts`) captures `cover?: { src: string; alt: string }` per spec L90 so
that content authors can supply cover images in frontmatter today and have them validated
at build time.

However, Phase 1 does **not** render an `<img>` element for the cover anywhere in the card
components. Thumbs are pure-CSS abstractions (`CodeThumb`, `VideoThumb`, `MusicThumb`,
`MathThumb`, `WritingThumb`). The `cover` field is schema-only.

The first place where a cover image will actually be displayed to users is the per-work
detail page (`/works/[slug]`), which ships in Phase 3.4. At that point `astro:assets`
`<Image />` will be used for optimised delivery.

## Decision

**Treat `cover` as schema-only in Phase 1.** Card thumbs are pure-CSS (Task 7); `<Image />`
from `astro:assets` ships in Phase 3.4 alongside per-work detail pages where the cover
actually surfaces.

No `<img>`, no `<Image />`, and no `getImage()` call appears in any Phase 1 card component.

## Alternatives

### Render `<img loading="lazy">` for unoptimized cover images now

Rejected. A 10-card grid with unoptimized images creates a real LCP regression risk against
the ≥ 95 mobile Lighthouse Performance gate on `/` and `/works`. Additionally it requires
plumbing image-source resolution (relative paths vs. absolute URLs, public-directory
resolution) that is wasted work, since Phase 3.4 replaces it entirely with `astro:assets`
`<Image />`.

### Drop the `cover` field from the schema entirely

Rejected. The schema is the source of truth for content frontmatter. Capturing the field
now lets Phase 3.4 ship without a content migration: existing `.md` / `.mdx` files that
already have a `cover:` key will be validated at build time and will not need to be
rewritten when the rendering pipeline lands.

## Consequences

- 10-card grid Lighthouse Performance ≥ 95 stays achievable (no images to optimize).
- `cover` validation runs at build time (`bunx astro check`); content authors get immediate
  feedback when frontmatter is malformed.
- Phase 3.4 must add a `<Image />` rendering pipeline + a `/works/[slug]` detail route;
  this ADR is the contract that authorises that work.
- 5 CSS thumb components (Task 7) ship as the visual-rhythm filler in lieu of imagery:
  `CodeThumb`, `VideoThumb`, `MusicThumb`, `MathThumb`, `WritingThumb`.
- Any PR that adds an `<img>` or `<Image />` to a Phase 1 card component violates this ADR
  and must be reverted or deferred to Phase 3.4.

## Sources

- https://docs.astro.build/en/guides/images/ (fetched 2026-04-26)
- packages/specs/specs/01-card-grid-mvp.md § Context / invariants (line about no `<Image />`)
- packages/specs/specs/01-card-grid-mvp.md § Schema (cover field, L90)
- https://web.dev/articles/lcp (Largest Contentful Paint fundamentals)
