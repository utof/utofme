# Phase 10 — Research article (tactical-arena) — implementation plan

> **Spec:** [`packages/specs/specs/10-tactical-arena-article.md`](../specs/10-tactical-arena-article.md) (revision 2). Invariants, schemas, dataset whitelists and every AC live there; this plan fixes lanes, ownership, order, TDD steps, commands and exit gates. When the two disagree, the spec wins; report the conflict.
>
> **Branch:** `phase/10-research-article`, cut from `main` (after tag `phase-09`). Each lane works on `p10/<lane>` in its own worktree and is merged into the phase branch with `git merge --no-ff`. The phase merges into `main` with a merge commit and is tagged `phase-10`.
> **Workers:** local Sonnet implementers, at most **two lanes at a time**, each in its own worktree; they may read the notes repo checkout. Opus for the plan review and the merge decisions.

## Pre-flight (coordinator, once)

```bash
git fetch origin && git switch -c phase/10-research-article origin/main
mkdir -p packages/specs/plans
cp <notes>/article/site/10-tactical-arena-article.md packages/specs/specs/
cp <notes>/article/site/plans/10-tactical-arena-article.md packages/specs/plans/
git add packages/specs && git commit -m "docs(specs): phase 10 spec and plan" && git push -u origin phase/10-research-article
cd packages/site && bun install --frozen-lockfile
flock /tmp/p10-build.lock sh -c 'nice -n 19 bun run build && bun run check:budgets' | tee /tmp/p10-baseline.txt
```

Keep the `check:budgets` table for `/works/tactical-arena/` (first-view JS 32.5 KB of 40, HTML 12.8 KB gzip at review time); the I lane compares against it. The spec review notes and the response stay in the notes repo; nothing private is copied.

## Conventions (every lane)

- **Briefing.** Paste CLAUDE.md § "Subagent briefing" and § "Subagent output verbosity" verbatim, then this lane's section. Add: CLAUDE.md line 3 still says "Astro 6"; the repo is on Astro 7.4.5 (ADR 0043). Read the spec sections your lane names before writing code.
- **Env** (set by the coordinator in the dispatch prompt; never written into a committed file): `UTOFME_NOTES` = the notes checkout; `UTOFME_ARTICLE_DATA=$UTOFME_NOTES/article/data`. Node ≥ 22.23 (the CI pin); if `node -v` is older, prefix `PATH` with a 22.23 toolchain.
- **Worktree.** `git worktree add ../p10-<lane> -b p10/<lane> phase/10-research-article`, then `bun install --frozen-lockfile` in it.
- **Foreground only.** No background jobs, no `astro dev`. Everything at `nice -n 19`.
- **Build lock.** The laptop is shared and Playwright's preview server always uses port 4321, so **build + e2e run under one lock**:

  ```bash
  cd packages/site
  flock /tmp/p10-build.lock sh -c 'nice -n 19 bun run build && nice -n 19 bun run test:e2e <spec files> --grep-invert @visual'
  ```

- **Commands** (from `packages/site`):
  - one unit file: `bun run test tests/unit/<name>.test.ts`
  - **GATE** (before every lane report): `bun run check:biome && bun run check:prettier && bun run check:astro && bun run check:type-coverage && bun run check:knip && bun run check:depcruise && bun run check:docs`, then under the lock: `bun run build && bun run test` (some unit tests read `dist/`), then the lane's e2e files.
  - privacy (from lane D1 on): `bun run check:privacy` (warns without `PRIVACY_DENYLIST`; must exit 0).
- **TDD.** Red test first, commit it failing only when the plan says "red commit"; otherwise red → green in one commit. Conventional commit subjects. **No AI/assistant mentions and no `Co-Authored-By` anywhere.** The lefthook pre-commit hook runs on every commit; never bypass it.
- **Visual snapshots** (`toHaveScreenshot`) are titled with `@visual` and are not run locally; their baselines are rendered on GitHub (§ Visual baselines).
- **Ownership.** Touch only the files your lane owns (lists below). If you need a change elsewhere, stop and report it. `knip.jsonc` belongs to D2; if knip flags your code, fix the code.
- **Datasets** (figure lanes): write `src/lib/article-data/<name>.ts` to the spec's contract and whitelist row, then `bun run sync:article-data --only <name>`; commit the output and its sidecar. `git diff` must be empty after a second run (AC3.7).
- **Lane report:** `packages/specs/reports/10-<lane>.md`: files touched, commit SHAs, ACs green with the command output summary, measured sizes, open doubts, issues to file.
- **Done** = the lane's ACs green, GATE green, `check:privacy` clean (from D1 on), report committed.

## Lane index and order

| Round | Lanes (parallel pair) | Why this order |
|---|---|---|
| 1 | **N** notes ∥ **A1** schema + lint + tokens | N feeds facts (D2) and the parity table (S); A1 unblocks A2 |
| 2 | **D1** privacy + CI ∥ **A2** layout + Figure + lab pages | D1's scanner is used by D2's sync; A2 gives every later lane its Blocks and lab pages |
| 3 | **D2** datasets + sync + facts + `<N>` ∥ **S** shared libs | both foundations for the figures; disjoint files |
| 4 | **B** budgets ∥ **P** copy | B before the figure lanes' size checks; P early so fact gaps surface early |
| 5 | **FA** F1 ∥ **FB** F2 + F5 + F10 | |
| 6 | **FC** F3 + F9 + F13 ∥ **FD** F4 + F11 + F8 | |
| 7 | **FE** F6 + F7 ∥ **I** integration (starts its own files; done after FE merges) | |

