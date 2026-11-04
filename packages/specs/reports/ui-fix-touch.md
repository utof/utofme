# UI fix report: touch (branch `fix/ui-touch`)

Measured on the production variant (`UTOFME_FIXTURES=false bun run build` + `astro preview`), Chromium, 1280×800, 1920×1080 @2x, iPhone-15-like 393×852 and 852×393 (touch, isMobile). Google Fonts are unreachable here, so fallback fonts render. "Before" numbers are the review's measurements. Screenshots are in `packages/specs/reports/ui-fix/touch/` and show the fixed state only. No "before" builds were made.

## Findings

| Id | Change | Files | Measurement |
|---|---|---|---|
| M-01 | `[data-cursor]` is `display: none` by default and shown only with `data-ready`, which is set from `$effect` after hydration. Coarse pointers never hydrate the island, so the SSR ring stays hidden. | `CustomCursor.svelte` | Before: 16 px ring at (0,0). After: no visible `[data-cursor]` on `/colophon/` under touch emulation (e2e). |
| M-06 | 44×44 hit zones via `::before` (Pause, sound) and `min-height: 44px` plus `margin-block: -12px` (prev/next/All projects). Visual size unchanged. | `MotionToggle.astro`, `SoundToggle.astro`, `PrevNext.astro` | Pause: visual 104.7×28, hit zone 102.7×44. Sound: visual 32×32, hit zone 44×44 (first try gave 42×42 because the border is inside the inset; fixed to `inset: -7px`). Prev/next/All projects: boxes were 20 px tall, now 44 px with a net layout height unchanged. The e2e test measures the same boxes. Footer `source` left to the layout worker. |
| M-18 | Replaced the glyph with a speaker body plus cone. Waves show when on, a cross when off. Same `aria-label` ("Toggle UI sounds") and `aria-pressed`; behaviour unchanged. | `SoundToggle.astro` | See `colophon-sound-phoneP.png`. |
| M-10 | `.cap__m` and `.private` raised to 0.75rem. | `Card.astro` (one line), `ProjectMeta.astro` | `.cap__m` computed 12 px on all 7 home cards. The caption line height token is 16 px, so the bar has the same height; no clipped `[class*=cap]` element at 1280, 1920, 393 or 852. `.private` is not rendered on any production work (no private links), so its 12 px is checked from CSS only. |
| D-06 / M-04 | Moved the seed file to `src/data/webmentions-fixtures/welcome.json`. `Webmentions.astro` reads it only when `UTOFME_FIXTURES` is true. Real data in `src/data/webmentions/` is untouched (`build-webmentions.ts` still writes there). Likes and replies are both `<ul>` with one list style. A failed avatar is hidden via `onerror` and has a muted circle background; the author name still reads. | `Webmentions.astro`, `src/data/**` | Production `/garden/welcome/`: 0 `aside.webmentions`, 0 `example.com` images. The existing e2e (`webmentions.spec.ts`, `garden-detail.spec.ts`) runs on the fixtures build and passes. |
| D-04 | New `src/lib/palette.ts` (`buildPaletteLinks`, `matchesLabel`) and `PaletteMount.astro`, which builds the list from `getWorksCollection()` plus the notes collection and a static lab entry, and passes it as the `links` prop. Entries: works (`title` → `/works/<slug>/`), notes (`Garden: <title>`), `Lab: datamosh`. The empty query still shows only the 8 commands; the typed query searches commands and links. Keyboard behaviour unchanged. | `CommandPalette.svelte`, `palette.ts`, `PaletteMount.astro`, `_BaseLayout.astro` | Production: typing "linsae" gives exactly one item, Enter goes to `/works/linsae/`. First-view JS: text routes 29.5 KB, project 30.9 KB, home 32.3 KB (limit 40). |
| D-11 | Reproduced 6/6 runs with the reported sequence (home → card → Back → Pause → Ctrl+K → type → Enter). The stack is **not** in the palette: it is `LinkPreview.svelte`'s body `focusout` handler `hide()`, which writes `visible = false`. Svelte removes the focused palette input while applying updates, `focusout` fires synchronously, and the write throws `state_unsafe_mutation`. Fix: `hide()` returns early when already hidden and defers the write to `queueMicrotask`. | `LinkPreview.svelte` (not on my list; small edit to the write site) | Before: 6/6 page errors. After: 0/6. The e2e regression test fails without the fix and passes with it. |
| M-07 | On `(pointer: coarse)`, `button`, `select`, `input` are 16 px and range inputs are at least 32 px tall. The rule sits at the end of the `<style>` block; earlier it lost to the `button, select` rule. | `MoshLab.svelte` | 393 px: every control reports 16 px (was 14 / 13.3), range height 32 (was 16). Desktop is unchanged. |
| M-08 | "Hover and drag across the cards." → "Move across the cards." | `datamosh.astro` (copy only) | |
| M-09 | `@media (max-height: 600px)`: `.panel` is `position: static`, no max-height, no scroll. | `MoshLab.svelte` | 852×393: `position: static`. Note: that rule only applied at ≥1000 px wide in the original code. |

