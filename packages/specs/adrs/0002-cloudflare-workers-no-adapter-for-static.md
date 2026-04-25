# ADR 0002 — Cloudflare Workers (no Astro adapter for static)

## Status
Accepted — Phase 0

## Context

The site targets Cloudflare Workers with the Workers Assets feature for static hosting. Astro 6 supports
`output: 'static'` independently of any deployment adapter. The question was whether to install
`@astrojs/cloudflare` and which hosting platform to use.

Three platforms were evaluated for the Phase 0 free tier:

1. **Cloudflare Workers (Assets)** — 100 k req/day, unlimited static-asset egress, no request time
   limit for pure asset serving. Workers Assets is the officially supported path for static output on
   Workers as of Wrangler 3.x; `@astrojs/cloudflare` is only required when `output: 'server'` or
   `output: 'hybrid'` is used.
2. **Vercel Hobby** — free tier prohibits commercial use (source: agentdeals.dev/hosting-free-tier-comparison-2026).
   The portfolio site falls in an ambiguous zone and adopting Vercel for a commercial portfolio would
   violate their ToS. Rejected on ToS grounds.
3. **Netlify** — free tier is credit-based (bandwidth + build minutes pool). Predictability is poor
   under traffic spikes. Rejected for budget unpredictability.

Astro's own docs confirm: *"If you're using Astro as a static site builder, you don't need an adapter."*
Source: docs.astro.build/en/guides/integrations-guide/cloudflare/

Additionally, `@astrojs/cloudflare` dropped Cloudflare **Pages** support in a major release; the
supported path for new projects is Workers + Assets, not Pages. Installing the adapter for static
output would add an unused dependency that trips `knip` and `depcruise` gates.

## Decision

Deploy Phase 0 to **Cloudflare Workers (Assets)** with `output: 'static'`, **no `@astrojs/cloudflare` adapter**.
`wrangler.jsonc` serves `./dist` via the `assets.directory` key. The Cloudflare adapter is re-introduced
in Phase 4 when the SSR `/stats` route lands.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| `@astrojs/cloudflare` in Phase 0 | Rejected | Unnecessary for `output: 'static'`; inflates deps |
| Cloudflare Pages | Rejected | `@astrojs/cloudflare` dropped Pages support |
| Vercel Hobby | Rejected | Commercial-use prohibited by ToS |
| Netlify | Rejected | Credit-based pricing; unpredictable under load |

## Consequences

- No `@astrojs/cloudflare` in `package.json` until Phase 4.
- `wrangler.jsonc` requires no `main` key (pure static assets).
- `wrangler deploy --config packages/site/wrangler.jsonc` is the deploy command.
- Phase 4 plan must re-evaluate adding `@astrojs/cloudflare` alongside the `/stats` SSR route.
- Free-tier budget (100 k req/day) is trivially satisfied by static asset serving.

## Sources

- docs.astro.build/en/guides/integrations-guide/cloudflare/ (adapter not needed for `output: 'static'`)
- developers.cloudflare.com/workers/static-assets/ (Workers Assets configuration)
- developers.cloudflare.com/workers/wrangler/configuration (Static Assets `not_found_handling`, `binding`)
- agentdeals.dev/hosting-free-tier-comparison-2026 (Vercel Hobby commercial-use prohibition)
- packages/specs/specs/00-foundations.md § "Context / invariants", § "External services / runtime deps"