| Lane | Branch | Owns (paths under `packages/site/` unless stated) | Depends on | Size (impl / tests / ~lines) |
|---|---|---|---|---|
| N | own branch in the notes repo | notes `article/scripts/{build_facts,laptop_sight_parity}.py`, `article/data/{facts_src,facts,sight_parity}.json`, `article/FACTS.md` (append § 6 only), `article/data/README.md` (two entries) | — | 2 scripts / self-tests / ~500 |
| A1 | `p10/a1-schema-tokens` | `src/content.config.ts`, `src/lib/project-fields.ts`, `src/components/ProjectMeta.astro`, `src/styles/tokens.css`, `src/lib/contrast.ts`, `src/lib/figure-marks.ts`, `tests/unit/{works-schema-v2,project-meta,mdx-prose,content-lint,figure-tokens,figure-marks}.test.ts`, `tests/unit/helpers/mdx-prose.ts`, `tests/fixtures/content-lint/**`, ADR 0056 | — | 6 / 6 / ~800 |
| A2 | `p10/a2-layout` | `src/components/ProjectBanner.astro`, `src/layouts/{_WorkLayout,_ArticleLayout}.astro`, `src/pages/works/[...slug].astro`, `src/components/article/{Figure,Stamp}.astro`, the 12 stub `src/components/article/*Block.astro`, `src/pages/lab/figures/[id].astro`, `src/pages/lab/article-layout.astro`, `tests/unit/{project-banner,figure,article-layout}.test.ts`, `tests/fixtures/banner-golden/**`, `tests/e2e/{p10-layout,p10-lab}.spec.ts`, ADR 0052 | A1 | 19 (12 stubs) / 5 / ~1,000 |
| D1 | `p10/d1-privacy` | `scripts/lib/privacy-scan-core.ts`, `scripts/check-privacy.ts`, `scripts/check-no-fixtures.ts`, `package.json` (script `check:privacy`), `lefthook.yml` (repo root), `.github/workflows/{ci,deploy}.yml`, `tests/unit/{privacy-scan-core,check-privacy,check-no-fixtures}.test.ts`, `tests/fixtures/privacy/**`, ADR 0055 | — | 3 + 4 modified / 3 / ~1,000 |
| D2 | `p10/d2-data` | `scripts/sync-article-data.ts`, `scripts/lib/article-data-core.ts`, `src/lib/article-data/{types,maps_cs}.ts`, `src/data/article/maps_cs.json`, `src/data/article-meta/**`, `src/lib/{facts,figure-scale,figure-data}.ts`, `src/components/article/N.astro`, `package.json` (script `sync:article-data`), `.github/workflows/ci.yml` (one step), `knip.jsonc`, `tests/unit/{article-data-core,sync-article-data,dataset-maps-cs,facts,n-component,figure-scale,figure-data}.test.ts`, `tests/fixtures/article-sync/**`, ADR 0054 | D1, N | 9 / 7 / ~1,300 |
| S | `p10/s-libs` | `src/lib/{grid,sight,elo,figure-keys,figure-live,figure-link}.ts`, `src/lib/figure-motion.svelte.ts`, `tests/fixtures/article/sight_parity.json`, `tests/unit/{grid,sight,sight-parity,elo,figure-keys,figure-motion,figure-live,figure-link}.test.ts`, ADRs 0053, 0058, 0060 | N | 7 / 8 / ~1,200 |
| B | `p10/b-budgets` | `route-budgets.config.ts`, `scripts/lib/route-budgets-core.ts`, `scripts/route-budgets.ts` (only if the table output needs columns), `tests/unit/route-budgets.test.ts`, `tests/fixtures/budgets/**`, `lighthouserc.cjs`, ADR 0057 | A2 | 3 modified / 1 + fixtures / ~800 |
| P | `p10/p-copy` | `src/content/works/tactical-arena.mdx`, deletes `src/assets/works/tactical-arena/{radar-dust2,mesh-inferno}.png`, `media/recipes/tactical-arena.json` (`stills` only), `tests/unit/article-provenance.test.ts`, `tests/fixtures/article-provenance/**`, may extend `tests/unit/helpers/mdx-prose.ts`, ADR 0059 | A1, A2, D2 | 1 + 2 deletions / 1 / ~3,500 words + ~600 |
| FA | `p10/fa-replay` | `src/components/article/Replay{Block,Keyframe}.astro`, `Replay.svelte`, `src/lib/figures/replay.ts`, `src/lib/article-data/replay_mirage.ts`, its data + sidecar, `tests/unit/{dataset-replay-mirage,figure-replay,replay-island,replay-block}.test.ts`, `tests/fixtures/article-sync/replay_mirage/**`, `tests/e2e/p10-replay.spec.ts` | A2, D2, S, B | 5 / 5 / ~1,300 |
| FB | `p10/fb-maps` | `SmokeSight*`, `MapStages*`, `RollMap*` (Block, Keyframe, svelte), `src/lib/figures/{smoke-sight,map-stages,roll-map}.ts`, `src/lib/article-data/{map_stages,maps_generated}.ts` + data + sidecars, matching unit tests and `tests/fixtures/article-sync/{map_stages,maps_generated}/**`, `tests/e2e/p10-{smoke-sight,map-stages,roll-map}.spec.ts` | A2, D2, S, B | 14 / 9 / ~1,600 |
| FC | `p10/fc-elo` | `Elo*`, `Noise*`, `EloSentence{Block.astro,.svelte}`, `src/lib/figures/{elo-chart,noise}.ts`, `src/lib/article-data/{elo,noise}.ts` + data + sidecars, matching tests and sync fixtures, `tests/e2e/p10-{elo,noise,elo-sentence}.spec.ts` | A2, D2, S, B | 12 / 8 / ~1,400 |
| FD | `p10/fd-tempo` | `Tempo*`, `AgentsVsPros*`, `FreePeek*`, `src/lib/figures/{tempo,agents-vs-pros,free-peek}.ts`, `src/lib/article-data/{tempo,agents_vs_pros}.ts` + data + sidecars, matching tests and sync fixtures, `tests/e2e/p10-{tempo,agents-vs-pros,free-peek}.spec.ts` | A2, D2, S, B | 14 / 9 / ~1,500 |
| FE | `p10/fe-notebook` | `Machine*`, `Notebook*`, `src/lib/figures/{machine,notebook}.ts`, `src/lib/article-data/{architecture,notebook,notebook_parked}.ts` + data + sidecars, matching tests and sync fixtures, `tests/e2e/p10-{machine,notebook}.spec.ts` | A2, D2, S, B, FC (AC11.7) | 11 / 8 / ~1,400 |
| I | `p10/i-integration` | `tests/e2e/p10-article.spec.ts`, `tests/unit/article-dist.test.ts`, `stryker.conf.json`, `packages/specs/reports/10-close.md`, visual baselines (via the workflow) | all | 0–1 / 2 / ~600 |

