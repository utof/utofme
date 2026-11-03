# 0047 — Per-route budgets (`check:budgets`) replace site-wide size-limit globs

Status: accepted (phase 9, decision D9)

## Context

`size-limit` entries measured globs, not routes:

- `site js (all routes …)` summed `dist/_astro/*.js`: a total of chunks that **no single route loads**. Sandpack and graph chunks were negated by hand, one pattern at a time, to keep the number meaningful. The total could grow while every route got lighter, and the reverse.
- Thirteen `* css+html` entries added `dist/_astro/*.css` (every CSS file on the site) to one route's HTML, so they measured the wrong thing.
- `pagefind ui js` measured `dist/pagefind/pagefind-ui.js`, a file `/search/` never loads.

Phase 9 adds routes with very different needs (a media-heavy home, project pages with banner loops, a Sandpack demo), so one site-wide number is useless as a gate.

## Decision

`bun run check:budgets` (`packages/site/scripts/route-budgets.ts`, pure logic in `scripts/lib/route-budgets-core.ts`, limits in `route-budgets.config.ts`) parses each `dist/**/index.html` with `linkedom` and walks the JS import graph: static `import`, `export … from`, dynamic `import()` and Vite `__vite__mapDeps` preload lists.

- **First view** = `script[type=module]`, modulepreload, inline-module static imports and `astro-island` with `client=load|only|idle`, plus their static closure. **Lazy** = `client=visible|media`, dynamic edges and preload lists, minus first view. A shared chunk counts once per route.
- **Platform** = chunks in every route's first view; its own limit (40 KB).
- Measurement: gzip level 9 via `node:zlib` (same as `@size-limit/file`) for JS/HTML/CSS; raw bytes for media.
- Rules implemented: R1 first-view JS, R3 HTML and linked CSS, R4 eager posters and `fetchpriority`, R5 `video[data-loop]` markup, R6 loop file sizes. R4 follows the spec review: the home masonry is column-major, so the first 4 DOM cards are the eager candidate set, with at most 1 `fetchpriority=high` (exactly 1 on `/`). R4–R6 pass vacuously until the loop markup exists.
- **Self-check:** every `dist/_astro/*.js` must be reachable from some route or explicitly allow-listed, and every import edge must resolve. An unplaceable chunk is an error, so a bundler upgrade (Astro 7 / Vite 8 / Rolldown) cannot silently under-count. Fixtures cover Rollup- and Rolldown-style output.
- The **site-wide unique-JS total is report-only**.
- `/works/code-sandbox/` is an explicit, commented allow-list entry (measured, never failing) until the Sandpack facade (P9-12) lands.
- `size-limit` keeps only single-file / lazy-family entries (feed, audio, cursor, hover fx, datamosh).

## Alternatives

- **size-limit globs per route.** Cannot express "the CSS this route links" or "chunks reachable from this HTML"; globs match directories, not dependency graphs.
- **Lighthouse CI resource-summary assertions.** Measures a real browser load, but needs a headless browser in the gate, is noisy on small budgets, and cannot see lazy/never-hydrated buckets or markup contracts (R4–R6). LHCI stays as a separate score gate.
- **Bundler-emitted manifest (`.vite/manifest.json`).** Astro does not expose a per-page entry map, so HTML would still need parsing; the regex walker was verified against size-limit totals instead.

## Consequences

- New gate: one more CI step after `check:size`; no lefthook step (pre-commit never builds).
- The import regexes are a maintenance surface when Vite/Rolldown output changes; the self-check turns that into a loud failure rather than a wrong number.
- Deferred (issues to file): R2 lazy-JS, R7 poster candidates, R8 GIF references, R9 eager-island closure, the Δ-vs-`main` baseline, and a `pagefind runtime (first query)` size-limit entry (120 KB) once P9-1 fixes the file names.

## Sources

- `packages/specs/specs/09-project-view.md` § P9-2 and "Budgets for this phase"
- `packages/specs/reviews/09-spec-review.md` finding 5 (branch `review/09-spec`)
- Vite preload helper: https://github.com/vitejs/vite/blob/main/packages/vite/src/node/plugins/importAnalysisBuild.ts
- `@size-limit/file` gzip level: `node_modules/@size-limit/file/index.js`
