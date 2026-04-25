# ADR 0004 — `output: 'static'` as the Phase 0 default

## Status
Accepted — Phase 0

## Context

Astro 6 supports three output modes: `'static'`, `'server'`, and `'hybrid'`. The site is
content-dominant in all phases. Phase 0 has no server-side logic, no API endpoints, and no
authenticated routes. The question was which output mode to adopt as the baseline.

Cloudflare Workers free tier caps **CPU time at 10 ms per request** for Worker script invocations.
This cap does not apply to static asset fetches served directly from Workers Assets. Full SSR or
hybrid mode would expose every page to that constraint unnecessarily.

`output: 'static'` enables:
- Zero-JS first-load (spec hard gate: `dist/_astro/*.js` must be empty on Phase 0 `/`).
- No server runtime cost; all pages are HTML files served from Workers Assets CDN.
- `bun run build` is purely deterministic; no runtime environment variables needed.

## Decision

Set `output: 'static'` in `astro.config.mjs` as the default for all phases up to and including
Phase 3. Phase 4 introduces the `/stats` SSR route, at which point `output` transitions to
`'hybrid'` with explicit `prerender = false` on `/stats` only, and `@astrojs/cloudflare` is added.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| `output: 'server'` (full SSR) | Rejected | Unnecessary for content-dominant site; 10 ms CPU risk on every request |
| `output: 'hybrid'` now | Deferred | No SSR routes exist until Phase 4; installing hybrid prematurely adds adapter complexity |
| `output: 'static'` for all phases | Deferred | Phase 4 `/stats` requires SSR; hybrid is the natural upgrade |

## Consequences

- `bun run build` produces a `dist/` directory of pure HTML/CSS/asset files — no JS chunks.
- `size-limit` hard gate: 0 KB JS on `/` for Phase 0 (spec § "size-limit budget for Phase 0").
- `wrangler.jsonc` has no `main` key (no Worker script entry point).
- Phase 4 plan must amend `astro.config.mjs` to `output: 'hybrid'`, add `@astrojs/cloudflare`,
  and add `export const prerender = false` to `src/pages/stats.astro`.
- Lighthouse Performance ≥ 95 on mobile is trivially achievable with static output + no JS.

## Sources

- docs.astro.build/en/reference/configuration-reference/#output (Astro output modes)
- developers.cloudflare.com/workers/platform/limits/ (10 ms CPU cap on Workers free tier)
- packages/specs/specs/00-foundations.md § "Context / invariants", § "size-limit budget for Phase 0"
- packages/specs/adrs/0002-cloudflare-workers-no-adapter-for-static.md