Within each pair the owned files are disjoint. Files that change hands across rounds: `ci.yml` (D1 → D2 adds one step), `package.json` scripts (D1 → D2), `tests/unit/helpers/mdx-prose.ts` (A1 → P), each `*Block.astro` stub (A2 → its figure lane), `src/data/article-meta/sources/` (each lane adds only its own sidecar).

---

## Lane N — facts, FACTS addendum, sight parity (notes repo)

**Goal.** Give the site a keyed `facts.json` it can trust and a parity table generated by the game itself. Runs in a worktree of the notes repo (the only lane that writes there); push its branch and tell the coordinator the commit to sync from.

**Tasks**
1. **Facts source.** `article/data/facts_src.json` = `{ "<key>": { "src": "FACTS.md:<line>" | "from": "<file>.json:<json.path>" | "derive": "<name>", "digits", "unit"?, "sign"?, "alt"?, "lo"?, "hi"?, "measuredOn"? } }`. Walk STORY.md (the honest sentence, the abstract, every section intent and figure entry) and the spec's captions, try lines and ACs; add a key for every number the page may print. Keys are dotted lower-case. **Required keys** (exact names; figure lanes use them):

   | Key | Value (as printed) | Used by |
   |---|---|---|
   | `elo.head.block2` | +96, lo 94, hi 98, sign | F3 mark, prose |
   | `tempo.pros.contact.median` | 22.8 s, lo 22.1, hi 23.6 (from `tempo.json` pros) | F1 marker, F4 mark, prose |
   | `tempo.b28.contact.median` | 9.6 s (from `tempo_dists.json` b28 q50) | F4 mark, prose |
   | `tempo.pros.plant.median` | 74.65 → digits 1 (from `tempo_dists.json` pros q50) | prose (matches F4) |
   | `sight.grid.extra` | 14.6 %, alt "1 in 7" | F2 caption |
   | `peek.hit.nosnap`, `peek.hit.snap` | 17 %, 57 % (from `agent_vs_pro.json` `one_tick_peeks` hit × 100, digits 0) | F8 |
   | `cs2.tickrate` | 64 — **only** with a cited line (see task 2); otherwise omit the key | F8 |
   | `compute.block.minutes` | 32 | F3 GPU-hours axis |
   | `util.agent.grenades`, `util.pros.grenades` | 0.9, 2.2; `measuredOn` 3v3, 2026-10-25 | F11 marks, prose |
   | `replay.contact.s` | 7.2 s (`derive: replay_first_contact_s` on `replay_head_cs.json` round 0) | F1 caption |

   Re-check the STORY numbers FACTS lacks (review M10) and either source them (task 2) or leave them out: snap hit 57 % (data, above); bots' holder 0.673 inside the pros' interval; "91 % of defenders moving at first contact" (FACTS has CTs moving **at 15 s**, 53 % vs pros 28 %: re-source or drop the 91 %); exploiters 49–51 % in all 40 lives; the 0.44 next-round weight; seed spread "5–20 Elo"; eco vs full win rate; 229 entries / 74 parked (from `notebook.json` counts); 64 ticks/s.
2. **FACTS addendum.** Append `## 6. Addendum (phase 10)` to `article/FACTS.md` with one cited line per newly sourced number, read in its source first. Never edit or renumber existing lines (`git diff` shows additions after the last line only).
3. **`article/scripts/build_facts.py`** (`python3 -I`): resolves `from` paths and named derivations, checks each `src` value appears on its FACTS line within half a unit of its last printed digit (normalising `+`, `−`, `,`, `%`, `×`), refuses FACTS § 4 values (the 54.4 s round length, "over its starting point" wording), writes `article/data/facts.json` (`{ "schema": "facts/1", "facts": {…} }`, sorted keys, `src` kept). `--check` rebuilds and diffs; `--selftest` runs on a temporary FACTS file (one pass, one off-by-rounding fail, one banned value).
4. **`article/scripts/laptop_sight_parity.py`**: `JAX_PLATFORMS=cpu python3 … --game <game checkout> --out article/data`. Imports the game's own line-of-sight and vision functions; sets FOV 106°, no see-behind, the directional smoke rule, range 10; asserts the game's Mirage and Dust2 walls equal `maps_cs.json` rows (canonical frame); writes ≥ 200 cases in the spec's mix (P10-4 "Parity table") with `verifiedAgainstGame: true` and a `settings` object. The docstring cites the game functions file:line. If the game cannot be imported, write the 30-case hand table with `verifiedAgainstGame: false` and say so in the report. The coordinator supplies the game checkout and its Python env.
5. `article/scripts/privacy_scan.sh article/data` clean; two README entries; commit; push.

