# Phase 9 — Project view — implementation plan

> **Spec:** [`packages/specs/specs/09-project-view.md`](../specs/09-project-view.md) (deliverables P9-1 … P9-12). Every AC, budget, API name and "spec author's call" lives there; this plan only splits the work into parallel tasks, fixes file ownership, and orders the merges. When this plan and the spec disagree, the spec wins, except for the calls listed in § "Planner's calls".
>
> **Phase branch:** `phase/09-project-view`. **Task branches:** `p09/<task-id>`, each cut from `phase/09-project-view` *at the start of its wave* (after that wave's gate merged). **Never** push to `main` or to any `phase/*` branch from a task; only the gate owner (G0…G3, INT) merges into `phase/09-project-view`, always with a **merge commit** (no squash, no rebase), per CLAUDE.md § Branching.
>
> **Time box:** ≈ 1.5 days wall clock. 4 waves + 4 gates + integration. Many parallel workers: CLOUD = a fresh Ubuntu VM session (4 vCPU / 16 GB); LOCAL = the owner's laptop.
>
> **Review status:** spec review `origin/review/09-spec` (`packages/specs/reviews/09-spec-review.md`, verdict green-with-fixes) is folded in: every BLOCKER and MAJOR finding is applied below as an override **O1…O12** (§ "Spec-review findings applied"); where an override and the spec disagree, the override wins. Plan review: 1 round (CLAUDE.md cap), by a fresh Opus reviewer, before wave 1 starts.

---

## Planner's calls (decided here; nobody could be asked)

1. **Waves are strict.** Every task in wave N starts from `phase/09-project-view` *after* gate G(N-1) merged. No task stacks on another task's branch.
2. **Shared files are owned by exactly one task per wave** (ledger below). Edits that several wave-1 tasks need in `package.json`, `ci.yml`, `lefthook.yml` and `stryker.conf.json` are **not** made by those tasks; they are listed in the **G1 wiring ledger** and applied by the gate owner in one commit. Tasks run their scripts directly (`bun run scripts/x.ts`) until then.
3. **No dependency edits after wave 0.** Every new/bumped package in the spec belongs to P9-1 (`@astrojs/markdown-remark`, `astro-pagefind ^2`, and whatever it pulls such as `@pagefind/component-ui`). No later task may touch `package.json` dependencies or `bun.lock`. If a task believes it needs a dep, it stops and files an issue (`-l nit`), it does not add it.
4. **All encoding is LOCAL** (owner's media + one owner of `src/data/loops.json` per wave). Cloud tasks never commit `loops.json`, `public/loops/**` or posters; cloud tests use the hand-written manifest fixture `tests/fixtures/loops/manifest.fixture.json`. This avoids merge conflicts on a generated, hash-keyed file.
5. **The 12 mock-GIF re-encodes (`mock-*`) are done LOCAL in L2**, not in cloud, for the same single-owner reason (the GIFs are in the repo, so this is minutes of work).
6. **No fixture "loop" entry is added.** The first real project (`tactical-arena`, newest date) is the video card that e2e tests on `/` and the morph tests drive. This keeps D7 (mock covers stay GIF until the owner looks).
7. **Existing count assertions become content-derived** (W2-3): `filter.spec.ts`, `feeds.spec.ts`, `cards.spec.ts`, `footer.spec.ts` compute expected counts from `src/content/works/*` frontmatter, so content tasks (L2, L3) never edit tests.
8. **`mediaOf(card)` lives in a new `src/lib/loops/media-of.ts`** (spec names the helper but not its file). New impl files: 20 (spec list; review finding 4 corrected the spec's "21") + `media-of.ts` + `scripts/check-no-fixtures.ts` (O7) = **22 ≤ 24** budget. Formatter-only churn from the `prettier-plugin-astro` 1.x reformat (P9-1) is **exempt** from the ≤ 34 modified-file budget (O4), by analogy with the CLAUDE.md refactor carve-out; cite commit 12d2483.
9. **Non-loop media also get the frame wrapper in `Card.astro`** (W3-1 wraps `CoverImage`/thumb in `<div class="loop-media" data-vt-frame data-loop-frame="card">`); `LoopMedia.astro` renders the wrapper only for loop items. One wrapper class, two producers.
10. **`CoverImage.astro` gains `eager` / `priority` props** (W2-1) so R4 holds when an eager card on `/` is a GIF fixture or still in the test build (eager set: O5).
11. **Playwright in cloud is best-effort.** Every cloud task runs `npx playwright install --with-deps chromium`; if it fails, the task still writes its e2e specs, records "e2e written, not run (no browser)" in its final report, and INT (LOCAL) is the oracle. Visual baselines are `*-linux.png`, so W4-4 generates them in cloud; fallback is INT only if the laptop is Linux, otherwise a follow-up CI `--update-snapshots` run (issue).
12. **Known-red window:** between G2 and G4 the existing visual snapshots (`cards.spec.ts-snapshots`, `landing.spec.ts-snapshots`, `image-pipeline.spec.ts-snapshots`) fail because real cards and the new card treatment change pixels. Lefthook never runs e2e, so commits stay green; W4-4 owns re-baselining. CI on `phase/09-project-view` may be red in that window; gates check everything except those named snapshot cases.
13. **ADR 0043 is written by T0** (P9-1 code already cites `packages/specs/adrs/0043-astro-7-upgrade.md`, which does not exist on `phase/09-astro7` at 12d2483). ADRs 0044–0049 and 0051 are written in wave 2 (W2-4); ADR 0050 is drafted in W2-4 and finalised by W4-2 with the perf numbers.
14. **Node (O1):** every worker (cloud and local) runs Node ≥ 22.23.4. On the owner's laptop this is a **user-local** Node (fnm/volta, or the official tarball on `PATH` for the session); the system Node is not modified. This is a **hard gate for every LOCAL task**: run the Node check from § Common setup first. Stop-gap only if that is impossible: `bun --bun run build` (runs Astro under Bun, which reports Node 26.x so the CLI check is skipped; unsupported runtime — never for INT).
16. **`_local/` is not in the repo (O1).** Cloud workers cannot read `_local/research/…` or `_local/proposals/…`. Every value they need is either in the spec already (tokens, timings, flags) or exported by L1 into `packages/specs/plans/09-local-refs.md` (card-variant reference CSS, banner prototype rules, media inventory paths). Cloud briefs below cite only repo files.
15. **Pagefind/component-ui, Rolldown codeSplitting, Node pins and ADR 0043 are P9-1 scope.** At 12d2483 `phase/09-astro7` had not yet done them (see T0 checklist). If the P9-1 worker has finished when T0 starts and any are missing, T0 closes them on `p09/t0-astro7-close` (not on `phase/09-astro7`).

---

## Common setup (paste into every task)

```bash
git fetch origin
git checkout -B p09/<task-id> origin/phase/09-project-view
# Node ≥ 22.23.4 (Astro 7 CLI refuses older). Cloud: user-local tarball.
node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&(b>23||(b===23&&c>=4)))?0:1)' || {
  curl -fsSL https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz | tar -xJ -C "$HOME"
  export PATH="$HOME/node-v22.23.4-linux-x64/bin:$PATH"; }
command -v bun >/dev/null || { curl -fsSL https://bun.sh/install | bash; export PATH="$HOME/.bun/bin:$PATH"; }
bun install --frozen-lockfile
bunx lefthook install
cd packages/site
npx playwright install --with-deps chromium || echo "PLAYWRIGHT UNAVAILABLE — write e2e, do not run"
# Tasks that need ffmpeg (W1-2 smoke tests only): sudo apt-get install -y ffmpeg
```

**Per-task rules (every task):**
- Read `CLAUDE.md` (repo root) first, then the spec sections named in the task.
- TDD: write the listed failing tests first, commit them red only if lefthook allows (it type-checks, so usually commit red+green together per sub-feature); never weaken an AC.
- Every exported symbol gets TSDoc with `@see <spec §|ADR|URL>` / `@issue` / `Why:` (check:docs).
- Before each commit, lefthook runs biome, prettier, astro check, type-coverage 100 %, knip, depcruise, check:docs. Do not bypass (`--no-verify` is forbidden).
- Verification commands are run from `packages/site/`.
- Commit messages: conventional, no mention of AI / Claude / sessions, no `Co-Authored-By`.
- **Push after each meaningful commit** (`git push -u origin p09/<task-id>`), at least every ~30 min.
- Touch **only** the files listed under "Files owned". Need another file? Stop, note it in your final report; the gate owner decides.
- Final report (to the gate owner): files touched with SHAs, commands run and their exit codes, any e2e not run, any spec doubt.

---

## Contracts (published up front; code against these, O11)

**Card markup contract** (W3-1 produces; W1-6, W2-2, W4-1 consume):
```
li > a.card.card--media[data-work-slug="<id>"][data-fixture?]
       > .card-figure
           > .loop-media[data-vt-frame][data-loop-frame="card"] > (picture img | video[data-loop][data-loop-size="card"])
           + .card-cap[data-cap] > h2.card-cap__t + p.card-cap__d? + p.card-cap__m
```
Banner (W3-2): `.loop-media[data-vt-frame][data-loop-frame="banner"][data-vt-hero]` inside `article[data-fixture?]`, `h1[tabindex="-1"]`. Gallery: `.loop-media[data-loop-frame="gallery"]` (no persist). Persist id on card and banner `<video>`: `loop-<slug>`.

**`src/data/loops.json` TS type** (W1-2 implements in `src/lib/loops/manifest.ts`):
```ts
type Source = { url: string; type: string; bytes: number };          // type = 'video/mp4; codecs="…"'
type Size = { width: number; height: number; sources: [Source, Source, ...Source[]] }; // [AV1, H.264]
type LoopEntry = { recipe: string /* sha8 */; durationS: number; fps: number; aspect: "16:9";
                   card: Size; banner: Size | null; posterPath: string; flash: { maxPerSecond: number } };
type LoopsManifest = Record<string, LoopEntry>;                       // keys sorted
```
Card/gallery frame is **768×432** (O2), banner 1280×720.

**Schema field names** (W1-4 implements): `cover{src,alt,loop?,focus}`, `gallery[]{src,alt,loop?,focus,caption}`, `lede?`, `status?`, `started?`, `links[]{label,href,private}`, `fixture`, `stack?` on video|music|math|writing. `UTOFME_FIXTURES` accepts only `"true"` / `"false"` (any other string is a build error — review verified-API table).

---

## Shared-file ledger (one owner per wave)

| Shared file | W0 | W1 | W2 | W3 | W4 |
|---|---|---|---|---|---|
| `packages/site/package.json` (scripts) / `bun.lock` | T0 (deps + scripts) | **G1 ledger** (scripts only) | — | — | — |
| `src/content.config.ts` | T0 (only if P9-1 needs) | W1-4 | — | — | — |
| `astro.config.mjs` | T0 | W1-4 (`env.schema`) | — | — | — |
| `wrangler.jsonc` | — | W1-3 | — | — | — |
| `tsconfig.json`, `knip.jsonc` | T0 | W1-3 | — | — | — |
| `.size-limit.cjs` | T0 | W1-1 | — | — | W4-3 |
| `route-budgets.config.ts` | — | W1-1 (new) | — | — | W4-3 |
| `lighthouserc.cjs` | — | — | — | — | W4-3 |
| `.github/workflows/ci.yml` | T0 (Node pin) | **G1 ledger** | — | — | W4-3 |
| `.github/workflows/deploy.yml` | T0 (Node pin) | W1-3 | — | — | — |
| `.github/workflows/mutation.yml` | T0 (Node pin, O6) | — | — | — | — |
| `src/pages/lab/datamosh.astro` | T0 | W1-4 (O7) | — | — | — |
| `src/lib/works.ts` | — | W1-4 | — | W3-1 (`eagerIndices`, O5) | — |
| `src/components/LoopMedia.astro` | — | — | W2-1 (new) | — | W4-2 (source order only, if O12 fires) |
| `scripts/lib/route-budgets-core.ts` | — | W1-1 (new) | — | — | W4-2 (R5 per-size, if O12 fires) |
| `lefthook.yml` | — | **G1 ledger** | — | — | — |
| `stryker.conf.json` | — | **G1 ledger** | — | — | — |
| `src/layouts/_BaseLayout.astro` | T0 | — | W2-1 | — | — |
| `src/components/Card.astro` | T0 | — | — | W3-1 | — |
| `src/components/CoverImage.astro` | T0 | — | W2-1 | — | — |
| `src/layouts/_WorkLayout.astro` | T0 | — | — | W3-2 | — |
| `src/pages/index.astro`, `src/pages/works/index.astro` | T0 | W1-4 | — | W3-1 | — |
| `src/pages/works/[...slug].astro` | — | W1-4 | — | W3-2 | — |
| `src/styles/tokens.css` | — | W1-6 | — | — | W4-2 |
| `src/styles/transitions.css` | — | W1-6 | — | — | W4-1 |
| `src/lib/vt/hero-morph.ts` | — | W1-6 (new) | — | — | W4-1 |
| `src/lib/dither/card-dither.ts`, `src/lib/datamosh/card-mosh.ts` | — | — | W2-2 | — | W4-1 |
| `src/data/loops.json`, `public/loops/**`, `media/recipes/**`, `src/assets/loops/**` | — | W1-2 (seed `{}` only) | L2 | L3 | — |
| `src/content/works/*.mdx` (16 fixtures) | — | W1-4 (`fixture: true`) | — | — | (P9-11 switch, post-INT) |
| `src/content/works/<real-slug>.mdx` | — | — | L2 (tactical-arena) | L3 (others) | — |
| `tests/e2e/search.spec.ts` | T0 | — | — | — | — |
| `tests/e2e/{filter,feeds,cards,footer}.spec.ts` | — | — | W2-3 | W3-1 (`cards` only, structure) | — |
| `tests/e2e/transitions.spec.ts` | — | — | — | W3-1 | — |
| `tests/e2e/detail.spec.ts` | — | — | — | W3-2 | — |
| `tests/e2e/*-snapshots/**` | — | — | — | — | W4-4 |
| `packages/specs/adrs/*` | T0 (0043) | — | W2-4 (0044–0051) | — | W4-2 (0050 numbers) |
| `memory/progress.md` | gate owners only | | | | |

---

## Task index

| Wave | Task | Deliverable | Where | Branch | Est. |
|---|---|---|---|---|---|
| 0 | P9-1 | Astro 7 upgrade (**in progress**, not planned here) | — | `phase/09-astro7` | — |
| 0 | **T0** | P9-1 acceptance check, close gaps, ADR 0043, merge | CLOUD | `p09/t0-astro7-close` | 2–3 h |
| 1 | W1-1 | P9-2 budgets core + CLI + config + size-limit cleanup | CLOUD | `p09/w1-1-budgets` | 5 h |
| 1 | W1-2 | P9-4 encode pipeline core + CLI + `--check` + manifest schema | CLOUD | `p09/w1-2-encode` | 5 h |
| 1 | W1-3 | P9-5 range lib + Worker + wrangler + deploy probes/guard | CLOUD | `p09/w1-3-range` | 3 h |
| 1 | W1-4 | P9-3 schema v2, fixtures, `UTOFME_FIXTURES`, listing helpers, content lint | CLOUD | `p09/w1-4-schema` | 4 h |
| 1 | W1-5 | P9-6 logic: `motion.ts`, loop controller, `MotionToggle.astro` | CLOUD | `p09/w1-5-motion` | 4 h |
| 1 | W1-6 | P9-9 logic: `hero-morph.ts`, `transitions.css`; AC7.1a contrast + caption tokens | CLOUD | `p09/w1-6-morph-core` | 4 h |
| 1 | W1-7 | P9-12 Sandpack click facade | CLOUD | `p09/w1-7-sandbox` | 2 h |
| 1 | L1 | P9-10 prep: recipes, copy drafts, privacy checklist | **LOCAL** | `p09/l1-recipes` | 3 h |
| G1 | G1 | merge wave 1 + wiring ledger | CLOUD | `p09/g1` | 1 h |
| 2 | W2-1 | `LoopMedia.astro`, `CoverImage` props, `_BaseLayout` script wiring | CLOUD | `p09/w2-1-loopmedia` | 4 h |
| 2 | W2-2 | #121: hover modules read video frames, `media-of.ts` | CLOUD | `p09/w2-2-hover-video` | 3 h |
| 2 | W2-3 | content-derived counts in existing e2e | CLOUD | `p09/w2-3-counts` | 2 h |
| 2 | W2-4 | ADRs 0044–0051 (0050 draft) | CLOUD | `p09/w2-4-adrs` | 2 h |
| 2 | L2 | encode `mock-*` (12) + tactical-arena content + A/B GIF copies | **LOCAL** | `p09/l2-tactical-arena` | 4 h |
| G2 | G2 | merge wave 2, first `check:media` on real loops | LOCAL/CLOUD | `p09/g2` | 1 h |
| 3 | W3-1 | P9-7 card treatment + home LCP + toggle on `/`, `/works/` | CLOUD | `p09/w3-1-card` | 5 h |
| 3 | W3-2 | P9-8 project page (`_WorkLayout`, meta, gallery, prev/next) | CLOUD | `p09/w3-2-project-page` | 5 h |
| 3 | W3-3 | P9-11 `/lab/loops-ab/` A/B page | CLOUD | `p09/w3-3-loops-ab` | 2 h |
| 3 | L3 | P9-10 breadth: ≥ 5 more projects (target 7) | **LOCAL** | `p09/l3-projects` | 6 h |
| G3 | G3 | merge wave 3 | CLOUD | `p09/g3` | 1 h |
| 4 | W4-1 | P9-9 morph e2e + fixes; AC7.5/7.6 e2e | CLOUD | `p09/w4-1-morph-e2e` | 4 h |
| 4 | W4-2 | `@perf` blur check on no-GPU Chrome, ADR 0050 numbers | **LOCAL** | `p09/w4-2-perf` | 2 h |
| 4 | W4-3 | budgets finalised on the real dist; LHCI URL; CI step | CLOUD | `p09/w4-3-budgets-final` | 2 h |
| 4 | W4-4 | visual-regression baselines | CLOUD | `p09/w4-4-visual` | 2 h |
| INT | INT | merge all, full gates, manual checks, PR | **LOCAL** | `phase/09-project-view` | 3–4 h |
| post | P9-11b | mock-GIF → loop switch (owner-gated, D7) | **LOCAL** | `p09/p11b-switch` | 1 h |

**LOCAL tasks:** L1, L2, L3, W4-2, INT, P9-11b. Everything else is CLOUD.

**Critical path:** P9-1 → T0 → {W1-2 encode CLI, W1-4 schema} → G1 → L2 (tactical-arena loops + MDX) ∥ W2-1 (LoopMedia) → G2 → W3-1 card ∥ W3-2 project page → G3 → W4-1 morph e2e → INT. Rough length: 2.5 + 5 + 1 + 4 + 1 + 5 + 1 + 4 + 4 ≈ 27.5 h of serial time, which fits 1.5 days only if gates are prompt. L3 runs beside wave 3 and may spill into wave 4 (it owns no file anyone else touches).

---

## Wave 0

### T0 — P9-1 acceptance check and merge · CLOUD · `p09/t0-astro7-close`

**Goal.** Prove `phase/09-astro7` meets AC1.1–AC1.5, close any gap, then merge it into `phase/09-project-view`. This is the only wave-0 task besides P9-1 itself; do not redo P9-1.

**Start when** the P9-1 worker reports done (or has stopped pushing for > 1 h). Branch from `origin/phase/09-astro7`, not from the phase branch.

**Spec refs.** § P9-1 (all), § Budgets (baseline paragraph), § ADRs to write (0043).

**Gap checklist** (state at `phase/09-astro7` 12d2483, 2026-11-03 — re-check each, fix only what is still missing):

| # | Item | Seen at 12d2483 | AC |
|---|---|---|---|
| a | **Conditional (O3):** run `search.spec.ts` on Astro 7 with `astro-pagefind ^1.8.6` first. Green (peer warning only) → keep 1.8.6, file `phase-N` issue for the Component UI rewrite, cite it in ADR 0043. Red → `astro-pagefind ^2.0.1` (depends on `@pagefind/component-ui ^1.5.0`); `SearchBox.astro` rebuilt as `<PagefindConfig />` + `<pagefind-input>` + `<pagefind-summary>` + `<pagefind-results>`; dev-fallback probe updated | still `astro-pagefind ^1.8.6`, `<Search>` | AC1.4 |
| b | `tests/e2e/search.spec.ts:74-113` rewritten for Component UI selectors (results for a known term, no-results state for nonsense) | not done | AC1.4 |
| c | **Required, not optional (O3):** Astro 7.4.5 reads only `build.rolldownOptions`, so the branch's `rollupOptions.manualChunks` is silently dropped. Migrate to `vite.build.rolldownOptions.output.codeSplitting.groups: [{ name: "graph-vendor", test: /…(force-graph\|d3-force-3d)…/ }]`; the group name fills `[name]` in Astro's `_astro/[name].[hash].js`, so `dist/_astro/graph-vendor.*.js` must exist; fallback = deprecated function `manualChunks` under `rolldownOptions` with `@issue` | not changed | AC1.2 |
| d | **Every** workflow under `.github/workflows/` (`ci.yml`, `deploy.yml`, `mutation.yml` — O6) pins `node-version: "22.23"`; `! grep -rn 'node-version: "22.1' .github/workflows`; `actionlint` clean | `"22.12"` | AC1.5 |
| e | `packages/specs/adrs/0043-astro-7-upgrade.md` (Context · Decision · Alternatives · Consequences · Sources), covering unified processor, `compressHTML: true`, Node 22.23 floor, `codeSplitting`, pagefind 2 / Component UI | cited in `astro.config.mjs`, file absent | ADR rule |
| f | `@astrojs/markdown-remark` version `^7.3.5` (spec) vs `^7.3.0` on branch — accept if lockfile resolves ≥ 7.3.5, else bump | `^7.3.0` | spec table |
| g | `getContainerRenderer` imports from `@astrojs/svelte/container-renderer` in `tests/unit/{microformats,sound-toggle}.test.ts` | done | breaking change 6 |
| h | `compressHTML: true`, `unified({ remarkPlugins, rehypePlugins })` | done | AC1.3 |
| i | `prettier-plugin-astro ^1.1.2` (Rust `@astrojs/compiler-rs`) recorded in ADR 0043; the reformat is in the tree **before** any wave-1 branch is cut (O3) | done in 12d2483 | O3 |

**Files owned.** Everything P9-1 touched, plus `packages/site/src/components/SearchBox.astro`, `packages/site/tests/e2e/search.spec.ts`, `packages/site/astro.config.mjs`, `packages/site/package.json`, `bun.lock`, `packages/site/.size-limit.cjs` (graph glob only), `.github/workflows/{ci,deploy,mutation}.yml` (Node pin only), `packages/specs/adrs/0043-astro-7-upgrade.md`, `packages/specs/plans/09-baseline.md` (new).

**TDD.** (b) first: rewrite `search.spec.ts` against the Component UI elements and see it fail on the `<Search>` markup, then (a).

**Verification.**
```bash
bun run build && ls dist/_astro/graph-vendor.*.js
bun run test
bun run test:e2e            # or record "not run" (call 11)
bunx lefthook run pre-commit --all-files
bunx size-limit
actionlint ../../.github/workflows/*.yml   # `go install github.com/rhysd/actionlint/cmd/actionlint@latest` or the release binary
ls dist/pagefind/            # record the Component UI runtime filenames for W1-1
```

**Baseline record.** Write `packages/specs/plans/09-baseline.md`: Node/bun versions, `size-limit` output verbatim, gzip-9 sizes of the home first-view JS, `/search/` JS, graph-vendor chunk, the `dist/pagefind/` file list. W1-1 cuts its fixtures from this dist.

**Merge.** If T0 changed nothing, merge `phase/09-astro7` → `phase/09-project-view`. Otherwise merge `p09/t0-astro7-close` (which already contains `phase/09-astro7`) → `phase/09-project-view`. Merge commit via PR; no tag (the tag is at phase end). T0 acts as gate owner G0 for this one merge.

**Commits.** `fix(search): rebuild SearchBox on Pagefind Component UI`, `build(site): split graph-vendor with rolldown codeSplitting`, `ci: pin Node 22.23 for Astro 7`, `docs(adr): 0043 Astro 7 upgrade`, `docs(specs): phase 09 post-upgrade baseline`.

---

## Wave 1 (starts after T0 merge) — 7 CLOUD + 1 LOCAL, disjoint files

### W1-1 — P9-2 per-route budgets · CLOUD · `p09/w1-1-budgets`

**Goal.** `check:budgets` (CLI + pure core + typed config) and the size-limit cleanup. Spec § P9-2 and § Budgets for this phase.

**Files owned.**
- new `packages/site/scripts/route-budgets.ts` (CLI: reads `dist/`, prints tables, appends `$GITHUB_STEP_SUMMARY`, exit 1 on error)
- new `packages/site/scripts/lib/route-budgets-core.ts` (pure: HTML parse via `linkedom` `parseHTML`, import-graph walk, bucket classification, gzip-9 via `node:zlib` `gzipSync(buf, { level: 9 })`, rules R1–R9)
- new `packages/site/route-budgets.config.ts` (typed module: route classes → limits, exactly the § Budgets table)
- new `packages/site/tests/unit/route-budgets-core.test.ts`, `packages/site/tests/unit/route-budgets-cli.test.ts`
- new `packages/site/tests/fixtures/budgets/**` (hand-written HTML + tiny JS, cut from shapes seen in the post-P9-1 dist)
- `packages/site/.size-limit.cjs`

**Failing tests first (AC2.1, AC2.4).**
- Bucket classification: `script[type=module][src]`, `link[rel~=modulepreload]`, inline-module imports, `astro-island[client=load|only|idle]` → first view; `client=visible|media` + `import()` closures not already counted → lazy; a chunk shared by two buckets counts once (closure minus earlier buckets).
- Graph walk follows static `import`/`export … from`, `import()`, and `__vite__mapDeps` preload lists **as Rolldown emits them** — copy one real example of each from the T0 dist into the fixture; if Rolldown's shape differs from the Vite 6 regexes in research Q4, the fixture proves the new regex.
- Self-check: union of reachable chunks + explicitly unreferenced chunks == `dist/_astro/*.js`; an unplaceable chunk is an **error** (fixture with an orphan).
- One passing + one failing fixture per rule R1–R9 (R4 **as amended by O5**: on `/` card 1's poster is not lazy and is the only `fetchpriority=high`; ≤ 3 non-lazy card posters; exactly one `fetchpriority=high` on `/` and on project pages with a cover, 0 elsewhere; eager poster bytes ≤ 200 KB; LCP poster ≤ 100 KB. The visual "largest image in the first viewport is not lazy" check is e2e, W3-1; R5: `video[data-loop]` attribute set and `<source>` order `av01.` then `avc1.`; R6/R7 sizes; R8 `.gif` > 200 KB only inside `[data-fixture]` or on `/lab/*`; R9 `client:load|only` closure > 20 KB outside `/lab/*`).
- AC2.4: an oversized loop fixture → exit 1, output names the file and rule.
- Platform = intersection of every route's first-view set.

**Implementation notes.** Route → class mapping is by pathname in the config (`/`, `/works/`, `/works/code-sandbox/`, `/works/*/`, `/search/`, `/garden/graph/`, `/lab/*`, text/slash/garden list). Report Δ vs `main` only when a baseline JSON path is passed (`--baseline <file>`); otherwise omit the column. Site-wide unique-JS total is printed as **report-only**. Warn ≈ 85 % unless the table says otherwise.

**size-limit cleanup** (AC2.3): delete the 13 `* css+html` entries, `"site js (all routes …)"`, `"/garden/graph/ js"`, `"pagefind ui js"`; add `"pagefind runtime (first query)"` (gzip JS, raw wasm; limit 120 KB) over the files the runtime fetches — per the review's check of pagefind 1.6.0: `pagefind.js`, `pagefind-entry.json`, `wasm.<lang>.pagefind`, `*.pf_meta`, plus one `*.pf_index` and one `*.pf_fragment` (confirm names against `09-baseline.md`; `pagefind-worker.js` only if Component UI was adopted in T0). Keep `feed.xml`, `audio-assets`, `cursor-island`, `hover fx js`, `/lab/datamosh/ js`.

**If the post-upgrade baseline already breaks a class limit**: do not raise it; record the measurement in your report (spec § Phase budget). G1 escalates as an issue.

**Note (review nit 25):** `check:depcruise` covers only `src`, so `scripts/` and `worker/` are not dependency-cruised this phase (issue `-l nit`).

**Verification.**
```bash
bun x vitest run tests/unit/route-budgets-core.test.ts tests/unit/route-budgets-cli.test.ts
bun run build && bun run scripts/route-budgets.ts      # exit 0 on current dist, prints per-route tables + report-only total
bunx size-limit
grep -c 'dist/_astro/\*.css' .size-limit.cjs           # 0
grep -c 'pagefind-ui.js' .size-limit.cjs               # 0
```

**Ledger requests (applied by G1, not by you):** `"check:budgets": "bun run scripts/route-budgets.ts"`; ci.yml step after `check:size`; stryker `mutate` += `scripts/lib/route-budgets-core.ts`.

**Commits.** `test(budgets): fixtures for route bucket classification and R1–R9`, `feat(budgets): per-route check:budgets core and CLI`, `build(size): drop mis-measuring size-limit entries`.

---

### W1-2 — P9-4 loop encode pipeline · CLOUD · `p09/w1-2-encode`

**Goal.** `encode-loops.ts` + pure `loops-core.ts` + `loopsManifestSchema`, including `--check`. Spec § P9-4 (CLI contract, recipe, master, encodes, codecs, outputs, flash lint, budgets, skip, exit codes).

**Files owned.**
- new `packages/site/scripts/encode-loops.ts`
- new `packages/site/scripts/lib/loops-core.ts` (recipe schema `recipeSchema`, filtergraph builder, `codecsFromProbe`, flash-window counter, file naming, prune planning)
- new `packages/site/src/lib/loops/manifest.ts` (`loopsManifestSchema`, `Size`, `LoopEntry` types, `getLoop(slug)` reading `src/data/loops.json`)
- new `packages/site/src/data/loops.json` — seed exactly `{}` (L2 owns it from wave 2)
- new `packages/site/tests/unit/loops-core.test.ts`, `tests/unit/loops-manifest.test.ts`, `tests/unit/encode-loops-cli.test.ts`
- new `packages/site/tests/fixtures/loops/**` (probe JSON fixtures, a 3-shot recipe, a fixture tree for `--check`, `manifest.fixture.json` used by wave-2/3 cloud tests — include a slug `fixture-loop` with card+banner sizes)
- new `packages/site/media/recipes/.gitkeep`

**Failing tests first (AC4.1–AC4.3).**
- `recipeSchema` accepts a valid montage/slideshow/transcode and rejects: unknown kind, `aspect ≠ "16:9"`, shot duration ∉ **[1.0, 2.0]** (review minor 15: owner asked for 1–2 s cuts), slide hold ∉ [0.8, 2.0], absolute `src` paths (recipes must be relative to the media root), `hold × fps` non-integer for slideshow.
- Filtergraph for a 3-shot montage equals a golden string: per input `fps → scale(force_original_aspect_ratio=increase|decrease) → crop|pad → setsar=1 → format=yuv420p`, then `concat=n=3:v=1:a=0`.
- `codecsFromProbe`: H.264 High@3.0 → `avc1.64001E`, High@3.1 → `avc1.64001F`, AV1 Main 8-bit with two `seq_level_idx` probes (4 and 5, as the review measured at ~720 w and 1280×720) → `av01.0.04M.08` / `av01.0.05M.08` (four probe fixtures). The string is always **derived** from ffprobe, never hard-coded per size.
- Flash counter: 4 opposing ≥ 10 % flips inside 1 s fails, 3 passes, last→first wrap is counted. fast-check: appending a frame never decreases max-flashes-per-window (AC4.2).
- Prune planning lists exactly the superseded hashed files.
- `loopsManifestSchema` round-trip `parse(JSON.parse(JSON.stringify(x)))` (fast-check), and a `recipeSchema` parse/safeParse property (review minor 19).
- Frame-size constants: card/gallery **768×432**, banner 1280×720; a test asserts both are even and exactly 16:9 (O2: 720×405 has an odd height and both encoders reject it).
- `--check` on the fixture tree exits 0; with one file deleted exits **5**; orphan file → 5; byte mismatch → 5 (AC4.3).
- Exit-code mapping 0/1/2/3/4/5 is unit-tested through an injected `run()` (ffmpeg stubbed).
- `it.skipIf(!hasFfmpeg)` smoke: encode a 2 s `lavfi testsrc2` montage end to end into a temp dir (cloud: `sudo apt-get install -y ffmpeg`; must have `libsvtav1` — check `ffmpeg -encoders | grep svtav1`, skip with a message if absent).

**Implementation notes (verified names, from spec; frame size per O2).** Encodes: card/gallery **768×432** `-c:v libsvtav1 -preset 4 -crf 38` / `-c:v libx264 -preset veryslow -crf 26 -profile:v high`; banner 1280×720 `-crf 36` / `-crf 24`; all `-an -pix_fmt yuv420p -movflags +faststart`; slideshow x264 adds `-tune stillimage`. Master: lossless FFV1 in a temp dir. Flash lint: `signalstats` YAVG per master frame. Outputs `public/loops/<slug>/<size>.<sha256-8>.<av1|h264>.mp4`, `src/assets/loops/<slug>/poster.png`, `src/assets/works/<slug>/<out>.png`, `src/data/loops.json` with sorted keys. `--media-root` defaults to `UTOFME_MEDIA_ROOT`; `--check` needs neither ffmpeg nor media root. Encode-time budgets: card/gallery > 300 KB fail (warn 150 KB), banner > 1 MB fail (warn 600 KB). Skip when recipe hash + outputs unchanged unless `--force`.

**Verification.**
```bash
bun x vitest run tests/unit/loops-core.test.ts tests/unit/loops-manifest.test.ts tests/unit/encode-loops-cli.test.ts
bun run scripts/encode-loops.ts --check; echo $?        # 0 on the committed tree ({} manifest, no files)
```

**Ledger requests:** `"media:encode": "bun run scripts/encode-loops.ts"`, `"check:media": "bun run scripts/encode-loops.ts --check"`; ci.yml `check:media` before `build`; lefthook `check-media` job with `glob: "packages/site/{public/loops/**,src/data/loops.json,media/recipes/**}"`, `root: "packages/site"`, `run: bun run check:media`; stryker `mutate` += `scripts/lib/loops-core.ts`, `src/lib/loops/manifest.ts` (review minor 19).

**Commits.** `test(loops): recipe, filtergraph, codecs, flash and prune cases`, `feat(loops): offline encode pipeline with flash lint`, `feat(loops): manifest schema and --check mode`.

---

### W1-3 — P9-5 `/loops/*` Range Worker · CLOUD · `p09/w1-3-range`

**Goal.** Range-serving Worker + pure range lib + wrangler config + deploy probe and fixture guard. Spec § P9-5, § P9-3 (deploy guard), AC3.5, AC5.1–AC5.4.

**Files owned.**
- new `packages/site/src/lib/range.ts` (pure: parse `Range`, honour `If-Range` vs ETag, plan 200/206/416)
- new `packages/site/worker/index.ts` (≤ 80 lines; local `interface Env { ASSETS: { fetch(input: Request | URL | string): Promise<Response> } }`, DOM `Request`/`Response`, no `@cloudflare/workers-types`)
- `packages/site/wrangler.jsonc` (exact shape in spec: `"main": "./worker/index.ts"`, `assets.binding: "ASSETS"`, `"run_worker_first": ["/loops/*"]`)
- `packages/site/tsconfig.json` (`include` += `worker/**/*`), `packages/site/knip.jsonc` (`entry` and `project` += `worker/**/*.ts`)
- `.github/workflows/deploy.yml` (three edits: build step env `UTOFME_FIXTURES: "false"`; guard step after build and before `wrangler deploy`: `bun run --cwd packages/site scripts/check-no-fixtures.ts --dist dist --min-real 6` (script owned by W1-4, O7/O16 — this YAML only calls it); post-deploy Range probe modelled on the feed probe `deploy.yml:56-68`: `curl -sS -D - -o /dev/null -H 'Range: bytes=0-1' https://utof.me<url>` must show `206` and `Content-Range: bytes 0-1/`, where `<url>` is the first `sources[0].url` in `src/data/loops.json` read with `jq`; skip with a notice if the manifest is `{}`)
- new `packages/site/tests/unit/range.test.ts`, `packages/site/tests/unit/worker.test.ts`

**Failing tests first.**
- AC5.1 (handler, fake `ASSETS`): every row of the spec table — non-`/loops/` passthrough (relabel per review minor 20: non-navigation requests for unmatched paths *do* reach the Worker; it returns `env.ASSETS.fetch(request)`, i.e. 404 with the `404.html` body — add that case); non-GET/HEAD → 405 + `Allow: GET, HEAD`; asset not 200 → passthrough; no Range / multi-range / `If-Range` ≠ ETag → 200 full; `bytes=a-b`, `a-`, `-n` → 206 with `Content-Range`, `Content-Length`; unsatisfiable → 416 `bytes */len`; HEAD → same status/headers, empty body. Every 200/206/416 has `Accept-Ranges: bytes`, asset `Content-Type` + `ETag`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`. Asset fetched with a clean GET (assert the fake saw no Range/conditional headers). Body > 25 MiB → streamed 200.
- AC5.2 fast-check on `range.ts`: L ∈ [1, 2²⁴], arbitrary header string → 206 slice invariants, 416 iff unsatisfiable, malformed → 200, never throws; a **weak** ETag (`W/"…"`) never satisfies `If-Range` → 200 (review minor 21, RFC 9110 §13.1.5).
- Copy the body at most once (Free plan 10 ms CPU; review minor 20); note the CPU ceiling for ADR 0045.

**AC3.5.** Now a unit-tested script (O7, owned by W1-4). W1-3 only wires it; G1 runs the seeded-leak and clean builds through it and records the output in `09-deploy-guard-dryrun.md`.

**Verification.**
```bash
bun x vitest run tests/unit/range.test.ts tests/unit/worker.test.ts
bun run check:knip && bun run check:astro
bunx wrangler deploy --dry-run --config wrangler.jsonc --outdir /tmp/w   # bundles worker, no network deploy
```

**Ledger requests:** `"preview:worker": "wrangler dev --config wrangler.jsonc"` (AC5.4, manual Safari/iOS check, not CI); stryker `mutate` += `src/lib/range.ts`.

**Commits.** `test(range): RFC 9110 range planner properties`, `feat(worker): range-serving worker for /loops/*`, `ci(deploy): fixture leak guard and loops range probe`.

---

### W1-4 — P9-3 works schema v2 + fixtures · CLOUD · `p09/w1-4-schema`

**Goal.** Schema delta, `fixture` flag on 16 mocks, `UTOFME_FIXTURES` via `astro:env`, `listWorks({ includeFixtures })`, `prevNext`, `works-collection.ts` as single entry point, content lint. Spec § P9-3, AC3.1–AC3.4; AC4.4 content cross-check.

**Files owned.**
- `packages/site/src/content.config.ts` (exact schema block from the spec: `loopSlug`, `media(image)`, `cover`, `gallery`, `lede`, `status`, `started`, `links` with `private`, `fixture`; `stack` on video|music|math|writing variants; `superRefine` `started ≤ date`; `z` from `astro/zod`, `z.url()`)
- `packages/site/astro.config.mjs` — only `env: { schema: { UTOFME_FIXTURES: envField.boolean({ context: "server", access: "public", default: true }) } }` (`envField` from `astro/config`)
- `packages/site/src/lib/works.ts` (`ListWorksOptions.includeFixtures`, pure `prevNext(entries, id)`)
- new `packages/site/src/lib/works-collection.ts` (Astro-only; reads `UTOFME_FIXTURES` from `astro:env/server`; exports the one listing function used by pages and feeds)
- `packages/site/src/pages/{index.astro, works/index.astro, works/[...slug].astro, feed.xml.ts, feed/works.xml.ts}` — replace direct `getCollection("works")` with `works-collection.ts`; no other edits (W3 owns their later changes)
- the 16 fixtures in `packages/site/src/content/works/*` — add `fixture: true` to frontmatter only
- `packages/site/src/pages/lab/datamosh.astro` — route through `works-collection.ts` (O7a), so a `UTOFME_FIXTURES=false` build shows no fixture cards and no links to unbuilt fixture pages; when no GIF card is available it renders the remaining cards (video cards work after #121) with a short note
- new `packages/site/scripts/check-no-fixtures.ts` (one file; pure `scanDist()` exported and unit-tested, CLI below it): scans **all** of `dist/` (HTML, both feeds, `sitemap-*.xml`, `dist/pagefind/` fragments) for any fixture slug (from `src/content/works/*` frontmatter `fixture: true`) and any `data-fixture`; exempt paths `dist/lab/**` and `dist/loops/mock-*/**` (O7b); `--min-real N` asserts ≥ N non-fixture cards in `dist/index.html`, newest first (O16 → AC10.1 gets a CI path in `deploy.yml`)
- new `packages/site/tests/unit/check-no-fixtures.test.ts` (seeded leak in each scanned file type fails; clean tree passes; exemptions honoured; `--min-real` ordering)
- new `packages/site/tests/unit/works-schema-v2.test.ts`, `tests/unit/works-fixtures.test.ts`, `tests/unit/content-lint.test.ts`, `tests/unit/content-loops.test.ts`

**Failing tests first.**
- AC3.1 fast-check (`@fast-check/vitest` `test.prop`, pattern `tests/unit/datamosh-engine.test.ts:432`): valid arbitrary entries parse; each single-field corruption (bad slug, focus ∉ [0,100], caption > 100, lede > 120, > 5 links, > 5 gallery, bad URL, `started > date`) fails `safeParse` **with that path**; defaults `fixture=false`, `focus=50`, `links=[]`, `gallery=[]`. Test the exported schema pieces; if the schema is only reachable inside `defineCollection`, export the Zod object (with TSDoc) the way the existing `content-schema.test.ts` reaches it.
- AC3.2 every existing fixture parses unchanged.
- AC3.3 `listWorks(…, { includeFixtures: false })` never returns `fixture: true` (property); `prevNext` gives home-order neighbours and `undefined` at both ends.
- AC3.4 content lint (`gray-matter`, `.mdx` only): for every non-draft, non-fixture entry with `cover.loop`: lede 6–20 words; body 40–120 words excluding MDX imports and comments; gallery 3–5; `alt` on every media item; `{/* src: … */}` in the same paragraph as each digit-bearing claim. Must pass vacuously today (no real entries) and fail on an inline-string fixture entry.
- AC4.4 (`content-loops.test.ts`): every `cover.loop` / `gallery[].loop` slug exists in `src/data/loops.json` and every manifest URL resolves under `public/` — uses W1-2's `loopsManifestSchema`… **W1-2 is in the same wave**, so this test reads `loops.json` with a local minimal Zod shape and is switched to `loopsManifestSchema` by G1 (ledger item) — passes vacuously now.

**Verification.**
```bash
bun x vitest run tests/unit/works-schema-v2.test.ts tests/unit/works-fixtures.test.ts tests/unit/content-lint.test.ts tests/unit/content-loops.test.ts tests/unit/content-schema.test.ts
bun run build && test -d dist/works/code-1                        # default true: fixtures built
UTOFME_FIXTURES=false bun run build && bun run scripts/check-no-fixtures.ts --dist dist   # 0 (no --min-real yet: no real entries)
bun run build && bun run scripts/check-no-fixtures.ts --dist dist; test $? -ne 0          # seeded leak fails
bun x vitest run tests/unit/check-no-fixtures.test.ts
bun run test:e2e   # existing suite stays green (default true), incl. datamosh.spec.ts
```

**Commits.** `test(content): works schema v2 properties and fixture filter`, `feat(content): works schema v2 with lede, status, links, loops`, `feat(content): UTOFME_FIXTURES keeps mock entries out of deploys`, `test(content): content lint for real projects`.

---

### W1-5 — P9-6 motion + loop controller + toggle · CLOUD · `p09/w1-5-motion`

**Goal.** Pure, DI-testable modules and the toggle component; no layout wiring (W2-1 does that). Spec § P9-6 (Controller, Pause motion), AC6.1, AC6.2.

**Files owned.**
- new `packages/site/src/lib/motion.ts` (state: `localStorage["utofme:motion"] ∈ {"paused","playing"}`; absent → follows `prefers-reduced-motion: reduce`; sets `html[data-motion="paused"]`; listens to live media-query changes; exports the tiny inline bootstrap used by `MotionToggle`/`_BaseLayout` as in ADR 0035's theme script)
- new `packages/site/src/lib/loops/controller.ts` (`mountLoops(root, deps)` → `dispose()`; deps injected: `IntersectionObserver`, `matchMedia`, `navigator.connection`, `document`, `addEventListener`; `threshold: 0.25`, `rootMargin: "200px 0px"`; `allowed = !paused && !saveData`; `play()` rejection leaves `data-ready` unset; first presented frame sets `data-ready`; `visibilitychange` hidden pauses all; full-load gating: no `play()`/`load()` before window `load`; **dispose never calls `pause()`**)
- new `packages/site/src/components/MotionToggle.astro` (`<button type="button" data-motion-toggle aria-pressed>Pause motion</button>` + inline script; no island)
- new `packages/site/tests/unit/motion.test.ts`, `tests/unit/loops-controller.test.ts`, `tests/unit/motion-toggle.test.ts` (Container API render)

**Failing tests first.** AC6.1 list verbatim (only intersecting + allowed loops play; pausing keeps `currentTime`; reduced motion + no key → nothing plays and `aria-pressed="true"`; stored `"playing"` overrides reduced motion; dispose never calls `pause()`; rejected `play()` leaves `data-ready` unset). AC6.2: exhaustive truth table storage {absent, paused, playing, garbage} × media {reduce, no-preference} → paused.

**Budget note.** Platform JS for hero-morph + controller + motion ≤ 3 KB gzip combined (spec § Phase budget). Measure `bun build src/lib/loops/controller.ts src/lib/motion.ts --minify | gzip -9 | wc -c` and report it.

**Verification.** `bun x vitest run tests/unit/motion.test.ts tests/unit/loops-controller.test.ts tests/unit/motion-toggle.test.ts`.

**Commits.** `test(motion): pause-motion truth table and controller policy`, `feat(motion): persisted pause-motion state and toggle`, `feat(loops): in-view loop controller`.

---

### W1-6 — P9-9 morph core + caption contrast · CLOUD · `p09/w1-6-morph-core`

**Goal.** The hero-morph module (all event handlers; no banner upgrade, O9) and the morph CSS, tested against hand-built DOM; plus the caption tokens and their contrast proof. Spec § P9-9 (event table, CSS, banner upgrade, fallbacks), § P9-7 Contrast, AC9.1, AC7.1a.

**Files owned.**
- new `packages/site/src/lib/vt/hero-morph.ts` — exports `slugFromWorkPath`, `onBeforePreparation`, `onBeforeSwap`, `onAfterSwap`, `clearMarks`, and `initHeroMorph(document)` that registers them on `astro:before-preparation` / `astro:before-swap` / `astro:after-swap`. **No banner upgrade (O9, deferred to an issue):** `astro:page-load` fires on `updateCallbackDone`, i.e. while the `hero` animation still runs, so a mid-morph node swap risks a visible jump. After a forward morph the banner keeps the persisted 768 w card node; direct loads render the banner encode. Event fields used: `sourceElement`, `from`, `to`, `direction`, `newDocument`, `viewTransition` (names verified in spec against astro@7.4.5 `events.ts`). Mark-clearing runs **before** marking; never touches transforms; reads no layout.
- `packages/site/src/styles/transitions.css` — the spec CSS block verbatim (`[data-vt-hero]`, `[data-vt-cap]`, `::view-transition-*` durations, zoom-settle under `prefers-reduced-motion: no-preference`); remove nothing else.
- new `packages/site/src/lib/contrast.ts` (gamma-encoded sRGB source-over + WCAG 2.2 relative luminance, unrounded)
- `packages/site/src/styles/tokens.css` — add `--caption-bg: rgb(16 16 16 / 0.62)`, `--caption-fg: #ffffff`, `--caption-blur: blur(10px) saturate(1.3)` only
- new `packages/site/tests/unit/hero-morph.test.ts`, `tests/unit/caption-contrast.test.ts`

**Failing tests first.**
- AC9.1 (minus the upgrade case, O9): `slugFromWorkPath(detailUrl({ id }))` round-trip (fast-check over valid slugs); with one card already marked, a second `onBeforePreparation` leaves exactly one marked frame; back mirror marks `[data-work-slug="<slug>"] [data-vt-frame]` and its `[data-cap]` in a parsed `newDocument` when `direction === "back"` and `to.pathname` ∈ {`/`, `/works/`}. Note: at `astro:before-preparation`, `event.newDocument` is still the **current** document (review verified-API table) — mark cards on `document`, not on `newDocument`, in step 1.
- Forward from a zoomed card sets `data-zoom-settle` on `newDocument`'s banner frame; `viewTransition.finished.finally(clearMarks)` removes marks and `data-zoom-settle`.
- AC7.1a: parse `--caption-bg`/`--caption-fg` from `tokens.css` by regex; worst case over white ≈ 5.34 ≥ 4.5 and over black; fast-check random `fc.record({ r, g, b })` underlays ≥ 4.5; the reference α .58 with `#f5f5f5` **fails**.

**Verification.** `bun x vitest run tests/unit/hero-morph.test.ts tests/unit/caption-contrast.test.ts && bun run check:knip` (hero-morph is reached only by tests until W2-1 imports it; knip counts `tests/unit/**` as entries).

**Commits.** `test(vt): hero-morph marking and back mirror`, `feat(vt): attribute-driven hero morph module`, `feat(tokens): caption glass tokens with contrast proof`.

---

### W1-7 — P9-12 Sandpack click facade · CLOUD · `p09/w1-7-sandbox`

**Goal.** `/works/code-sandbox/` loads Sandpack only on click. Spec § P9-12, AC12.1 (e2e part), AC12.2 is asserted by W4-3.

**Files owned.** `packages/site/src/components/mdx/Sandbox.astro`; new `packages/site/src/components/sandbox-mount.tsx` (`createRoot(el).render(<SandboxIsland {...props} />)`, then focus the container `tabindex="-1"`); `packages/site/tests/e2e/sandbox.spec.ts`; new `packages/site/tests/unit/sandbox-facade.test.ts` (Container API: facade renders button + `data-props`, no `astro-island`).

**Failing tests first.** e2e: before click, no request to a chunk whose source contains `react-dom` or `@codesandbox` (collect via `page.on("request")`, resolve names from `dist/_astro`); click "Load live playground" → Sandpack container visible within 3 s (`sandbox.spec.ts:15` semantics); focus is in the container; Axe clean before and after.

**Implementation.** Facade markup: short static note + `<button type="button">Load live playground</button>`; props serialised in `data-props` (JSON, escaped). A bundled `<script>` does `await import("../sandbox-mount")` on click. No custom client directive (spec call).

**Verification.** `bun run build && bun run test:e2e -- sandbox.spec.ts && bun x vitest run tests/unit/sandbox-facade.test.ts`.

**Commits.** `test(sandbox): no React before click`, `feat(sandbox): load Sandpack behind a click facade`.

---

### L1 — P9-10 prep: recipes, copy drafts, privacy checklist · **LOCAL** · `p09/l1-recipes`

**Why LOCAL.** Needs the owner's media under `UTOFME_MEDIA_ROOT` and `_local/`.

**Hour-0 note (O1).** Reading the inventory and drafting copy needs no repo build, so the owner may start that work as soon as this plan is approved; the branch itself is cut after T0 like every other task.

**Goal.** Everything L2/L3 need so that encoding + MDX is mechanical. No encoding yet (the CLI lands in G1).

**Files owned.**
- new `packages/site/media/recipes/<slug>.json` for the 8 projects in spec § P9-10 table (`tactical-arena`, `modified-maxwell-taichi`, `manimce`, `enth`, `godot-ctcs`, `linsae`, `gr-demo-learn`, `eeg-ads1299-lab`) and 14 A/B recipes: `mock-<name>` for each of the 12 `src/assets/works/mock/*.gif` (kind `transcode`, `sizes: ["card"]`, **`src` relative to the repo**, see note) plus `mock-fdtd-2d` and `mock-ta-round` (from owner media). Shots 1.0–2.0 s (minor 15).
- new `packages/specs/plans/09-content-drafts.md` — per project: lede (10–15 words, "**X** is a Y that Z"), body 40–120 words, 3–5 gallery captions (≤ 100 chars, claim-style), meta (status, started, links with `private`), and every number with its source file:line (tactical-arena: only `…-project-media-inventory-rl-docs.md`, headline "+96 (+94..+98)" Elo `JOURNAL.md:6090`, first contact 9.6 s vs 22.8 s `CS2_ROUNDS_REPORT.md:18`, `JOURNAL.md:6396`; smoke caption `SMOKE_REPORT.md:115-116`).
- new `packages/specs/plans/09-local-refs.md` (O1) — verbatim copies of what cloud workers can't read: the `.cap`, `body[data-fill="dark"]` and `.v1` rules from `_local/proposals/2026-11-03-project-view/show-me-card-variants.html`; the `.banner` and `::view-transition-*` rules from `show-me-project-view.html`; the no-GPU Chrome flags from `_local/handoff.md`; the media inventory rows used in recipes. No local absolute paths or account names (rewrite paths relative to `UTOFME_MEDIA_ROOT`). Push this **first** (within ~45 min) so G1 can merge it early if wave 1 is waiting.
- new `packages/specs/plans/09-media-checklist.md` — one checkbox per media file: no paths / usernames / hostnames / tokens / third-party screenshots (D5 exclusions: `enth/_local/reference/ui`, `linsae/local_files`, `defomo`, `yt-parse/datadir`), no cs2rl Rerun toasts, viewer top bars checked for local paths, Valve credit where applicable. INT pastes it into the PR description (AC10.4).

**Decision for mock recipes:** `--media-root` for `mock-*` is `packages/site/src/assets/works/mock` (pass it explicitly in L2); recipe `src` is the bare filename. No absolute path is ever committed.

**Verification.** `bunx biome check media/recipes` (JSON formatting). Schema validation happens in L2 with `recipeSchema` (W1-2) — if a recipe fails there, L2 fixes it.

**Commits.** `chore(media): loop recipes for phase 09 projects`, `docs(specs): phase 09 content drafts and media checklist`.

---

### G1 — wave-1 gate · CLOUD · `p09/g1`

**Merge order** (each a merge commit into `phase/09-project-view` via PR): W1-4 → W1-2 → W1-3 → W1-1 → W1-5 → W1-6 → W1-7 → L1. Expected conflicts: none (disjoint). After each merge: `bun run test && bunx lefthook run pre-commit --all-files`.

**Wiring ledger (one commit `build(site): wire phase 09 scripts and gates`):**
- `package.json` scripts: `check:budgets`, `media:encode`, `check:media`, `preview:worker` (as requested above); `test:e2e` → `node node_modules/@playwright/test/cli.js test --grep-invert @perf`; `"test:perf": "node node_modules/@playwright/test/cli.js test --grep @perf"`.
- `ci.yml`: `check:media` step before `build`; `check:budgets` step after `check:size`.
- `lefthook.yml`: `check-media` job (glob above) inside the piped group, after `check-docs`.
- `stryker.conf.json` `mutate` += `src/lib/range.ts`, `scripts/lib/route-budgets-core.ts`, `scripts/lib/loops-core.ts`.
- `tests/unit/content-loops.test.ts`: switch the local Zod shape to `loopsManifestSchema` (W1-2).
- Run the AC3.5 guard (`scripts/check-no-fixtures.ts`): clean `UTOFME_FIXTURES=false` build passes, default build fails; record both outputs in `packages/specs/plans/09-deploy-guard-dryrun.md` (new; G1 owns it). `ci.yml` also gets a step `UTOFME_FIXTURES=false bun run build && bun run scripts/check-no-fixtures.ts --dist dist` (without `--min-real` until INT adds `--min-real 6`).
- `package.json` script `"check:fixtures": "bun run scripts/check-no-fixtures.ts"`.
- If `09-local-refs.md` (L1) is pushed but L1 is unfinished, merge L1's branch at its current tip first so wave-2/3 cloud workers can read it.

**Exit gate.** `bun run build && bun run check:budgets && bun run check:media && bun run test && bun run test:e2e` (e2e minus known snapshot cases is fine until G2; nothing should be red yet), `actionlint`. Update `memory/progress.md`.

---

## Wave 2 (starts after G1)

### W2-1 — LoopMedia + playback wiring · CLOUD · `p09/w2-1-loopmedia`

**Goal.** The `LoopMedia` component (spec § P9-6 Markup), LCP-capable `CoverImage`, and the site-wide bundled script that mounts the controller, motion and hero-morph. Spec § P9-6, § P9-9 (`_BaseLayout` import), R5.

**Files owned.**
- new `packages/site/src/components/LoopMedia.astro` — props `media`, `slug`, `size: "card" | "banner" | "gallery"`, `sizes`, `eager?`, `priority?`. Renders `.loop-media[data-vt-frame][data-loop-frame]` with `style="--focus:<focus>%"`, the `<Picture>` underlay (`formats={["avif","webp"]}`, `priority` → `loading="eager" decoding="sync" fetchpriority="high"`; alt lives here), then `<video data-loop data-loop-size muted loop playsinline preload="none" width height aria-hidden="true">` with **AV1 `<source>` first, H.264 second** from the manifest; `transition:persist={"loop-" + slug}` on card and banner only (not gallery); **no `poster`, no `autoplay`**; **no `<template data-upgrade>`** (O9). In card context the poster `alt=""` (the card title names the link; review minor 17) — prop `decorative`; banner and gallery keep `alt`. Video `opacity: 0` until `[data-ready]`. Video styling via the wrapper (`.loop-media :global(video)`), never scoped classes on `<video>` (persist keeps source-page scope attrs).
- `packages/site/src/components/CoverImage.astro` — `eager` / `priority` props (call 10); GIF branch honours them; no other change.
- `packages/site/src/layouts/_BaseLayout.astro` — one bundled `<script>` importing `initHeroMorph` (W1-6), `mountLoops` on `astro:page-load` / dispose on `astro:before-swap` (W1-5), motion init; the motion inline bootstrap in `<head>` (no-flash `html[data-motion]`). Do **not** place `MotionToggle` here (W3 tasks place it in page headers).
- new `packages/site/tests/unit/loop-media.test.ts` (Container API, with `tests/fixtures/loops/manifest.fixture.json` injected — make `LoopMedia` take an optional `manifest` prop defaulting to `getLoop`, or mock the module with `vi.mock`), new `packages/site/tests/unit/base-layout-scripts.test.ts` if needed.

**Failing tests first.** LoopMedia output satisfies R5 exactly (attribute set, no `poster`/`autoplay`, ≥ 2 sources, `av01.` then `avc1.`), persist id `loop-<slug>` on card/banner and absent on gallery, no `<template>` emitted, `decorative` → `alt=""`, `priority` puts `fetchpriority="high"` on the `<img>` and no `loading="lazy"`; CoverImage GIF branch with `eager` is not lazy.

**Verification.** `bun x vitest run tests/unit/loop-media.test.ts && bun run build && bun run check:budgets && bun run test:e2e` (existing suite green; `transitions.spec.ts` still passes because names are not removed until W3).

**Commits.** `test(loops): LoopMedia markup satisfies R5`, `feat(loops): LoopMedia poster underlay and sources`, `feat(layout): mount loops, motion and hero morph site-wide`.

---

### W2-2 — #121 hover effects read video frames · CLOUD · `p09/w2-2-hover-video`

**Goal.** Spec § P9-7 "Flagged hover effects read video frames"; closes utof/utofme#121.

**Pre-check.** `git log origin/phase/09-project-view -- packages/site/src/lib/dither packages/site/src/lib/datamosh` and `git branch -r` — if any other branch still edits these two modules, rebase onto it after it lands; report.

**Files owned.** `packages/site/src/lib/dither/card-dither.ts`, `packages/site/src/lib/datamosh/card-mosh.ts`, new `packages/site/src/lib/loops/media-of.ts` (`mediaOf(card): HTMLVideoElement | HTMLImageElement | null` — `video[data-loop][data-ready]` while playing, else poster/cover `<img>`), new `packages/site/tests/unit/media-of.test.ts`, edits to `packages/site/tests/unit/datamosh-*.test.ts` only where the widened source type requires.

**Failing tests first.** `mediaOf` precedence (ready+playing video > poster img > cover img > null); both modules accept `HTMLVideoElement` (geometry from `videoWidth`/`videoHeight`, draw only when `readyState > 1`); on `astro:before-preparation` the overlay canvas is hidden (`display:none` or detached) and **no transform is reset**; disposal idempotent; `gif-source.ts` path unchanged for GIF cards.

**Verification.** `bun x vitest run tests/unit/media-of.test.ts tests/unit/datamosh-engine.test.ts tests/unit/datamosh-gif-source.test.ts && bunx size-limit` (`hover fx js` entry still within limit). e2e AC7.5/7.6 are written by W4-1 (needs a real video card).

**Commits.** `test(hover): media source selection for video cards`, `fix(hover): dither and mosh sample live video frames (#121)`.

---

### W2-3 — content-derived counts in existing e2e · CLOUD · `p09/w2-3-counts`

**Goal.** Planner's call 7: real entries added by L2/L3 must not require test edits.

**Files owned.** `packages/site/tests/e2e/{filter,feeds,cards,footer}.spec.ts` (count assertions only), new `packages/site/tests/e2e/helpers/works-counts.ts` (reads `src/content/works/*` frontmatter with `gray-matter`; mirrors the listing rules: non-draft, fixture filter per `process.env.UTOFME_FIXTURES ?? "true"`, per-type counts).

**Tests.** Replace literal counts with helper-derived values; add a guard that the helper's total equals the number of `[data-work-slug]` cards on `/` in the current build. Run the full suite before and after: same pass set.

**Verification.** `bun run build && bun run test:e2e -- filter feeds cards footer`.

**Commit.** `test(e2e): derive work counts from content`.

---

### W2-4 — ADRs 0044–0051 · CLOUD · `p09/w2-4-adrs`

**Goal.** Write the ADRs listed in spec § ADRs to write, from the spec text and its sources (no new research). Skeleton: Context · Decision · Alternatives · Consequences · Sources (URLs).

**Files owned.** new `packages/specs/adrs/0044-video-loops-replace-gifs.md`, `0045-range-worker-for-loops.md` (amends ADR 0002; records D17 Free-plan ceiling, R2/Workers Cache alternatives), `0046-card-banner-morph-client-router.md` (supersedes ADR 0015 naming), `0047-per-route-budgets.md` (supersedes parts of 0016, 0019), `0048-pause-motion-control.md`, `0049-works-schema-v2-project-anatomy.md`, `0050-card-caption-and-hover.md` (**draft**: leave a `## Perf result` section with `TBD by W4-2`), `0051-sandpack-click-facade.md`. Add "Superseded in part by NNNN" lines to 0002, 0015, 0016, 0019 (one line each; docs only).

**Verification.** `ls packages/specs/adrs | sort | tail -9`; every ADR has all five headings (`grep -c '^## ' …`).

**Commit.** `docs(adr): phase 09 decisions 0044–0051`.

---

### L2 — mock loops + tactical-arena · **LOCAL** · `p09/l2-tactical-arena`

**Why LOCAL.** Owner media; single owner of `loops.json` in wave 2.

**Goal.** First real loops in the repo, in this order (push after each): (1) the 12 `mock-*` A/B encodes, (2) `mock-fdtd-2d` + `mock-ta-round` and their source GIFs copied to `src/assets/lab/loops-ab/{fdtd-2d,ta-round}.gif`, (3) `tactical-arena` loop (card + banner) + poster + stills + MDX.

**Files owned.** `packages/site/media/recipes/**` (fixes only), `packages/site/public/loops/**`, `packages/site/src/assets/loops/**`, `packages/site/src/assets/works/tactical-arena/**`, `packages/site/src/assets/lab/loops-ab/**`, `packages/site/src/data/loops.json`, new `packages/site/src/content/works/tactical-arena.mdx`, `packages/specs/plans/09-media-checklist.md` (tick boxes).

**Steps.**
```bash
export UTOFME_MEDIA_ROOT=<owner code root>          # never committed
bun run media:encode mock-<name>... --media-root src/assets/works/mock
bun run media:encode mock-fdtd-2d mock-ta-round
bun run media:encode tactical-arena                 # flash lint must pass; drop strobing shots (flashbangs/HE) and re-run
bun run check:media                                  # 0
```
MDX from `09-content-drafts.md`: `lede`, `status: research`, `started: 2026-10-11`, `links: [{ label: "Code", href: …, private: true }]`, `cover: { src, alt, loop: "tactical-arena", focus }`, gallery 3–5 (radar overlay still credited "CS2 map data © Valve", 3D-viewer mesh still, 1–2 behaviour loops), `{/* src: … */}` comments next to every number. No Tier R sections.

**Verification.** `bun run check:media && bun x vitest run tests/unit/content-lint.test.ts tests/unit/content-loops.test.ts && bun run build && bun run check:budgets` (R6/R7 on the real files). Watch every encoded loop once at 1× and note it in the checklist.

**Commits.** `feat(media): A/B re-encodes of the mock GIFs`, `feat(media): tactical-arena loops and stills`, `feat(content): tactical-arena project page`.

---

### G2 — wave-2 gate · LOCAL or CLOUD · `p09/g2`

**Merge order:** W2-1 → W2-2 → W2-3 → W2-4 → L2. Expected conflict: none. Exit gate: `bun run check:media && bun run build && bun run check:budgets && bun run test && bun run test:e2e` (known-red: the named visual snapshots, call 12). `UTOFME_FIXTURES=false bun run build` shows tactical-arena on `/`. Update `memory/progress.md`.

---

## Wave 3 (starts after G2)

### W3-1 — P9-7 card treatment + home LCP + toggle · CLOUD · `p09/w3-1-card`

**Goal.** Dark-glass caption, "zoom + reveal", LCP on `/`, `data-fixture`, MotionToggle on `/` and `/works/`, removal of per-card `transition:name`. Spec § P9-7 (Structure, Contrast, backdrop-filter default, Hover table, Gating, Touch, Reduced motion), § P9-6 LCP, § P9-6 Pause motion placement, AC6.3–6.5, AC7.1b, AC7.2–7.4.

**Files owned.** `packages/site/src/components/Card.astro`, `packages/site/src/pages/index.astro`, `packages/site/src/pages/works/index.astro`, `packages/site/src/lib/works.ts` (add pure `eagerIndices(n, cols)` only, O5), new `packages/site/tests/unit/eager-indices.test.ts`, `packages/site/tests/e2e/cards.spec.ts` (structure only), `packages/site/tests/e2e/transitions.spec.ts`, new `packages/site/tests/unit/card-caption.test.ts`, new `packages/site/tests/e2e/card-caption.spec.ts`, new `packages/site/tests/e2e/playback.spec.ts`.

**Implementation.**
- `variant="media"` structure exactly as the spec HTML: `<a class="card card--media" data-work-slug data-fixture?>` › `.card-figure` (position relative, overflow hidden, **no z-index, no filter/opacity/mask/clip-path/blend/will-change**) › `.loop-media[data-vt-frame]` (LoopMedia for loop covers; wrapper around `CoverImage`/thumb otherwise, call 9) + `.card-cap[data-cap]` (absolute, `inset-inline:0; bottom:0`, radius 0, `z-index: 2`) with `h2.card-cap__t`, `p.card-cap__d` (`lede ?? summary`, one line, ellipsis), `p.card-cap__m` (year or `started`–`date` years · ≤ 3 `stack`, Geist Mono 12 px tabular-nums). All bar text `var(--caption-fg)`; sizes 15/600, 13/400, 12/400.
- Keep every existing attribute and Pagefind span (`Card.astro:86-132`), and the focus ring on the `<a>`.
- Remove `transition:name={`card-${id}`}`.
- Hover rules in `@media (hover: hover) and (pointer: fine)`: frame **children** `scale(1.05)` 560 ms enter / 340 ms leave `cubic-bezier(0.23, 1, 0.32, 1)`, 50 ms hover-intent delay on enter; bar `translateY(var(--cap-meta-h))` → `0` 220 ms / 160 ms `var(--ease-out)`; meta opacity 160 ms with 60 ms delay on enter. Ungated `.card--media:focus-visible` gives the same end state. `hover: none` → static bar with meta visible. Reduced motion or `html[data-motion="paused"]` → no scale/translate, meta visible, opacity-only transitions. Blur: `.card--media:is(:hover, :focus-visible) .card-cap { backdrop-filter: var(--caption-blur) }` inside `@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))`, never in `transition`.
- `index.astro` (O5 — the home is CSS multi-column, **column-major**, `index.astro:12-14`; 2 columns on desktop): `eagerIndices(n, 2)` = `{0, 1, ⌈n/2⌉}` (0-based: card 1, card 2 for the 1-column mobile first screen, and the likely top of column 2); card 0 gets `priority` (only `fetchpriority=high`), the others `eager`, the rest lazy. Card `p.card-cap__d` is omitted when both `lede` and `summary` are absent (review minor 18; `writing-3-no-summary.md`); `MotionToggle` in `header.site-head` before the first card in tab order. `works/index.astro`: toggle in its header.

**Failing tests first.** AC7.4 (container: `lede` shown, falls back to `summary`; `card-pagefind-attrs.test.ts` green). e2e (desktop context `{ viewport: 1280×900, isMobile: false, hasTouch: false }`, pattern `datamosh.spec.ts:12-17`): AC7.2 geometry/reveal/gating/touch (Pixel 5 project for touch), AC7.3 no Backdrop Root + `transition-property` excludes `backdrop-filter`, AC7.1b pure-white `<div>` pixel test with `sharp` `raw().toBuffer({ resolveWithObject: true })` (channels 107 ± 3, contrast ≥ 4.5), AC6.3 toggle (click pauses all `video[data-loop]`, `aria-pressed="true"`, persists across reload and a ClientRouter navigation, keyboard Tab+Enter, Axe clean), AC6.4 (off-screen loops paused after scroll; no `.mp4` resource before `loadEventEnd`; first poster `fetchpriority="high"` not lazy; **by visual position (O5):** at 1280×900 desktop and on Pixel 5, the largest `img` intersecting the initial viewport is not `loading=lazy` — if it fails, adjust `eagerIndices`, never add a 2nd `high`), card link accessible name starts with the title (`getByRole('link', { name: /^<title>/ })`, minor 17), empty description omitted (container test), AC6.5 reduced motion → nothing plays, posters visible. `transitions.spec.ts`: delete per-card name cases (replaced by AC9.x in W4-1), keep the rest.

**Verification.** `bun run build && bun run check:budgets && bun x vitest run tests/unit/card-caption.test.ts tests/unit/card-pagefind-attrs.test.ts && bun run test:e2e -- card-caption playback transitions cards`.

**Commits.** `test(card): caption geometry, contrast pixel and gating`, `feat(card): dark-glass caption with zoom and reveal`, `perf(home): eager LCP poster on the first two cards`, `feat(home): pause-motion toggle in the home and archive headers`.

---

### W3-2 — P9-8 project page · CLOUD · `p09/w3-2-project-page`

**Goal.** Tier S anatomy on `/works/<slug>/`. Spec § P9-8 (items 1–8), AC8.1–8.4.

**Files owned.** `packages/site/src/layouts/_WorkLayout.astro`, new `packages/site/src/components/{ProjectMeta,Gallery,PrevNext}.astro`, `packages/site/src/pages/works/[...slug].astro` (pass `prevNext`), `packages/site/tests/e2e/detail.spec.ts`, new `packages/site/tests/e2e/project-page.spec.ts`, new `packages/site/tests/unit/project-meta.test.ts`.

**Implementation.** Banner: `LoopMedia size="banner" priority`, `aspect-ratio: 3 / 1` at ≥ 700 px else `16 / 9`, `max-height: 60vh`, `max-width: 1280px`, `object-fit: cover`, `object-position: 50% var(--focus)`, frame carries `data-vt-hero` **statically**; no text over it; no `cover` → existing thumb. `<h1 tabindex="-1">` (remove `transition:name`), `<p class="lede">` (`lede ?? summary`). `ProjectMeta` one mono line: years · status · ≤ 4 stack · links `Label ↗`, `private: true` → link + `<span>private for now</span>`; empty `links` keeps the legacy repo/youtube/listen/arxiv/pdf link (`_WorkLayout.astro:38-66`). Body `<Content />`. `Gallery`: 3–5 `<figure>`, loops via `LoopMedia size="gallery"` (no persist), stills via `<Picture>`, `<figcaption>`. Research slot `<slot name="research" />` wrapped in `<section>` only if `Astro.slots.has("research")`. `PrevNext`: text links + "All projects". Webmentions/microformats unchanged. `<article data-fixture>` when `fixture` (R8). Meta description `summary ?? lede`. `MotionToggle` in the page header before the banner video in tab order.

**Failing tests first.** Container: private link renders "private for now"; legacy link kept when `links` empty. e2e on `/works/tactical-arena/` (desktop 1440×900 and Pixel 5): AC8.1 h1+lede inside first viewport, banner aspect 3:1 / 16:9 ± 2 %; AC8.2; AC8.3; AC8.4 Axe on every real project page present; `detail.spec.ts:124-140` name case removed (AC9.x replaces it), other detail cases kept.

**Verification.** `bun run build && bun run check:budgets && bun x vitest run tests/unit/project-meta.test.ts && bun run test:e2e -- project-page detail`.

**Commits.** `test(project): Tier S first screen, meta and gallery`, `feat(project): banner, lede, meta row and gallery`, `feat(project): prev/next and research slot`.

---

### W3-3 — P9-11 `/lab/loops-ab/` · CLOUD · `p09/w3-3-loops-ab`

**Files owned.** new `packages/site/src/pages/lab/loops-ab.astro` (`BaseLayout noindex`; `MotionToggle` first; 14 rows: 12 `src/assets/works/mock/*.gif` + `src/assets/lab/loops-ab/{fdtd-2d,ta-round}.gif`, each GIF `<img>` beside `LoopMedia size="card"` of `mock-<name>` at the same display width, byte counts for GIF and each MP4 from the manifest), new `packages/site/tests/e2e/loops-ab.spec.ts`.

**Tests (AC11.1).** 14 rows, each one `img[src$=".gif"]` + one `video[data-loop]`; `meta[name=robots]` noindex; Axe zero; toggle present. `/lab/` sitemap exclusion already exists (`sitemap-filter.ts:27`).

**Verification.** `bun run build && bun run check:budgets && bun run test:e2e -- loops-ab`.

**Commit.** `feat(lab): GIF vs loop A/B page`.

---

### L3 — P9-10 breadth · **LOCAL** · `p09/l3-projects`

**Goal.** ≥ 5 (target 7) of: `modified-maxwell-taichi`, `manimce`, `enth`, `godot-ctcs`, `linsae`, `gr-demo-learn`, `eeg-ads1299-lab`. Order: by readiness of media (transcodes first: `modified-maxwell-taichi`, `manimce`; then slideshows). Push after each project.

**Files owned.** `packages/site/media/recipes/<these>.json` (fixes), `packages/site/public/loops/<these>/**`, `packages/site/src/assets/loops/<these>/**`, `packages/site/src/assets/works/<these>/**`, `packages/site/src/data/loops.json`, new `packages/site/src/content/works/<these>.mdx`, `packages/specs/plans/09-media-checklist.md`.

**Per project.** encode → `check:media` → MDX from drafts (no invented numbers; every digit sourced) → `bun x vitest run tests/unit/content-lint.test.ts tests/unit/content-loops.test.ts` → `bun run build && bun run check:budgets` → checklist ticks → commit `feat(content): <slug> project page` → push.

**Done when** AC10.1 holds: `UTOFME_FIXTURES=false bun run build` lists ≥ 6 real entries on `/`, newest first. L3 may continue into wave 4 (no one else owns its files); INT merges whatever is pushed.

---

### G3 — wave-3 gate · CLOUD · `p09/g3`

**Merge order:** W3-2 → W3-1 → W3-3 → L3 (current tip; L3 may be merged again in INT). Exit gate as G2 plus AC10.1 build check. Update `memory/progress.md`.

---

## Wave 4 (starts after G3)

### W4-1 — P9-9 morph e2e + #121 e2e · CLOUD · `p09/w4-1-morph-e2e`

**Files owned.** new `packages/site/tests/e2e/morph.spec.ts`, new `packages/site/tests/e2e/hover-video.spec.ts` (add a `canPlayType('video/mp4; codecs="av01.0.04M.08"')` probe test so the Chromium-codec assumption is visible — review verified-API table); fixes only in `src/lib/vt/hero-morph.ts`, `src/styles/transitions.css`, `src/lib/dither/card-dither.ts`, `src/lib/datamosh/card-mosh.ts`.

**Tests (desktop context; tactical-arena card on `/`).** AC9.2 (at `astro:after-preparation`: exactly one computed `view-transition-name: hero`, matching `[data-vt-frame]`; exactly one `card-caption` = that card's bar; frame child still `scale(1.05)`. **O10:** `startViewTransition` runs *after* `after-preparation`, so `document.activeViewTransition` is `null` there — instead capture `e.viewTransition` in an `astro:before-swap` listener and assert its `ready` resolves without `InvalidStateError` and that it is the native object (`e.viewTransition === document.activeViewTransition` in Chrome 142+), not Astro's simulation; label every sampled event by name; expando on the card `<video>` survives onto the banner `<video>`; `!paused && muted`; `activeElement` is the `<h1>`), AC9.3 back (hero on card frame in new state, focus on `a[data-work-slug]`, `scrollY` ± 2 px), AC9.4 (`addInitScript` deletes `Document.prototype.startViewTransition`), AC9.5 (reduced motion: no `::view-transition*` animations), AC9.6 **replaced (O9)**: after forward morph the banner `<video>` is the card node (`currentSrc` contains `/card.`) and exactly one `[data-astro-transition-persist="loop-<slug>"]` exists; after Back the card's `currentSrc` contains `/card.`; a direct load of the project page plays `/banner.`; AC9.7 (zoom-settle cleared after `finished`, media transform ends `none`; never set under reduced motion). AC7.5 (`?dither`: two overlay samples 500 ms apart differ while the video plays — AV1 source), AC7.6 (overlay hidden at `astro:after-preparation`, media transform unchanged).

**Verification.** `bun run build && bun run test:e2e -- morph hover-video transitions` + `bun x vitest run tests/unit/hero-morph.test.ts`.

**Commits.** `test(vt): card to banner morph forward, back and fallbacks`, `fix(vt): …` as needed.

---

### W4-2 — `@perf` blur check · **LOCAL** · `p09/w4-2-perf`

**Why LOCAL.** The owner's no-GPU Chrome is the reference machine.

**Files owned.** `packages/site/src/components/LoopMedia.astro` and `packages/site/scripts/lib/route-budgets-core.ts` + `tests/unit/route-budgets-core.test.ts` (only if rule 2 fires), `packages/specs/adrs/0044-video-loops-replace-gifs.md` (codec result), new `packages/site/tests/e2e/caption-perf.spec.ts` (`@perf` tag; `test.use({ launchOptions: { args: ["--disable-software-rasterizer", "--use-gl=disabled"] } })` per `_local/handoff.md`; records rAF intervals 3 s with 4 loops playing and one card hovered, once with `--caption-blur` and once with `none` injected), `packages/site/src/styles/tokens.css` (only if the rule fires), `packages/specs/adrs/0050-card-caption-and-hover.md` (fill `## Perf result`).

**Codec axis (O12).** Run the matrix {AV1-first, H.264-first} × {blur, none} (reorder sources via an injected script that swaps the two `<source>` elements before `load()`). Rule 2: if AV1-first raises p95 by > 4 ms over H.264-first, order **card-size** sources H.264 first in `LoopMedia.astro` and make R5's order check per-size in `scripts/lib/route-budgets-core.ts` (+ its fixture test); banner stays AV1-first. Record in ADR 0044 and 0050.

**Rule.** If blur raises p95 frame interval by > 4 ms → set `--caption-blur: none`. Record p50/p95 both ways, machine, Chrome version, and the choice in ADR 0050 (AC7.7). Also do the owner's real-Chrome eyeball check on `/` with the flags and note it.

**Verification.** `bun run build && bun run test:perf`.

**Commits.** `test(perf): caption blur frame-interval check`, `docs(adr): 0050 caption blur perf result` (+ `perf(card): drop caption blur on no-GPU budget` if it fires).

---

### W4-3 — budgets finalised · CLOUD · `p09/w4-3-budgets-final`

**Files owned.** `packages/site/route-budgets.config.ts` (only to add class routes that now exist — never to raise a limit; a breach is reported, spec § Phase budget), `packages/site/.size-limit.cjs`, `packages/site/lighthouserc.cjs` (add `/works/tactical-arena/`), `.github/workflows/ci.yml` (only if the check:budgets step needs the summary env).

**Checks.** AC2.2 `check:budgets` exits 0 on this build and prints per-route tables + report-only total; AC12.2 (`/works/code-sandbox/` first-view ≤ 40 KB, lazy demo ≤ 450 KB warn 300) and AC12.1's "chunks are lazy" assertion; platform JS increase from hero-morph + controller + motion ≤ 3 KB vs `09-baseline.md`; `bunx size-limit`; `npx @lhci/cli autorun` ≥ 0.85 mobile on the URL list. Record the new baseline numbers for the PR.

**Commit.** `build(budgets): final phase 09 route budgets and LHCI URL`.

---

### W4-4 — visual-regression baselines · CLOUD · `p09/w4-4-visual`

**Files owned.** new `packages/site/tests/e2e/visual-09.spec.ts`; all `packages/site/tests/e2e/*-snapshots/**`.

**Cases** (under `reducedMotion: "reduce"`, `img[src$=".gif"]` masked): `/` desktop 1280×900 + Pixel 5; `/works/tactical-arena/` desktop + Pixel 5; one card revealed (focused) in desktop context with motion allowed and injected `* { transition: none !important }`. Re-baseline the known-red snapshots from call 12 **only after** inspecting each diff image and confirming the change is intended (list them in the commit body).

**Verification.** `bun run build && bun run test:e2e -- --update-snapshots visual-09 cards landing image-pipeline` then a clean run without `--update-snapshots`.

**Commit.** `test(visual): phase 09 baselines`.

---

## Merge order (summary)

1. G0/T0: `p09/t0-astro7-close` (contains `phase/09-astro7`) → `phase/09-project-view`.
2. G1: W1-4 → W1-2 → W1-3 → W1-1 → W1-5 → W1-6 → W1-7 → L1 → wiring commit.
3. G2: W2-1 → W2-2 → W2-3 → W2-4 → L2.
4. G3: W3-2 → W3-1 → W3-3 → L3 (tip).
5. INT: W4-1 → W4-3 → W4-2 → W4-4 → L3 (final tip) → close.

Each arrow is a PR into `phase/09-project-view` merged with a merge commit after its own verification block passes on the merged tree.

---

## INT — integration and phase close · **LOCAL** · on `phase/09-project-view`

**Why LOCAL.** Final e2e oracle (call 11), owner's media for `check:media` re-encode spot checks, manual Safari/iOS check, owner look at the A/B page.

1. Merge wave-4 branches and the final L3 tip (order above).
2. Full gates, all from `packages/site/`:
   ```bash
   bun install --frozen-lockfile
   bunx lefthook run pre-commit --all-files
   bun run check:media
   bun run build
   bun run check:budgets
   bunx size-limit
   bun run test                         # vitest unit + integration + fast-check
   bun run test:e2e                     # all Playwright incl. Axe + visual, minus @perf
   npx @lhci/cli autorun
   UTOFME_FIXTURES=false bun run build && bun run check:fixtures --dist dist --min-real 6   # AC3.5 + AC10.1
   # then add `--min-real 6` to the ci.yml fixtures step
   bun run test:mutation                # nightly-scope; run once here, report scores (not blocking)
   ```
3. Manual: `bun run preview:worker` and open `/` + one project on a Safari/iOS device on the LAN (AC5.4; Range 206, H.264 fallback, persist after morph, Low Power Mode poster). Record the result in the PR.
4. AC coverage sweep: walk spec ACs 1.1 → 12.2 and tick each with the test/command that proves it; any gap is fixed or filed (`-l nit` per CLAUDE.md inline-fix gate).
5. Open PR `phase/09-project-view` → `main` (after phase 8 merges): description lists ACs, the new baseline numbers (W4-3), the privacy checklist (`09-media-checklist.md`, AC10.4), the deploy-guard dry run (AC3.5), the ADR list, deferred issues (spec § Deferred). Merge commit; tag `phase-9`.
6. File the spec § Deferred issues and any queued nits. Update `memory/progress.md`.
7. Ask the owner to look at `/lab/loops-ab/` (D7). On approval run **P9-11b**.

### P9-11b — mock-GIF switch (owner-gated) · LOCAL · `p09/p11b-switch`

Fixture covers become `{ src: <poster>, loop: "mock-<name>" }`; `/lab/datamosh/` imports its GIFs directly from `src/assets/works/mock/` (it already does — verify); GIFs stay in place. Tests: AC11.2 (`dist/index.html` references no `.gif`; R8 passes on `/` without the fixture exemption). Visual baselines for `/` re-taken. Commit `feat(home): mock cards play loops instead of GIFs`. Separate PR into `phase/09-project-view` if before phase close, else into `main` as a follow-up.

---

## ADRs to write (owners)

| ADR | Title | Owner | Wave |
|---|---|---|---|
| 0043 | Astro 7 upgrade | T0 | 0 |
| 0044 | Video loops replace GIFs | W2-4 | 2 |
| 0045 | Range-serving Worker for `/loops/*` (amends 0002) | W2-4 | 2 |
| 0046 | Card → banner morph on `<ClientRouter />` (supersedes 0015 naming) | W2-4 | 2 |
| 0047 | Per-route budgets via `check:budgets` (supersedes parts of 0016, 0019) | W2-4 | 2 |
| 0048 | Global "Pause motion" + reduced-motion posters | W2-4 | 2 |
| 0049 | Works schema v2 + Tier S project anatomy + `UTOFME_FIXTURES` | W2-4 | 2 |
| 0050 | Card caption and hover (perf result filled by W4-2) | W2-4 draft, W4-2 final | 2 / 4 |
| 0051 | Sandpack behind a click facade | W2-4 | 2 |

---

## Minimal viable cut (drop in this order if time runs out)

Already cut by the review (O9): the banner upgrade. Then:

1. **P9-11b switch** — owner-gated and fixture-only (O8); ship without it.
2. **P9-12 Sandpack facade** (W1-7) — `/works/code-sandbox/` is a fixture, so it has no production effect (O8); drop it and its budget row, file `phase-N`.
3. **`/lab/loops-ab/` page + `mock-*` encodes** (W3-3, L2 step 1) — D7 stays open; file `phase-N`.
4. **`backdrop-filter` polish** — ship `--caption-blur: none` without the `@perf` run; keep the codec-axis run if any time remains (O12). Contrast never depended on blur.
5. **#121 video-frame hover** (W2-2) — flagged extras only; file the issue back open.
6. **AC7.1b pixel test + revealed-card visual baseline** — record a manual check in ADR 0050.
7. **Budgets R2/R7/R8/R9 and the Δ-vs-`main` column** (W1-1) — keep R1, R3, R4, R5, R6 + report-only total (review MVC).
8. **Content breadth below target** — 7 → 5 extra projects is the spec floor (AC10.1). The review would accept ≥ 3; going under 5 needs an owner amendment of AC10.1 (and `--min-real`), so it is the last resort.

**Never cut:** P9-1, P9-2, P9-3 (fixture guard), P9-4 (`check:media`, flash lint), P9-5 (Safari playback), P9-6 Pause motion (WCAG 2.2.2) + reduced-motion posters, P9-7 contrast guarantee, the P9-9 no-morph fallback, tactical-arena.

---

## Spec-review findings applied

Source: `origin/review/09-spec` → `packages/specs/reviews/09-spec-review.md` (verdict green-with-fixes). All BLOCKER and MAJOR findings are applied; the task sections above carry the concrete edits.

| Id | Review finding | Sev. | Applied as | Where |
|---|---|---|---|---|
| O1 | Critical path runs through the owner's machine; `_local/` unreadable in cloud; owner Node 22.22.3 | BLOCKER | Node ≥ 22.23.4 is a hard gate for LOCAL tasks (user-local install; `bun --bun` stop-gap); L1 exports `_local` values to `09-local-refs.md`, pushed first; L1 drafting may begin at hour 0 | calls 14, 16; L1; G1 |
| O2 | 720×405 card frame can't be encoded (odd height) | BLOCKER | Card/gallery **768×432**; codecs strings derived from ffprobe (`av01.0.04M.08` / `.05M.08` measured) | Contracts; W1-2 |
| O3 | P9-1 misses `prettier-plugin-astro`; `rollupOptions` silently dropped under Astro 7; reformat must land before branching | MAJOR | T0 checklist (c) required, (i) added; pagefind Component UI made conditional | T0 |
| O4 | Phase file budget breached by the reformat | MAJOR | Formatter-only churn exempt (carve-out analogue); new-file count corrected to 20 + 2 = 22 | call 8 |
| O5 | LCP/eager rule assumes row order; home is column-major | MAJOR | `eagerIndices(n, 2)` = {0, 1, ⌈n/2⌉}; one `high`; R4 amended; e2e by visual position | W1-1, W3-1 |
| O6 | `mutation.yml` keeps Node 22.12 | MAJOR | All workflows pinned; grep check | T0 (d) |
| O7 | Fixtures leak via `/lab/datamosh/`, `public/loops/mock-*`, unchecked dist paths | MAJOR | (a) datamosh through `works-collection.ts`; (b) **accepted with reason**: `mock-*` loops and `/lab/**` are the site's own placeholder art on noindex, sitemap-excluded pages, so the guard exempts `dist/lab/**` and `dist/loops/mock-*/**`; (c) guard is a unit-tested script scanning all of `dist/` | W1-4, W1-3, G1 |
| O8 | P9-11 switch and P9-12 have no production effect | MAJOR | Not deferred outright (both are cheap, off the critical path, and run in parallel), but moved to the top of the minimal cut | Minimal viable cut |
| O9 | Banner upgrade runs mid-morph and isn't mirrored on Back | MAJOR | **Banner upgrade deferred** (issue); AC9.6 replaced (card node stays, `/card.` after Back, direct load plays `/banner.`) | W1-6, W2-1, W4-1 |
| O10 | AC9.2 `activeViewTransition` assertion vacuous at `after-preparation` | MAJOR | Capture `e.viewTransition` in `astro:before-swap`; assert native + `ready` | W4-1 |
| O11 | Hidden shared-file coupling; publish contracts | MAJOR | Shared-file ledger + § Contracts (markup, `loops.json` type, field names) | top of plan |
| O12 | AV1 software-decode cost on no-GPU Chrome unmeasured | MAJOR | `@perf` gets a codec axis; card-size H.264-first if AV1 costs > 4 ms p95 | W4-2 |
| O16 | AC10.1 has no CI path (minor 16) | MINOR | `check-no-fixtures.ts --min-real 6` in `deploy.yml`, and in `ci.yml` from INT | W1-3, W1-4, INT |

**Minor findings also applied** (cheap, inside owned files): 15 (shots 1.0–2.0 s), 17 (card poster `alt=""`, link name starts with title), 18 (omit empty description), 19 (`manifest.ts` in Stryker, `recipeSchema` property), 20 (Worker row relabel, 404 case, CPU note), 21 (weak ETag never matches `If-Range`), 25 (depcruise gap noted as an issue).

**Not applied (queued for `gh issue create -l nit` by INT, per the review-round cap):** 13 (tag manual ACs `[manual]` in the spec), 14 (per-tile linearised flash lint), 22 (Back mirror for an off-screen card), 23 (cite "time" for LHCI/size-limit pins), 24 (CLAUDE.md phase count — owner's call, CLAUDE.md is not edited unasked), 26 (cite symbols, not line numbers, for the hover modules).

**Spec text not edited by this plan.** The overrides live here; INT amends the spec in one `docs(specs): fold review overrides into phase 09 spec` commit so spec and code agree at merge.
