# 0049 — Works schema v2 and fixtures hidden from the deploy

Status: accepted (phase 9, spec P9-3)

## Context
The project page (Tier S anatomy) needs fields the Phase 3 schema lacks: a one-line lede, status, start date, labelled links (some private), a media object with a loop and a focal point, a gallery with captions. Meanwhile 16 mock entries (`code-1`, `video-2`, …) exist only to exercise layouts and tests; they must not ship on the live site.

## Decision
- **Schema v2** in `src/content.config.ts` (`worksSchema`), still one discriminated union on `type` (ADR 0007). Added to the shared base: `lede` (≤ 120), `status` (`shipped | prototype | research | archived`), `started`, `links[]` (`label` ≤ 24, `href`, `private` default false, max 5), `gallery[]` (max 5, each media plus `caption` ≤ 100), `fixture` (default false). `cover` becomes `media`: `{ src: image(), alt, loop?: slug, focus 0–100 default 50 }`, backward compatible with `{ src, alt }`. Defaults keep `WorkEntry`'s output type stable (`gallery`, `links`, `fixture` always present).
- **Banner geometry:** 3:1 at ≥ 700 px, 16:9 below, max 1280 px wide, max 60 vh; `--focus` drives `object-position`.
- **Fixtures are flagged in frontmatter** (`fixture: true`, all 16 mocks) and filtered in one gateway, `getWorksCollection(filter?)` in `src/lib/works-collection.ts`, which ANDs `UTOFME_FIXTURES || entry.data.fixture !== true` onto the caller's predicate. Every `getCollection("works")` caller goes through it.
- **`UTOFME_FIXTURES`** is an `astro:env` boolean (`context: "server"`, `access: "public"`, default `true`). Local dev, CI and the test suite build with fixtures on; `deploy.yml` builds with `UTOFME_FIXTURES=false`. With the flag off, fixture pages are never generated, so the sitemap, feeds, Pagefind index and prev/next never see them.
- **Guard:** `scripts/check-no-fixtures.ts` (`bun run check:no-fixtures`) scans `dist/` for fixture slugs (`works/<slug>` not followed by a slug character) and `data-fixture` attributes and fails the deploy on any hit.
- **Budget config follows the flag:** with fixtures off, fixture-only island chunks (Sandpack, Counter, expressive-code, …) are still emitted but unreachable; `route-budgets.config.ts` allow-lists them only when `UTOFME_FIXTURES=false` so `check:budgets` stays strict in CI.
- The `/works/` index page was deleted (it only listed mocks); `/` is the single listing and `/works/` 301s to it.

## Alternatives
- **Delete the mocks.** Loses the layout/edge-case coverage the e2e, Axe and budgets suites rely on.
- **Move mocks to a separate collection or directory excluded from the build.** Needs every test and page to learn a second source; one flag on one collection is simpler.
- **Filter with `draft: true`.** Mixes two meanings; drafts also hide in dev and would drop the fixtures from the suites.
- **Per-caller filtering.** Easy to forget in one of the six call sites; the gateway makes the filter impossible to skip.

## Consequences
- The deployed site contains only real works; the production guard turns a leak into a failed deploy.
- Anything that asserts on mock content (some e2e/visual tests) only holds in fixture builds and must not be run against the deploy build.
- Chunk-level checks that expect "every chunk reachable" need the same flag awareness (see the budgets config).

## Sources
- https://docs.astro.build/en/guides/environment-variables/ (`astro:env`)
- https://docs.astro.build/en/guides/content-collections/
- packages/specs/specs/09-project-view.md § P9-3
- packages/specs/reports/09-w1-schema.md
- packages/specs/adrs/0007-single-collection-discriminated-union.md
