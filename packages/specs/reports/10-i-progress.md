# Lane I progress (phase 10 integration)

Branch `p10/i-integration` from `phase/10-research-article` at `7e7de47` (A1, A2, B, D1, D2, S, N, P, FA, FB, FC, FD merged; FE pending).

## Plan

- [x] Baseline: unit 126 files / 1,890 passed / 1 skipped on the branch
- [x] AC4.1 sight parity with the real `maps_cs` (was skipping 200 cases in CI: wrong path) — `0f0366f`
- [x] Step 2: `tests/unit/article-dist.test.ts` (AC3.4, AC16.3) — `f0412bc`
- [x] Step 1: `tests/e2e/p10-article.spec.ts` — `31d44ee` (15 tests green, 2 `@visual` not run)
- [x] Reconcile: fact vs figure (before12 80/79; 3v3 peak 151/159) — `9231a0d`; F1 caption 23 vs 22.8 — `b0dd1a9`
- [x] Reconcile: Note box at >= 1200 px (`grid-row: span 2`) — `8552c39`; dead `aside` mapping removed — `149e0c9`
- [x] Reconcile: lazy-data column for island-prop datasets — `03b0ad4`, JSON gzip — `d141a22`
- [x] Reconcile: F11 track 24 → 32 px, larger marks and bars — `8dced69`
- [x] Reconcile: lefthook `--no-errors-on-unmatched`; garden prebuild Biome-formats — `1e7041b`
- [x] R10 RollMap lab 6.0/6.0 KB → 5.4 KB (`square-paths.ts`) — `ad4fba4`
- [x] Article HTML: coordinator raised the cap to 60 KB (ADR 0057); page 58.4 KB with full F6/F7 keyframes
- [x] Step 3: budgets (only R3 HTML fails), size ok, LHCI mobile 0.95-0.96 on the article
- [x] Step 4: deploy build + privacy gate + manual dist grep: clean; privacy fixes `7bd3aa4`, `51f86fb`
- [x] Step 5: Stryker paths `c7564b6`; sight.ts 75.6 (seed artefact) → 80.2 → 83.97 with `8d5e988`
- [x] Step 7: ADR review 0052-0060: all on template; 0052/0054/0057/0058/0059 amended `2b2c752`
- [x] Reader's pass (screenshots 1440x900, 393x852 in `/tmp/p10-i-shots/`): TOC markers, AC1.7 overflows, F3 panel title, F9 label fixed — `8552c39`, `8dced69`
- [x] FE merged (`0935271`); F6/F7 keyframes restored; fixtures sanitised; notebook run labels plain; owner skipped e2e and Stryker after FE (mutation config reverted `65106df`)
- [x] Step 8: `10-close.md` final

## Log

- e2e green on the fixes: `p10-article`, `p10-replay`, `p10-roll-map`, `p10-map-stages`, `p10-noise`, `p10-elo`, `p10-agents-vs-pros`, `p10-layout`, `p10-lab`, and AC1.5's `chrome`, `footer`, `layout-chrome`, `project-layout`, `banner-quality`, `p09-morph` (153 + 27 passed).
- F4 axis end labels `16dc392`. GATE static checks all exit 0 at `16dc392`.
- Waiting: FE merge; coordinator decision on the article HTML limit.
- Final: unit 134 files / 2,002 passed / 1 skipped; astro check 0 errors; type-coverage 100 %; budgets exit 0; privacy clean (src 147, dist 286).
