# Phase 10 close: research article variant (tactical-arena)

`/works/tactical-arena/` is now the long-form interactive article "Stronger, Not More Human". The card → banner morph, the banner loop, the Tier S first screen and the per-route budgets from phase 9 still hold. Spec: `packages/specs/specs/10-tactical-arena-article.md` (revision 2). Plan: `packages/specs/plans/10-tactical-arena-article.md`. Lanes N, A1, A2, D1, D2, S, B, P, FA, FB, FC, FD, FE and I are merged on `phase/10-research-article`; lane reports are `packages/specs/reports/10-*.md`.

> Status of this draft: **FE pending** marks rows that wait for lane FE (F6, F7). **Decision pending** marks the article HTML budget (see § Budgets).

## Gates

Measured on `p10/i-integration` at `16dc392` (Node 22.23.4, Bun 1.3, Astro 7.4.5). Builds and e2e ran under the build lock.

| Gate | Result |
|---|---|
| `check:biome` | 0 errors (319 files) |
| `check:prettier` | clean |
| `check:astro` | 0 errors, 0 warnings, 2 hints (pre-existing) |
| `check:type-coverage` | 100.00 % (80,283 / 80,283) |
| `check:knip` | clean (the existing `lefthook` configuration hint) |
| `check:depcruise` | no violations (109 modules) |
| `check:docs` | clean |
| `check:privacy` | clean, 128 files; no `PRIVACY_DENYLIST` here, so the denylist rule only warns |
| `check:privacy --dist dist` (deploy build) | clean, 237 files |
| `check:privacy --dist dist --require-denylist` | exits 4 without the secret, as designed (the deploy needs `PRIVACY_DENYLIST`) |
| `check:no-fixtures` (deploy build) | clean |
| `sync:article-data --check` (no notes checkout) | ok, 8 datasets + facts; **FE pending** (11) |
| Vitest (`bun run test` on the fixture build) | 126 files, 1,890 passed, 1 skipped (pre-existing); **FE pending** |
| e2e, `--grep-invert @visual` | `p10-article` 15/15; every figure spec, `p10-layout`, `p10-lab`, and AC1.5's `chrome`, `footer`, `layout-chrome`, `project-layout`, `banner-quality`, `p09-morph`: 180 passed, 0 failed; **FE pending** (`p10-machine`, `p10-notebook`) |
| `check:budgets` | **1 error: R3 article HTML 47.2 KB > 45 KB** (decision pending); everything else ok |
| `check:size` | ok |
| Lighthouse CI, mobile (deploy build, 5 runs) | `/works/tactical-arena/` 0.95–0.96 (LCP 2.37 s, CLS ≤ 0.0044, TBT 0); `/` 0.98; assertion ≥ 0.85 passes |
| Stryker, `src/lib/sight.ts` (local, 30 min cap) | **83.97** (107 killed, 3 timeouts, 21 survived, 13 compile errors); the other targets run in the mutation workflow |
| Sight parity (AC4.1) | 401 / 401 against the game's table, nothing skipped |

## Budgets (`/works/tactical-arena/`, deploy build)

| Measure | Value | Limit |
|---|---:|---:|
| First-view JS | 33.4 KB | 40 KB |
| Lazy JS (R2) | 44.4 KB | 160 KB |
| Lazy data (report only) | 81.7 KB raw / 12.0 KB gzip | warn above 120 KB |
| HTML | **47.2 KB** | **45 KB** |
| CSS | 19.9 KB | 30 KB |

First view is the same 10 chunks as every other works page (34,160 B by direct gzip for both this route and `/works/enth/`). The +0.9 KB against the pre-flight 32.5 KB comes from `main`'s home-masonry work merged into the phase, not from the article.

Per-island exclusive JS (R10). On the article page, shared chunks count once, in R2. On a lab page, each island also carries the shared chunks.

| Island | Article | Lab page | Limit |
|---|---:|---:|---:|
| Replay | 6.1 KB | 9.7 KB | 25 KB |
| SmokeSight | 6.3 KB | 9.6 KB | 15 KB |
| Elo | 4.5 KB | 7.0 KB | 12 KB |
| Tempo | 5.1 KB | 7.3 KB | 8 KB |
| MapStages | 3.1 KB | 5.9 KB | 10 KB |
| Noise | 3.5 KB | 5.5 KB | 6 KB |
| RollMap | 2.9 KB | 5.4 KB | 6 KB |
| AgentsVsPros | 3.3 KB | 5.5 KB | 6 KB |
| FreePeek | 3.6 KB | 5.8 KB | 8 KB |
| EloSentence | 0.9 KB | 1.5 KB | 2 KB |
| Machine, Notebook | **FE pending** | | 8 / 12 KB |

