# Phase 9: Project view (card → banner morph, video loops, first real projects)

## Goal

Make the home masonry a real portfolio. Click a project's card and its moving media expands into the project page's banner. Below the banner sits a short, concrete page. The first real projects ship with video loops, not GIFs.

1. **Astro 7 first** (D8). Upgrade Astro 6.1.9 → 7.4.x and its integrations, because the `<video>` fixes in Astro's router exist only in 7.x.
2. **Per-route budgets** (D9). A build-time `check:budgets` script replaces the site-wide "site js" gate. The site total becomes report-only, and the two mis-measuring `size-limit` patterns are fixed.
3. **Works schema v2.** The schema gains a lede, status, `started`, typed links (with a `private` flag, D12), loop media on `cover` and `gallery` items, and a `fixture` flag that keeps the mock entries out of the deployed site while tests keep using them.
4. **Loop pipeline.** An offline Bun script wraps ffmpeg and writes content-hashed AV1 + H.264 MP4 loops, posters and a manifest. A flash lint runs inside it.
5. **`/loops/*` Range Worker** (D15). Safari and iOS get `206` responses.
6. **Loop playback.** Loops play only in view, started from JS. One persisted "Pause motion" control covers the whole site (WCAG 2.2.2), reduced-motion users get posters (D16), and the LCP fix lands on `/`.
7. **Card treatment** (D20, D21). A dark-glass caption bar overlays the bottom of the media, flush and full width. On hover or focus the media zooms to 1.05 and the bar lifts to reveal a meta line, both compositor-only. Caption contrast is guaranteed without blur, and the blur is optional and perf-checked. The flagged hover effects read live video frames (closes utof/utofme#121).
8. **Project page** with the Tier S anatomy and a 3:1 banner (D19). A slot for long-form research sections exists and stays empty.
9. **Card → banner morph** through `<ClientRouter />` (D10). Only the clicked card is named, the playing `<video>` is persisted, Back is mirrored, focus is managed, reduced motion is respected, and the page works with no morph at all.
10. **Content, breadth first.** The tactical-arena page ships (D14), plus at least 5 more small projects whose media already exists.
11. **`/lab/loops-ab/`** puts each GIF next to its re-encode (D7). The mock home GIFs switch to video only after the owner has looked.
12. **`/works/code-sandbox/` loads Sandpack on click** (D11).

## Context / invariants

- **Branch** `phase/09-project-view`, stacked on the tip of `phase/08-masonry-mvp` once the in-flight work on that branch is committed (D13 test/baseline update, hover modules). The PR targets `main` after phase 8 merges. The merge commit is tagged `phase-9` (CLAUDE.md § Branching).
- **Stack today.** `astro ^6` resolved 6.1.9. Integrations `@astrojs/mdx ^5`, `@astrojs/react ^5`, `@astrojs/svelte ^7`, `@astrojs/sitemap ^3.7.2`, `@astrojs/rss ^4.0.18`, `@astrojs/check ^0.9.8`, `astro-expressive-code ^0.41`, `astro-pagefind ^1.8.6`. Also `wrangler ^4.85.0` and `size-limit 12.1.0` (`packages/site/package.json`). Output is `static` with no Cloudflare adapter (ADR 0002, ADR 0004). Workers Static Assets only (`packages/site/wrangler.jsonc`, no `main`).
- **Router.** `<ClientRouter />` is mounted site-wide (`src/layouts/_BaseLayout.astro:106`). `CommandPalette` is `transition:persist` (`:137`). Today every card has `transition:name={`card-${id}`}` (`src/components/Card.astro:97`), and the detail `<h1>` carries the same name (`src/layouts/_WorkLayout.astro:55`). This phase removes both.
- **Media today.** `cover: z.object({ src: image(), alt: z.string() })` (`src/content.config.ts:41`). GIF covers bypass `<Picture>` as a plain lazy `<img>` (`src/components/CoverImage.astro`, GIF branch, `loading="lazy"`). The home ships 8 GIFs totalling about 9.0 MB, all lazy, including the LCP candidate (research `_local/research/2026-11-03-22-size-budgets.md` Q3).
- **Hover effects.** `?dither` and `?mosh` are flagged, lazy, `(pointer: fine)`-gated and reduced-motion-aware (`src/pages/index.astro:151-172`, ADR 0040 addendum, ADR 0041). Both read only `HTMLImageElement` (`src/lib/dither/card-dither.ts:179,193,211,743`; `src/lib/datamosh/card-mosh.ts:79,283`), so GIF cards dither a frozen frame 0 (#121). **Other workers are editing these two modules and `packages/site/tests/` right now.** The plan sequences this phase's edits to them after that work lands.
- **Phase 0–8 invariants carry over.** All lefthook steps stay green: biome, prettier, astro check, type-coverage 100 %, knip, depcruise, check:docs. The Axe-zero-violations rule stays. So does the TSDoc rule (`@see` / `@issue` / `Why:` on every export). Light-only stays (ADR 0040), and so do the v21 tokens (ADR 0042).
- **Fixtures.** The 16 mock entries in `src/content/works/` are test fixtures. Specs that reference them include `tests/e2e/detail.spec.ts:22-30`, `cards.spec.ts:98-105`, `image-pipeline.spec.ts`, `sandbox.spec.ts`, `filter.spec.ts`, `footer.spec.ts:10` and `feeds.spec.ts:49`. Gates that reference them: `lighthouserc.cjs` (`/works/code-2/`) and `.size-limit.cjs:118-139`. P9-3 says how they coexist with real projects.
- **Decisions honoured.** DONE: D8, D13, D14, D18 (Valve imagery OK, credit it), D4 (`RL_playground/_local/` media may be used), D7 (A/B page approved; the home switches after the owner looks), D20 (caption overlaid at the bottom of the media), D21 (dark-glass bar, "zoom + reveal" hover). DEFAULTED: D9, D10, D11, D12, D15, D16, D19. **Not built on:** D17 (Workers plan, NEEDS YOU, informational only); D1 and D2 (client work and agency-site stay out); D3, D5 (skip list and private data stay off the site); D6.

## Non-goals / anti-goals

- **No Tier R research sections** on tactical-arena: no TL;DR box, results with CIs, experiment log or playable demo. They are queued in `_local/todo/tactical-arena.md`. The page only leaves a slot for them.
- **No cross-document view transitions** (`@view-transition`, `pageswap` / `pagereveal`). Firefox stable lacks them, and they reload the video (D10; research `…-project-view-transitions.md` Q3, Q5).
- **No clip-path "grow then crop" morph (Option B) and no nested view-transition groups** (Chrome 140-only). This phase ships the frame crossfade (Option A). Option B becomes an issue.
- **No GIF, animated WebP or animated AVIF for new content.** No VP9/WebM third source. No Cloudflare Stream, no R2, no Workers Cache.
- **No new capture tooling** (no headless 3D-viewer recorder, no Godot movie maker). Only existing media is used.
- **No Sätteri port** of the remark/rehype plugins. The site stays on the `unified()` processor.
- **No new hover-effect registry.** The default hover is CSS (D21). `?dither` and `?mosh` stay as the flagged extras.
- **No LHCI or size-limit version bumps, no `_headers` file, no CSP.**
- **No client work, agency-site, qwenasr, or `RL_playground/_local` research notes** (only its screenshots, per D4).
- **No padding copy.** Every number on a project page has a source. No stock headings ("Overview", "Challenge", "Solution").

## Deliverables

Deliverables are numbered P9-1 … P9-12. The "P" keeps them apart from the owner's decision IDs (D7, D9, …). Each deliverable lists its acceptance criteria (AC). Every AC is a Vitest `it`, a Playwright test, a `check:budgets` / `size-limit` / `check:media` assertion, an Axe run, or a grep. The parenthesised "**[V]**" notes give the verification source of each external API named.

### P9-1 · Astro 7 upgrade (D8)

**What.** Upgrade to the latest 7.x and the official integrations together. Fix every breaking change that touches this repo, before any other deliverable.

**Target versions** (`npm view <pkg> version peerDependencies engines`, run 2026-11-03):

| Package | From | To | Why this version |
|---|---|---|---|
| `astro` | ^6 (6.1.9) | ^7.4.5 | latest (released 2026-11-02); engines `node >=22.23.4` |
| `@astrojs/mdx` | ^5 | ^8.1.2 | peer `astro ^7.2.10` |
| `@astrojs/react` | ^5 | ^7.1.2 | engines node ≥ 22.23.4; peer `oxc-transform-react` is optional |
| `@astrojs/svelte` | ^7 | ^9.1.2 | peer `astro ^7.0.0`, `svelte ^5.43.6` (installed 5.55.5) |
| `@astrojs/sitemap` | ^3.7.2 | ^3.7.4 | patch |
| `@astrojs/rss` | ^4.0.18 | ^4.0.19 | patch |
| `@astrojs/check` | ^0.9.8 | ^0.9.12 | patch |
| `astro-expressive-code` | ^0.41 | ^0.44.3 | 0.44.0 "Adds support for Astro v7 and Sätteri v0.9" ([CHANGELOG](https://github.com/expressive-code/expressive-code/blob/main/packages/astro-expressive-code/CHANGELOG.md)) |
| `astro-pagefind` | ^1.8.6 | ^2.0.1 | 1.8.6 peers `astro ^2…^6` only; 2.0.1 "widen astro peer dependency to include v7" ([releases](https://github.com/shishkin/astro-pagefind/releases)) |
| **new** `@astrojs/markdown-remark` | — | ^7.3.5 | needed for `unified()` (see breaking change 3) |

Unchanged: `vitest ^4.1.5`, whose peer `vite ^6 || ^7 || ^8` already covers Vite 8 (npm). Also unchanged: `wrangler`, `size-limit`, `@lhci/cli`, `svelte` and `typescript`.

**Breaking changes that touch this repo.** **[V]** [Upgrade to v7 guide source](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/upgrade-to/v7.mdx), read in full 2026-11-03, with the line numbers below.

1. **Node floor.** `bin/astro.mjs` hard-fails below Node 22.23.4 (`const engines = '>=22.23.4'`, [astro@7.4.5 bin/astro.mjs:31](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/bin/astro.mjs)).
   - CI: change `.github/workflows/ci.yml` and `deploy.yml` `node-version: "22.12"` → `"22.23"`. Node 22.23.4 (2026-10-20) is the newest 22.x on [nodejs.org/dist/index.json](https://nodejs.org/dist/index.json).
   - **The owner's machine runs Node v22.22.3**, so `astro dev/build/preview` will refuse to start (see Open questions).
2. **Vite 8.** `vite.build.rollupOptions` is renamed `build.rolldownOptions`. The object form of `output.manualChunks` was removed and the function form is deprecated in favour of `output.codeSplitting` (**[V]** [Vite migration guide](https://github.com/vitejs/vite/blob/main/docs/guide/migration.md) L292-294, L342; [Rolldown `codeSplitting`](https://rolldown.rs/reference/OutputOptions.codeSplitting)).
   - Migrate `astro.config.mjs:131-140` to `vite.build.rolldownOptions.output.codeSplitting.groups: [{ name: "graph-vendor", test: /…(force-graph|d3-force-3d)…/ }]`.
   - The emitted chunk must still match `dist/_astro/graph-vendor.*.js`, because budget entries glob that name. If Rolldown names the file differently, update the globs in the same commit.
   - Fallback if `codeSplitting` can't reproduce the split: keep the deprecated function form with a `@issue` link.
3. **Sätteri is the default Markdown processor.** The repo runs four remark plugins (`embedRemark`, `wikiLinks`, `remarkMath`, `remarkCallout`) and two rehype plugins (`rehypeKatex`, `brokenLinkRehype`) (`astro.config.mjs:122-130`).
   - Install `@astrojs/markdown-remark` and move them into `markdown: { processor: unified({ remarkPlugins, rehypePlugins }) }`. **[V]** context7 `/withastro/docs` (`reference/markdown-processors/unified.mdx`, v7.mdx L211-261).
   - MDX inherits the processor (`extendMarkdownConfig` defaults to `true`). **[V]** context7 `guides/integrations-guide/mdx.mdx`.
   - Expressive Code registers with whichever processor is active (EC 0.43.1 / 0.44.0 changelog).
4. **`compressHTML` default is now `'jsx'`** (v7.mdx L263-298), which strips whitespace between inline elements. **Spec author's call:** set `compressHTML: true` to keep the v6 output, so no prose or meta row loses spaces in this phase. Moving to `'jsx'` becomes an issue.
5. **Rust compiler.** Unclosed or invalid nesting now errors or passes through unchanged (v7.mdx L126-175). The build must pass. Fix any markup it surfaces; don't suppress it.
6. **`getContainerRenderer()` from integration roots is deprecated.** Import it from `@astrojs/svelte/container-renderer` instead (v7.mdx L306-323). This touches `tests/unit/microformats.test.ts:8` and `tests/unit/sound-toggle.test.ts:30`, which the test worker owns; the plan coordinates the change.
7. **astro-pagefind 2.0 breaking change.** "Search now imports from 'astro-pagefind/components/Search.astro'". That component is in maintenance mode. The README recommends Pagefind 1.5's Component UI with `PagefindConfig.astro` (**[V]** [README](https://github.com/shishkin/astro-pagefind#readme); [v2.0.1 `PagefindConfig.astro`](https://github.com/shishkin/astro-pagefind/blob/v2.0.1/packages/astro-pagefind/src/components/PagefindConfig.astro) imports `@pagefind/component-ui` plus its CSS and renders `<pagefind-config bundle-path>`).
   - **Spec author's call:** rebuild `src/components/SearchBox.astro` as `<PagefindConfig />` + `<pagefind-input>` + `<pagefind-summary>` + `<pagefind-results>`. Those element names come from **[V]** [pagefind.app/docs/components](https://pagefind.app/docs/components/). This keeps a full results page; the Searchbox component is a compact dropdown.
   - The dev-fallback script's `.pagefind-ui__search-input` probe (`SearchBox.astro`) and `tests/e2e/search.spec.ts:74-113` selectors change with it.
8. **Not affected** (grep, 2026-11-03):
   - No `src/fetch.ts` (now reserved, v7.mdx L186-209).
   - No `@astrojs/db`.
   - No removed `astro:transitions` internals (`TRANSITION_*`, `isTransition*`, `createAnimationScope`).
   - No `experimental` flags.
   - `experimental_AstroContainer` keeps its name in 7.4.5 ([container/index.ts:296](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/container/index.ts)).

**Router fixes this upgrade buys** (all 7.x only, from the [Astro CHANGELOG](https://github.com/withastro/astro/blob/main/packages/astro/CHANGELOG.md), via research Q2): non-persisted `<video>` working after navigation (7.2.1, #17603); `transition:persist` working for media (7.2.5, #17750); `<video muted>` staying muted in Chrome (7.3.6, #18163); instant scroll restore on Back (7.4.3). In the 7.4.5 source, `swapBodyElement` recreates every non-live media element and leaves persisted ones alone ([swap-functions.ts:145-237](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/transitions/swap-functions.ts)).

**AC**
- AC1.1 — `bun run build`, `bun run test`, `bun run test:e2e` and all lefthook steps pass on Astro 7.4.x. Expected test edits are limited to the listed breaking changes: selectors, the import path, and `transition:name` cases that P9-9 replaces.
- AC1.2 — `dist/_astro/graph-vendor.*.js` exists, and `/garden/graph/` loads it lazily (P9-2 table).
- AC1.3 — Every page that rendered remark/rehype output before (wikilinks, callouts, KaTeX, embeds, EC code blocks) renders it after: the existing garden, detail and EC e2e cases stay green.
- AC1.4 — `/search/` returns results for a known term and shows a no-results state for nonsense, using Component UI elements. The plan rewrites the existing search cases.
- AC1.5 — `ci.yml` and `deploy.yml` pin Node `22.23`, and `actionlint` stays clean.

### P9-2 · Per-route budgets, `check:budgets`, size-limit cleanup (D9)

**What.** Add `packages/site/scripts/route-budgets.ts` (CLI) and `scripts/lib/route-budgets-core.ts` (pure logic). It parses every `dist/**/index.html` with `linkedom`, which is already a dependency (`src/lib/feed.ts:11`), and walks the JS import graph. It also classifies each route's JS as first-view or lazy, measures HTML, linked CSS and media, applies the media rules, and gates against `packages/site/route-budgets.config.ts`.

**Spec author's call:** budgets live in a typed TS module rather than JSONC, so they are type-checked and need no parser.

**Measurement.**
- JS, HTML and CSS are gzip level 9, the same as `@size-limit/file` (research Q4: `node_modules/@size-limit/file/index.js:29-31`), using `node:zlib` `gzipSync(buf, { level: 9 })`. Media is raw bytes.
- The JS graph follows static `import` / `export … from`, dynamic `import()`, and Vite's `__vite__mapDeps` preload lists.
  - These are the regexes measured in research Q4, where they matched size-limit's site total to rounding. That measurement was taken on the Vite 6 / Rollup output of Astro 6.1.9.
  - Rolldown (Vite 8) may emit different import and preload shapes. So the AC2.1 fixtures are cut from the **post-P9-1** dist.
  - Self-check: the union of all routes' reachable chunks plus explicitly unreferenced chunks must equal `dist/_astro/*.js`. Any chunk the walker cannot place is an error, never silently dropped.
- **Buckets:**
  - **first view:** `script[type=module][src]`, `link[rel~=modulepreload]`, imports of inline module scripts, `astro-island[client=load|only|idle]`;
  - **lazy:** `client=visible|media`, plus `import()` closures not already counted.
  - Each bucket is the transitive closure minus earlier buckets, so a shared chunk counts once per route.
- **Platform** = the chunks in every route's first-view set.

**Rules** (errors unless marked warn):
- R1: first-view JS per route ≤ its class limit. R2: lazy JS ≤ its class limit. R3: HTML and linked CSS ≤ class limits.
- R4: on `/`, the first 2 cards' poster `<img>` are not `loading=lazy`.
  - At most 1 element per route has `fetchpriority=high`: exactly 1 on `/` and on any project page with a `cover`, and 0 elsewhere.
  - Eager poster bytes are ≤ 200 KB in total, and the LCP poster is ≤ 100 KB.
- R5: every `video[data-loop]`:
  - has `muted`, `loop`, `playsinline`, `preload="none"`, `width`, `height`, `aria-hidden="true"`;
  - has no `autoplay` and no `poster` attribute;
  - has ≥ 2 `<source>`, the first `type` containing `codecs="av01.`, the second `codecs="avc1.`.
- R6: loop file sizes. Card and gallery files are ≤ 300 KB (warn > 150 KB); banner files ≤ 1,000,000 B (warn > 600 KB).
- R7: the poster candidate nearest 640 w is ≤ 60 KB for cards; nearest 1280 w ≤ 200 KB for banners; any gallery still candidate ≤ 250 KB.
- R8: a `.gif` > 200 KB may be referenced only inside a `[data-fixture]` element or on `/lab/*`. Fixture cards carry `data-fixture` (P9-7), and so does the `<article>` of a fixture's detail page (`_WorkLayout.astro`).
- R9: no `client:load` / `client:only` island whose closure is > 20 KB, outside `/lab/*`.

**Output.** One markdown table per route (measured · limit · Δ vs `main` when a baseline JSON is present), printed to stdout and appended to `$GITHUB_STEP_SUMMARY`. Exit 1 on any error. Prints the **site-wide unique-JS total as report-only** (D9).

**size-limit cleanup** (`packages/site/.size-limit.cjs`). Fix the two mis-measuring patterns from research Q4/Q5:
- (a) Delete the 13 `* css+html` entries (`:41-62, :118-207`). They sum `dist/_astro/*.css`, i.e. every CSS file on the site, not the CSS the route links; `check:budgets` R3 replaces them.
- (b) Delete the stale `"pagefind ui js"` entry (`:110-116`), which measures `dist/pagefind/pagefind-ui.js`, a file `/search/` never loads. Replace it with `"pagefind runtime (first query)"`, which measures the files the Component UI actually fetches. The exact filenames are read from `dist/pagefind/` after P9-1. Limit 120 KB, gzip for JS and raw for the wasm.
- Delete `"site js (all routes …)"` (`:97-109`), which closes #118. Delete `"/garden/graph/ js"` too; its budget moves into `check:budgets`.
- Keep `feed.xml`, `audio-assets`, `cursor-island`, `hover fx js`, `/lab/datamosh/ js`.

**Wiring.**
- `package.json` gets `"check:budgets": "bun run scripts/route-budgets.ts"`.
- `ci.yml` gets a step after `check:size`.
- No lefthook step, because pre-commit never builds (research Q4).

**AC**
- AC2.1 — Unit fixtures (hand-written HTML plus tiny JS files under `tests/fixtures/budgets/`) prove the bucket classification, closure de-duplication, gzip measurement and each rule R1–R9 (one passing and one failing fixture per rule).
- AC2.2 — `bun run check:budgets` exits 0 on the phase's final build and prints the per-route table plus the report-only total.
- AC2.3 — `.size-limit.cjs` has no entry whose `path` contains `dist/_astro/*.css` and no entry for `pagefind-ui.js`, and `bun x size-limit` passes.
- AC2.4 — A deliberately oversized loop (a test fixture) makes `check:budgets` exit 1, naming the file and the rule.

### P9-3 · Works schema v2 and fixture handling

**Schema delta** (`src/content.config.ts`; `z` from `astro/zod`, Zod 4 as now; `image` from `SchemaContext`):

```ts
const loopSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
const media = (image) => z.object({
  src: image(),                          // the still, or the loop's poster
  alt: z.string().min(1).max(200),
  loop: loopSlug.optional(),             // key into src/data/loops.json (P9-4)
  focus: z.number().int().min(0).max(100).default(50), // banner crop: object-position y in %
});
// baseFields gains:
cover:   media(image).optional(),        // was z.object({ src: image(), alt: z.string() }); backward-compatible
gallery: z.array(media(image).extend({ caption: z.string().min(1).max(100) })).max(5).default([]),
lede:    z.string().min(1).max(120).optional(),   // one sentence, 10–15 words; card description + page lede
status:  z.enum(["shipped", "prototype", "research", "archived"]).optional(),
started: z.coerce.date().optional(),     // meta row prints "2025–2026" when set and the year differs from `date`
links:   z.array(z.object({
           label: z.string().min(1).max(24),
           href: z.url(),
           private: z.boolean().default(false),   // D12: rendered with "private for now"
         })).max(5).default([]),
fixture: z.boolean().default(false),
// video | music | math | writing variants gain: stack: z.array(z.string().min(1)).max(8).optional()
// (code keeps its required `stack`; it is not moved into baseFields, which would override the code variant)
```

Plus one `superRefine` on the union: `started ≤ date`. Content policy (lede word count, body length, gallery size) lives in a content-lint test, not in the schema, so drafts can stay incomplete. **[V]** `z.url()` / `z.iso.datetime()` already work against the Astro-bundled Zod (`content.config.ts:47,125`); `z.discriminatedUnion` is in use (`:44`).

**Card description field: `lede`, falling back to `summary`.**
- `summary` (≤ 240 chars) stays the meta description, feed text and Pagefind summary. It is too long for a one-line bar.
- Real projects set `lede`. Mock fixtures have only `summary` and show it clamped to one line.

**Fixtures.** **Spec author's call: unlisted in the deployed site, unchanged for tests and local viewing.**
- All 16 mock entries get `fixture: true`.
- A new `astro:env` field `UTOFME_FIXTURES: envField.boolean({ context: "server", access: "public", default: true })`, read through `astro:env/server`. **[V]** context7 `/withastro/docs`: `reference/modules/astro-config.mdx` (`envField.boolean`), `guides/environment-variables.mdx`.
- When it is `false`, fixtures are filtered out of `/`, `/works/`, both feeds and `getStaticPaths`, so their detail pages are not built at all. `/lab/*` pages may still import mock media directly.
- `deploy.yml` builds with `UTOFME_FIXTURES=false`, then runs a guard step that fails the deploy if `dist/works/code-1/` exists or any `[data-fixture]` element is in `dist/index.html`.
- CI, local builds and dev keep the default `true`, so every existing e2e, LHCI and size check that targets `/works/code-2/` and friends keeps working. Locally the home still shows the mock GIFs (D7).

**Listing helper.**
- `listWorks()` in `src/lib/works.ts` gains `includeFixtures` and a pure `prevNext(entries, id)`.
- A thin `src/lib/works-collection.ts` (Astro-only) reads `UTOFME_FIXTURES` and becomes the single entry point used by `index.astro`, `works/index.astro`, `works/[...slug].astro`, `feed.xml.ts` and `feed/works.xml.ts` (today each calls `getCollection("works")` directly).

**AC**
- AC3.1 — fast-check properties (`@fast-check/vitest` `test.prop`, the pattern in `tests/unit/datamosh-engine.test.ts:432`):
  - valid arbitrary entries `parse`;
  - each single-field corruption (bad slug, focus ∉ [0, 100], caption > 100 chars, lede > 120 chars, > 5 links or gallery items, bad URL, `started` > `date`) fails `safeParse` with that path;
  - `fixture` defaults to `false`, `focus` to 50, `links` and `gallery` to `[]`.
- AC3.2 — Every existing fixture still parses unchanged (backward compatibility of `cover`).
- AC3.3 — `listWorks(…, { includeFixtures: false })` never returns an entry with `fixture: true` (property test). `prevNext` returns neighbours in home order and `undefined` at the ends.
- AC3.4 — A content-lint unit test reads `src/content/works/*.mdx` with `gray-matter` (already a devDependency). Every non-draft, non-fixture entry with `cover.loop` must have:
  - a `lede` of 6–20 words;
  - a body of 40–120 words, excluding MDX imports and comments;
  - a gallery of 3–5 items;
  - `alt` on every media item;
  - a source comment (`{/* src: … */}`) in the same paragraph as each digit-bearing claim.
- AC3.5 — The deploy guard step exists in `deploy.yml` and fails on a seeded leak in a dry run (documented in the plan).

### P9-4 · Loop encode pipeline (`media:encode`, `check:media`)

**What.**
- `packages/site/scripts/encode-loops.ts` (CLI) plus `scripts/lib/loops-core.ts` (pure: recipe schema, filtergraph builder, codecs-string derivation, flash-window counter, file naming, prune planning).
- It wraps the system `ffmpeg` / `ffprobe` (local ffmpeg 6.1.1 with `libsvtav1`, `libx264`, `ffv1`, and the `concat` / `signalstats` / `scale` / `crop` / `pad` / `fps` / `setsar` filters, verified with `ffmpeg -encoders` and `-filters` on 2026-11-03).
- Outputs are committed, so builds and CI never need ffmpeg.

**CLI contract.**

```
bun run media:encode [<slug>...] [--all] [--force] [--dry-run] [--media-root <dir>]
bun run check:media                      # = encode-loops.ts --check; no ffmpeg needed
```

- `--media-root` defaults to env `UTOFME_MEDIA_ROOT`. Encoding requires it, `--check` does not. Recipe paths are **relative** to it, so no absolute local path (or account name) is ever committed.
- **Recipe** at `packages/site/media/recipes/<slug>.json`, validated by `recipeSchema` (Zod):
  - `slug`;
  - `kind: "montage" | "slideshow" | "transcode"`;
  - `aspect: "16:9"` (the only value this phase; spec author's call so the card ↔ banner geometry stays uniform);
  - `fps` (30 for montage/transcode, 10 for slideshow, chosen so `hold × fps` is an integer: research §3);
  - `sizes ⊆ ["card", "banner"]`;
  - `shots[]: { src, start?, duration (0.5–2.0 s), fit: "cover" | "contain", crop?: {x,y,w,h} }` (montage and transcode);
  - `slides[]: { src, hold (0.8–2.0 s), fit }` (slideshow);
  - `poster: { at: seconds }`;
  - `stills[]: { src, crop?, out }`, i.e. gallery images copied and optionally cropped into `src/assets/works/<slug>/`.
- **Master.** Build one lossless FFV1 master in a temp dir. Each input is normalised with `fps → scale (force_original_aspect_ratio=increase|decrease) → crop|pad → setsar=1 → format=yuv420p` and then joined with `concat=n=N:v=1:a=0`. That gives hard cuts, no `xfade`, no audio (research §3; [FFmpeg concat](https://ffmpeg.org/ffmpeg-filters.html#concat)).
- **Encodes** (defaults from the research's local measurements; overridable per recipe):

  | Size | Frame | AV1 (first `<source>`) | H.264 (second `<source>`) |
  |---|---|---|---|
  | card / gallery | 720×405 | `-c:v libsvtav1 -preset 4 -crf 38` | `-c:v libx264 -preset veryslow -crf 26 -profile:v high` |
  | banner | 1280×720 | `-c:v libsvtav1 -preset 4 -crf 36` | `-c:v libx264 -preset veryslow -crf 24 -profile:v high` |

  All encodes use `-an -pix_fmt yuv420p -movflags +faststart`, and slideshows add `-tune stillimage` to x264. ([FFmpeg mov/mp4 muxer](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv); the local `libsvtav1` wrapper accepts `-crf 0–63` and `-preset -2–13`, per `ffmpeg -h encoder=libsvtav1`.)
- **Codecs strings** are derived from `ffprobe -show_entries stream=profile,level`:
  - H.264 High@3.0 → `avc1.64001E`; @3.1 → `avc1.64001F`.
  - AV1 Main, `seq_level_idx` n, 8-bit → `av01.0.<nn>M.08`.
  - Format **[V]**: [MDN codecs parameter](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter); local probes in research §1.
- **Outputs:**
  - `public/loops/<slug>/<size>.<sha256-8 of file bytes>.<av1|h264>.mp4`;
  - `src/assets/loops/<slug>/poster.png` (lossless frame at `poster.at`; Astro emits AVIF/WebP from it);
  - `src/assets/works/<slug>/<out>.png` for stills;
  - `src/data/loops.json`, sorted keys, validated by `loopsManifestSchema` (Zod) in `src/lib/loops/manifest.ts`:
    `{ [slug]: { recipe: sha8, durationS, fps, aspect, card: Size, banner: Size | null, posterPath, flash: { maxPerSecond } } }`, where
    `Size = { width, height, sources: [{ url, type, bytes }] }` and `type` = `video/mp4; codecs="…"`.
  - Superseded hashed files for a re-encoded slug are deleted (prune), so `public/loops/` holds no orphans.
- **Flash lint** (WCAG 2.3.1, conservative whole-frame approximation; research §8):
  - mean luma (`signalstats` YAVG) per master frame, including the last → first wrap;
  - a "transition" is a change ≥ 10 % of full scale, and a flash is a pair of opposing transitions;
  - fail if any 1 s sliding window holds more than 3 flashes. **[V]** [Understanding SC 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
- **Budgets at encode time:** fail when a card or gallery file is > 300 KB or a banner file > 1 MB; warn over 150 KB / 600 KB.
- **Skip:** if the recipe hash and outputs are unchanged, do nothing unless `--force`.
- **Exit codes:** 0 ok · 1 recipe or validation error · 2 ffmpeg/ffprobe failure · 3 size budget · 4 flash lint · 5 `--check` mismatch (missing file, byte or hash mismatch, orphan file).
- **Wiring:**
  - `package.json` scripts `media:encode` and `check:media`;
  - `ci.yml` runs `check:media` before `build`;
  - `lefthook.yml` gets a `check-media` job with `glob: "packages/site/{public/loops/**,src/data/loops.json,media/recipes/**}"`, so it runs only when loop files are staged.

**AC**
- AC4.1 — Unit (pure core):
  - recipe schema accept and reject;
  - the filtergraph string for a 3-shot montage equals a golden string;
  - `codecsFromProbe` maps the four probe fixtures to the four strings above;
  - the flash counter fails a synthetic luma series with 4 opposing ≥ 10 % flips inside 1 s and passes one with 3, and the wrap is counted;
  - prune planning lists exactly the superseded files.
- AC4.2 — fast-check: for any luma series, adding a frame never decreases the max-flashes-per-window (monotonicity). `loopsManifestSchema` round-trips (`parse(JSON.parse(JSON.stringify(x)))`).
- AC4.3 — `bun run check:media` exits 0 on the committed tree and 5 on a fixture tree with one deleted file.
- AC4.4 — Every slug referenced by any `cover.loop` or `gallery[].loop` exists in `loops.json` (unit test over content), and every manifest URL resolves to a file under `public/`.

### P9-5 · `/loops/*` Range Worker (D15)

**Why.** "When a request for a static asset includes a `Range` header, Workers returns `200 OK` with the full file instead of `206 Partial Content` … Some clients need range support, for example Safari when it plays video." The documented workaround is `run_worker_first` plus `env.ASSETS.fetch()`, returning a `206` (**[V]** [Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), updated 2026-11-03, fetched this session). WebKit needs range support ([WebKit bug 211323](https://bugs.webkit.org/show_bug.cgi?id=211323), research §5).

**wrangler shape** (`packages/site/wrangler.jsonc`):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "utofme",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-04-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/loops/*"]
  }
}
```

**[V]** [Static Assets binding docs](https://developers.cloudflare.com/workers/static-assets/binding/), updated 2026-10-12:
- `run_worker_first` takes `boolean` or "an array of route patterns" with `*` globs and `!` negation, at most 100 entries.
- `env.ASSETS.fetch(request: Request | URL | string): Promise<Response>`, and "Requests made through this method have `html_handling` and `not_found_handling` configuration applied".
- The array form shipped in workers-sdk PR #9509 ("add static routing options via 'run_worker_first'"; [wrangler CHANGELOG](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md) L9437), which is older than the pinned `wrangler ^4.85.0`.
- `main` is "The path to the entrypoint of your Worker" ([configuration docs](https://developers.cloudflare.com/workers/wrangler/configuration/), updated 2026-10-29). The docs don't say how relative paths resolve. The repo already deploys `--config packages/site/wrangler.jsonc` from the repo root with `"directory": "./dist"` (`deploy.yml:50`), which shows paths resolve relative to the config file.

**Worker** (`packages/site/worker/index.ts`, ≤ 80 lines; pure range logic in `src/lib/range.ts`). It is typed against a local `interface Env { ASSETS: { fetch(input: Request | URL | string): Promise<Response> } }` with DOM-lib `Request` / `Response`, so no `@cloudflare/workers-types` dependency is needed. `tsconfig.json` `include` and knip `entry` / `project` gain `worker/**/*.ts`. Behaviour, per [RFC 9110 §14](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests):

| Request | Response |
|---|---|
| path not under `/loops/` | `env.ASSETS.fetch(request)` unchanged (this only happens if routing changes) |
| method other than GET or HEAD | `405`, `Allow: GET, HEAD` |
| asset response not `200` | passed through (404 page etc.) |
| no `Range`; or multi-range; or `If-Range` ≠ asset `ETag` | `200`, full body |
| `bytes=a-b`, `bytes=a-` or `bytes=-n`, satisfiable | `206`, `Content-Range: bytes s-e/len`, `Content-Length: e-s+1` |
| unsatisfiable | `416`, `Content-Range: bytes */len` |
| HEAD | same status and headers, no body |

- Every 200/206/416 carries `Accept-Ranges: bytes`, the asset's `Content-Type` and `ETag`, `Cache-Control: public, max-age=31536000, immutable` (the files are content-hashed) and `X-Content-Type-Options: nosniff`.
- The Worker must set `Cache-Control` itself, because `_headers` "are not applied to responses generated by your Worker code" ([Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/), via research §5).
- The asset is fetched with a clean `GET` (no Range or conditional headers) and buffered. Loops are ≤ 1 MB; anything over 25 MiB streams through as a `200`.

**AC**
- AC5.1 — Vitest unit tests on the handler with a fake `ASSETS`: every row of the table, with exact status, headers and body bytes.
- AC5.2 — fast-check on `src/lib/range.ts`, for any length L ∈ [1, 2²⁴] and any header string:
  - a 206 body is the byte slice `[s, e]`, with `0 ≤ s ≤ e < L` and `Content-Length = e − s + 1`;
  - a 416 happens iff no satisfiable range exists;
  - malformed input yields a 200, never a throw.
- AC5.3 — `deploy.yml` adds a post-deploy probe like the feed probe (`deploy.yml:56-68`): `curl -H 'Range: bytes=0-1'` on one manifest URL must return `206` with `Content-Range: bytes 0-1/…`.
- AC5.4 — `bun run preview:worker` (`wrangler dev` over `dist/`) is documented as the manual Safari / iOS check. It is not in CI.

### P9-6 · Loop playback, "Pause motion" (D16), LCP fix

**Markup** (new `src/components/LoopMedia.astro`). Props: `media` (a `cover` or `gallery` item), `slug`, `size: "card" | "banner" | "gallery"`, `sizes`, `eager?`, `priority?`. It renders:

```html
<div class="loop-media" data-vt-frame data-loop-frame="card|banner|gallery" style="--focus:50%">
  <!-- poster underlay: carries the accessible name, works with no JS, gets srcset/AVIF -->
  <Picture src={poster} formats={["avif","webp"]} widths=[…] sizes alt={alt} priority? loading=… />
  <video data-loop data-loop-size="card|banner|gallery" muted loop playsinline preload="none"
         width height aria-hidden="true" transition:persist="loop-<slug>"  {/* card + banner only */}>
    <source src="/loops/<slug>/<size>.<hash>.av1.mp4"  type='video/mp4; codecs="av01.0.nnM.08"'>
    <source src="/loops/<slug>/<size>.<hash>.h264.mp4" type='video/mp4; codecs="avc1.64001X"'>
  </video>
  <!-- banner only: <template data-upgrade> holding the banner <video> markup (P9-9 upgrade) -->
</div>
```

- **No `poster` attribute** (spec author's call). A poster attribute would download a second, single-format still. The `<Picture>` underlay is the poster: it has a responsive srcset, `priority` works on it, and the alt text lives there.
- The video is `opacity: 0` until it first presents a frame. The controller then sets `data-ready`, so an unloaded video never covers the poster, whatever each engine paints for an empty `<video>`.
- **[V]** `<Picture priority>` sets `loading="eager" decoding="sync" fetchpriority="high"` (context7 `/withastro/docs` `reference/modules/astro-assets.mdx`, since 5.10). `transition:persist="<id>"` pairs elements by id, which is the docs' video example ([view-transitions.mdx L98-150](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/view-transitions.mdx)). It compiles to `data-astro-transition-persist` ([swap-functions.ts:9](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/transitions/swap-functions.ts)). `muted` + `playsinline` with no audio track is required for muted inline play on iOS ([WebKit iOS video policies](https://webkit.org/blog/6784/new-video-policies-for-ios/)).
- GIF covers without `loop` keep the existing `CoverImage.astro` path, and stills use `<Picture>`.
- Every card and banner wraps its media in the same `.loop-media[data-vt-frame]` clipping wrapper: loop, still, GIF or thumb fallback alike. So every card can morph, and the P9-7 zoom has one target.

**Controller** (`src/lib/loops/controller.ts`; dependencies injected so happy-dom tests can fake them).
- `mountLoops(root)` runs on `astro:page-load` and disposes on `astro:before-swap`. **Disposal never pauses a video**: the persisted node must keep playing through the morph.
- Policy: `allowed = !paused && !saveData`, where `paused` comes from `motion.ts` (below) and `saveData = navigator.connection?.saveData === true` (Chromium only; research §2).
- An `IntersectionObserver` (`threshold: 0.25`, `rootMargin: "200px 0px"`) plays intersecting loops when allowed and pauses the rest. `play()` rejections (iOS Low Power Mode, `NotAllowedError`) leave the poster showing.
- `visibilitychange` to hidden pauses all loops. Pausing leaves the current frame, which satisfies technique G4.
- On a full page load, no loop bytes are requested before the window `load` event. On SPA navigations they may start immediately. **[V]** IntersectionObserver, `HTMLMediaElement.play()` (Promise) and `requestVideoFrameCallback` (Chrome 83, Firefox 132, Safari 15.4; [BCD](https://github.com/mdn/browser-compat-data/blob/main/api/HTMLVideoElement.json), research §7) are stable platform APIs.

**Pause motion** (`src/lib/motion.ts` plus `src/components/MotionToggle.astro`, no island; a small inline script as in ADR 0035).
- Markup: `<button type="button" data-motion-toggle aria-pressed>Pause motion</button>`.
- Storage key `localStorage["utofme:motion"] ∈ {"paused", "playing"}`. When the key is absent, the effective state follows `prefers-reduced-motion: reduce`. So **reduced-motion users get posters by default** and can opt in.
- The toggle sets `html[data-motion="paused"]`, which also disables the P9-7 hover zoom.
- It is rendered in the top header of `/`, `/works/`, every project page and `/lab/loops-ab/`, **before the first loop in tab order** (spec author's call; "a mechanism … that does not tie up the user or the focus", technique G186, [Understanding SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)).
- The paused state survives reloads and SPA navigations, and live changes to the `prefers-reduced-motion` media query are honoured.

**LCP on `/`.** The first card's poster gets `priority`. The second card's poster is `loading="eager"` without high priority. Every other card is lazy (research Q3: "Never lazy-load the LCP image", [web.dev Optimize LCP](https://web.dev/articles/optimize-lcp)). On project pages the banner poster gets `priority`.

**AC**
- AC6.1 — Unit (happy-dom, fakes):
  - only intersecting and allowed loops play;
  - pausing leaves `currentTime` unchanged;
  - with reduced motion and no stored key, nothing plays and `aria-pressed="true"`;
  - a stored `"playing"` value overrides reduced motion;
  - disposal never calls `pause()`;
  - a rejected `play()` leaves `data-ready` unset.
- AC6.2 — Truth table for `motion.ts` (storage × media query → paused), checked exhaustively.
- AC6.3 — e2e:
  - clicking the toggle pauses every `video[data-loop]`, sets `aria-pressed="true"`, and stays paused across a reload and a ClientRouter navigation;
  - the toggle is operable with the keyboard (Tab, Enter);
  - Axe stays clean.
- AC6.4 — e2e:
  - after scrolling, loops outside the viewport are `paused`;
  - on a fresh load of `/`, no `.mp4` request starts before `loadEventEnd` (`performance.getEntriesByType("resource")`);
  - the first card's poster `<img>` has `fetchpriority="high"` and no `loading="lazy"`.
- AC6.5 — e2e with `emulateMedia({ reducedMotion: "reduce" })`: no loop plays and the posters are visible.

### P9-7 · Card treatment: dark-glass caption + "zoom + reveal" (D20, D21), video-frame hover source (#121)

D21 is decided: this is the **default** card treatment, in plain CSS. There is no hover-effect registry. `?dither` and `?mosh` stay as the flagged extras. Values come from the owner's reference (`_local/proposals/2026-11-03-project-view/show-me-card-variants.html`: `.cap`, `body[data-fill="dark"]`, `.v1`), tuned with `_local/research/2026-11-03-22-card-hover-effects.md` (cited below as "hover notes Qn").

**Structure** (`variant="media"` in `Card.astro`):

```html
<a class="card card--media" data-work-slug data-fixture? …existing data-* + Pagefind spans…>
  <div class="card-figure">                     <!-- position:relative; overflow:hidden; NOT a Backdrop Root -->
    <div class="loop-media" data-vt-frame>…</div> <!-- clipping wrapper; its CHILDREN scale, never the wrapper -->
    <div class="card-cap" data-cap>             <!-- dark glass bar: absolute; inset-inline:0; bottom:0; radius 0 -->
      <h2 class="card-cap__t">…</h2><p class="card-cap__d">…</p><p class="card-cap__m">…</p>
    </div>
  </div>
</a>
```

- The bar is a **sibling** of the named media frame, so it is never baked into the media's snapshot (P9-9).
- Stacking order: media < flagged hover canvas < bar.
  - The overlay canvas is `position:absolute; z-index:1` in the `<li>` (`card-dither.ts:601-606`, `card-mosh.ts:270,288`). The bar sets `z-index: 2`.
  - `.card-figure` gets no z-index, so it creates no stacking context and the two compare in the `<li>`'s context.
- Description = `lede ?? summary`, one line with `text-overflow: ellipsis`. The full text stays in the DOM.
- Meta line = year (or the `started`–`date` years) · up to 3 `stack` items.
- Existing attributes stay untouched: `data-test`, `data-type`, `data-tags`, `data-preview-target`, `data-title`, `data-date`, `data-summary`, and the hidden Pagefind spans (`Card.astro:86-132`).

**Contrast: every glyph in the bar is ≥ 4.5:1 over any frame, without `backdrop-filter`** (hover notes Q3).

- **Tokens** in `src/styles/tokens.css`:
  - `--caption-bg: rgb(16 16 16 / 0.62)`;
  - `--caption-fg: #ffffff` for **all** bar text (title, description, meta);
  - `--caption-blur: blur(10px) saturate(1.3)`.
- **No grey or semi-transparent text in the bar.** Hierarchy comes from size and weight:
  - title: Geist 15 px / 600;
  - description: Geist 13 px / 400;
  - meta: Geist Mono 12 px / 400 with `tabular-nums`.
- **Why α .62.** The owner's reference uses `.58`, which keeps pure `#fff` at only 4.65:1 over a pure-white frame. Any dimmer text fails at that alpha (`#f5f5f5` 4.26:1; `#fff` at 72 % opacity 3.27:1).
- **Worst case at α .62.** The bar composites to ≈ `rgb(107,107,107)` over white, which gives **5.34:1** for `#fff`; over black it is far higher (hover notes Q3 table; spec author's arithmetic agrees).
- **Why white frames matter.** They are common here: the plot slideshows, the Pluto pages and the Wikimedia diagrams.
- **The model.**
  - Gamma-encoded sRGB source-over compositing ([Compositing L1 §5.1](https://www.w3.org/TR/compositing-1/#simplealphacompositing)).
  - Relative luminance per [WCAG 2.2](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance), unrounded ([Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
  - Blur can't raise the worst case, because a white frame blurs to white. So the fill alone carries the guarantee, and the e2e pixel check (AC7.1b) confirms the compositing assumption that the hover notes left unverified.

**`backdrop-filter` is optional polish, never part of the guarantee** (hover notes Q4).

- **Spec author's default:** the blur applies **only to the hovered or focused card's bar**: `.card--media:is(:hover, :focus-visible) .card-cap { backdrop-filter: var(--caption-blur) }`.
  - It sits inside `@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))`.
  - It is never listed in a `transition` (the radius is never animated).
  - Why: over a playing `<video>` the bar is re-blurred on every decoded frame ([Chrome "Animating a blur"](https://developer.chrome.com/blog/animated-blur/)), and the owner's Chrome has no GPU.
- **No Backdrop Root between the bar and the media.** The bar's ancestors, up to and including `.card-figure`, carry no `filter`, `opacity < 1`, `mask*`, `clip-path`, `mix-blend-mode` ≠ normal, or `will-change` naming any of them. Otherwise the bar would stop seeing the video ([Filter Effects 2, Backdrop Root](https://drafts.csswg.org/filter-effects-2/)).
- **Perf check (required before merge).**
  - A `@perf`-tagged Playwright spec (excluded from CI with `--grep-invert @perf`) runs Chromium with the owner's no-GPU flags (`--disable-software-rasterizer --use-gl=disabled`, per `_local/handoff.md`) via `test.use({ launchOptions: { args } })`.
  - It records `requestAnimationFrame` intervals for 3 s, with 4 loops playing and one card hovered, once with `--caption-blur` and once with `none`.
  - `package.json` `test:e2e` gains `--grep-invert @perf`, and a separate `test:perf` script runs the spec.
  - Rule: if the blur raises the p95 frame interval by more than 4 ms, ship `--caption-blur: none`.
  - The numbers and the choice go into ADR 0050.

**Hover "V1 zoom + reveal"** (timings from hover notes Q2; they replace the reference's 700 ms and grid-rows values):

| What | Enter | Leave |
|---|---|---|
| Hover-intent delay | 50 ms `transition-delay` | none |
| Media zoom: the frame's **children** go to `scale(1.05)` (the owner's ceiling is 1.06) | 560 ms `cubic-bezier(0.23, 1, 0.32, 1)` | 340 ms, same curve |
| Bar reveal: rest `translateY(var(--cap-meta-h))`, hover `translateY(0)`, clipped by `.card-figure` | 220 ms `var(--ease-out)` | 160 ms |
| Meta line opacity 0 → 1 | 160 ms, 60 ms delay | 160 ms, no delay |

- **Compositor-only.** Only `transform` and `opacity` animate; there is no `height`, `grid-template-rows` or `interpolate-size` (Chrome-only per BCD, hover notes Q2).
- `--cap-meta-h` is a fixed CSS length: meta line-height plus gap. No JS.
- **Gating.**
  - Hover rules live inside `@media (hover: hover) and (pointer: fine)`.
  - A separate, **ungated** `.card--media:focus-visible` rule gives keyboard users the same end state on any device.
- **Touch (`hover: none`).** No zoom and no translate. The bar shows title + description + meta statically. Loops play in view (P9-6).
- **Reduced motion, or `html[data-motion="paused"]`.** No scale and no translate. The meta line is always visible. No transitions except opacity.
- The focus ring stays on the `<a>` (`box-shadow`, `Card.astro:219`), outside the clipped figure, so the zoom can't obscure it.

**Flagged hover effects read video frames (#121).**

- A helper `mediaOf(card): HTMLVideoElement | HTMLImageElement | null` returns the card's `video[data-loop][data-ready]` while it plays, and otherwise the poster or cover `<img>`.
- `card-dither.ts` and `card-mosh.ts` widen their source type to `HTMLImageElement | HTMLVideoElement`, draw it as a `CanvasImageSource`, and take geometry from `videoWidth` / `videoHeight`. `drawImage(video)` draws the current frame once `readyState > 1` ([MDN drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)).
- Both modules hide their overlay canvas on `astro:before-preparation`, which runs before the old snapshot. Disposal stays idempotent.
- They **must not** reset the CSS zoom there (P9-9; Safari snapshot bugs).
- `gif-source.ts` stays for GIF cards.

**AC**

- **AC7.1a** — `tests/unit/caption-contrast.test.ts` parses `--caption-bg` and `--caption-fg` from `tokens.css` (a regex on the declarations), so any token edit is re-checked. It then:
  - computes worst-case contrast over white and black underlays, asserting ≥ 4.5 (expected ≈ 5.34 over white);
  - fast-checks random `fc.record({ r, g, b })` underlays, asserting ≥ 4.5 for every one;
  - asserts that the reference `.58` with `#f5f5f5` text **fails**, which proves the model discriminates.
- **AC7.1b** — An e2e test in the desktop context:
  - replaces one card's media with a pure-white `<div>`;
  - forces `backdrop-filter: none` on the bar;
  - screenshots a 4×4 px clip inside the bar, away from glyphs;
  - decodes it with `sharp` (already a dependency: `packages/site/package.json` `"sharp": "^0.34.5"`; `raw().toBuffer({ resolveWithObject: true })`, per the [sharp output API](https://sharp.pixelplumbing.com/api-output#raw), not re-fetched).
  - Assertions: every channel is 107 ± 3, and the computed contrast against `#fff` is ≥ 4.5.
- **AC7.2** — e2e in the desktop context `{ isMobile: false, hasTouch: false }` (the pattern in `tests/e2e/datamosh.spec.ts:12-17`):
  - the bar spans the media width (±1 px) and its bottom equals the media's bottom (±1 px);
  - at rest the meta line is outside the figure's clip;
  - on hover, and on keyboard focus, once `card.getAnimations({ subtree: true })` have finished, the bar's computed transform is the identity and the frame child's transform is `scale(1.05)` (matrix check);
  - under reduced motion the media transform is `none` on hover and the meta line is visible at rest;
  - on the Pixel 5 project (touch) the meta line is visible at rest and there is no zoom.
- **AC7.3** — e2e: walking from the bar up to `.card-figure`, `getComputedStyle` shows `filter: none`, `opacity: 1`, `mask-image: none`, `clip-path: none` and `mix-blend-mode: normal`. The bar's `transition-property` does not include `backdrop-filter`.
- **AC7.4** — Integration (container): a card renders `lede` when present and falls back to `summary`. `tests/unit/card-pagefind-attrs.test.ts` stays green.
- **AC7.5** — e2e with `?dither` on a video card: two samples of the overlay canvas taken 500 ms apart differ while the video plays (#121). This relies on the AV1 source, because Playwright's Chromium lacks some proprietary codecs ([playwright.dev/docs/browsers](https://playwright.dev/docs/browsers)).
- **AC7.6** — e2e with `?dither`: the overlay canvas is `display: none` or detached when `astro:after-preparation` fires on a card click, while the media child's transform at that moment is unchanged from its pre-click value.
- **AC7.7** — The `@perf` measurement and the blur decision are recorded in ADR 0050 before merge.

### P9-8 · Project page (Tier S anatomy, banner D19)

**Anatomy** (research `…-project-page-anatomy.md` Q7, Tier S), in this order on `/works/<slug>/` (`_WorkLayout.astro` rewrite):

1. **Banner.** `LoopMedia size="banner"`, `aspect-ratio: 3 / 1` at ≥ 700 px wide and `16 / 9` below (D19; prototype `_local/proposals/2026-11-03-project-view/show-me-project-view.html` `.banner`).
   - Height capped at `60vh` (the research range is 55–65 vh), with `object-fit: cover` and `object-position: 50% var(--focus)`.
   - Contained to `max-width: 1280px`, the same as the banner encode width (spec author's call).
   - No text over it. The banner frame carries `data-vt-hero` statically (P9-9).
   - Projects without `cover` fall back to the existing thumb.
2. **Title + lede.** `<h1 tabindex="-1">`, then `<p class="lede">` with 10–15 words, in "**X** is a Y that Z" form, including a result number when one exists. When `lede` is absent, the layout renders `summary`.
3. **Meta row** (one line, mono, `ProjectMeta.astro`): year or range · status · up to 4 `stack` items · links.
   - Links render as `Label ↗`.
   - A `private: true` link renders as the link followed by `<span>private for now</span>` (D12).
   - When `links` is empty, the legacy `repo` / `youtube` / `listen` / `arxiv` / `pdf` "Open external" link (`_WorkLayout.astro:38-66`) is kept.
4. **Body.** The MDX `<Content />`, 40–120 words, with no stock headings.
5. **Gallery.** `Gallery.astro` renders 3–5 `<figure>`s. Loops use `LoopMedia size="gallery"` (card-size encode, no persist); stills use `<Picture>`. Each has a `<figcaption>` with a claim-style caption of ≤ 100 chars.
6. **Research slot.** `<slot name="research" />`, wrapped in `<section>` only when `Astro.slots.has("research")` (**[V]** [astro-syntax.mdx `Astro.slots.has()`](https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/astro-syntax.mdx)). Nothing fills it this phase.
7. **Prev / next + "All projects".** Text links from `prevNext()`, with no media. A text-only link can never collide with a persisted id.
8. Webmentions and microformats stay as they are (`h-entry`, `u-url`, `Webmentions` outside `<article>`).

The meta description is `summary ?? lede`. The `transition:name` on the `<h1>` (`_WorkLayout.astro:55`) is removed.

**AC**
- AC8.1 — e2e at 1440×900 (desktop context) and on the Pixel 5 project, for `/works/tactical-arena/`: the `<h1>` and lede bounding boxes lie inside the first viewport (`bottom ≤ innerHeight`), and the banner's computed aspect is 3:1 (±2 %) on desktop and 16:9 (±2 %) on Pixel 5 (393 px wide).
- AC8.2 — e2e: the meta row shows "private for now" next to the tactical-arena Code link, and every link has an accessible name.
- AC8.3 — e2e: the gallery has 3–5 `figure`s, each with a non-empty `figcaption`, and every `img` has non-empty `alt`.
- AC8.4 — Axe reports zero violations on every real project page, `/`, `/works/` and `/lab/loops-ab/`.
- AC8.5 — The visual-regression baselines below exist and pass.

### P9-9 · Card → banner morph (D10)

**Two names, one module.**
- `hero` is the media, set by the attribute rule `[data-vt-hero] { view-transition-name: hero; }`.
- `card-caption` is the clicked card's caption bar, set by `[data-vt-cap] { view-transition-name: card-caption; }`.
- Both rules live in `src/styles/transitions.css`. The `transition:name` directive is not used, which removes Astro's per-element `<style>` injection (research Q6).
- **`hero` goes on the media's clipping wrapper `[data-vt-frame]`, never on the scaled `<video>` or `<img>`.**
  - The wrapper's image is captured with the hover zoom and the clip already baked in, so the morph starts exactly as the user sees the card.
  - Naming the scaled child would carry its `scale(1.05)` into the group's start transform without the ancestor clip, and the group would pop about 5 % larger than the card ([css-view-transitions-1 §7.3](https://drafts.csswg.org/css-view-transitions-1/); hover notes Q5).
- **The caption gets its own name** so that it neither stretches with the media nor leaves a dark rectangle in the root snapshot (hover notes Q5).
  - Its name is set only on the clicked card.
  - The bar follows the frame in DOM order, so its group paints above `hero`.
  - It has no counterpart on the project page: it is an old-only group that fades out quickly.
- **Never reset the hover zoom before capture.** `before-preparation` does not touch the card's transforms. Safari snapshots a stale transform when a view transition starts during a running transform transition ([WebKit 310181](https://bugs.webkit.org/show_bug.cgi?id=310181)), and it upscales scaled elements from layout size ([WebKit 317712](https://bugs.webkit.org/show_bug.cgi?id=317712)) (both via hover notes Q5, search summaries).
- The project page's banner frame carries `data-vt-hero` statically.
- Cards get their marks from `src/lib/vt/hero-morph.ts`, imported once from `_BaseLayout.astro` (a bundled `<script>`).
- `transition:name` is removed from `Card.astro:97` and `_WorkLayout.astro:55`.

**Event sequence.** Every name and order is checked against the Astro 7.4.5 source: [events.ts](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/transitions/events.ts), [router.ts](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/transitions/router.ts) and [swap-functions.ts](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/transitions/swap-functions.ts).

| # | Event / step (7.4.5 source) | Our action |
|---|---|---|
| 1 | `astro:before-preparation`: a `TransitionBeforePreparationEvent` with `from`, `to`, `direction`, `navigationType`, `sourceElement`, `newDocument`, `signal`, `loader` (events.ts:11-19, 60-97). Dispatched before the loader (events.ts:129-165). | **Clear every stale `data-vt-hero` / `data-vt-cap` on cards first.** Hide or dispose the flagged hover overlay; **leave the CSS zoom alone**. If `sourceElement?.closest("[data-work-slug]")` exists and `to.pathname` is `/works/<that slug>/`, set `data-vt-hero` on the card's `[data-vt-frame]` and `data-vt-cap` on its `[data-cap]`. Remember whether the card was zoomed: `card.matches(":hover, :focus-visible")`, the zoom media query `(hover: hover) and (pointer: fine)` matching (or the card being focus-visible), and motion allowed. No layout reads. |
| 2 | Loader: fetch, `DOMParser`, style preload. Then `astro:after-preparation` (events.ts:153-155). | — (tests observe the overlay state here) |
| 3 | `document.documentElement` gets `data-astro-transition="forward" or "back"`. `document.startViewTransition(cb)` captures the **old state** (router.ts:500-506) when `supportsViewTransitions && !hasUAVisualTransition` (router.ts:25, :502). Otherwise the fallback simulation runs (router.ts:507-550). | — |
| 4 | Inside `cb`: `astro:before-swap`, a `TransitionBeforeSwapEvent` with `viewTransition`, `newDocument`, `direction`, `swap` (events.ts:99-127, 174-186). | **Back** (`direction === "back"`, `to.pathname` is `/` or `/works/`, `from.pathname` is `/works/<slug>/`): set `data-vt-hero` on `newDocument`'s `[data-work-slug="<slug>"] [data-vt-frame]`, and `data-vt-cap` on its `[data-cap]` (a new-only group that fades in late). **Forward from a zoomed card:** set `data-zoom-settle` on `newDocument`'s banner frame. Always: `viewTransition.finished.finally(clearMarks)`. |
| 5 | `swap()`: persisted `[data-astro-transition-persist]` nodes are lifted to `<html>`, the body is replaced, and they move into the new targets (`moveBefore` where available). Non-live media are re-created (swap-functions.ts:145-212). | — (the playing card `<video>` with `loop-<slug>` is now in the banner frame) |
| 6 | Scroll: top for a push; the saved position for a traverse (router.ts:206-215). Then `astro:after-swap` (router.ts:316). | Forward to a project page: `h1.focus({ preventScroll: true })`. Back to a grid: focus the `a[data-work-slug="<slug>"]`. |
| 7 | New-state capture; the `::view-transition-*(hero)` animations run. | CSS below |
| 8 | `updateCallbackDone` → scripts → `astro:page-load` → route announcer (router.ts:552-557). | `mountLoops`; hover-effect re-arm; **banner upgrade check** |
| 9 | `viewTransition.finished` | Clear the marks. Remove `data-zoom-settle`, so the banner media settles from `scale(1.05)` to 1. |

**CSS** (starting values from the prototype's `::view-transition-*` rules, `show-me-project-view.html:73-76`):

```css
[data-vt-hero] { view-transition-name: hero; }
[data-vt-cap]  { view-transition-name: card-caption; }
::view-transition-group(hero) { animation-duration: 450ms; animation-timing-function: var(--ease-out); }
::view-transition-old(hero), ::view-transition-new(hero) { width: 100%; height: 100%; object-fit: cover; }
::view-transition-old(hero) { animation-duration: 200ms; }   /* frozen old frame leaves early: less ghosting at hard cuts */
::view-transition-old(card-caption) { animation-duration: 120ms; }                         /* forward: bar fades fast */
::view-transition-new(card-caption) { animation-duration: 160ms; animation-delay: 300ms; } /* back: bar returns late */
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 200ms; }
/* zoom continuity (spec author's call; hover notes Q5 option a): banner media starts at the card's hover scale */
@media (prefers-reduced-motion: no-preference) {
  .loop-media[data-loop-frame="banner"] > * { transition: transform 600ms cubic-bezier(0.23, 1, 0.32, 1); }
  .loop-media[data-zoom-settle] > * { transform: scale(1.05); }
}
```

- This is Option A, the frame crossfade (research Q4; [Jake Archibald, aspect-ratio changes](https://jakearchibald.com/2024/view-transitions-handling-aspect-ratio-changes/)).
- `html[data-astro-transition=back]` is a valid direction selector, because the router sets it before `startViewTransition` (router.ts:500). Back uses the same values.
- The persisted video keeps the **source page's** scoped attributes (swap-functions.ts:166-189 moves the old node), so banner video styling must come from the wrapper (`.loop-media :global(video)`), never from scoped classes on the `<video>`.

**Banner upgrade** (spec author's call; "where possible" in D10).
- After a forward morph the banner holds the 720 w card node.
- On `astro:page-load` on a project page, if the banner's `video[data-loop-size]` is not `"banner"`:
  1. clone the banner `<video>` from `<template data-upgrade>` and set its `currentTime` from the persisted node;
  2. if motion is allowed and the old node is playing, `play()` the clone and wait for its first `requestVideoFrameCallback`, with a 5 s timeout;
  3. insert the clone in place, move `data-astro-transition-persist="loop-<slug>"` onto it, and remove the old node.
- When motion is paused, the swap happens immediately, because the poster underlay is already showing.
- After the swap, exactly one element in the document carries that persist id. On timeout or error the card node stays.

**Fallbacks.**
- With no `startViewTransition` (Firefox < 144) and the default `fallback="animate"` (router.ts:507-550; [`fallback` prop](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/view-transitions.mdx) L477-500), navigation, persistence, focus and the upgrade all still work; only the morph is absent. Firefox ≥ 144 runs same-document view transitions natively ([BCD](https://github.com/mdn/browser-compat-data/blob/main/css/properties/view-transition-name.json), research Q3).
- iOS swipe-back sets `hasUAVisualTransition`, and the router swaps with no view transition (router.ts:502, :521).
- Reduced motion: Astro's own CSS sets `animation: none !important` on every `::view-transition-*` ([viewtransitions.css:56-66](https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/components/viewtransitions.css)), and our module adds no motion of its own.
- Safari has no `Element.moveBefore`, so the persisted node is moved with `appendChild` / `replaceWith` (swap-functions.ts:171-189). If the engine paused it, the controller replays it on `astro:page-load`, since it is in view.

**AC**
- AC9.1 — Unit:
  - `slugFromWorkPath(detailUrl({ id }))` returns `id` for any slug (fast-check round trip);
  - with one card marked, a second navigation's step 1 leaves exactly one marked frame;
  - the back mirror marks the matching card in a parsed `newDocument`;
  - the upgrade waits for the clone's first frame (fake rVFC) and leaves exactly one persist id.
- AC9.2 — e2e forward (desktop context, card hovered and then clicked):
  - when `astro:after-preparation` fires, exactly one element has computed `view-transition-name: hero` and it matches `[data-vt-frame]`, not `video` or `img`;
  - exactly one element has `card-caption`, and it is that card's bar;
  - the frame child's computed transform is still `scale(1.05)`, so the zoom was not reset;
  - `document.activeViewTransition?.ready` resolves without `InvalidStateError` (`document.activeViewTransition` exists in Chrome 142+, research Q3);
  - an expando set on the card `<video>` before the click is present on the banner's `<video>` after it (the same node);
  - `!video.paused && video.muted` while motion is allowed;
  - `document.activeElement` is the `<h1>`.
- AC9.3 — e2e back: after `page.goBack()`, the card frame for that slug carried `hero` in the new state, focus is on `a[data-work-slug=<slug>]`, and `scrollY` equals the value before the click (±2 px).
- AC9.4 — e2e with no view transitions (`addInitScript` deletes `Document.prototype.startViewTransition`): forward and back navigation, the banner, focus and video playback all work.
- AC9.5 — e2e with reduced motion: during a navigation, `document.getAnimations()` holds no animation whose `effect.pseudoElement` starts with `::view-transition`.
- AC9.6 — e2e: within 5 s of a forward morph, the banner `<video>`'s `currentSrc` contains `/banner.`, and exactly one `[data-astro-transition-persist="loop-<slug>"]` exists.
- AC9.7 — e2e: after a forward morph from a hovered card, the banner frame loses `data-zoom-settle` once `viewTransition.finished` resolves, and the computed transform of its media child ends at `none` (identity). With reduced motion the attribute is never set.

### P9-10 · Content: tactical-arena + small projects (D14; breadth first)

Each project gets an MDX entry, a recipe, encoded loops, a poster, stills, 40–120 words and a 3–5 item gallery. Sources are listed relative to `UTOFME_MEDIA_ROOT` (the owner's code root), from research `…-project-media-inventory.md`. **Required: tactical-arena plus at least 5 of the 7 others. Target: all 8.** None of them needs a GPU, hardware or client permission.

| Slug · type | Banner/card loop (recipe kind) | Gallery candidates | Links · status |
|---|---|---|---|
| `tactical-arena` · code | montage, 4–6 hard cuts of 1–2 s: `RL_playground/tactical-arena/runs/m27/round_gifs_*/*.gif` cropped to the 560×560 map area (`crop=560:560:0:0`, research rl-media A5), plus 3D-viewer stills `RL_playground/_local/sessions/2026-11-02-lanes/viewer-3d/screens/*.png` (D4) held 1.2 s; ≥ 1 smoke or molotov shot | `runs/cs_maps/overlay/de_dust2_preview.png` (CS2 radar vs game grid; D18 OK, caption credits "CS2 map data © Valve"), a 3D-viewer still with the CS2 mesh (`f_3d_inferno_mesh.png`), 1–2 behaviour loops (`runs/m21/gifs_smoke/*`, `runs/m21/gifs_best_molly/*`) | Code ↗ `private: true` (D12) · research · started 2026-10-11 |
| `modified-maxwell-taichi` · code | transcode `modified-maxwell-taichi/fdtd_2d.gif` (800×800, 4.5 s), cropped to 16:9 | `fdtd_2d_snapshot.png`, `maxwell_snapshot_warp.png` | no remote · prototype |
| `manimce` · math | montage from `manimce/media/videos/manimce/1080p60/{cov_der2,wis1to5,tetradpostulate34,cartesiantopolar,d1spherewtangentplane,four_circles}.mp4` | 2–3 of the same clips as gallery loops | no remote · archived (2022) |
| `enth` · code | slideshow `enth/crates/enth-ui/tests/snapshots/{editor_lanes_max,editor_dense_g2,recreate_before,recreate_hint,recreate_results,learn_round}.png` | `recreate_results.png`, `learn_browser.png`, `create_done.png` | Code ↗ utof/enth · prototype |
| `godot-ctcs` · code | slideshow `godot_ctcs/artifacts/{01-observatory,03-portals,06-dneg}.png` + `docs/screenshots/2026-10-17/{1440-68-rooms-green-room,1440-67-holes-kerr}.png` | 3 of the same | no remote · prototype |
| `linsae` · code | slideshow `linsa/flinsa/_local/sessions/2026-11-03-linsae-reference/key/{K1-main-window-feed,K4-thread-view,K8-canvas,K9-pdf-reader-docked,K7-command-palette}.png` | 3 of the same | Code ↗ utof/linsae · prototype |
| `gr-demo-learn` · code | slideshow `GR_demo_learn/artifacts/{orbit,compact-final,compact-controls}.png` | `orbit.png` + 2 | no remote · prototype |
| `eeg-ads1299-lab` · code | slideshow `eeg_ads1299_lab/results/demo/{synthetic_trace,synthetic_psd,model_filter_response,synthetic_ml}.png` | 3 of the same | Code ↗ utof/eeg_ads1299_lab · prototype |

**Copy rules.**
- Concise, with no padding, using the anatomy word counts.
- Every number has an MDX source comment (AC3.4).
- tactical-arena draws only on `…-project-media-inventory-rl-docs.md`. The honest headline is the 5v5 head at "+96 (+94..+98)" Elo over its start (JOURNAL.md:6090) while "first contact 9.6 s" vs the pros' "22.8 s" did not close (CS2_ROUNDS_REPORT.md:18, JOURNAL.md:6396).
- Captions state claims, e.g. "Attackers smoke the entry in nearly every round, near tick 23; the scripted bots throw at tick 20" (SMOKE_REPORT.md:115-116).
- The other projects' copy is grounded in their own README or docs as cited in the inventory, with no invented numbers.

**Privacy and licence checklist**, applied per still and per clip:
- no file paths, usernames, hostnames, tokens or third-party screenshots (D5: never `enth/_local/reference/ui`, `linsae/local_files`, `defomo`, `yt-parse/datadir`);
- the cs2rl Rerun toasts are excluded for the same reason;
- Valve imagery is credited.

**AC**
- AC10.1 — At least 6 real (non-fixture) entries are listed on `/` in the `UTOFME_FIXTURES=false` build, and the newest is first.
- AC10.2 — AC3.4 content lint passes for every one of them.
- AC10.3 — Every recipe passes the flash lint and the encode-time budgets. `check:media` and `check:budgets` are green.
- AC10.4 — The privacy checklist is recorded per project in the PR description, as a checkbox per media file.

### P9-11 · `/lab/loops-ab/` (D7) and the mock-GIF switch (owner-gated)

**The A/B page.** `src/pages/lab/loops-ab.astro`, using `BaseLayout noindex`. `/lab/` is already excluded from the sitemap (`src/lib/sitemap-filter.ts:27`, ADR 0041). One row per pair:
- the 12 mock GIFs (`src/assets/works/mock/*.gif`), plus `fdtd_2d.gif` and one tactical-arena round GIF;
- the original GIF `<img>` beside its `transcode` re-encode (`LoopMedia size="card"`) at the same display width;
- byte counts for the GIF and for each MP4.

The re-encodes for the A/B page are recipes `mock-<name>` (card size only).

**The switch** (blocked until the owner approves on the A/B page; the plan schedules it last):
- fixture `cover`s become `{ src: <poster>, loop: "mock-<name>" }`;
- `/lab/datamosh/` imports its GIFs directly from `src/assets/works/mock/`, so it keeps its GIF test cards;
- the GIF files stay in `src/assets/works/mock/`.

**AC**
- AC11.1 — `/lab/loops-ab/` renders 14 rows, each with one `img[src$=".gif"]` and one `video[data-loop]`. It carries `<meta name="robots" content="noindex">`, has zero Axe violations, and has the Pause toggle.
- AC11.2 (after owner approval) — `dist/index.html` in the test build references no `.gif`, and R8 passes without the fixture exemption on `/`.

### P9-12 · `/works/code-sandbox/` loads Sandpack on click (D11)

**What.**
- `src/components/mdx/Sandbox.astro` stops rendering `<SandboxIsland client:only="react">` (`:21`). Instead it renders a facade: a short static note and a `<button>Load live playground</button>`, with props serialised into `data-props`.
- A bundled `<script>` imports `src/components/sandbox-mount.tsx` with dynamic `import()` on click. That module calls `createRoot(el).render(<SandboxIsland {...props} />)` (**[V]** React 18+ stable API, [react.dev `createRoot`](https://react.dev/reference/react-dom/client/createRoot); not re-fetched, stable for more than 2 years under the Verify-or-not SKIP rule).
- After mount, focus moves to the playground container (`tabindex="-1"`).

**Spec author's call:** a facade with dynamic `import()`, not a custom `client:click` directive. **[V]** `addClientDirective` exists (context7 `/withastro/docs` `integrations-reference.mdx`), but a custom directive would server-render Sandpack, which `client:only` currently avoids.

**AC**
- AC12.1 — e2e: before the click, no request goes to a chunk that contains React or Sandpack. Chunk names are identified from the build and asserted by `check:budgets` as lazy. After the click, the Sandpack container renders within 3 s, matching `tests/e2e/sandbox.spec.ts:15` semantics.
- AC12.2 — `check:budgets`: `/works/code-sandbox/` first-view JS ≤ 40 KB, and its lazy demo JS ≤ 450 KB (warn above 300 KB).

## Component / file map

New (implementation, excluding tests and content):
- `worker/index.ts`;
- `src/lib/range.ts`, `src/lib/motion.ts`, `src/lib/contrast.ts`;
- `src/lib/loops/{manifest,controller}.ts`, `src/lib/vt/hero-morph.ts`, `src/lib/works-collection.ts`;
- `src/components/{LoopMedia,MotionToggle,ProjectMeta,Gallery,PrevNext}.astro`, `src/components/sandbox-mount.tsx`;
- `src/pages/lab/loops-ab.astro`;
- `scripts/encode-loops.ts`, `scripts/lib/loops-core.ts`, `scripts/route-budgets.ts`, `scripts/lib/route-budgets-core.ts`;
- `route-budgets.config.ts`.

That is **21 new implementation files**. All paths are under `packages/site/`.

Generated or committed data: `src/data/loops.json`, `media/recipes/*.json`, `public/loops/<slug>/*.mp4`, `src/assets/loops/<slug>/poster.png`, `src/assets/works/<slug>/*.png`, plus 8 `src/content/works/<slug>.mdx`.

Modified:
- `package.json` and `bun.lock`;
- `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `knip.jsonc`, `stryker.conf.json`, `.size-limit.cjs`, `lighthouserc.cjs` (adds `/works/tactical-arena/`);
- `src/content.config.ts`, `src/lib/works.ts`;
- `src/components/{Card,CoverImage,SearchBox}.astro`, `src/components/mdx/Sandbox.astro`;
- `src/layouts/{_BaseLayout,_WorkLayout}.astro`;
- `src/pages/{index.astro,works/index.astro,works/[...slug].astro,feed.xml.ts,feed/works.xml.ts}`;
- `src/styles/{tokens,transitions}.css`;
- `src/lib/dither/card-dither.ts`, `src/lib/datamosh/card-mosh.ts`;
- the 16 fixture frontmatters (`fixture: true`);
- `.github/workflows/{ci,deploy}.yml`, `lefthook.yml`.

That is **about 30 modified implementation files**.

**Phase budget (CLAUDE.md FIRE trigger).**
- ≤ 24 new and ≤ 34 modified implementation files.
- The JS, HTML, CSS and media limits in the table below.
- New platform JS (hero-morph + loop controller + motion) ≤ 3 KB gzip combined.
- If the post-upgrade baseline already breaks a class limit, the builder stops and reports instead of raising the limit.

## Budgets for this phase (enforced by `check:budgets` in CI; D9 numbers)

Units: JS, HTML and CSS are gzip-9. Media are raw bytes. "Warn" is about 85 % of the error limit unless stated.

| Route class (routes) | First-view JS | HTML / linked CSS | First-view media | Lazy budgets |
|---|---|---|---|---|
| **Platform** (chunks shared by every route) | ≤ 40 KB | — | fonts ≤ 100 KB, ≤ 2 preloads | — |
| **Home** (`/`) | ≤ 45 KB | HTML ≤ 45 KB, CSS ≤ 10 KB | ≤ 2 eager posters, ≤ 200 KB total; LCP poster ≤ 100 KB with `fetchpriority=high`; 0 video bytes before `load` | card loop ≤ 300 KB per file (warn 150); card poster ≤ 60 KB; flagged hover fx ≤ 16 KB (existing size-limit entry); full-scroll media report-only |
| **Project** (`/works/<slug>/`) | ≤ 40 KB | HTML ≤ 30 KB, CSS ≤ 10 KB (≤ 15 KB with EC code) | banner poster ≤ 200 KB, priority; no loop bytes before `load` | banner loop ≤ 1,000,000 B per file (warn 600 KB); gallery loop ≤ 300 KB; gallery still ≤ 250 KB; page lazy media report-only (warn 8 MB) |
| **Project + demo** (`/works/code-sandbox/`) | ≤ 40 KB | as Project | as Project | demo JS ≤ 450 KB (warn 300), on click only |
| **Archive** (`/works/`) | ≤ 45 KB | HTML ≤ 45 KB, CSS ≤ 10 KB | as Home | as Home |
| **Text / slash / garden** (`/now/ /uses/ /colophon/ /tops/ /stats/ /garden/ /garden/<note>/`) | ≤ 40 KB | HTML ≤ 25 KB, CSS ≤ 10 KB (math notes ≤ 20 KB) | ≤ 150 KB | visible islands ≤ 50 KB |
| **`/search/`** | ≤ 70 KB | HTML ≤ 25 KB, CSS ≤ 10 KB | 0 | Pagefind runtime ≤ 120 KB (size-limit) |
| **`/garden/graph/`** | ≤ 40 KB | as text | 0 | graph JS ≤ 80 KB (was a 180 KB size-limit cap against about 60 KB measured) |
| **`/lab/*`** | ≤ 120 KB, **warn only** | — | ≤ 500 KB, warn only | ≤ 600 KB, warn only |
| **`feed.xml`** | — | ≤ 30 KB raw (existing size-limit entry) | — | — |
| **Site total unique JS** | **report-only** (D9) | | | |

The baseline measured on Astro 6.1.9 (research Q2/Q5) was: platform 32.7 KB, home JS 33.9 KB, home HTML 12.6 KB at 12 cards, `/search/` 60.5 KB, `/garden/graph/` lazy 60.3 KB. The plan re-measures after P9-1 and records the new baseline in the PR.

## Tests (per CLAUDE.md "Tests every batch")

- **Vitest unit:**
  - range + worker handler (P9-5);
  - loops core, manifest and content cross-check (P9-4);
  - controller and motion (P9-6);
  - caption contrast from the tokens, plus random underlays (AC7.1a);
  - hero-morph helpers (P9-9);
  - works schema, listing and `prevNext` (P9-3);
  - route-budgets core (P9-2);
  - content lint (AC3.4).
- **Integration (Vitest, happy-dom / Container API):** Card caption rendering; `LoopMedia` source order and attributes (it must satisfy R5); `ProjectMeta` private-link rendering.
- **fast-check:**
  - works schema `parse` / `safeParse` (AC3.1);
  - `loopsManifestSchema` and `recipeSchema` round-trips;
  - Range planner (AC5.2);
  - flash-counter monotonicity (AC4.2);
  - fixture filter (AC3.3);
  - slug ↔ URL round trip (AC9.1);
  - contrast over random underlays (AC7.1a).
- **Playwright e2e:**
  - morph forward, back, without view transitions, and with reduced motion (AC9.2–9.7);
  - Pause toggle and in-view playback (AC6.3–6.5);
  - caption geometry, reveal, gating and touch state (AC7.2);
  - caption fill pixel over a white frame (AC7.1b);
  - no Backdrop Root on the bar's ancestors (AC7.3);
  - zoom kept at capture, caption named, banner zoom settles (AC9.2, AC9.7);
  - #121 and the overlay hidden before the snapshot (AC7.5–7.6);
  - project page first screen (AC8.1–8.3);
  - Sandpack on click (AC12.1);
  - search (AC1.4).
  - Morph and hover cases use the desktop context. The Pixel 5 project covers the mobile banner.
- **Existing cases the plan rewrites** (owned by the test worker; listed so nothing silently disappears):
  - `detail.spec.ts:124-140` (`card-code-2` name) and the `transitions.spec.ts` name checks, replaced by AC9.x;
  - `search.spec.ts` `.pagefind-ui__*` selectors;
  - `filter.spec.ts` card counts, which grow by the new real entries;
  - the Container renderer imports.
- **Axe-core:** zero violations on `/`, `/works/`, every real project page, `/works/code-sandbox/` (before and after clicking), `/search/` and `/lab/loops-ab/`. Axe cannot measure contrast over video frames; AC7.1a and AC7.1b cover that gap.
- **Visual regression**, under `reducedMotion: "reduce"` so posters are deterministic:
  - `/` desktop 1280×900 and Pixel 5;
  - `/works/tactical-arena/` desktop and Pixel 5;
  - one card in its revealed (focused) state, in the desktop context with motion allowed and transitions disabled through an injected `* { transition: none !important }` style, so the end state is deterministic.
  - `img[src$=".gif"]` is masked (fixture GIFs animate).
- **Budgets:** `check:budgets` (P9-2), `check:media` (P9-4), the remaining `size-limit` entries, and LHCI ≥ 0.85 mobile on the existing URLs plus `/works/tactical-arena/`.
- **Stryker (nightly):** add `src/lib/range.ts`, `scripts/lib/route-budgets-core.ts` and `scripts/lib/loops-core.ts` (flash counter, codecs) to `stryker.conf.json` `mutate`. `src/content.config.ts` and `src/lib/works.ts` (schema and fixture filter) are already listed.

## ADRs to write

Numbering continues after 0042.

- **0043** Astro 7 upgrade. Covers the unified processor kept via `@astrojs/markdown-remark` (Sätteri port deferred), `compressHTML: true`, the Node 22.23 floor, Rolldown `codeSplitting` for `graph-vendor`, and the astro-pagefind 2 / Component UI search.
- **0044** Video loops replace GIFs. Covers AV1 then H.264 MP4 with full codecs strings, the poster as a `<Picture>` underlay (no `poster` attribute), JS-started in-view playback, the offline encode script plus manifest plus content hashes under `/loops/`, the flash lint, and `aspect` fixed at 16:9.
- **0045** Range-serving Worker for `/loops/*`. Amends ADR 0002's "assets-only" and records the Free-plan request ceiling (D17), plus the R2 and Workers Cache alternatives.
- **0046** Card → banner morph on `<ClientRouter />`. Covers:
  - the attribute-driven `hero` name, on the clipping wrapper, plus a separate `card-caption` name;
  - `transition:persist` of the playing video, and the banner upgrade;
  - the zoom-settle continuity;
  - Option A over Option B;
  - focus management.
  It supersedes the per-card `transition:name` from Phase 2 (ADR 0015's naming).
- **0047** Per-route budgets via `check:budgets`. The site total is report-only, the CSS-glob and pagefind entries are removed, and parts of ADR 0016 and ADR 0019 are superseded.
- **0048** Global "Pause motion" control and reduced-motion posters (WCAG 2.2.2, G4/G186).
- **0049** Works schema v2 and project page Tier S anatomy. Covers lede, status, links with `private`, `cover.loop` and `focus`, gallery, the research slot, the 3:1 / 16:9 banner (D19), and the `fixture` flag plus `UTOFME_FIXTURES`.
- **0050** Card caption and hover (D20/D21):
  - dark-glass bar at α .62 with all-white text;
  - the worst-case contrast rule, with its token test and pixel test;
  - blur kept optional and hover-only, plus the recorded `@perf` result;
  - the compositor-only "zoom + reveal" timings and their gating (hover notes Q2–Q6);
  - the `hero` name on the clipping wrapper, the separate `card-caption` name, and no zoom reset before capture.
- **0051** Sandpack behind a click facade (D11): dynamic `import()` + `createRoot` rather than a custom client directive.

## Risks

1. **Upgrade blast radius** (P9-1). The Rust compiler, the unified processor, Pagefind 2's UI and Vite 8's chunk naming all land together.
   - Mitigation: P9-1 is its own first batch, merged green before any feature work.
   - If `codeSplitting` renames the vendor chunk, the globs change in the same commit.
2. **Node floor.** The owner's machine has Node 22.22.3. The Astro 7 CLI refuses to run below 22.23.4 (bin/astro.mjs). Nothing can be built locally until Node is updated (Open question 1).
3. **Concurrent edits.** Other workers are changing `card-dither.ts`, `card-mosh.ts` and `tests/` right now. P9-7's video-source change and the test rewrites must rebase onto their commits; the plan orders them last in their batches.
4. **Safari / iOS.**
   - AV1 decodes only on devices with a hardware decoder, so H.264 is the fallback ([caniuse AV1](https://caniuse.com/av1)).
   - Low Power Mode blocks autoplay; the poster stays.
   - Range support exists only through the Worker. It can't be tested in CI because `astro preview` serves ranges itself, hence the manual `wrangler dev` check and the post-deploy probe.
   - utof.me doesn't resolve today (research §5), so both deploy probes fail until DNS exists.
5. **Free-plan ceiling** (D17). Every range request is a Worker request, and the Free plan returns 429 beyond its limit ([billing docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). That is fine for a personal site; the ADR records it.
6. **Persist edge cases.**
   - The persisted node keeps the home page's scoped attributes, so style it from the wrapper.
   - A stale `data-vt-hero` would duplicate the name and skip the transition. Mitigation: clear before marking, plus the AC9.1 unit test.
   - Safari moves the node without `moveBefore`, so the controller replays it.
7. **Flashes in the RL footage.** Flashbangs and HE blasts strobe inside a shot. Mitigation: the flash lint fails the encode, and such shots are dropped (research §8, inventory C.2-D).
8. **Playwright's Chromium lacks some proprietary codecs.** Playback e2e depends on the AV1 source being first. If a future Chromium build drops AV1 software decode, the playback ACs fail loudly, not silently.
9. **Content accuracy and privacy.** Numbers come only from cited files, and the privacy checklist covers every media file. The `RL_playground/_local` screenshots are full viewer UI; the top bar must be checked for local paths.
10. **Git weight.** About 0.5–1 MB per project (4 MP4s plus a PNG poster plus stills); 8 projects is about 8 MB. That is acceptable, and Git LFS is deferred (research §6).
11. **`backdrop-filter` over playing video on the no-GPU Chrome.** Its cost is unquantified by any source (hover notes Q4).
    - The default limits it to the hovered card's bar; the AC7.7 perf check decides whether it ships at all.
    - Contrast never depends on it.
12. **Safari snapshot quirks with a zoomed card.** A stale transform (WebKit 310181) and upscaled, blurry snapshots of scaled elements (WebKit 317712).
    - Accepted: the hero is the clipping wrapper, and the zoom is never reset before capture.
    - No Safari runs in CI, so this needs a manual check on a device.
13. **Pagefind Component UI size** is unmeasured. If `/search/` first-view JS breaks 70 KB, the fallback is to load the Component UI on input focus (research Q5 table).

## Open questions (builder cannot settle)

1. **May the local Node be updated to ≥ 22.23.4** (e.g. 22.23.4, or the 24 / 26 LTS line) on the owner's machine? Astro 7's CLI refuses Node 22.22.3. CI is handled in P9-1. Until this is answered, P9-1 can be prepared but not run locally.
2. **D7 gate.** The owner's look at `/lab/loops-ab/` unblocks P9-11's switch. Everything else proceeds without it.
3. **D17** (Workers plan) is informational only and doesn't block.

Everything else was decided above and marked "spec author's call", or is an owner decision cited by D-number.

## Deferred (file as issues after merge, labels as noted)

- Option B grow-then-crop morph (WAAPI `clip-path` on `::view-transition-new(hero)`) and a `/lab/morph/` tuning page (`phase-N`).
- Sätteri port of the six remark/rehype plugins (`phase-N`).
- `compressHTML: 'jsx'` adoption (`nit`).
- `public/_headers` immutable caching for `/_astro/*` (`phase-N`).
- LHCI 0.16 / Lighthouse 13.6 `resource-summary` assertMatrix (`phase-N`).
- Headless 3D-viewer capture for tactical-arena, plus the Tier R sections (`_local/todo/tactical-arena.md`).
- More projects that need capture first (perima, rv4all, repulsive-test2, cs2rl, …; inventory rows marked C).

## Verification log (every external API named above)

| API / fact | Verified against (2026-11-03) |
|---|---|
| Package versions, peers, engines | `npm view` for each package (P9-1 table) |
| Node versions | https://nodejs.org/dist/index.json (22.23.4 = 2026-10-20; 24.22.2; 26.13.0 LTS) |
| Astro 7 breaking changes | withastro/docs `guides/upgrade-to/v7.mdx` (raw, full read) |
| Astro CLI Node check | withastro/astro@7.4.5 `packages/astro/bin/astro.mjs:31-46`; `package.json` `engines` |
| ClientRouter events, fields and order | astro@7.4.5 `src/transitions/events.ts:11-186`, `router.ts:25, 195-240, 262-335, 495-557` |
| `transition:persist` mechanics, media re-creation, `moveBefore` | astro@7.4.5 `src/transitions/swap-functions.ts:9, 145-237` |
| `fallback` prop, `sourceElement: link` | astro@7.4.5 `components/ClientRouter.astro:4-8, 98-101` |
| Reduced-motion kill switch | astro@7.4.5 `components/viewtransitions.css:56-66`; docs `view-transitions.mdx` L790-792 |
| `transition:persist="<name>"`, `data-astro-reload` | withastro/docs `guides/view-transitions.mdx` L98-150, L303-323 |
| `unified()` processor, MDX `extendMarkdownConfig` | context7 `/withastro/docs` (`markdown-processors/unified.mdx`, `integrations-guide/mdx.mdx`) |
| `envField.boolean`, `astro:env/server` | context7 `/withastro/docs` (`astro-config.mdx`, `environment-variables.mdx`) |
| `<Picture priority>`, `getImage()` | context7 `/withastro/docs` (`modules/astro-assets.mdx`) |
| `Astro.slots.has()` | withastro/docs `reference/astro-syntax.mdx` (gh code search) |
| `addClientDirective` (rejected alternative) | context7 `/withastro/docs` (`integrations-reference.mdx`) |
| `experimental_AstroContainer` name in v7 | astro@7.4.5 `src/container/index.ts:296` |
| Vite 8 `rolldownOptions`, `manualChunks` deprecation | vitejs/vite `docs/guide/migration.md` L292-294, L342 |
| Rolldown `codeSplitting.groups` | https://rolldown.rs/reference/OutputOptions.codeSplitting (WebFetch) |
| EC Astro 7 support | expressive-code `packages/astro-expressive-code/CHANGELOG.md` (0.43.0, 0.43.1, 0.44.0) |
| astro-pagefind 2 import path, `PagefindConfig` | GitHub releases v2.0.0 / v2.0.1; README; `v2.0.1/.../PagefindConfig.astro` |
| Pagefind Component UI element names | https://pagefind.app/docs/components/ (WebFetch) |
| Range limitation, `run_worker_first` billing, 429 | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ (WebFetch) |
| `run_worker_first` array, `env.ASSETS.fetch` signature | https://developers.cloudflare.com/workers/static-assets/binding/ (WebFetch) |
| wrangler `main`, `assets` keys | https://developers.cloudflare.com/workers/wrangler/configuration/ (WebFetch) |
| `run_worker_first` routing added | workers-sdk `packages/wrangler/CHANGELOG.md` L9437 (PR #9509) |
| ffmpeg encoders and filters, `libsvtav1` CRF/preset ranges | local `ffmpeg -encoders`, `-filters`, `-h encoder=libsvtav1` (6.1.1) |
| Playwright Chromium codecs | https://playwright.dev/docs/browsers (WebFetch) |
| WCAG 2.2.2 / 2.3.1, contrast and relative luminance | W3C Understanding pages (research §8) and WCAG 2.2 definitions; compositing model per W3C Compositing L1 |
| Caption alpha table, hover timings, Backdrop Root, blur cost, VT capture of a zoomed card | `_local/research/2026-11-03-22-card-hover-effects.md` Q2–Q6, citing Filter Effects 2, css-view-transitions-1 §7.3, Chrome "Animating a blur", WebKit 310181 / 317712 and Emil Kowalski's STANDARDS.md (not re-fetched here; the contrast arithmetic was re-derived independently and matches: α .62 gives rgb(107), 5.34:1) |
| `sharp` raw pixel read (AC7.1b) | existing dependency `packages/site/package.json` (`sharp ^0.34.5`); https://sharp.pixelplumbing.com/api-output (not re-fetched) |
| Playwright `launchOptions` per test (`@perf` spec) | Playwright test options (stable API; not re-fetched) |
| `requestVideoFrameCallback`, `drawImage(video)`, codecs parameter, autoplay policy | MDN / BCD / WebKit blog via research §1, §2, §7 (not re-fetched; stable APIs) |
| React `createRoot` | not re-fetched (stable since React 18; SKIP rule) |

**Not verified:**
- How Rolldown names a `codeSplitting` group's output file (the docs don't say; checked at build, AC1.2).
- The byte size of Pagefind Component UI (measured after P9-1).
- That relative wrangler paths resolve against the config file (inferred from the working deploy, `deploy.yml:50`).
- Safari behaviour of a persisted `<video>` moved without `moveBefore` (no Safari in CI).
- Current Safari range behaviour against the live Worker (domain not resolving).
