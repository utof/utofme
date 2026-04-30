# ADR 0031 — RSS as three feeds (firehose + per-collection)

**Status:** accepted
**Date:** 2026-04-30 (Phase 6 close)

## Context

The site has two long-form content collections (works, garden notes). Some
subscribers want everything; some want only one stream. A single firehose feed
forces every subscriber to receive both kinds of post, which is the wrong
default for readers who follow only one collection.

`@astrojs/rss` is the first-party Astro integration for emitting RSS 2.0; it
ships a typed `getRssString` / default-export builder that handles XML
escaping, validates required item fields, and integrates with content
collections.

## Decision

Ship three RSS endpoints, all built via `@astrojs/rss` (latest stable major):

- `/feed.xml` — firehose (works ∪ garden), top 30 by `pubDate` desc.
- `/feed/works.xml` — works only.
- `/feed/garden.xml` — garden notes only.

A single source-of-truth helper `src/lib/feed.ts` converts content-collection
entries to the RSS item shape and applies `stripIslands` (via `linkedom`) so
RSS readers — which can't execute Phase 3 islands — see plain HTML.

Per-route `<link rel="alternate" type="application/rss+xml">` policy:
- Index pages (`/works/`, `/garden/`) advertise firehose **plus** their own
  collection feed.
- Detail pages (`/works/[slug]/`, `/garden/[slug]/`) advertise firehose only.
- Slash pages and other static routes advertise firehose only.

`customData: '<language>en</language>'` on every feed.

## Alternatives considered

- **Single firehose only.** Cheaper to maintain, but a reader interested only
  in code work has to filter by hand. Rejected.
- **Atom + RSS dual.** Atom would add another endpoint per feed and ~30 %
  maintenance for a feature few subscribers ask for. Deferred.
- **JSON Feed.** Same — not enough subscriber demand to justify a third
  format. Deferred.

## Consequences

- 3 endpoints to maintain; `src/lib/feed.ts` is the single source of truth so
  drift between feeds is impossible.
- Content-stripping (`stripIslands` via `linkedom`) is required because RSS
  readers can't execute Phase 3 islands; the helper walks the rendered HTML
  and removes `<astro-island>` and similar custom elements.
- `astro.config.mjs#site` MUST be set (`https://utof.me/`) for absolute
  `<link>` URLs in RSS items.

## Sources

- [@astrojs/rss recipe](https://github.com/withastro/docs/blob/main/src/content/docs/en/recipes/rss.mdx)
- [RSS 2.0 specification](https://www.rssboard.org/rss-specification)
- [Phase 6 spec § RSS feed pipeline](../specs/06-indieweb.md)
