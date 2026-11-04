# Phase 10 close: research article variant (tactical-arena)

`/works/tactical-arena/` is now the long-form interactive article "Stronger, Not More Human": eleven numbered figures and one inline reactive sentence. The card → banner morph, the banner loop, the Tier S first screen and the per-route budgets from phase 9 still hold. Spec: `packages/specs/specs/10-tactical-arena-article.md` (revision 2). Plan: `packages/specs/plans/10-tactical-arena-article.md`. Lanes N, A1, A2, D1, D2, S, B, P, FA, FB, FC, FD, FE and I are merged on `phase/10-research-article`; the lane reports are `packages/specs/reports/10-*.md`.

**Owner decisions taken during integration.**
- Mutation testing and e2e runs are out of scope from the FE merge on: no Stryker run, no Playwright run after FE. The mutation workflow is disabled. The e2e specs that exist stay in the repo, including FE's `p10-machine` and `p10-notebook`, which were never run here.
- The article's HTML limit is 60 KB, not 45 KB (see § Budgets).
- The `PRIVACY_DENYLIST` Actions secret is set.

## Gates

Final state of `p10/i-integration` (Node 22.23.4, Bun 1.3, Astro 7.4.5). Builds ran under the build lock.

| Gate | Result |
|---|---|
| `check:biome`, `check:prettier`, `check:knip`, `check:depcruise`, `check:docs` | clean. The lefthook hook ran them on every commit; knip shows only the existing `lefthook` configuration hint. |
| `check:astro` | 0 errors, 0 warnings, 2 hints (pre-existing) |
| `check:type-coverage` | 100 % |
| Vitest (`bun run test`, fixture build) | 134 files, 2,002 passed, 1 skipped (pre-existing) |
| Sight parity (AC4.1) | 401 / 401 against the game's own table, nothing skipped |
| `sync:article-data --check` (no notes checkout) | ok, 11 datasets + facts |
| `check:privacy` (source tree) | clean, 147 files (the denylist rule ran in warn mode here; CI now has the secret) |
| `check:privacy --dist dist` | clean, 286 files (fixture build with all figures). Earlier, on a deploy build before FE: 237 files clean, `check:no-fixtures` clean, `--require-denylist` exits 4 without the secret, as designed. |
| `check:budgets` (fixture build, all figures) | exit 0. Warnings: the article HTML at 58.4 of 60 KB, lab CSS, and five lab islands within 15 % of their limits. |
| `check:size` | ok (before FE) |
| Lighthouse CI, mobile | `/works/tactical-arena/` 0.95–0.96 (LCP 2.37 s, CLS ≤ 0.0044, TBT 0); `/` 0.98. Measured on the deploy build **before FE** (page HTML 47.2 KB). Not re-run after FE, by the owner's instruction; CI's Lighthouse job covers the article URL. |
| e2e, `--grep-invert @visual` | **Before FE:** `p10-article` 15/15 and every figure spec. Also `p10-layout`, `p10-lab`, and AC1.5's `chrome`, `footer`, `layout-chrome`, `project-layout`, `banner-quality`, `p09-morph`: all green. **After FE: not run** (owner). |
| Stryker | **Skipped by the owner.** One local run on `src/lib/sight.ts` before the decision scored 83.97 (break threshold 80). The mutate-list additions were reverted. |

## Budgets (`/works/tactical-arena/`)

| Measure | Value | Limit |
|---|---:|---:|
| First-view JS | 33.4 KB | 40 KB |
| Lazy JS (R2) | 57.1 KB | 160 KB |
| Lazy data (report only) | 169.4 KB raw / 39.2 KB gzip | warn above 120 KB |
| HTML | 58.4 KB | 60 KB |
| CSS | 21.0 KB | 30 KB |

**First-view JS.** The article's first view is the same ten chunks as every other works page. The +0.9 KB against the pre-flight 32.5 KB comes from `main`'s home-masonry work, which was merged into the phase; it is not from the article.

**HTML.** The spec's 45 KB broke at 47.2 KB with F6 and F7 still stubs. Spec Risk 3 says stop and report, so I reported. The coordinator raised the limit to 60 KB on two conditions, Lighthouse mobile ≥ 0.85 and CLS ≤ 0.02, which the numbers above meet. ADR 0057 records the amendment.

Per-figure gzip cost on the page:

| Figure | F7 | F6 | F10 | F3 | F9 | F4 | F2 | F1 | F5 | F11 | F8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| KB | 7.1 | 4.1 | 3.3 | 2.8 | 2.5 | 2.4 | 2.3 | 2.2 | 2.0 | 1.9 | 1.2 |

The chrome's inline scripts add another 4.9 KB, the same on every page.

**Lab CSS.** The lab figure pages are one dynamic route with an eager glob over every Block, so each links all twelve figures' CSS: 10.8 KB once F6 and F7 landed. Their CSS limit is now 12 KB. The lab pages exist only in fixture builds.

Per-island exclusive JS (R10). On the article, shared chunks count once, in R2. On a lab page the island also carries the shared chunks.

