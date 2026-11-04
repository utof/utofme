# Lane D2 progress (dataset framework, sync, facts, `<N>`, loader)

Successor: continue from "In progress"; branch `p10/d2-data`, worktree cut from `phase/10-research-article`.

## Done (SHA)
- e593e8a dataset contract (`types.ts`) + sync core (`article-data-core.ts`) + 27 tests
- d730647 `figure-scale.ts` + 19 tests
- dc89ad1 `facts.ts` schema/reader factory + `sync-article-data.ts` CLI + `package.json` script + `ci.yml` step + `biome.json` excludes for `src/data/article{,-meta}/**`
- 01550f6 `maps_cs` dataset + first real sync (maps_cs output + sidecar + facts.json, 149 keys)

## In progress
- Step 5: `facts.ts` default reader (`fact`, `formatFact`) + `N.astro` (tests green, committing).

## Next
6. `src/lib/figure-data.ts` loader (red test first: happy-dom, stubbed fetch).
7. ADR 0054 (`packages/specs/adrs/0054-article-data-whitelist-projections.md`), GATE (incl. build + full vitest under the lock), `check:privacy`, report `10-d2.md`, final push.

## Decisions
- Sidecar `syncedAt` is a UTC date and is kept when the output sha256 is unchanged (AC3.7: a second run leaves `git diff` empty).
- Exit codes: cap overrun in sync = 1; in `--check` = 3. Schema failure in check = 1, privacy = 2, sha/sidecar/schemaId/missing-output = 3, missing source = 4.
- `formatInterval(lo, hi, digits, { signed? })`: the plan's "+94 to +98" example needs `signed: true`; the spec signature has three arguments, the fourth is optional.
- CLI extra flags (test seams): `--site-root`, `--modules`.

## Gotchas
- Env: `export PATH=/home/vboxuser/.local/node-v22.23.4-linux-x64/bin:$PATH`; `UTOFME_NOTES`, `UTOFME_ARTICLE_DATA` as in the dispatch prompt (never commit these paths).
- Build + e2e only under `flock /tmp/p10-build.lock`, `nice -n 19`.
