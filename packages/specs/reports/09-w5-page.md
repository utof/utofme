# 09 · W5 — project page + card → banner morph

Branch `p09/w5-page` (base `origin/phase/09-project-view`, Astro 7.4.5, Node 22.23.4).

## Summary
The project page now follows the Tier S anatomy and the card → banner morph is wired through Astro's
ClientRouter events. Only the clicked card's `[data-vt-frame]` is ever named `hero`; the banner frame
is named in `astro:before-swap`; Back mirrors it; marks clear after `finished`.

## What I built (files)
- `src/lib/vt/hero-morph.ts` — pure naming logic (`slugFromWorkPath`, `markOld`, `markNew`, `clearMarks`, `focusTarget`) + router wiring (imported once from `_BaseLayout.astro` as a bundled `<script>`). Marks are attributes: `data-vt-hero` (→ `hero`), `data-vt-cap` (→ `hero-cap`); `html[data-vt-morph]` hides dither/mosh canvases (`canvas[data-dither-backend]`, `canvas[data-mosh-backend]`) via CSS, without editing those libs. Hover zoom is never touched.
- `src/styles/transitions.css` — names, `::view-transition-group(hero)` 450 ms `cubic-bezier(0.2,0.7,0.2,1)`, old/new(hero) 100 % cover, root fade 200 ms, caption timings, overlay hide, plus a reduced-motion kill switch (see decisions).
- `src/layouts/_WorkLayout.astro` — banner (3:1 ≥ 700 px, 16:9 below, max 1280 px, max 60 vh, `--focus`) → h1 (`tabindex=-1`) + lede → `ProjectMeta` → body (`.e-content`) → `Gallery` → hidden-unless-filled `research` slot → `PrevNext`. h-entry, Webmentions, `breadcrumb`/`detail-external` hooks preserved. No-loop projects use the still cover in the same frame; no cover → no banner.
- `src/components/ProjectMeta.astro`, `Gallery.astro`, `PrevNext.astro`, `ProjectStill.astro` (new, fills a frame; GIF branch like CoverImage).
- `src/components/LoopMedia.astro` — **STUB** (`STUB — replaced by W4 (p09/w4-card)`): renders only the outer `.loop-frame` div. Take W4's version at merge.
- `src/lib/prev-next.ts` (newest-first neighbours), `src/lib/project-fields.ts` (**temporary W1 type mirror**, delete after merging W1).
- `src/pages/works/[...slug].astro` — computes neighbours (non-draft, non-fixture) and passes `neighbours` to the layout (small edit outside my owned list; needed so the layout stays free of `getCollection`, which container unit tests can't stub).
- `src/layouts/_BaseLayout.astro` — hero-morph `<script>` + a `TODO` for `<MotionToggle />` (W4's file isn't on this branch).
- Tests: `tests/unit/hero-morph.test.ts` (10), `tests/unit/project-meta.test.ts` (4), `tests/e2e/p09-morph.spec.ts` (4), `tests/e2e/p09-project.spec.ts` (4).

## Updated existing tests (minimal, justified)
- `detail.spec.ts` case 8: h1 no longer carries `transition:name` (spec P9-8/P9-9); now asserts no static `card-*`/`hero` name on a fresh detail page.
- `image-pipeline.spec.ts` case 6: the detail cover is now the LCP banner → `loading=eager` + `fetchpriority=high` (was lazy). Case 7 baseline `cover-fixture-chromium-mobile-linux.png` regenerated (layout intentionally changed). **The env has no Google Fonts access, so this baseline used fallback fonts — regenerate in CI if it flaps.**

## Gate results (packages/site)
- biome (changed files): clean. (Pre-existing errors in untouched files, e.g. `snapshot-fetcher.test.ts`, unchanged.)
- `astro check`: 0 errors / 0 warnings. `type-coverage`: 100.00 % (21886/21886). `knip`: clean (only the pre-existing lefthook config hint). `check:docs`: pass. depcruise: pass. lefthook pre-commit passed on both commits.
- Unit suite: 416 pass / 12 fail — all 12 in `card-pagefind-attrs.test.ts` (known pre-existing). New tests: 14/14 pass. `microformats` still green.
- `bun run build`: OK (29 pages).
- E2E (chromium-1243 via a temporary local config, since the repo's Playwright wants chromium-1217): 176 pass / 3 fail → `image-pipeline` 6 & 7 (fixed after, passing), `typography` "preload link for local mono font" (fonts unreachable in this env; pre-existing, not touched). Net new failures: 0.

## Decisions
1. **Dash-less names:** `hero` for media, `hero-cap` for the caption (brief); spec's `card-caption` not used.
2. **Banner frame is not statically named** (brief overrides spec): `hero` is set on `newDocument`'s banner in `astro:before-swap` only if the old document marked the same slug, so names always come in pairs.
3. **Back** also marks the *old* banner (in `before-preparation`, `direction === "back"` from `/works/<slug>/` to `/` or `/works/`) — needed for the old snapshot; the spec table omitted it.
4. **Focus:** forward → `h1.focus({preventScroll})` on `astro:after-swap`; Back → `a[data-work-slug=…]`.
5. **Reduced-motion:** Astro's kill switch is an inline `<style>` that is *absent* on pages whose CSS is emitted externally (all `/works/<slug>/`, `/garden/*`, `/search/` — verified in `dist`). Arriving at a project page ran 23 view-transition animations under `prefers-reduced-motion`. I duplicated the same rule in `transitions.css` (`animation: none !important` on `::view-transition-group/old/new(*)`); Astro's own copy still stays. This is a pre-existing bug on the base for those pages.
6. **MDX `.item` class:** microformats1 treats `item` as a root class and dropped `dt-published`; meta items use class `m`.
7. **No banner-encode upgrade, no `data-zoom-settle`** (deferred per review finding 9 / not in brief).
8. Meta row: the `<time class="dt-published">` is the year (single `<time>` on the page); `MetaPills` is no longer used by the layout (still used by index pages).

## Open issues / merge notes
- Card hooks (`data-work-slug`, `[data-vt-frame]`, `[data-cap]`, removal of Card's `transition:name`) come from W4. My morph e2e injects them into the live DOM (and the incoming doc on Back) to test the wiring; once W4 merges, those specs can drop the injection. Until then the real home cards still carry the old `transition:name` (harmless: no matching name on the new page).
- Swap `project-fields.ts` for W1's types; replace `getCollection` filter in `[...slug].astro` with `getWorksCollection` (W1) — `fixture` filtering uses the temporary mirror.
- Merge-time check: `MotionToggle` TODO in `_BaseLayout.astro`.
- Not covered (needs real content): AC8.1 viewport fit on `tactical-arena`, private-link label on a real page (covered by unit test on `ProjectMeta`), AC9.2 expando-on-same-video / playing state (needs W4's `LoopMedia` + loops).
- Local run tip: `CI` must be unset for Playwright's `reuseExistingServer`; a stale `astro preview` on :4321 otherwise kills the webServer.