| Island | Article | Lab page | Limit |
|---|---:|---:|---:|
| Replay | 6.1 KB | 9.7 KB | 25 KB |
| SmokeSight | 6.3 KB | 9.6 KB | 15 KB |
| Elo | 4.5 KB | 6.9 KB | 12 KB |
| Notebook | 6.0 KB | 8.2 KB | 12 KB |
| MapStages | 3.1 KB | 5.9 KB | 10 KB |
| Machine | 6.7 KB | 7.9 KB | 8 KB |
| Tempo | 5.1 KB | 7.3 KB | 8 KB |
| FreePeek | 3.6 KB | 5.8 KB | 8 KB |
| Noise | 3.4 KB | 5.5 KB | 6 KB |
| RollMap | 2.9 KB | 5.4 KB | 6 KB |
| AgentsVsPros | 3.3 KB | 5.5 KB | 6 KB |
| EloSentence | 0.9 KB | 1.5 KB | 2 KB |

Machine's lab number sits 0.1 KB under its limit, because its hand-written public copy is part of the island; more copy needs a higher limit.

## ADRs

0052–0060 are written and follow Context · Decision · Alternatives · Consequences · Sources. Integration amended five of them to match the merged code:
- **0052:** the MDX imports `Note`, and it spans two grid rows.
- **0054:** `biome-format` runs with `--no-errors-on-unmatched`.
- **0057:** chrome and eager islands sit outside R10; lazy data includes island-prop datasets; article CSS is 30 KB, article HTML 60 KB, lab CSS 12 KB.
- **0058:** parity runs against the committed `maps_cs`.
- **0059:** where a figure's own measurement differs from a fact, the prose points at the figure.

0050 and 0051 stay reserved.

## What integration changed

Every change is on `p10/i-integration`. Each fix lists the lane whose files it touched.

- **Sight parity ran nothing in CI** (S). The map half of AC4.1 read a path that does not exist, so all 200 cases were skipped. It now reads the committed `maps_cs`.
- **Prose contradicted figures** (P).
  - Section 6 printed 80 % of rounds before 12 s, from 2026-11-02, next to F4's 79 % from the 2026-11-04 rerun.
  - Section 5 printed the 3v3 peak +151 (another tournament) under F3's panel, which peaks at +159.
  - In both places the prose now points at the figure.
  - The F1 caption read "about 23 s" next to its own marker's "about 22.8 s".
- **F6 and F7 keyframes** (FE). They are drawn in full again. To meet the old 45 KB cap, F7's keyframe had shown an empty box instead of the timeline, and F6's a placeholder on phones.
- **Notebook cards** (FE). Nine card metrics showed the notes' run labels ("Elo g5line10 - v5a2"). The projection now maps them to plain block names ("Elo block 10 vs block 2") and was re-synced.
- **Fixtures** (D2, FA–FE). The sync fixtures for elo, agents vs pros, tempo and noise were near-verbatim cuts of the private notes: journal and session paths, a private script path, run labels, the notes' prose. They now hold stand-ins. The numbers and the keys the projections read are unchanged; the elo projection's three pair labels stay, because the code looks them up.
- **Budgets tool** (B).
  - The lazy-data column missed datasets passed through island props, and it never gzipped JSON.
  - RollMap was at 6.0 of 6.0 KB on its lab page, because two helpers pulled F5's whole module in. They moved to `square-paths.ts`.
- **Layout** (A2).
  - Section-list numbers were glued to the previous link.
  - The boxed note left a 277 px hole at 1440 px.
  - The dead `aside: Note` MDX mapping is removed.
- **393 px overflow, AC1.7** (FA, FB, FC, FD).
  - F1's markers overhung the scrub bar and sat 8 px off the slider.
  - Bordered SVGs in F1, F5 and F10 were 2 px too wide.
  - F10's strip scrolled sideways.
  - F9's slider kept Chromium's margin.
  - Labels were clipped in F3's 3v3 panel, F9 and F4.
  - F11's marks and interval bars are larger.
- **Privacy** (D1).
  - Scan paths could print a JSON key that was itself the hit; such keys are now `<redacted>`.
  - `internal-path` now covers the rest of the notes repo's privacy checklist.
- **Tooling.**
  - lefthook passes JSON-only commits.
  - `bun run build` no longer rewrites `src/data/graph.json`.
- **Added.**
  - `tests/e2e/p10-article.spec.ts`: AC1.3, AC1.7, AC1.8, AC1.9, AC3.5, AC16.4, AC16.5, linked numbers, and two `@visual` first-screen snapshots.
  - `tests/unit/article-dist.test.ts`: AC3.4 and AC16.3 over `dist/`.
  - A fixed-scene `visiblePairs` test.

## Privacy gate

