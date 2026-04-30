# ADR 0034 — Microformats v2 subset: `h-entry` + `h-card` + `rel="me"`

**Status:** accepted
**Date:** 2026-04-30 (Phase 6 close)

## Context

IndieWeb tools — webmention.io, indielogin.com, indieweb.xyz aggregators,
and feed-discovery readers — discover site identity and post structure via
microformats v2 markup. The full mf2 vocabulary is large (`h-entry`,
`h-card`, `h-event`, `h-review`, `h-product`, `h-feed`, `h-cite`, …); only
a small subset is consumed by tools we care about.

## Decision

Emit only the subset the site actually consumes:

- **`h-entry`** on every detail page (`p-name`, `dt-published`, `e-content`,
  `u-url`). Applied in `_WorkLayout.astro` and `_NoteLayout.astro`.
- **`h-card`** once in the footer (`p-name`, `p-note`, `u-url` plus
  `rel="me"` profile links). Component: `src/components/HCard.astro`.
- **`rel="me"` `<link>`** per profile in `<head>`, sourced from
  `src/lib/profiles.ts`.

Explicitly **NOT** emitted: `h-event`, `h-review`, `h-product`, `h-feed`.
`h-cite` appears only inside webmention render (where each mention may be
itself a cite of an external post).

Validation oracle: `microformats-parser`'s `mf2()` API in unit tests
asserts the emitted markup parses to the expected shape.

## Alternatives considered

- **Full mf2 (every property).** Surface area without consumer; breaks
  YAGNI. Rejected.
- **Schema.org JSON-LD only.** Doesn't satisfy webmention.io's
  rel-me-based identity verification, and the IndieWeb tooling stack is
  mf2-first. Rejected.
- **Hand-rolled rel-me-only (skip h-entry).** Loses post-level granularity
  webmentions need to attach replies to specific posts. Rejected.

## Consequences

- New unit test (`microformats.test.ts`) using `microformats-parser`'s
  `mf2()` API as the schema oracle — protects against accidental class
  removal in future layout edits.
- Markup is additive — no existing class names removed; visual output
  unchanged.
- Future expansion to `h-feed` (for the works/garden index pages) is a
  small follow-up; deliberately deferred to keep Phase 6 scope tight.

## Sources

- [Microformats v2 wiki](http://microformats.org/wiki/microformats2)
- [IndieWeb: microformats2](https://indieweb.org/microformats2)
- [microformats-parser on GitHub](https://github.com/microformats/microformats-parser)
- [IndieWeb: h-entry](https://indieweb.org/h-entry)
- [IndieWeb: h-card](https://indieweb.org/h-card)
- [Phase 6 spec § Microformats markup](../specs/06-indieweb.md)
