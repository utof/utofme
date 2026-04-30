# ADR 0032 — Sitemap via `@astrojs/sitemap` with filter; `robots.txt` advertises it

**Status:** accepted
**Date:** 2026-04-30 (Phase 6 close)

## Context

Search engines and IndieWeb readers discover content via a sitemap.
`@astrojs/sitemap` is the first-party Astro integration; it auto-discovers
every emitted route, supports `entryLimit` auto-sharding into multiple
`sitemap-N.xml` files, and emits a `sitemap-index.xml` pointing at the
shards.

A few routes in this site should NOT appear in the sitemap:
- `/search` — interactive island, not indexable content.
- `/garden/graph/` — canvas visualisation, no text.
- `/stats/` — SSR snapshot of build metrics, not user-facing content.

## Decision

Register `sitemap()` in `astro.config.mjs#integrations`. Use the `filter`
option to exclude `/search`, `/garden/graph/`, `/stats/` (and their
descendants) from the index. `serialize()` deferred (Phase 6 follow-up) —
the default per-page metadata (`<lastmod>`, `<changefreq>`) emitted by the
integration is good enough for first ship.

Ship `public/robots.txt` (3 lines: `User-agent: *`, `Allow: /`, `Sitemap:
https://utof.me/sitemap-index.xml`) so crawlers without manual sitemap-URL
configuration discover it.

## Alternatives considered

- **Hand-rolled sitemap.** Reinvents the wheel; loses `entryLimit`
  auto-sharding and content-collection integration. Rejected.
- **Drop sitemap entirely.** Bad SEO posture; webmention.io and IndieWeb
  aggregators also rely on a sitemap to discover all canonical URLs.
  Rejected.
- **Separate ADR for `robots.txt`.** Folded into this one — `robots.txt` is a
  3-line standard pointer, not a reversible architectural decision.

## Consequences

- 2 new endpoints (`/sitemap-index.xml`, `/sitemap-0.xml`) emitted at build
  time.
- `astro.config.mjs#site` MUST be set (`https://utof.me/`) — sitemap fails
  the build without it. (Same requirement as ADR 0031.)
- Filter list is hand-maintained; new private routes added in later phases
  must be appended to the filter or they will leak into search indexes.

## Sources

- [@astrojs/sitemap integration guide](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/integrations-guide/sitemap.mdx)
- [Sitemaps protocol](https://www.sitemaps.org/protocol.html)
- [Google: robots.txt introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Phase 6 spec § Sitemap pipeline](../specs/06-indieweb.md)
