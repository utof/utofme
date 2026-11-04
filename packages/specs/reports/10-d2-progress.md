# Lane D2 progress

**Status: finished.** All steps done and pushed on `p10/d2-data`; GATE green on the merge with `phase/10-research-article` (`6035797`). Final report: `10-d2.md` (SHAs, ACs, sizes, doubts, issues to file).

## Done (SHA)
- e593e8a contract + sync core · d730647 figure-scale · dc89ad1 facts schema + sync CLI + CI step + biome excludes · 01550f6 `maps_cs` + first real sync · 3862e52 default fact reader + `<N>` · edc4f38 loader · 445fa7d ADR 0054 · 6035797 merge of the phase branch
- Report commit follows (see `git log`).

## Gotchas for a successor
- Node ≥ 22.23 on `PATH` before every commit (the hook runs `astro check`).
- Build + vitest only under `flock /tmp/p10-build.lock`; the build rewrites `src/data/graph.json` (restore it).
- A commit staging only `src/data/article*/**` JSON fails the lefthook biome job; add any code/docs file to the commit.