**Done.** `build_facts.py --check` and `--selftest` exit 0; every required key present (or `cs2.tickrate` deliberately absent, reported); `sight_parity.json` has ≥ 200 cases and `verifiedAgainstGame: true` (or the fallback, reported); FACTS diff is append-only; privacy scan clean.

## Lane A1 — schema, structural lint, tokens, marks

**Spec:** P10-1 (schema delta, structural lint), P10-2.

1. **Schema (AC1.1).** Red: add `test.prop` cases to `tests/unit/works-schema-v2.test.ts` — valid `article` objects parse, `math` defaults to false, each single-field corruption fails at its path, a non-private link without `href` fails at `links.N.href`, a private link without `href` parses, every real entry still parses. Green: the `article` object in `baseFields`; `links[].href` optional + `superRefine`; pass `article` and `updated` through `src/lib/project-fields.ts` if its types need it.
2. **ProjectMeta.** Red (`tests/unit/project-meta.test.ts`, Container): a link without `href` renders no `<a>`; an `updated` prop renders "Updated <date>" with a `<time datetime>`. Green.
3. **MDX prose helper.** Red (`tests/unit/mdx-prose.test.ts`): `parseMdxProse(text)` returns frontmatter, `## ` sections with `github-slugger` ids, paragraphs with components, imports and comments removed (keeping `<N …/>` and `<Stamp …/>` as tokens), Figure Blocks with their `number` prop and `caption` / `try` slot text, and prose word counts. Green: `tests/unit/helpers/mdx-prose.ts`.
4. **Structural lint (AC1.4).** Red (`tests/unit/content-lint.test.ts`): one passing fixture and five failing ones under `tests/fixtures/content-lint/` (`.mdx`: 120 words; a gallery item; a section id without a heading; figure numbers out of order; an unescaped `$40`), each failing with its rule name; plus "every non-draft, non-fixture real entry with `article` passes" (none yet). Green: rules in the helper module.
5. **Tokens and marks (AC2.1–2.3).** Red: `tests/unit/figure-tokens.test.ts` (light `:root` block only; contrast table; bands; smoke edge vs fill; grep for `--color-accent` and hex literals in `src/components/article/**`), `tests/unit/figure-marks.test.ts` (a shape for every coloured key; `markPath` returns a closed path). Green: the `/* Figures */` block in `tokens.css`, `parseHex` in `contrast.ts`, `src/lib/figure-marks.ts`.
6. ADR 0056; report.

**Done.** AC1.1, AC1.4, AC2.1–2.3 green; GATE green; e2e `project-layout.spec.ts p09-project.spec.ts` green.

## Lane A2 — layout, banner, Figure, lab pages

**Spec:** P10-1 (route, layout, grid), Figures common contract (Figure, island root, lab pages).

1. **Banner golden (AC1.2).** Red commit first: `tests/unit/project-banner.test.ts` renders the **current** `_WorkLayout` banner for a loop entry and a still entry with `experimental_AstroContainer` and writes nothing; commit the captured goldens to `tests/fixtures/banner-golden/{loop,still}.html` (strip `data-astro-cid-*`). Green: extract `ProjectBanner.astro` (markup, `ProjectStill` fallback, `.banner` CSS); `_WorkLayout` uses it; goldens equal.
2. **Figure + Stamp.** Red (`tests/unit/figure.test.ts`): "Figure N." prefix, caption slot, "Try:" line from the `try` slot, `Stamp` text from a `measuredOn` prop, `<details>` only with the `details` slot, reserved box styles from `aspect` / `minBlock`, widths `text|wide|full`. Green.
3. **Article layout.** Red (`tests/unit/article-layout.test.ts`, Container): order banner → header (breadcrumb + eyebrow in `.nav-row`, `h1` = headline, `.lede` = dek, meta with "Updated") → `a.u-url[hidden]` → `nav[aria-label="Sections"]` → `.e-content.article-body`; `data-variant="article"`; no gallery; KaTeX CSS link iff `article.math`. Green: `_ArticleLayout.astro`, the switch in `[...slug].astro`, the grid CSS.
4. **Lab pages and stubs.** Create the 12 stub Blocks (`Replay`, `SmokeSight`, `MapStages`, `Machine`, `EloSentence`, `RollMap`, `Elo`, `Noise`, `Tempo`, `AgentsVsPros`, `FreePeek`, `Notebook` + `Block.astro`): props `number`, slots `caption`, `try`; a `Figure` with a `<p data-stub>` placeholder (`EloSentenceBlock` renders an inline `<span data-stub>`). `src/pages/lab/figures/[id].astro` (glob over `*Block.astro`, id = kebab name, placeholder caption/try, `noindex`, no pages when `UTOFME_FIXTURES` is false) and `src/pages/lab/article-layout.astro` (the tactical-arena entry + an `article` overlay + a demo body with all widths, an aside and one h2 per section).
5. **e2e.** Red → green: `tests/e2e/p10-layout.spec.ts` on `/lab/article-layout/` — AC1.3, AC1.7 (desktop context 1440×900 and 393 px), AC1.8 (Axe at load and with JS off), AC1.9; `tests/e2e/p10-lab.spec.ts` — each of the 12 lab pages renders one `figure[data-figure]` and is Axe-clean.
6. ADR 0052; report.