**HTML budget (spec Risk 3).** The 47.2 KB was measured with F6/F7 still stubs. The figures' SSR keyframes and no-JS tables cost 1.2–3.3 KB gzip each. The chrome's inline scripts add 5.3 KB, and those appear on every page. Spec Risk 3 says integration stops and reports instead of raising the limit. The overrun was reported with the Lighthouse numbers above; the decision is pending.

## What integration changed

Every change is on `p10/i-integration`. Each fix lists the lane whose files it touched.

- **Sight parity ran nothing in CI** (S). The map half of AC4.1 looked for a path that does not exist, so all 200 cases were skipped. It now reads the committed `maps_cs` and never skips: 401 / 401 pass.
- **Prose contradicted figures** (P).
  - Section 6 printed 80 % of rounds before 12 s, from the 2026-11-02 measurement, next to F4, which plots the 2026-11-04 rerun at 79 %.
  - Section 5 printed the 3v3 peak +151 (another tournament) under F3's panel, which peaks at +159.
  - In both places the prose now points at the figure. ADR 0059 records the rule.
  - The F1 caption said "about 23 s" next to its own marker's "about 22.8 s"; it now prints 22.8 s.
- **Budgets tool** (B).
  - The lazy-data column missed datasets passed through island props, and it never gzipped JSON. Both are fixed and tested.
  - RollMap measured 6.0 of 6.0 KB on its lab page, because two helpers pulled F5's whole module into its closure. The helpers moved to `src/lib/figures/square-paths.ts`; RollMap is now 5.4 KB.
- **Layout** (A2).
  - The section list's numbers sat glued to the previous link ("Ten seconds2. A board").
  - The boxed note left a 277 px hole beside the text at 1440 px. It now spans two grid rows.
  - The `aside: Note` MDX mapping never applied and is removed; the MDX imports `Note`.
- **AC1.7 at 393 px** (FA, FB, FC).
  - F1's event markers overhung the scrub bar and were offset 8 px from the slider thumb. They now share its inset track.
  - The bordered SVGs in F1, F5 and F10 were 2 px wider than their cells.
  - F10's thumbnail strip scrolled sideways.
  - F9's slider kept Chromium's 2 px margin.
  - F3's 3v3 axis title, F9's noise label and F4's end-of-axis labels were clipped.
- **F11 on phones** (FD). The track grew from 24 to 32 px, with larger marks and thicker interval bars.
- **Privacy** (D1).
  - The scanner's JSON paths could print a key that was itself the hit (a denylisted word), against "never the matched text". Such keys are now `<redacted>`.
  - `internal-path` now covers the rest of the notes repo's privacy checklist.
- **Tooling** (D1, D2).
  - lefthook's `biome-format` runs with `--no-errors-on-unmatched`, so a commit that stages only article JSON passes.
  - `prebuild:garden` Biome-formats its output, so `bun run build` no longer rewrites `src/data/graph.json`.
- **Mutation testing**.
  - Stryker now mutates the sight port, the grid, the dataset modules and the privacy and sync cores.
  - `@fast-check/vitest` puts a fresh seed in every property test's name, which hid those tests from Stryker's per-test coverage. A setup file pins the seed for mutation runs only.
  - A fixed-scene `visiblePairs` test was added.
- **ADRs** 0052, 0054, 0057, 0058 and 0059 were amended to match the merged code. ADRs 0052–0060 all follow Context · Decision · Alternatives · Consequences · Sources.

## Privacy gate (plan § Privacy gate)

1. Projections are whitelists, and the key-set tests are green for every dataset.
2. The deploy build (`UTOFME_FIXTURES=false`) passes `check:no-fixtures` and `check:privacy --dist dist` in warn mode.
3. The notes repo's `privacy_scan.sh` was run over the article route, `dist/_astro`, `src/data/article` and the MDX. It hits only vendored third-party code: Pagefind UI translator credits (e-mail addresses), and Sandpack and Svelte identifiers such as `rCon` and `password`. These are the files the `bundle` rule set exists for (ADR 0055).
4. A manual case-insensitive grep of `dist/`, binaries included, for the owner's list of private names, hosts and paths found nothing.
5. Manual read: every string and key in `src/data/article/*.json` and the MDX frontmatter is public data or copy.

