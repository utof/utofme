# ui3 fix report: morph (card ↔ banner, loop hand-off)

Branch `fix/ui3-morph`. Findings: M3-01, M3-02, M3-03, M3-04, M3-08, M3-10, plus M3-12 (same CSS block).

## What changed

| id | change | files |
|---|---|---|
| M3-01 | `overflow: clip` on `::view-transition-old/new(hero)` | `src/styles/transitions.css` |
| M3-03 | `object-position: 50% var(--vt-focus, 50%)`. `hero-morph.ts` sets `--vt-focus` on `<html>` (forward: from the new document's `.banner`; Back: from the live banner; restored after swap, removed on finish). Forward: card snapshot on top (z-index 1) and fades out 150 ms after 300 ms. Back: banner snapshot on top and dissolves in 200 ms. | `transitions.css`, `src/lib/vt/hero-morph.ts` (new `bannerFocus`) |
| M3-04 | `.site-header { view-transition-name: site-header }` and `::view-transition-group(site-header) { animation: none }` | `SiteHeader.astro` (one line + comment), `transitions.css` |
| M3-02 | The upgrade video carries `data-upgrade`. The generic `playing` reveal skips it. It is revealed only after the re-align `seeked` (predictive seek to card time +0.12 s) and one `requestVideoFrameCallback` (50 ms fallback; 900 ms hard fallback). The card video drops 220 ms later. Opacity fades over 180 ms, only under `prefers-reduced-motion: no-preference`. | `src/lib/loops/controller.ts`, `LoopMedia.astro` (CSS) |
| M3-08 | `astro:before-preparation` on Back stores `{slug, banner.currentTime}`. At remount that card's loop is seeded to it before `play()`. | `controller.ts` |
| M3-10 | `mountLoops(root, deps, {only, stagger})`. During a Back morph (`document.activeViewTransition`) only the hero loop mounts. When the transition finishes, all loops mount with a 50 ms stagger. | `controller.ts` |
| M3-12 | `hero-cap` old fade is 80 ms ease-in forward | `transitions.css` |
| (found) | A quick Back used to let the *forward* transition's `finished` run `clearAll` and strip the marks and `--vt-focus` mid-Back. Cleanup is now generation-guarded (only the latest navigation cleans up). | `hero-morph.ts` |

Reduced motion: unchanged. Astro's `animation: none !important` kill switch still wins, and the new fade is gated by `no-preference`. The "Pause motion" path is unchanged: the card video is dropped at once and the sharp poster shows.

## Measurements (production build, paused animations, `currentTime` = 0/25/50/75/100 % of 450 ms)

Frames are in `packages/specs/reports/ui3-fix/morph/`. Each sheet has the "before" row on top and "after" below, for enth, tactical-arena and gr-demo-learn at 1440×900, plus enth at 393×852 touch, forward and Back.

- Computed style of `::view-transition-old/new(hero)`, before → after: `overflow` visible → clip. `object-position` 50% 50% → `50% 8%` (enth). Group size is the same as before: forward 606×341 → 1224×408, Back the reverse.
- Before, both snapshots painted past the group box. After, nothing paints outside it (see sheets).
- Header: it has its own group with no animation. A test asserts that `::view-transition-group(site-header)` has no running animation during the morph.
- Phone 393×852: the banner is 16:9 there. The group is 334×188 at every step, and the header no longer blinks. The sheets show no spill.
- Back loops (enth, 1440): banner `currentTime` 4.186 at Back. Hero card loop 4.195 at `astro:page-load`, 4.40 at +300 ms. Videos playing: 1 at page-load and during the morph, 4 at `finished`+400 ms (the visible ones, staggered). Before, all started at frame 0 about 180 ms after Back.
- Longest frame during Back at 4× CPU (VT window, software-rendered headless, 2 runs × 3 cards): before 66.7 / 66.7 / 66.6 ms, after 50.0 / 66.6 / 50.1 ms. This environment is noisy at 33 ms granularity, so treat it as "not worse, slightly better", not as a precise gain. Rendering of the loop work is deferred; the main-thread group animation is unchanged.
- M3-02: an e2e test measures drift between the banner and the persisted card node at reveal. It is under 0.2 s, and `seeking` is false at reveal (assertion: drift + 100 if seeking < 0.2).

## Tests added

- Unit: `bannerFocus`; `data-upgrade` is not revealed by `playing`; `mountLoops` `only`.
- e2e (`p09-morph.spec.ts`): header name and no group animation; hero snapshots `overflow: clip` and non-default `object-position` and `--vt-focus` both ways, with `--vt-focus` removed after; banner reveal drift.

## Visual-regression specs expected to change

`transitions.spec.ts` snapshots (if they capture the header or morph frames) and `cards.spec.ts`/`landing.spec.ts` should not change (no resting-state CSS changed). Regenerate on the runner.

## Gates

- biome check: clean. astro check: 0 errors, 0 warnings, 1 pre-existing hint (`SoundToggle.astro`).
- type-coverage: 100.00% (34900/34900).
- knip: no findings, only 2 existing config hints. depcruise: no violations. check:docs: clean.
- Unit: 644 passed, 1 skipped (58 files).
- e2e (default build, Chromium full, all but screenshot specs): 201 passed, 3 skipped, 1 failed. The failure is `typography.spec.ts:77` "preload link for local mono font": this VM cannot fetch fonts and the test touches nothing I changed.
- `UTOFME_FIXTURES=false` build + `check:no-fixtures`: clean. `check:budgets`: passes after the default (CI-style) build. After a `UTOFME_FIXTURES=false` build it reports 11 SELF "unreachable chunk" errors (Sandbox/Counter/react), because those chunks are only referenced by fixture pages. That is unrelated to this change; CI runs budgets after the default build.

## Decisions / not done

- Forward keeps the card snapshot on top and crops it to the banner focus. This avoids the banner's zoomed band on frame 1, and the 150 ms handover lands at 300 ms.
- The predictive seek uses +0.12 s (the review suggested 0.15) so drift at reveal stays within ~0.1 s.
- Not touched (other area): M3-05…M3-07, M3-09, M3-11, M3-13…M3-17.
- I could not measure real-device frame timing; all numbers are headless Chromium.
