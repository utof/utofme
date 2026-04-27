# ADR 0022 — Slash-page MDX collection + shared `_SlashLayout`

## Context

Phase 4 ships /now, /uses, /colophon, /tops as content-driven pages. Two
options:

(a) Inline content in each `.astro` page.
(b) Per-page `.md` / `.mdx` content with no schema.
(c) MDX collection at `src/content/slash/` with Zod schema and shared layout.

Each page needs an `updated` timestamp by IndieWeb convention. Phase 1
already has the `works` collection precedent (ADR 0007).

## Decision

Adopt option (c) — `slash` MDX collection with required `updated: Date`,
optional `description`, optional `tags`. Pages render through a shared
`_SlashLayout` that surfaces title + updated + cross-link to the other 4
slash pages.

## Alternatives

- (a) — drift, no `updated` enforcement, no shared chrome.
- (b) — loses MDX (no embedded components if `/uses` later wants a list
  of links rendered from a Svelte island).

## Consequences

- One MDX collection; one Zod schema; one layout — single source of truth.
- `_SlashLayout` is shared between /now, /uses, /colophon, /tops. /stats
  uses a parallel layout because its body is rendered from the snapshot,
  not MDX `<Content />`.

## Sources

- [phase-4 spec § Architecture](../specs/04-slash-pages.md)
- [ADR 0007 — works collection precedent](./0007-single-collection-discriminated-union.md)
- IndieWeb /now-page directory: <https://nownownow.com/about>
