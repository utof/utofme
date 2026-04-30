# ADR 0033 — Webmentions fetched at build time, CI-only, never runtime

**Status:** accepted
**Date:** 2026-04-30 (Phase 6 close)

## Context

Webmentions are inbound notifications from other sites that link to ours.
The standard pattern is to receive them via Aaron Parecki's
`webmention.io` service and display them under detail pages. Two places
could fetch the data: at request time (runtime) or at build time. Runtime
fetch breaks the static-only output goal (ADR 0004) and adds latency +
rate-limit risk on every page render.

## Decision

A discrete script `scripts/build-webmentions.ts` runs as a CI step
(`bun run sync:webmentions`) **before** `bun run build`. It fetches
`https://webmention.io/api/mentions.jf2?target=…` via offset pagination
(`page=N&per-page=100`, 0-indexed, `MAX_PAGES = 50` ⇒ 5 000-mention ceiling
per URL, `MAX_RETRIES = 3` per page with exponential backoff), validates
each child against a Zod schema in `src/lib/webmentions-types.ts`, and
writes per-slug JSON to `src/data/webmentions/<slug>.json` with the
deterministic-write contract (tab indent, trailing newline, sorted by
`wm-id` ascending).

Local `bun run dev` and local `bun run build` NEVER hit the network — they
consume the last-committed JSON. Only CI (and a maintainer running
`bun run sync:webmentions` manually) refreshes the cache.

## Alternatives considered

- **Runtime fetch.** Breaks ADR 0004 static-only output; visible latency on
  every page render; rate-limit risk per visitor. Rejected.
- **Chain into `bun run build` directly.** Forces every local build to hit
  the network and to require the `WEBMENTION_IO_TOKEN`. Rejected — local
  rebuilds must work fully offline.
- **Lefthook precommit gate.** Same offline problem as the build chain;
  also makes commits flaky on poor connections. Rejected.

## Consequences

- One new CI step; optional `WEBMENTION_IO_TOKEN` repo secret raises the
  rate limit on the upstream API (anonymous calls work, but slowly).
- Schema lives in `src/lib/webmentions-types.ts` and is shared by the
  fetcher and `Webmentions.astro` so producer + consumer can never drift.
- `content.html` is intentionally NEVER rendered (only `content.text`);
  avatars hotlink with `referrerpolicy="no-referrer"`. Trust boundary is
  tight; no XSS surface from third-party HTML.
- Pagination ceiling (`MAX_PAGES = 50`) means a single target URL exceeding
  5 000 mentions silently drops the tail. Acceptable for personal-site
  scale; revisit if any URL approaches the cap.

## Sources

- [webmention.io (Aaron Parecki)](https://github.com/aaronpk/webmention.io)
- [W3C Webmention recommendation](https://www.w3.org/TR/webmention/)
- [jf2 microformats serialization](https://indieweb.org/jf2)
- [Phase 6 spec § Webmentions: build-time fetch](../specs/06-indieweb.md)