## Reader's pass (1440×900 and 393×852)

Every figure's default state was screenshotted and read against its caption and the prose.

**Fixed:** see § What integration changed.

**Holds:**
- Each figure's default state shows its caption's claim. F4 is the recorded guess-first exception.
- F1 autoplays once from 0 s when motion is allowed. Under paused motion it rests at first contact.
- Prose numbers match the figures except where noted below.

**Open (issues below):**
- On a 393 px phone, F3's and F4's SVG text renders at about 6–7 px.
- F4's guess line crosses the "median" label.
- The no-JS data tables in F4's and F11's `<details>` scroll sideways on a phone. WCAG 1.4.10 exempts data tables, and the AC1.7 test exempts them explicitly.
- Section 1 rounds through approved `alt` wordings ("about 10 s", "about 23 s"), while F4 prints 9.6 s and 22.8 s. Kept on purpose; flagged for the fresh read.

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

9. Facts: eleven numbers the copy leaves out need keys. Lane P's report lists them: snap-arm contact, snap step-back shares, open-map attack, molotov curriculum, factored heads, learning rate, residual layers, exploiter speed-up, saved-rifle value, the faster clock, bootstrap level.
10. Spec 10 amendments:
    - the `bundle` privacy rule set (ADR 0055);
    - `elo` markers carry `notebookId`;
    - article CSS limits are 30 KB;
    - the HTML limit, whatever is decided;
    - the mutation workflow is on demand (ADR 0008), not nightly.
11. Phone legibility of SVG text in F3 and F4 (design pass)
12. F4: the guess line crosses the agents' "median" label
13. Responsive layout for the figures' no-JS data tables (F4, F11)
14. The heading `#` anchor is always visible on touch screens
15. F3 and F9 have a Pixel 5 `@visual` snapshot but no 1440×900 one
16. Playwright: an `executablePath` override for a preinstalled Chromium build
17. `astro preview` puts itself in the background; the build-lock command needs `ASTRO_PREVIEW_BACKGROUND=1`

## Visual baselines

These tests are written but not rendered locally. `update-visual-baselines.yml` renders them on GitHub:
- `p10-article.spec.ts`: `@visual article first screen (Pixel 5)`, `@visual article first screen (1440×900)`
- `p10-replay.spec.ts`: `replay board @visual (Pixel 5)`, `(1440x900)`
- `p10-smoke-sight.spec.ts`: `@visual F2 hydrated board, Pixel 5`, `desktop 1440x900`
- `p10-map-stages.spec.ts`: `@visual F5 hydrated figure, Pixel 5`, `desktop 1440x900`
- `p10-roll-map.spec.ts`: `@visual F10 hydrated figure, Pixel 5`, `desktop 1440x900`
- `p10-elo.spec.ts`: `@visual F3 element snapshot`
- `p10-noise.spec.ts`: `@visual F9 element snapshot`
- `p10-tempo.spec.ts`: `tempo @visual (Pixel 5)`, `(1440x900)`
- `p10-agents-vs-pros.spec.ts`: `agents vs pros @visual (Pixel 5)`, `(1440x900)`
- `p10-free-peek.spec.ts`: `free peek @visual (Pixel 5)`, `(1440x900)`
- FE's `p10-machine` and `p10-notebook` snapshots: **FE pending**

## PR checklist (owner)

- [ ] Set the Actions secret `PRIVACY_DENYLIST` before merging (the deploy fails without it).
- [ ] Decide the article HTML budget (above).
- [ ] Sign off on the ten starred notebook highlights (lane FE's list) and the F6 public copy.
- [ ] A fresh read of the copy by someone who did not write it: voice, claims, the number words lane P lists, the F1 text equivalent, the F6 and F7 copy, and the rounded `alt` wordings in section 1.
- [ ] F5 stage 2 ships the project's floor-fraction grid. The source data's licence note asks for a check before floor masks are published.
- [ ] Keep or drop the credits line naming figure influences.
- [ ] The `tactical-arena` recipe hash is stale after the stills were removed. The next `media:encode` re-encodes the slug.
- [ ] Render the visual baselines, inspect the new PNGs, and re-run CI.
- [ ] Merge with a merge commit, tag `phase-10`, watch the deploy, file the deferred issues.