## $derived / $effect audit (other islands)

- `CommandPalette.svelte`: `filtered` and `everything` are pure. The `$effect` that resets `selectedIndex` writes state inside an effect, which is allowed.
- `CustomCursor.svelte`: `pos` is written in rAF and `ready` in an effect, both fine.
- `LinkPreview.svelte`: the only unsafe write site, fixed above. `GraphView.svelte`, `ClickCounter.svelte` and `SandboxIsland.tsx` were not changed.

## Tests added or changed

- `tests/unit/palette.test.ts`: link builder (works, notes, lab, fixtures dropped, unique ids) and matcher.
- `tests/e2e/touch-fixes.spec.ts`: no visible cursor ring on touch; 44 px tap targets (Pause, sound, All projects, prev/next); "linsae" + Enter → `/works/linsae/`; the D-11 sequence raises no page error.
- `tests/unit/microformats.test.ts`: mocks `astro:content` and `works-collection` because `_BaseLayout` now mounts `PaletteMount`, which reads collections.

## Gates

- biome check: clean. astro check: 0 errors, 0 warnings, 1 pre-existing hint. type-coverage: 100.00% (32451/32451). knip: no findings (2 config hints already present). depcruise: no violations. check:docs: ok.
- Unit: 54 files, 625 passed, 1 skipped.
- E2E (fixtures build, this VM's Chromium via a local config pointing at `/opt/pw-browsers/chromium`; not committed): 160 passed, 3 skipped, 6 failed.
  - 4 are visual-regression specs, expected to change: `cards.spec.ts:42` (`/`), `image-pipeline.spec.ts:112` (cover-fixture), `landing.spec.ts:29` (`/`), `transitions.spec.ts:152` (`/`). Caption meta and tap-target changes alter the card pixels. The coordinator regenerates the baselines on a GitHub runner.
  - `typography.spec.ts:77` (mono font preload) fails because fonts cannot be fetched here. Not from this change.
  - `palette.spec.ts:54` (open ≤150 ms) measured 162 ms under 4 workers and passes 3/3 alone (about 2 s each). Load flake; open path is unchanged for an empty query.
- Production build, `check:no-fixtures`: clean. `check:budgets`: all routes ok. Two errors say chunks `_astro/base-80a1f760…js` and `_astro/ec.0vx5m.js` are "not reachable from any route". They look like expressive-code assets used only by fixture pages. I could not build main here to confirm they are pre-existing; flagging so the coordinator can compare. WARN R6 on `/` (enth card loop 178 KB) is already known.

## Decisions and leftovers

- The palette mount needed more than one line in `_BaseLayout.astro`: the import and the tag changed (2 lines total). The collection reading lives in the new `PaletteMount.astro`.
- Draft notes are not filtered because the notes schema has no draft field; draft works are filtered.
- The footer `source` link is left to the layout worker.
- `LinkPreview.svelte` was edited outside my list; the change is line-local.
- No "before" builds were made, so before values come from the reviews.
