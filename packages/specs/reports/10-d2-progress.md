# Lane D2 progress (dataset framework, sync, facts, `<N>`, loader)

Successor: continue from "In progress"; branch `p10/d2-data`, worktree cut from `phase/10-research-article`.

## Done (SHA)
- (none yet)

## In progress
- Step 1: `types.ts` + `article-data-core.ts` (red test first).

## Next
2. CLI `scripts/sync-article-data.ts` + `package.json` script + `ci.yml` step.
3. `maps_cs` dataset + real sync (`src/data/article/maps_cs.json` + sidecar).
4. `src/lib/figure-scale.ts`.
5. `src/lib/facts.ts`, `N.astro`, real `facts.json` sync.
6. `src/lib/figure-data.ts`.
7. ADR 0054, GATE, report `10-d2.md`.

## Decisions
- Sidecar `syncedAt` is a UTC date and is kept when the output sha256 is unchanged (AC3.7: a second run leaves `git diff` empty).
- Exit codes: cap overrun in sync = 1; in `--check` = 3. Schema failure in check = 1, privacy = 2, sha/sidecar/schemaId/missing-output = 3, missing source = 4.
- `formatInterval(lo, hi, digits, { signed? })`: the plan's "+94 to +98" example needs `signed: true`; the spec signature has three arguments, the fourth is optional.
- CLI extra flags (test seams): `--site-root`, `--modules`.

## Gotchas
- Env: `export PATH=/home/vboxuser/.local/node-v22.23.4-linux-x64/bin:$PATH`; `UTOFME_NOTES`, `UTOFME_ARTICLE_DATA` as in the dispatch prompt (never commit these paths).
- Build + e2e only under `flock /tmp/p10-build.lock`, `nice -n 19`.
