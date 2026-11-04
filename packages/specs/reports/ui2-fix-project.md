# ui2-fix · project page (`/works/<slug>/`)

Branch `fix/ui2-project`. Measurements: Chromium via Playwright against the production build (`UTOFME_FIXTURES=false`), fallback fonts (no Google Fonts in the VM). Screenshots: `packages/specs/reports/ui2-fix/project/`. No "before" PNGs were taken (the review's `enth_*`/`tactical_*` shots on `review/ui2-polish` are the before); before numbers below come from the review.

## Findings

**P-03 wide composition + lightbox.** `_WorkLayout.astro`: banner stays full width; below it `.work` holds `.text` (header + body) and `<Gallery>`. From 1200 px: grid `minmax(0,38rem) minmax(0,1fr)`, gap `--space-7`, gallery = one stack of figures at full right-column width. Below 1200 px one column; gallery 1-up on phones, 2-up from 700 px. Research block and prev/next stay below, full column. Body `p`/`li`: `max-width: 65ch`, `text-wrap: pretty`.
Measured (enth): 1280 → figures 432×243 at x=752 (text x=96, w=608); 1920@2 → figures 976×549 at x=800 (before: 348×196). Phone 393 → 334×188 1-up; 800 tablet → 332×187 2-up; 734/852 landscape → 2-up. No horizontal overflow at any width (scrollWidth = viewport).
Lightbox: `src/lib/lightbox.ts` (+ small inline script in `Gallery.astro`), native `<dialog class="lightbox">`: full-res image (`data-full` = original asset, 1200×800 for enth) with caption; Esc, backdrop click and × close; ‹ › buttons and ←/→ step (wrapping); focus returns to the thumbnail. Thumbnails are `<button data-zoom>`s with an `Enlarge: …` label. Loop (video) gallery items are not enlargeable (decision: footage already fills the frame; only stills carry text worth zooming).
Budget: project routes first-view JS 31.5 KB (limit 40; was 29.6 platform baseline + lightbox ~1.9 KB).

**P-08 gallery.** All frames 16:9. Decision: stills use `object-fit: contain` on the neutral surface (UI screenshots with small text must not be cropped); loops use `cover`. Odd counts in the 2-up layout: first figure spans both columns (enth tablet: 680×383 then 332×187 ×2, no hole; the dialog was moved out of the grid so it does not break `:nth-last-child`).

**P-12 type.** h1 `--font-size-7` (36 px) / `--leading-tight`; lede `--font-size-5` (22 px) / `--leading-snug`, 65ch. Measured 36px / 22px. Tokens already existed.

**P-15 meta.** `ProjectMeta.astro`: grey mono tag row (year/status/stack) and a separate link row at `--font-size-ui` in `--color-link` (`rgb(0,100,194)`); private links show muted label + "private for now" chip. Link box 45×44 on phone; `elementFromPoint` at all four corners hits the link (393 portrait and 852×393 landscape).

**P-07 prev/next.** `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)`; prev start, "All projects" centre, next end; empty slots kept. Measured on tactical-arena (no prev): "All projects" centre = nav centre (±2 px), next right edge flush.

**P-13 banner focus** (`cover.focus`, only field touched; checked at 1440 over several focus values): enth 50→8 (label rows no longer bisected), eeg-ads1299-lab 50→0 (title + spike), modified-maxwell-taichi 50→5 (title + source ring), tactical-arena 40→10 (A-site label + grenade arc). linsae 50, godot-ctcs 45, gr-demo-learn 50 kept (already framed on the content).

**Morph.** `transitions.css`: `::view-transition-old(hero)` and `-new(hero)` now `animation: none; opacity: 1; mix-blend-mode: normal; width/height 100%; object-fit: cover`. The old 200 ms fade rule is removed, so nothing is semi-transparent mid-morph and the 16:9→3:1 change crops instead of stretching. Reduced-motion kill switch untouched. Recorded 3 cards forward and Back (Playwright video + rapid screenshots, ffmpeg frames); 4-frame montages in `morph_forward_4frames.png`, `morph_back_4frames.png`. Caveat: headless screencast frames mid-morph show stacked offset copies of the image; this is identical with the previous rules re-injected and with `old(hero)` hidden, so it appears to be a capture artefact (damage-region trails), not caused by this change; the final frames are clean. Not verified on real hardware.

## Tests
- Unit: `tests/unit/lightbox.test.ts` (stepIndex wrapping; open/step/close/focus return).
- E2E: `tests/e2e/project-layout.spec.ts` (two-column geometry + 36 px h1, tablet 2-up/equal frames/span, lightbox open/arrows/Esc/focus/backdrop, meta rows + 44 px hit area + link colour, prev/next slots).
- Screenshot specs expected to change (baselines to regenerate): `image-pipeline.spec.ts` case 7 (`cover-fixture.png`, project page). `transitions.spec.ts`/`cards.spec.ts`/`landing.spec.ts` shoot the home/search pages (not touched, but `landing`/`cards` could shift only if card media changed: no).

## Gates (packages/site unless noted)
- biome: clean on all my files; `biome check` of the whole package reports only the two generated, git-ignored/regenerated files (`src/content/stats/snapshot.json`, `src/data/graph.json`) after a local build — not committed.
- astro check: 0 errors, 0 warnings, 1 hint (pre-existing). type-coverage 100.00% (33391/33391). knip clean (2 config hints, pre-existing). depcruise clean. check:docs OK (via precommit hook).
- Unit: 56 files, 632 passed, 1 skipped (fixture build).
- E2E (fixture build, screenshot specs excluded): 163 passed, 3 skipped, 1 failed: `typography.spec.ts:77` "preload link for local mono font" (0 font preloads: fonts can't be fetched in this VM; unrelated).
- `UTOFME_FIXTURES=false` build: `check:no-fixtures` clean. `check:budgets`: all project routes OK at 31.5 KB first-view JS; exit 1 only from 11 "chunk not reachable from any route" SELF errors (react/sandbox chunks) — identical 11 on unmodified origin/main in this VM, so pre-existing, and the home-route loop-size WARNs are unchanged.

## Decisions / left undone
- Lightbox covers stills only; loops not enlargeable.
- Gallery at 1280 is 432 px wide per figure (38rem text column leaves that); it reaches 976 px at 1920. Enlarge covers the small case.
- `.nav-row`, breadcrumb and MotionToggle untouched (chrome worker). The header now sits inside the left column under 1200→ the chrome worker's header move will need to take `.nav-row` out of `<header>` in `_WorkLayout.astro`; layout structure is `.work > .text > header` so that is a one-block edit.
- No "before" captures of my own; morph not checked on real GPU/Safari.
