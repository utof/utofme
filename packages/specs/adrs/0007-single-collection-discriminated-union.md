# ADR 0007 — Single `works` collection with discriminated union

## Status

Accepted — Phase 1

## Date

2026-04-26

## Context

Phase 1 ships a heterogeneous home grid showing 5 work types (code/video/music/math/writing).
The schema must validate frontmatter for each type; the home page must sort all entries by date
regardless of type.

The key design question is whether to model this as one collection with a discriminated-union
schema or as five separate collections (one per work type).

## Decision

One Astro Content Collection named `works`, with a `z.discriminatedUnion("type", [...])` schema
spanning all 5 types. A single `getCollection("works")` returns the full sortable list.

The schema is defined in `packages/site/src/content.config.ts` with `worksSchema` as a named
export (enabling standalone unit tests and Stryker mutation testing without importing the full
Astro runtime).

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Five separate collections (`code`, `video`, `music`, `math`, `writing`) | Rejected | The home grid would require 5 `getCollection()` calls + a manual merge + a separate sort step; also loses the natural discriminated-union TypeScript narrowing that makes per-type field access sound. |
| Single collection with a loose `z.record` or `z.any()` schema | Rejected | Loses type safety entirely; per-type fields would be untyped at the consumer, requiring manual casting and silencing the TS strict compiler. |

## Consequences

- Adding a new work type means adding one variant to the discriminated union in
  `src/content.config.ts` (single-file change). Removing a type is symmetric.
- The schema file is the single source of truth for what frontmatter is valid in
  `src/content/works/`.
- Per-type fields are TypeScript-narrowed inside `if (entry.data.type === "code")` blocks
  (verified at spec polish 2026-04-25 via `tsc --noEmit` positive + negative probes).
- `getCollection("works")` returns entries typed as a discriminated union; consumers narrow
  with `entry.data.type` before accessing type-specific fields (e.g. `entry.data.stack`).
- The `worksSchema` named export allows unit tests and Stryker mutation testing to import and
  exercise the schema logic independently of the Astro build pipeline.

## Sources

- https://docs.astro.build/en/guides/content-collections/ (fetched 2026-04-25)
- https://zod.dev/api (fetched 2026-04-25)
- `packages/specs/specs/01-card-grid-mvp.md` § Schema
- `packages/specs/plans/01-card-grid-mvp.md` § Task 2
