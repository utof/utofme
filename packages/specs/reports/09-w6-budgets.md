# W6 — per-route budgets (`check:budgets`) + size-limit cleanup

Branch `p09/w6-budgets` (from `origin/phase/09-project-view`). Spec P9-2, decision D9, reduced scope per the spec review.

## What was built
- `packages/site/scripts/lib/route-budgets-core.ts` — pure logic: import-graph extraction and walking, linkedom HTML analysis, buckets (first view / lazy), platform, rules **R1, R3, R4, R5, R6**, chunk-placement self-check, report-only unique-JS total, markdown rendering.
- `packages/site/scripts/route-budgets.ts` — CLI (`measureDist`, `runBudgets`, `main`): reads `dist/`, prints the markdown report, appends to `$GITHUB_STEP_SUMMARY`, exits 1 on any error finding.
- `packages/site/route-budgets.config.ts` — typed budgets table (classes → limits, route → class rules, excluded routes, allow-listed unreferenced chunks, loop limits). 1 KB = 1024 B.
- `packages/site/.size-limit.cjs` — deleted the 13 `* css+html` entries, `pagefind ui js`, `site js (all routes …)` and `/garden/graph/ js`. Kept feed.xml, audio-assets, cursor-island, hover fx js, `/lab/datamosh/ js`. Header comment rewritten. `bun x size-limit` passes (5 entries).
- `packages/site/package.json` — `"check:budgets": "bun run scripts/route-budgets.ts"`.
- `.github/workflows/ci.yml` — one step `check:budgets` after `check:size`.
- `packages/specs/adrs/0047-per-route-budgets.md`.
- Tests: `packages/site/tests/unit/route-budgets.test.ts` (36 tests); fixtures in `packages/site/tests/fixtures/budgets/` (`graph-rollup/`, `graph-rolldown/` mini-dists; `rules/*.html` pass/fail pages).

## Measurement
gzip level 9 (`node:zlib`) for JS/HTML/CSS (CSS = sum of per-file gzip of linked `link[rel~=stylesheet]`); raw bytes for media. JS edges: static `import` (incl. multi-line, single-quoted, bare `import "x"`), `export {…}/* /* as ns from`, dynamic `import()`, and `m.f=[…]` / `viteFileDeps=[…]` preload lists (treated as dynamic). Specifiers resolve three ways to one dist-relative key: `./x.js` (importer-relative), `/_astro/x.js` and `_astro/x.js` (root-relative). Shapes checked against Vite's current `importAnalysisBuild.ts` (`__vite__mapDeps`, relative-base variant) and covered by a Rolldown-style fixture (spaced, multi-line, `export * from`, relative `./` preload lists, `__vitePreload`). Not verified against a real Rolldown build (still Astro 6 here).

Buckets: **first view** = `script[type=module][src]`, `link[rel~=modulepreload]`, inline-module static imports, `astro-island` `component-url`/`renderer-url`/`before-hydration-url` for `client=load|only|idle`, then static closure. **Lazy** = `client=visible|media` (and any other value), inline-module dynamic imports, and dynamic/preload edges from the first set, full closure, minus first. **Platform** = intersection of all routes' first sets. **Self-check**: every `_astro/*.js` must be reachable from some route or match `unreferencedChunks`; every resolved-looking edge must exist (else error).

## Decisions
- R4 (per review finding 5): the eager candidate set is the first `eagerCardCount` = 4 DOM `.card` elements; only cards whose poster is a `.loop-media img` are checked (lazy → error). `fetchpriority=high` count ≤ 1 everywhere; exactly 1 on `/` (when a loop poster is in the candidate set) and on pages with a `.loop-media[data-loop-frame=banner]`; 0 on other routes. Poster bytes use the `<picture>` first `<source srcset>` (else `<img srcset>`, else `src`), candidate nearest 640 w (home/archive) or 1280 w (project). Limits: eager total ≤ 200 KB, LCP poster ≤ 100 KB (home) / 200 KB (project).
- Vacuous passes: R4 needs `.loop-media`; R5/R6 need `video[data-loop]`. R5/R6 also look inside `<template>` content (banner upgrade markup).
- R5 per spec contract (muted, loop, playsinline, preload=none, width, height, aria-hidden=true, no autoplay/poster, ≥2 sources with `codecs="av01.` then `codecs="avc1.`). R6: `data-loop-size` card/gallery ≤ 300 KB (warn > 150 KB), banner ≤ 1,000,000 B (warn > 600 KB); unknown size or missing file is an error. Loop files are looked up under `dist/` by URL path.
- Generic warn at >85 % of any R1/R3 limit ("warn ≈ 85 %").
- Unclassified route = error (forces a classification decision for new pages). `/lab/*` class is `warnOnly`.
- Platform limit 40 KB is enforced as an R1 finding on `(platform)`.
- `/works/code-sandbox/` is an explicit, commented `excluded` entry (measured + shown, findings downgraded to warn). Its "Project + demo" class was not added to the table (YAGNI) — add it with the Sandpack facade.
- Math notes get the 20 KB CSS allowance (detected by `.katex`), EC pages 15 KB (`.expressive-code`).

## Measured on today's build (Astro 6.1.9, `bun run build`, `bun run check:budgets` exits 0)
Platform: 13 chunks, 32.0 KB (limit 40). Site unique JS (report-only): 474.7 KB. No unreferenced chunks; no unresolved edges.

