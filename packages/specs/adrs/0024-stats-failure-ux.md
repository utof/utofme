# ADR 0024 — `/stats` failure UX: stateless per-build, no stale-data retention

## Context

When an upstream API (GitHub, Strava, Last.fm, Literal, Wakatime) is
down at build time, the snapshot fetcher gets one of:

- network rejection
- non-2xx status
- malformed JSON (non-object)

Two possible responses:

1. **Retain last good** — read prior `snapshot.json` from disk, keep its
   per-source value, flag `error: true`.
2. **Stateless per-build** — no prior read, no persistence; failed
   sources render `value: null` + `error: true` and the page shows
   "⚠ data temporarily unavailable" for that section.

## Decision

Adopt option 2.

## Alternatives

- Option 1 needs cross-build persistence. Cloudflare Pages does not
  persist working-tree files between deploys; a viable persistence layer
  is Cloudflare KV / R2 / a GitHub Releases artifact. Adding any of
  those is a deploy-infra change beyond Phase 4 scope.
- Even with persistence, presenting last-known-good as if it were
  current is a credibility hazard (visitors don't see the timestamp the
  same moment they read the value).

## Consequences

- Zero persistence dependency; build script is fully stateless.
- A short upstream outage between scheduled deploys shows ⚠ for that
  source instead of last-known value. Trade-off accepted.
- `StatsSource.value` is nullable; `StatsSource.lastSuccessAt` is
  nullable. Type system encodes the failure case.

## Sources

- [phase-4 spec § Failure UX](../specs/04-slash-pages.md)
- [Cloudflare Pages — Build configuration: working directory not persisted](https://developers.cloudflare.com/pages/configuration/build-configuration/)
