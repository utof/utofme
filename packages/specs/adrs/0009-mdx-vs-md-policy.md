# ADR 0009 — MDX vs Markdown policy for content-collection entries

## Status

Accepted — Phase 1

## Date

2026-04-26

## Context

Phase 1 ships a content collection (`works`) loaded via
`glob({ pattern: "**/*.{md,mdx}", base: "./src/content/works" })`.
The `worksSchema` discriminated union is shared; both `.md` and `.mdx` extensions
parse identically into frontmatter + body via Astro's built-in Markdown pipeline and
the `@astrojs/mdx` integration respectively.

Phase 1 introduces **10 fixture files** (2 per type) that are the first entries in the
collection. Without a documented policy, future contributors might default to `.mdx`
for everything ("forward-compatibility") or default to `.md` for everything ("simplicity"),
neither of which exercises both branches of the glob loader — a gap that would leave the
`.mdx` parser path untested until Phase 3 detail pages.

## Decision

- Use **`.md`** for plain prose entries: no JSX, no custom-component imports, no
  evaluated expressions in the body. All five production-visible fixtures ship as `.md`.
- Use **`.mdx`** only when an MDX feature is genuinely needed: custom component imports
  (`import Foo from "…"` inside the file), JSX expressions, or runtime-evaluated
  frontmatter logic. The five draft fixtures ship as `.mdx`.
- Phase 1 intentionally includes **5 `.md` files + 5 `.mdx` files** to exercise both
  branches of the loader's glob pattern from the first commit that adds content.

The policy is: **prefer `.md`; escalate to `.mdx` when an MDX feature is required**.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| All `.mdx` for forward-compatibility | Rejected | `.mdx` parsing carries Vite transform overhead vs. plain Markdown. Adds complexity for entries that need no JSX. Violates CLAUDE.md "no preemptive complexity" principle — only use an MDX feature when the feature is actually used. |
| All `.md`, switch to `.mdx` on demand | Rejected | The production build would never exercise the `.mdx` parser path until Phase 3 detail pages ship a component-importing entry. Violates "test what you ship" — the glob includes `.mdx` from Day 1, so the integration must be exercised from Day 1. |
| Two separate collections (one per extension) | Rejected | Fragments the schema, doubles the `getCollection` call-sites, and provides no benefit over the discriminated-union policy already adopted in ADR 0007. |

## Consequences

- Contributors writing prose-only entries (no JSX, no custom components) **must** use
  `.md`. This keeps parse time low and review diffs readable.
- Contributors who need an embedded custom component (Phase 3+) **must** use `.mdx`.
  The `@astrojs/mdx` integration is registered in `astro.config.mjs` (Task 1) and
  available from Phase 1 onward.
- Phase 1 ships no detail-page that renders the MDX body via `<Content />`. The
  `@astrojs/mdx` integration is exercised at build time (Vite transform), not at
  runtime, so zero JS reaches the browser (0 KB JS gate holds).
- Phase 3 detail-page rendering will exercise both `.md` and `.mdx` body parsing; this
  policy is the contract for which extension to expect in which file.
- The `worksSchema` validates both `.md` and `.mdx` frontmatter identically. Extension
  choice has no impact on schema validation or TypeScript types.

## Sources

- https://docs.astro.build/en/guides/integrations-guide/mdx/ (fetched 2026-04-26)
- https://docs.astro.build/en/guides/markdown-content/ (fetched 2026-04-26)
- `packages/specs/specs/01-card-grid-mvp.md` § ADRs to write
- `packages/specs/adrs/0007-single-collection-discriminated-union.md` (related decision)
- `packages/specs/plans/01-card-grid-mvp.md` § File structure (5 `.mdx` drafts + 5 `.md` prod)
