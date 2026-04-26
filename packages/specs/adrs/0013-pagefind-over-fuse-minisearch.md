# ADR 0013 — Pagefind over Fuse.js / MiniSearch / backend services

## Date
2026-04-26

## Status
Accepted — Phase 2

## Context

Phase 2 adds a `/search` route (`packages/site/src/pages/search.astro`) backed by a
local-search implementation. The site is **static** (Cloudflare Workers Assets; no SSR);
search must therefore run entirely in the browser with no runtime egress to an external
service.

Several options were evaluated:

- **Fuse.js** — ships the full searchable corpus as a JSON blob in the page. On a
  hundreds-of-pages site that blob is multi-MB; on the current 10-fixture corpus it is
  small, but the architecture is fundamentally non-lazy: the browser downloads the entire
  index on first page load.
- **MiniSearch** — same "ship the corpus" model as Fuse.js; faster fuzzy matching, but
  no lazy loading of the index. Multi-MB at scale.
- **Algolia / Typesense / Meilisearch** — hosted backend services. Require API keys,
  billing, and runtime fetch calls from the browser, violating the static-first,
  no-runtime-egress invariant (`packages/specs/specs/02-interactivity.md` line 40:
  "No backend search service").
- **Pagefind** (via `astro-pagefind`) — emits a **chunked, lazy-loaded binary index** at
  build time. The browser loads only the chunks relevant to each query. The Pagefind UI
  JS bundle (`dist/pagefind/pagefind-ui.js`) measured **29.7 KB gzipped** on the Phase 2
  build with 10 fixture entries. The Astro integration (`astro-pagefind`) builds and
  serves the index automatically on `astro build`. Pagefind is Starlight's (Astro's
  official docs framework) default search backend, giving it significant battle-testing
  across large doc sites.

Known cost: the Pagefind index is generated **post-build**, so `/search` returns an empty
fallback panel during `bun run dev` unless a prior `bun run build` has populated
`dist/pagefind/`. The dev-fallback UX is documented in
`packages/specs/plans/02-interactivity.md` § OQ#3.

Source: `packages/specs/specs/02-interactivity.md` line 226; `packages/specs/plans/02-interactivity.md` § OQ#3 + Task 11.

## Decision

Use `astro-pagefind` (wrapping `pagefind` v1) for the `/search` route. The integration is
registered in `astro.config.mjs` alongside `@astrojs/svelte`. Post-build it populates
`dist/pagefind/`; the Pagefind UI JS (`pagefind-ui.js`) is budgeted separately in
`.size-limit.cjs` at ≤ 100 KB gzipped (measured 29.7 KB — well inside the ceiling).

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Fuse.js | Rejected | Ships the full corpus as JSON on first load; multi-MB at scale; no lazy chunking. |
| MiniSearch | Rejected | Same "ship the corpus" model; faster matching than Fuse.js but same first-load cost. |
| Algolia | Rejected | Hosted service; requires API key, billing, runtime fetch. Violates static-first, no-runtime-egress invariant. |
| Typesense / Meilisearch | Rejected | Same hosted-service objection as Algolia. |

## Consequences

- `/search` works on built preview (`bun run preview`) and in production; it does not
  work on a fresh `bun run dev` with no prior build.
- Dev-fallback: `search.astro` renders a `<p data-pagefind-dev-fallback>` element when
  `window.pagefind` is undefined after 2 s; the e2e suite (`tests/e2e/search.spec.ts`)
  runs against built preview only.
- Pagefind UI JS is gated by the `"pagefind ui js"` entry in
  `packages/site/.size-limit.cjs` (≤ 100 KB gzipped). The `"site js (all routes)"` entry
  covers `dist/_astro/*.js` separately; Pagefind's own chunks live under
  `dist/pagefind/` and are not bundled by Astro.
- Adding new content entries to `src/content/works/` automatically extends the Pagefind
  index on the next `bun run build` — no search-specific config update required.
- Pagefind attributes (`data-pagefind-body`, `data-pagefind-meta`, `data-pagefind-filter`)
  are added to relevant HTML elements in `Card.astro` and `search.astro` to control index
  granularity and filter facets.

## Sources

- https://pagefind.app/ (fetched 2026-04-26)
- https://github.com/CloudCannon/pagefind (Pagefind repo; fetched 2026-04-26)
- https://github.com/shishkin/astro-pagefind (astro-pagefind integration README; fetched 2026-04-26)
- `packages/specs/specs/02-interactivity.md` line 40 (no backend search service) and line 226 (Pagefind choice)
- `packages/specs/plans/02-interactivity.md` § OQ#3 (dev-fallback), OQ#6 (bundle-size split), Task 11
- `packages/site/.size-limit.cjs` (pagefind ui js ≤ 100 KB entry)
