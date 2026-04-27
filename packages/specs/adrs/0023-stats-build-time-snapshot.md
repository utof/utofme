# ADR 0023 — `/stats`: build-time snapshot, not runtime SSR

## Context

The general-plan has two architectural options for `/stats`:
1. Runtime SSR (Astro Cloudflare adapter, `prerender = false`, KV-cached).
2. Build-time snapshot (scheduled deploy hook, fully static).

CLAUDE.md says "Static-first; SSR only for `/stats`". Phase 4 spec
chooses path 2.

## Decision

Ship `/stats` as a static page driven by a build-time JSON snapshot
(`src/content/stats/snapshot.json`, fetched by
`scripts/fetch-stats-snapshot.ts` in production builds, falls back to
fixture in dev/CI). No Cloudflare adapter installed in Phase 4.

## Alternatives

- Path 1 (runtime SSR) — adds CF adapter dep + secrets-blocker + runtime
  CPU; freshness floor drops to whatever cache TTL is set (15 min in
  general-plan). Punted to a future phase if sub-hour freshness is
  required.

## Consequences

- Zero runtime CPU; survives upstream outages.
- Freshness floor = build cadence (manual + scheduled deploy hook ≥ 6 h).
- /stats acceptance criteria still met: static HTML, all 5 sources
  visible, ⚠ on failure (per ADR 0024).

## Sources

- [phase-4 spec § Architecture (/stats)](../specs/04-slash-pages.md)
- [General plan § Phase 4.2 recommendation](../../../2026-04-25-general-plan)
- [CLAUDE.md § Stack — "Static-first"](../../../CLAUDE.md)