- **Projections.** They are whitelists, and the key-set test is green for each of the 11 datasets.
- **Deploy build.** It passes `check:no-fixtures` and `check:privacy --dist`.
- **Notes repo's scan script** (run over the article route, `dist/_astro`, `src/data/article` and the MDX). It hits only vendored third-party code: Pagefind UI translator credits (e-mail addresses), and Sandpack and Svelte identifiers. This is the code the `bundle` rule set exists for (ADR 0055).
- **Manual grep of `dist/`.** A case-insensitive search, binaries included, for the owner's list of private names, hosts and paths found nothing, before and after FE.
- **Manual read.** Every key and string in `src/data/article/*.json` and the MDX frontmatter is public data or copy.

## Reader's pass (1440×900 and 393×852, before FE)

Every figure's default state shows its caption's claim. F4 is the recorded guess-first exception. F1 autoplays once from 0 s when motion is allowed and rests at first contact under paused motion.

What was fixed is listed in § What integration changed. Still open:
- On a 393 px phone, F3's and F4's SVG text renders at about 6–7 px.
- F4's guess line crosses the "median" label.
- The no-JS data tables in F4's and F11's `<details>` scroll sideways on phones. WCAG 1.4.10 exempts data tables, and the AC1.7 test exempts them explicitly.
- Section 1 rounds through approved `alt` wordings ("about 10 s", "about 23 s"), while F4 prints 9.6 s and 22.8 s.

F6 and F7 were not part of the screenshot pass.

## Deferred issues

From spec § Deferred:
1. F12 "Three clocks" and F14 3D replay behind a click facade (P2; needs a three.js ADR)
2. Dark-theme values for the figure tokens
3. Valve-derived views (pro-round companion to F1, real-map sight toggle in F2, nav-mesh slider and hand-vs-compiled diff in F5) need an owner clearance
4. F1: round picker over the other recorded head rounds
5. Per-block Elo intervals for every 5v5 block
6. Tier S content lint (09 AC3.4) is blocked by a two-item gallery
7. Loop recipes keep media-root folder names (privacy nit, owner decision)
8. Spec 09 leftovers: Sandpack facade, R7/R8 budgets, Δ-vs-main baseline, Pagefind Component UI, caption blur perf check

From the lanes and integration:

9. Facts: eleven numbers the copy leaves out need keys. Lane P's report lists them.
10. Spec 10 amendments:
    - the `bundle` privacy rule set;
    - `elo` markers carry `notebookId`;
    - article CSS 30 KB and HTML 60 KB;
    - lab CSS 12 KB;
    - mutation testing and post-FE e2e skipped by the owner.
11. Run the e2e suite once with F6 and F7 merged: `p10-machine`, `p10-notebook`, and `p10-article` (its AC1.7 and AC3.5 checks now include F6 and F7)
12. Phone legibility of SVG text in F3 and F4 (design pass)
13. F4: the guess line crosses the agents' "median" label
14. Responsive layout for the figures' no-JS data tables (F4, F11)
15. The heading `#` anchor is always visible on touch screens
16. F3 and F9 have a Pixel 5 `@visual` snapshot but no 1440×900 one
17. F6 stage 6 states about half an hour per seed per block; check it against the latest speed-ups (lane FE)
18. Playwright: an `executablePath` override for a preinstalled Chromium build
19. `astro preview` puts itself in the background; the build-lock command needs `ASTRO_PREVIEW_BACKGROUND=1`

## Visual baselines

These tests are written but not rendered here. `update-visual-baselines.yml` renders them on GitHub. They are all on the figures' lab pages, except `p10-article`:
- `p10-article`: first screen, Pixel 5 and 1440×900
- `p10-replay`, `p10-smoke-sight`, `p10-map-stages`, `p10-roll-map`, `p10-tempo`, `p10-agents-vs-pros`, `p10-free-peek`: Pixel 5 and 1440×900
- `p10-elo`, `p10-noise`: Pixel 5 only
- `p10-machine`, `p10-notebook`: lane FE's snapshots

## PR checklist (owner)

- [x] The `PRIVACY_DENYLIST` Actions secret is set.
- [x] The article HTML budget is decided: 60 KB, ADR 0057.
- [x] Sign off on the ten starred notebook highlights (lane FE's report lists them) and the F6 public copy. Owner approved the ten highlights.
- [ ] A fresh read of the copy by someone who did not write it: voice, claims, the number words lane P lists, the F1 text equivalent, the F6 and F7 copy, and the rounded `alt` wordings in section 1. Deferred: the owner reads the live page.
- [x] F5 stage 2 ships the project's floor-fraction grid. The source data's licence note asks for a check before floor masks are published. Owner approved shipping it.
- [x] Keep or drop the credits line naming figure influences. Kept (default; owner may drop it later).
- [ ] The `tactical-arena` recipe hash is stale after the stills were removed. The next `media:encode` re-encodes the slug. Deferred: `check:media` passes as is.
- [x] Render the visual baselines, inspect the new PNGs, and re-run CI. CI's e2e and Lighthouse jobs are the first runs that include F6 and F7. The baselines run found one failure: AC10.2 matched both F6 layouts. Fixed: the test now asserts exactly one visible layout.
- [ ] Merge with a merge commit, tag `phase-10`, watch the deploy (the denylist step now runs), and file the deferred issues.
