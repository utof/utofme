# 0057 — Per-island lazy-JS budgets

## Context
Phase 10 turns `/works/tactical-arena/` into an article with twelve interactive figures. Every figure island is `client:visible`, so first-view JS must stay at the project limit while the lazy JS grows. Phase 9 deferred R2 (lazy JS) and R9 (eager islands) and had no way to bound a single figure.

## Decision
- Two new route classes: `article` (`/works/tactical-arena/`) and `labFigure` (`/lab/figures/*`, enforced, not warn-only). Both are matched before the generic `project` and `lab` rules.
- `RouteDoc.islands` records each `astro-island`: `opts.name`, `client`, component and renderer URLs, decoded `props` byte length.
- R2: the route's lazy JS closure ≤ `lazyJs` for classes that declare it.
- R9: outside `/lab/`, no `client:load` or `client:only` island with a closure above 20 KB gzip.
- R10: per island, the exclusive closure (chunks reachable from its component, minus the first-view set, minus chunks reachable from other islands) ≤ `islandJs[name]`. An island without an entry is an error. Shared chunks are counted once, in R2.
- Lazy data (`_astro/*.json` named by the route's chunks) is report-only, with a warning above 120 KB gzip.
- No `htmlWarn`: the core already warns at 85 % of every limit.

## Alternatives
- One `lazyJs` ceiling only: cannot say which figure grew. Rejected.
- Count the Svelte runtime against each island: it is already in the first view through the chrome's `client:idle` islands, so it would double count. Rejected.
- Per-island limits as `size-limit` entries: they would measure chunks no route loads (ADR 0047). Rejected.

## Consequences
- A new figure needs an `islandJs` entry before its page builds green.
- The JSON-reference scan is textual (quoted `*.json` strings inside `_astro/` chunks); a bundler change that hides the names would make the data column read zero, not fail.

## Sources
- packages/specs/specs/10-tactical-arena-article.md § P10-16
- packages/specs/adrs/0047-per-route-budgets.md
