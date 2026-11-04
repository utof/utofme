# 0057 — Per-island lazy-JS budgets

## Context
Phase 10 turns `/works/tactical-arena/` into an article with twelve interactive figures. Every figure island is `client:visible`, so first-view JS must stay at the project limit while the lazy JS grows. Phase 9 deferred R2 (lazy JS) and R9 (eager islands) and had no way to bound a single figure.

## Decision
- Two new route classes: `article` (`/works/tactical-arena/`) and `labFigure` (`/lab/figures/*`, enforced, not warn-only). Both are matched before the generic `project` and `lab` rules.
- `RouteDoc.islands` records each `astro-island`: `opts.name`, `client`, component and renderer URLs, decoded `props` byte length.
- R2: the route's lazy JS closure ≤ `lazyJs` for classes that declare it.
- R9: outside `/lab/`, no `client:load` or `client:only` island with a closure above 20 KB gzip.
- R10: per island, the exclusive closure (chunks reachable from its component, minus the first-view set, minus chunks reachable from other islands) ≤ `islandJs[name]`. An island without an entry is an error, except eager (`load`/`only`/`idle`) islands, which R1/R9 cover, and the site chrome's islands listed in `chromeIslands` (`CommandPalette`, `LinkPreview`, `CustomCursor`). Shared chunks are counted once, in R2.
- Lazy data (`_astro/*.json` named by the route's chunks or passed to an island in its `props`, the way figure Blocks hand over their dataset URL) is report-only, raw and gzip, with a warning above 120 KB gzip.
- The `article` class's CSS limits are 30 KB (`css` and `cssMath`): Astro links every island's CSS in `<head>`, so eleven figures add ~1–1.5 KB gzip each on top of KaTeX and the layouts; the spec's 15 KB held only the stub figures.
- No `htmlWarn`: the core already warns at 85 % of every limit.
- **Amendment (integration): the `article` class's HTML limit is 60 KB, not the spec's 45 KB.** With F6 and F7 still stubs the article measured 47.2 KB gzip. Each figure's SSR keyframe and no-JS table costs 1.2–3.3 KB, and the chrome's inline scripts cost 5.3 KB on every page. With F6 and F7 drawn in full (the static F7 timeline alone is 7.0 KB) the page is 58.4 KB. Spec Risk 3 asked integration to stop and report instead of raising the limit. The coordinator raised it on two conditions: Lighthouse mobile ≥ 0.85 and CLS ≤ 0.02. Measured on the deploy build (5 runs, Slow-4G as configured), the page scores 0.95–0.96, with LCP 2.37 s, CLS ≤ 0.0044 and TBT 0. Trimming would have meant dropping no-JS tables and keyframes that the figure ACs require.
- **Amendment (integration): the `labFigure` class's CSS limit is 12 KB, not 10 KB.** `/lab/figures/[id]` is one dynamic route with an eager `import.meta.glob` over every Block, so every lab page links all twelve figures' CSS: 10.8 KB once F6 and F7 landed. The lab pages exist only in fixture builds and are never deployed. Splitting them into one file per figure would only make a harness budget pass.

## Alternatives
- One `lazyJs` ceiling only: cannot say which figure grew. Rejected.
- Count the Svelte runtime against each island: it is already in the first view through the chrome's `client:idle` islands, so it would double count. Rejected.
- Per-island limits as `size-limit` entries: they would measure chunks no route loads (ADR 0047). Rejected.

## Consequences
- A new figure needs an `islandJs` entry before its page builds green.
- The JSON-reference scan is textual (quoted `*.json` strings inside `_astro/` chunks and `/_astro/*.json` URLs inside island props); a bundler change that hides the names would make the data column read zero, not fail.

## Sources
- packages/specs/specs/10-tactical-arena-article.md § P10-16
- packages/specs/adrs/0047-per-route-budgets.md
