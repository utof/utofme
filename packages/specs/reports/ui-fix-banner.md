# UI fix report — area `banner` (branch `fix/ui-banner`)

## Summary
The project banner now ends on the 1920×1080 rendition after a card → banner morph. After the swap the page behaves as it does on a direct load: no black flash, no restart from frame 0, no jump. The morph itself now moves only the named `hero` frame. Landscape phones get a shorter banner. The crop review found nothing that `cover.focus` can fix; the cut-off labels are baked into the source masters.

## Findings

### D-02 (MAJOR) banner plays the upscaled card loop after a morph — fixed
- Cause: `transition:persist` keeps the home card's `<video>` (768×432 sources) alive, and it replaces the banner's own video.
- Change:
  - `LoopMedia.astro`: a persisted banner frame now carries `data-banner-sources` (its own banner sources as JSON; the frame itself is not persisted).
  - `src/lib/loops/controller.ts`: new `upgradeBannerLoops` (plus `parseBannerSources`) runs at `astro:page-load`, before `mountLoops`. It inserts a hidden banner-rendition `<video>` above the card one and sets its start time to the card video's `currentTime`. The controller reveals it on its first `playing`. When it plays it re-aligns to the card video's time (if more than 0.1 s apart), then drops the card video one video frame later.
  - Pause motion / Save-Data / reduced motion: the card video is removed at once, so the sharp banner poster shows. The banner video stays hidden until unpaused.
  - The new node has no persist id, so Back to `/` mounts the card's own card-rendition video. I confirmed that in a test.
  - Poster: the banner `<picture>` was already the banner poster (1920 px master, widths 640–2560). No change needed.
- Measurement (1280×800, 3.5 s after clicking the Tactical Arena card):
  - before: `card.c0364b24.av1.mp4`, `videoWidth` 768, box 1216 px (1.58× upscale)
  - after: `banner.7afcad36.av1.mp4`, `videoWidth` 1920, box 1216 px
  - 1920×1080 @DPR2 after morph: `banner.…` / 1920, box 1280 px, poster `poster.CVI49JHM_ZKT5eI.avif` (before: card / 768)
- Swap timing: 300 ms after the page change both videos exist (card t=1.84 s playing, banner t=1.55 s still hidden, opacity 0). By 1 s only the banner video is left, visible, with `data-ready`.
- Tests:
  - `tests/e2e/banner-quality.spec.ts`: `currentSrc` matches `banner.*`; `videoWidth` is 1920 within 8 s; exactly one banner video remains and it is ready.
  - Same file: Back to `/` leaves the card on the card rendition (the `<source>` url contains `/card.`).
  - Same file: with Pause motion on, the morph ends with a banner-size, not-ready video (poster shown).
  - `tests/unit/loops/banner-upgrade.test.ts`: parser edge cases; the upgrade function adds the banner video, drops the persist id, and removes the card video at once when paused.
- Screenshots: `d02-before-1280.png`, `d02-after-1280.png`. Fonts differ from production because Google Fonts can't be fetched here.

### M-14 (POLISH) root cross-fade during the morph — fixed in Chromium; Firefox not tested
- `transitions.css`, scoped to `html[data-vt-morph]` (set by hero-morph.ts while a morph is in flight):
  - old root fades out in 120 ms;
  - new root starts after 140 ms, over 220 ms, with fill `backwards`;
  - `::view-transition` gets `--color-bg`, so the gap shows page white, not a black canvas.
  - Net effect: the masonry and the project text are never on screen together. The hero group (450 ms) and hero-cap timings are unchanged.