**Done.** AC1.2, Figure tests, AC1.3/1.7/1.8/1.9 on the lab layout page; existing e2e `banner-quality chrome footer layout-chrome project-layout p09-morph p09-project` green; GATE green.

## Lane D1 — privacy scan, deploy guards, CI wiring

**Spec:** P10-3 "Privacy scan" (rules, scopes, wiring); Figures common contract § "Lab pages" (`check:no-fixtures`).

1. **Core (AC3.2).** Red (`tests/unit/privacy-scan-core.test.ts`): per rule id one positive and one negative fixture (`tests/fixtures/privacy/`; documentation addresses 192.0.2.x, 100.64.0.1; stand-in internal paths); the denylist from `tests/fixtures/privacy/denylist.txt` hits a word in prose, in a path, inside a hyphenated host-like token and as a JSON key; messages never contain the matched text; `test.prop` insertion property; raw-like records hit, their projections are clean. Rule sets `core` / `shipped` / `docs` and the scope table exactly as the spec. Green: `scripts/lib/privacy-scan-core.ts` (the `internal-path` list mirrors the notes repo's privacy checklist; read `$UTOFME_NOTES/article/PRIVACY.md` § 1 for it).
2. **CLI (AC3.3).** Red (`tests/unit/check-privacy.test.ts`, spawns the script on temp dirs): exit 0 clean, 2 on a CGNAT fixture, 4 with `--require-denylist` and an empty env, `--dist` scans every `dist/_astro/*.json` and the article route; warns without the denylist. Green: `scripts/check-privacy.ts`; `package.json` script `check:privacy`.
3. **No-fixtures guard.** Red (extend `tests/unit/check-no-fixtures.test.ts`): a temp dist containing `lab/figures/x/index.html` or `lab/article-layout/index.html` fails. Green: `scripts/check-no-fixtures.ts`.
4. **Wiring.** `lefthook.yml`: job `check-privacy` (glob: the article surfaces) running `bun run check:privacy`. `ci.yml`: job-level `env: PRIVACY_DENYLIST: ${{ secrets.PRIVACY_DENYLIST }}`; step `check:privacy` after `check:docs`; step `check:privacy --dist dist` after `build`; new job `deploy-build` (checkout, bun, node, install, `UTOFME_FIXTURES=false` build, `check:no-fixtures`, `check:privacy --dist dist`). `deploy.yml`: the same job env; after the fixture guard, `check:privacy --dist dist --require-denylist`. No `if:` on secrets. Validate with `actionlint .github/workflows/ci.yml .github/workflows/deploy.yml`.
5. ADR 0055 (declares the secret); report.

**Done.** AC3.2, AC3.3 green; `bun run check:privacy` exits 0 on the tree; actionlint clean; GATE green.

## Lane D2 — dataset framework, sync, facts, `<N>`, loader

**Spec:** P10-3 (datasets contract, sync, loading), P10-4 rows `figure-scale`, `figure-data`, `facts`, P10-17 "`<N>`".

1. **Contract + core.** Red (`tests/unit/article-data-core.test.ts`): `defineDataset`, `shapeOf`; core pipeline on a fixture module set: source parse → project → projected parse → deterministic serialise (sorted keys) → gzip cap → privacy scan (`shipped` set, from D1) → output + sidecar; `--check` semantics; exit codes 0/1/2/3/4 with file + JSON path, never matched text. Green: `src/lib/article-data/types.ts`, `scripts/lib/article-data-core.ts`.
2. **CLI.** Red (`tests/unit/sync-article-data.test.ts`, spawns the script with `--from tests/fixtures/article-sync/notes` into a temp site root): discovers `src/lib/article-data/*.ts` by listing the folder; `--only`; `--check`; facts handling (`src` dropped). Green: `scripts/sync-article-data.ts`; `package.json` script `sync:article-data`; `ci.yml` step `sync:article-data --check` after `check:privacy`.
3. **Worked example (AC3.1, AC3.7).** Red (`tests/unit/dataset-maps-cs.test.ts`): source fixture under `tests/fixtures/article-sync/maps_cs/` (stand-in `sources`/`pipeline_source` strings); key set = `{schema, maps[{name, rows}]}` exactly; `test.prop` on the projected schema. Green: `src/lib/article-data/maps_cs.ts`; run the real sync → `src/data/article/maps_cs.json` + sidecar.
4. **Formatting.** Red (`tests/unit/figure-scale.test.ts`): `formatNumber` rounding (74.65 → "74.7", one rounding), grouping ("9,158"), U+2212, U+00A0 units, `formatSigned`, `formatInterval` ("+94 to +98"), `formatSeconds`, `formatPercent(0.6347, 0)` → "63 %"; `linear`, `ticks`. Green: `src/lib/figure-scale.ts`.
5. **Facts + `<N>`.** Red (`tests/unit/facts.test.ts`, `tests/unit/n-component.test.ts` Container): schema (`facts/1`, key regex, fields); unknown key throws; `<N>` prints at the stored `digits`, `sign`, `ci`, `alt`, `title` for `measuredOn`, `<data class="n" value data-fact>`. Green: `src/lib/facts.ts`, `src/components/article/N.astro`; sync the real `facts.json` from lane N's commit.
6. **Loader.** Red (`tests/unit/figure-data.test.ts`, happy-dom, stubbed `fetch`): ok; HTTP error; network error; shape error (wrong `schema`, missing key); abort; one request per URL (cache); cache cleared on `astro:before-swap`. Green: `src/lib/figure-data.ts`.
7. `knip.jsonc` only if a real false positive remains (document why). ADR 0054 (declares `UTOFME_ARTICLE_DATA` and the lab routes); report.

**Done.** AC3.1 (maps_cs), AC3.6 (`bun run sync:article-data --check` exit 0), AC3.7 for `maps_cs` and `facts`; all listed tests green; GATE green; `check:privacy` clean.

## Lane S — shared libraries

**Spec:** P10-4 (all rows except the D2 ones), sight rule, parity table.

1. **Parity fixture.** Copy `$UTOFME_ARTICLE_DATA/sight_parity.json` verbatim to `tests/fixtures/article/sight_parity.json` (test-only; record its sha256 in the report).
2. **grid (AC4.3).** Red (`tests/unit/grid.test.ts`): both legends; `wallPath` raster equality; tick/second round trip; `yawToScreen` / `facingToScreen` agree on 8 directions. Green: `src/lib/grid.ts`.
3. **sight (AC4.1, AC4.2).** Red: `tests/unit/sight-parity.test.ts` (`it.each` over all cases, zero mismatches when `verifiedAgainstGame`), `tests/unit/sight.test.ts` (fast-check properties). Green: `src/lib/sight.ts`. A mismatch is fixed in TS, never in the table.
4. **elo (AC4.4).** Red → green: `tests/unit/elo.test.ts`, `src/lib/elo.ts`.
5. **keys, motion, live, link (AC4.5, AC4.6).** Red → green: `tests/unit/{figure-keys,figure-motion,figure-live,figure-link}.test.ts` (happy-dom), then the modules. `motionState()` returns `{ readonly paused: boolean; dispose(): void }`; `registerLive(): () => void`; `linkFacts(root): () => void` — signatures frozen.
6. ADRs 0053, 0058, 0060; report.

**Done.** AC4.1–AC4.6 green (parity: report the case count and `verifiedAgainstGame`); GATE green.

## Lane B — budgets

**Spec:** P10-16.

1. **Per-island records.** Red (`tests/unit/route-budgets.test.ts` + HTML fixtures in `tests/fixtures/budgets/`): `analyzeHtml` returns `islands[]` with `name` from `opts`, `client`, URLs, decoded `propsBytes`. Green: `RouteDoc.islands` in `route-budgets-core.ts`.
2. **Rules (AC16.1).** Red: one passing and one failing fixture each for R2 (`lazyJs`), R9 (load/only closure > 20 KB outside `/lab/`), R10 (exclusive closure > `islandJs[name]`; missing entry is an error); lazy-data column warns > 120 KB. Green: the rules; `RouteClassLimits` gains `lazyJs?`, `islandJs?`; no `htmlWarn`.
3. **Config.** `article` and `labFigure` classes and routes in the spec's order; `lighthouserc.cjs` adds `/works/tactical-arena/`.
4. **Real build.** Under the lock: `bun run build && bun run check:budgets` passes (stub figures, real layout); paste the table in the report.
5. ADR 0057; report.

**Done.** AC16.1 green; `check:budgets` passes; GATE green.

## Lane P — copy

**Spec:** P10-17, P10-1 (frontmatter, structural lint), OD-2/OD-3/OD-4.

1. **Provenance lint (AC17.1).** Red: `tests/unit/article-provenance.test.ts` over the helper, with negative fixtures in `tests/fixtures/article-provenance/` (`.mdx`): bare number; one banned claim per verb group (incl. "superhuman" alone and a pros-first sentence); negation outside the 6-word window; "over its starting point"; chained 3v3/5v5 keys; missing `<Stamp>`; caption over 100 characters; a positive fixture using every exemption pattern once. Green: the lint rules.
2. **Convert the entry.** Rewrite `src/content/works/tactical-arena.mdx`: frontmatter per spec (no YAML comments, `links: [{ label: "Code", private: true }]`, `gallery: []`, `updated`, the `article` object with the 9 section ids, `math: true` only if the boxed aside uses `$$`); body ≈ 3,000–3,500 words in the 9 sections, written from `$UTOFME_NOTES/article/STORY.md` and `FACTS.md` in the north-star voice; every number through `<N k>` (read `src/data/article-meta/facts.json` for keys); each Block with its `number` (reading order in the spec), a `caption` slot (≤ 100 chars, a claim, ≥ 1 `<N>`) and a `try` slot with the spec's action; `<Stamp>` in sections that print `measuredOn` facts; the honesty sentence in section 1 (first 120 words) and section 8; credits with both dataset links and licences, "Not affiliated with Valve.", "The code is private for now."; "about \$40 of cloud GPU".
3. **Cleanup (AC17.4, AC17.5).** Delete the two PNGs and the recipe's `stills` block in the same commit as the frontmatter change (the build must not reference a deleted file). Note in the report that the recipe hash for the slug is now stale (spec P10-17).
4. **Missing facts.** If a sentence needs a number with no key, leave the number out and list it in the report for the I lane (no edits in the notes repo from this lane).
5. ADR 0059; report with the PR-checklist items (fresh read, highlight sign-off placeholder).

**Done.** AC17.1–AC17.5 and AC1.4's real-entry case green; `check:privacy` clean; the page builds; e2e `banner-quality chrome footer layout-chrome project-layout p09-morph` green on the real page; GATE green.

## Figure lanes (FA … FE): shared procedure

For each figure, in this order:
1. **Dataset** (if any). Red (`tests/unit/dataset-<name>.test.ts`): source fixture under `tests/fixtures/article-sync/<name>/` (cut from the real file; stand-in strings for path fields), whitelist key set = the spec row, dropped keys absent, `test.prop` on the projected schema, the dataset's specific rule (e.g. Mirage-only, cross-team `sees`, no `radar_floor_x4`, no five-vs-five block). Green: the module; real sync; commit output + sidecar.
2. **Logic.** Red (`tests/unit/figure-<name>.test.ts`): the figure's unit ACs. Green: `src/lib/figures/<name>.ts`.
3. **Keyframe + Block.** Red (`tests/unit/<name>-block.test.ts`, Container): caption, keyframe (`role="img"`), `<details>`, exactly one `astro-island[client="visible"]` with decoded props ≤ 2 KB, the stamp where the spec asks. Green: replace the stub Block; write the Keyframe (static imports: the JSON and `?url&no-inline`).
4. **Island.** Red (`tests/unit/<name>-island.test.ts`, `mount()` + stubbed `fetch` + `flushSync()`): keyboard changes state; error state shows Retry; the disposer releases every `registerLive`. Green: the `.svelte` island with the `.fig-box` root, roles and names per the common contract, `motionState()`, `linkFacts` where named.
5. **e2e** (`tests/e2e/p10-<id>.spec.ts` on `/lab/figures/<id>/`): hydration (island loses `ssr`), the Try path, the spec's e2e ACs, reduced motion, no-JS (`test.use({ javaScriptEnabled: false })`), Axe after hydration, CLS ≤ 0.02 while scrolling, one `@visual` element snapshot at 1440×900 and Pixel 5.
6. **Size.** Under the lock: `bun run build && bun run check:budgets` (R10 for `labFigure` routes); report the island's exclusive gzip size.

**Done (every figure lane).** The spec's ACs for its figures green; dataset sync idempotent (AC3.7); `check:budgets` green; `check:privacy` clean; GATE green; report.

### FA — F1 replay (spec P10-5)
Dataset `replay_mirage` (round 0 of `replay_head_cs.json`; derived `firstContactTick`). Logic: fog per team, ghosts, event markers (area onsets), interpolation, autoplay state machine. Canvas island (`role="img"` on the canvas; controls outside). ACs AC5.1–AC5.6. Budget 25 KB; data ≤ 10 KB.

### FB — F2 smoke sight, F5 map stages, F10 roll a map (spec P10-6, P10-9, P10-14)
F2 uses D2's `maps_cs` and S's `sight.ts`; choose the token literal and the suggested smoke by the ≥ 8 / ≥ 30 % rule (AC6.1). F5 dataset `map_stages`; counts computed from rows (AC9.1–9.3). F10 dataset `maps_generated`; Mirage from `maps_cs` (same URL, shared cache). Budgets 15 / 10 / 6 KB.

### FC — F3 Elo, F9 noise, F13 Elo sentence (spec P10-7, P10-13, P10-15)
Datasets `elo` (markers: the flash-arc, bot-roles and flash-kick A/B rows; map each to its notebook entry id by reading `$UTOFME_ARTICLE_DATA/notebook.json`; store `notebookId` in the dataset module's literal) and `noise` (rules parsed and unit-tested against the source strings). F3 calls `linkFacts`. F13 is inline (`<span>` root), no dataset. Budgets 12 / 6 / 2 KB.

### FD — F4 tempo, F11 agents vs pros, F8 free peek (spec P10-8, P10-15, P10-12)
Datasets `tempo` (stamp date literal in the module, citing the notes data README) and `agents_vs_pros` (11 rows, `peek`). F8 reads `peek.hit.*` and optional `cs2.tickrate` through `facts.ts` in its Block and passes formatted strings. F4 and F11 call `linkFacts`. Budgets 8 / 6 / 8 KB.

### FE — F6 machine, F7 notebook (spec P10-10, P10-11)
Datasets `architecture` (geometry + labels), `notebook`, `notebook_parked`. Hand-write the F6 public copy and the 9 stages in `src/lib/figures/machine.ts` from `$UTOFME_NOTES/article/ARCHITECTURE.md` (generic compute words; no file names, paths or transfer mechanism). Curate the ten highlight ids from `$UTOFME_NOTES/article/TRIED_PARKED.md` § "Highlights" (nearest entry on the same date, or a parked id) and list the mapping in the report for the owner's sign-off. AC11.7 checks FC's `notebookId`s. Budgets 8 / 12 KB.

## Lane I — integration

Starts in round 7 on its own files; finishes after FE is merged.

1. **Page e2e** (`tests/e2e/p10-article.spec.ts` on `/works/tactical-arena/`): AC1.3, AC1.5 (run the listed existing specs), AC1.7, AC1.8 (load, all hydrated, JS off), AC1.9, AC3.5 (request counts), AC16.4 (CLS), AC16.5 (three round trips, `figuresLive` = "0"), linked numbers (hovering a prose `<data data-fact>` marks the F3 point), and one `@visual` first-screen snapshot (desktop + Pixel 5).
2. **Dist unit** (`tests/unit/article-dist.test.ts`): AC3.4 and AC16.3.
3. **Budgets and Lighthouse.** Under the lock: `bun run build && bun run check:budgets && bun run check:size`, then `npx @lhci/cli autorun` (AC16.2, AC16.4); compare with the pre-flight baseline (first-view JS ± 0.5 KB).
4. **Deploy build + privacy gate** (§ Privacy gate, steps 3–4).
5. **Stryker.** Add `src/lib/sight.ts`, `src/lib/grid.ts`, `src/lib/article-data/*.ts`, `scripts/lib/privacy-scan-core.ts`, `scripts/lib/article-data-core.ts` to `stryker.conf.json` `mutate`; run once: `nice -n 19 bun x stryker run --mutate "<those paths>"`; if a file scores < 80, add tests (in the owning lane's test file, reported) until it passes.
6. **Facts gaps** from P's report: ask the coordinator to run lane N again for the missing keys, then re-sync `facts.json`.
7. **ADR review**: 0052–0060 exist, follow the template (Context · Decision · Alternatives · Consequences · Sources), and agree with the merged code.
8. `packages/specs/reports/10-close.md`: gates table, measured budgets, deferred issues (spec § Deferred) with titles, the PR checklist.

**Done.** Every AC in the spec green locally except `@visual`; the deploy build passes the guards; report committed; then the baseline and PR steps below.

---

## Merge sequence

1. After each lane's report: the coordinator reviews the report, merges `p10/<lane>` into `phase/10-research-article` with `git merge --no-ff`, runs GATE on the merge result under the lock, and pushes the phase branch. Within a pair, merge the lane that finishes first; the second lane merges `phase/10-research-article` into its branch (merge, not rebase) before its own GATE.
2. Lane N's commit is pushed in the notes repo; D2, S and every figure lane sync from the notes commit the coordinator names.
3. After I is merged: § Visual baselines, then the PR.

## Visual baselines

Baselines need the real fonts, so they are rendered on GitHub by `update-visual-baselines.yml` (workflow_dispatch, input `branch`):

```bash
gh workflow run update-visual-baselines.yml --ref main -f branch=phase/10-research-article
gh run watch "$(gh run list --workflow update-visual-baselines.yml --limit 1 --json databaseId -q '.[0].databaseId')"
git pull   # the bot commit "test: regenerate visual baselines"
```

Inspect the new and changed PNGs (`git show --stat HEAD`); a functional failure is never fixed by a baseline. The bot's push does not start CI: push any follow-up commit or re-run CI from the PR. After the merge into `main`, run the workflow once more with `branch=main` only if `main`'s CI reports a baseline diff. If `gh` is not authenticated, the coordinator asks the owner to dispatch it.

## Privacy gate

1. **Every lane** (from D1 on): `bun run check:privacy` exits 0 before its report; dataset syncs refuse to write a file with a hit (exit 2).
2. **Projections are whitelists** (AC3.1 key-set tests) and the F6/F7 public text is hand-written; nothing private can pass through by omission.
3. **I lane, local deploy build:** under the lock, `UTOFME_FIXTURES=false bun run build && bun run check:no-fixtures && bun run check:privacy --dist dist --require-denylist` with the owner's denylist in `PRIVACY_DENYLIST`. If the coordinator does not hold the list, run the notes repo's `article/scripts/privacy_scan.sh` over `packages/site/dist/works/tactical-arena`, `packages/site/dist/_astro`, `packages/site/src/data/article` and the article MDX as the denylist pass, plus `check:privacy --dist dist` without the flag.
4. **I lane, manual read:** open every `src/data/article/*.json` and the MDX frontmatter once; nothing but public data and copy.
5. **PR:** CI's `deploy-build` job green; the owner has set the `PRIVACY_DENYLIST` secret (the deploy fails without it).

## PR and merge

```bash
gh pr create --base main --head phase/10-research-article --title "Phase 10: research article variant (tactical-arena)" --body-file packages/specs/reports/10-close.md
```

- Body: the close report (gates, budgets, ADRs, deferred issues) and the PR checklist: owner sets `PRIVACY_DENYLIST`; owner signs off on the ten notebook highlights and the F6 copy; a fresh read of the copy by someone who did not write it. No mention of tools or authorship.
- CI green (after the baselines). Merge with a merge commit (`gh pr merge --merge`; never squash or rebase). Tag the merge commit and push the tag:

  ```bash
  git switch main && git pull && git tag phase-10 && git push origin phase-10
  ```

- Deploy runs on the push to `main`; watch it (the privacy step must pass). File the deferred issues (`gh issue create -R utof/utofme -l nit` for nits; the spec's § Deferred list for later phases). Update `progress.md`.

## ADRs to write

| ADR | Title | Lane |
|---|---|---|
| 0052 | Research-article variant of the works page | A2 |
| 0053 | Hand-rolled SVG / canvas figures, no chart library | S |
| 0054 | Article data as whitelist projections fetched on visible | D2 |
| 0055 | Privacy scan with a secret denylist | D1 |
| 0056 | Figure tokens and the colour-plus-shape rule | A1 |
| 0057 | Per-island lazy-JS budgets | B |
| 0058 | Sight rule ported to TypeScript; the game is the oracle | S |
| 0059 | Keyed facts, `<N>` and the claims lint | P |
| 0060 | Figure motion and liveness policy | S |

Template: Context · Decision · Alternatives · Consequences · Sources (URLs). 0050 and 0051 stay reserved.

## Failure modes

- **Parity mismatches** (S): fix `sight.ts`; if the table is the fallback (`verifiedAgainstGame: false`), report mismatches as caption issues instead of blocking.
- **A dataset over its cap**: tighten rounding or the whitelist in the spec's spirit and report; never raise a cap silently.
- **R10 over budget**: move pure logic out of the island or merge helpers before asking for a higher limit (spec Risk 5).
- **HTML over 45 KB**: stop and report (spec Risk 3).
- **A missing fact** blocks nothing: the copy omits the number; I collects the list for lane N.
- **Two lanes need the same file**: stop; the coordinator assigns it.
- **A worker stalls**: the coordinator checks the lane branch's commits and report; a lane is resumable from its last green commit.