```
| Route | Class | First-view JS | Lazy JS | HTML | CSS | Status |
|---|---|---:|---:|---:|---:|---|
| `/colophon/` | text | 32.0 KB | 0.8 KB | 7.7 KB | 2.6 KB | ok |
| `/garden/callout-demo/` | text | 32.0 KB | 0.8 KB | 7.5 KB | 2.6 KB | ok |
| `/garden/embed-demo/` | text | 32.0 KB | 0.8 KB | 7.5 KB | 2.6 KB | ok |
| `/garden/graph/` | graph | 32.0 KB | 60.0 KB | 7.3 KB | 2.6 KB | ok |
| `/garden/` | text | 32.0 KB | 0.8 KB | 6.9 KB | 2.6 KB | ok |
| `/garden/math-demo/` | text | 32.0 KB | 0.8 KB | 8.2 KB | 10.4 KB | ok |
| `/garden/orphan/` | text | 32.0 KB | 0.8 KB | 7.3 KB | 2.6 KB | ok |
| `/garden/welcome/` | text | 32.0 KB | 0.8 KB | 7.6 KB | 2.6 KB | ok |
| `/garden/wikilinks/` | text | 32.0 KB | 0.8 KB | 7.5 KB | 2.6 KB | ok |
| `/` | home | 33.2 KB | 13.4 KB | 11.9 KB | 2.6 KB | ok |
| `/lab/datamosh/` | lab | 49.5 KB | 0.0 KB | 9.5 KB | 2.6 KB | ok |
| `/now/` | text | 32.0 KB | 0.8 KB | 7.4 KB | 2.6 KB | ok |
| `/search/` | search | 59.4 KB | 0.8 KB | 7.5 KB | 5.3 KB | ok |
| `/stats/` | text | 32.0 KB | 0.8 KB | 7.5 KB | 2.6 KB | ok |
| `/tops/` | text | 32.0 KB | 0.8 KB | 7.6 KB | 2.6 KB | ok |
| `/uses/` | text | 32.0 KB | 0.8 KB | 7.4 KB | 2.6 KB | ok |
| `/works/code-1/` | project | 33.2 KB | 0.8 KB | 8.2 KB | 6.6 KB | ok |
| `/works/code-2/` | project | 32.0 KB | 0.8 KB | 8.1 KB | 2.6 KB | ok |
| `/works/code-sandbox/` | project | 301.9 KB | 65.3 KB | 7.6 KB | 2.6 KB | excluded |
| `/works/cover-fixture/` | project | 32.0 KB | 0.8 KB | 7.8 KB | 2.6 KB | ok |
| `/works/external-only/` | project | 32.0 KB | 0.8 KB | 7.7 KB | 2.6 KB | ok |
| `/works/` | archive | 34.2 KB | 1.8 KB | 12.5 KB | 2.6 KB | ok |
| `/works/math-2/` | project | 32.0 KB | 0.8 KB | 7.5 KB | 2.6 KB | ok |
| `/works/music-2/` | project | 32.0 KB | 0.8 KB | 8.0 KB | 2.6 KB | ok |
| `/works/no-link/` | project | 32.0 KB | 0.8 KB | 7.5 KB | 2.6 KB | ok |
| `/works/video-2/` | project | 32.0 KB | 0.8 KB | 7.6 KB | 2.6 KB | ok |
| `/works/writing-2/` | project | 32.0 KB | 0.8 KB | 7.9 KB | 2.6 KB | ok |
| `/works/writing-3-no-summary/` | project | 32.0 KB | 0.8 KB | 7.8 KB | 2.6 KB | ok |
| `/works/writing-mdx-island/` | project | 32.0 KB | 1.3 KB | 7.7 KB | 2.6 KB | ok |

```

Notable: `/` 33.2 KB first / 13.4 KB lazy (card-dither + card-mosh via dynamic import); `/search/` 59.4 KB (limit 70); `/garden/graph/` 32.0 KB first / 60.0 KB lazy; `/lab/datamosh/` 49.5 KB; `/garden/math-demo/` CSS 10.4 KB (math allowance 20); `/works/code-sandbox/` 301.9 KB first-view (excluded, would fail the 40 KB limit).

## Gates
- `biome check` on my files: clean (repo-wide `biome check .` has pre-existing `useLiteralKeys`/json-format errors in other files).
- `astro check`: 0 errors, 0 warnings, 3 hints (pre-existing).
- `type-coverage --at-least 100 --strict`: 100.00 % (23184/23184).
- `knip`: no findings (one pre-existing config hint about `lefthook`).
- `check:docs` (default root `src`): pass; also run with `--root scripts`: my files clean.
- `depcruise`: no violations (ran via pre-commit).
- Unit: new file 36/36. Full suite: 70 failures, all in `card-pagefind-attrs.test.ts` (69) and `theme-script.test.ts` (1), i.e. the known pre-existing set; zero new.
- `bun x size-limit`: passes. `bun run build` + `bun run check:budgets`: exit 0. Playwright not run (no e2e touched).

## Open / TODO (deferred by the review; file as issues)
- R2 lazy-JS limits (lazy bucket is computed and shown, not gated), R7 poster candidates, R8 GIF references, R9 eager-island closure, Δ-vs-`main` baseline JSON.
- Add `pagefind runtime (first query)` size-limit entry (120 KB; gzip JS, raw wasm) once P9-1 settles the Pagefind filenames.
- Re-run the walker on the real Astro 7 / Vite 8 (Rolldown) dist; if the self-check errors, add the new import shape to the regexes plus a fixture cut from that dist (spec AC2.1 asks for post-P9-1 fixtures).
- Drop the `/works/code-sandbox/` exclusion and add a "Project + demo" class when the Sandpack facade lands.
- First-view media rules (fonts ≤ 100 KB, ≤ 2 preloads, "0 video bytes before load") are not implemented; they are not in R1–R6.
- `src/data/graph.json` is rewritten by `bun run build` (prebuild:garden); I reverted it, not part of this change.