- `src/lib/vt/hero-morph.ts` (outside my brief's list, one line): `astro:after-swap` now re-sets `data-vt-morph`. Astro's swap replaces `<html>`'s attributes, and the mark set before navigation was gone by the time Chromium resolved the pseudo-element styles. I checked this in the browser: `data-vt-morph` was false, the new rule didn't apply, then true after the fix.
- Measured pseudo-element animations (Chromium): old root 120 ms, new root 220 ms with 140 ms delay, hero group 450 ms. Mid-morph frames: `m14-after-morph-frames.png` (frame 1 is the masonry only; later frames show the project text with no masonry).
- Reduced motion: the existing `animation: none !important` block is unchanged and still wins.
- Firefox / Astro's `fallback: "animate"` path: no Firefox binary in this VM, so it is untested. The new rules are `::view-transition-*` selectors only, which a fallback path ignores.

### M-05 (MAJOR) banner pushes the title below the fold on landscape phones — fixed
- `_WorkLayout.astro` (`.banner` CSS only): `@media (max-height: 500px) { .banner { max-height: 38svh } }`.
- 852×393, iPhone 15 profile, `/works/eeg-ads1299-lab/`:

  | | banner | h1 bottom | lede |
  |---|---|---|---|
  | before | 788×236 | 352 | 360–387 (touches the fold) |
  | after | 788×149 | 266 | 274–301 |

- Portrait 393×852 is unchanged (329×185).
- Test: `banner-quality.spec.ts` "landscape phone" asserts banner height ≤ 40 % of 393 and h1 bottom < 393.
- Screenshots: `m05-before-land.png`, `m05-after-land.png`.

### M-12 + D-12 (crops) — no change; the cut-off is baked into the source masters
- I checked every published work: card at 1280 (16:9), banner at 393 (16:9) and at 1280 (3:1). The measurements:
  - All seven `loops.json` entries are 16:9 masters (poster 1920×1080, banner 1920×1080, card 768×432).
  - A 16:9 frame on a 16:9 source crops nothing, so `object-position` / `cover.focus` has no effect on the card or the phone banner.
  - `modified-maxwell-taichi`: the master itself ends with the colour bar and x-axis cut (`d12`-style check on `poster.png`: the bottom axis and labels are not in the file).
  - `gr-demo-learn`: the right plot's right edge and "r / M" label are already clipped in `poster.png` (`d12-gr-demo-learn-source-poster.png`). On the card the dark-glass caption bar then covers the bottom axis labels.
  - Fixing these needs re-exported masters; sources aren't in the repo and the brief forbids re-encoding.
- 3:1 desktop banners: focus values (tactical-arena 40, godot-ctcs 45, others 50) show the subject in all seven. `eeg-ads1299-lab` loses either its title or its x-axis at 3:1; no focus value fits both, so I left it.
- No horizontal focus is needed, so no schema change, no schema test and no `--focus-x` (I tried it, then reverted).
- Screenshots: `m12-phone-banners-unchanged.png`, `m12-home-cards-unchanged.png`.

## Gates (packages/site unless noted)
- `bun x biome check` (repo root): clean.
- `bun x astro check`: 0 errors, 0 warnings, 1 hint (existing, `SoundToggle.astro`).
- `type-coverage --at-least 100 --strict`: 100.00 % (32625/32625).
- `knip`: clean (two config hints about `wrangler` / `lefthook` in `knip.jsonc`, present on main).
- `depcruise`: no violations (53 modules).
- `check:docs`: pass.
- Unit suite, fixtures build: 54 files, 625 passed, 1 skipped. (Against a `UTOFME_FIXTURES=false` build, 70 failures in `card-pagefind-attrs.test.ts` appear. That file reads fixture cards and needs the fixtures build; it is not related to this change.)
- Playwright e2e, fixtures build, excluding screenshot specs: 160 passed, 3 skipped, 1 failed — `typography.spec.ts:77` "preload link for local mono font exists" (0 `link[rel=preload][as=font]` tags). I didn't touch `<head>`; fonts can't be fetched in this VM, so I treated it as environmental but did not prove that on main. The browser here is the pre-installed Chromium (`/opt/pw-browsers/chromium`) via a throwaway local config, not committed.
- `UTOFME_FIXTURES=false bun run build`, `check:no-fixtures`: clean.
- `check:budgets` fails with the same findings as unmodified main, which I rebuilt and compared:
  - 11 `SELF` "chunk not reachable from any route" errors (Sandbox/react chunks);
  - 2 R6 warnings (enth and godot-ctcs card h264 files, 178058 B and 203715 B).
  - Per-route first-view JS is unchanged by this work: project routes 31.4 KB, `/` 32.8 KB. The brief's known R4 failure isn't present because no fixture GIF-cover route is built in the production variant.

## Visual-regression baselines expected to change
Not regenerated here. Specs that screenshot a project page (banner at <500 px height, hero transition frames) or a page containing the changed CSS:
- `tests/e2e/transitions.spec.ts` (morph/transition snapshots)
- `tests/e2e/image-pipeline.spec.ts` (project/banner snapshots)
- `tests/e2e/cards.spec.ts` and `landing.spec.ts` should not change (no home/card changes), but they share the transitions stylesheet; the coordinator should confirm on the runner.

## Decisions
- Used a second video element with an explicit swap instead of switching `src` on the persisted node (that blanks the element) or dropping persist (that loses the hero continuity).
- Dropped the persist id from the upgraded node so Back doesn't carry a 1080p video onto the grid card.
- Pause motion: poster only, not a paused frame of the card video. A frozen upscaled card frame would reproduce the low-quality look.
- Scoped the root fade-through to morphs so other navigations keep their 200 ms cross-fade.

## Not done
- Re-exported masters for `modified-maxwell-taichi` and `gr-demo-learn` (needs the original sources).
- Firefox / Astro fallback-path verification of the morph.
