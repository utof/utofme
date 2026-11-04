# Motion UI review (round 3)

Lens: motion and interaction. Read-only review; no product code changed.

Base: `origin/fix/ui-wave2-r` @ 4202c3a (main plus the ui2 project and chrome fixes).

## Method

- Production build: `UTOFME_FIXTURES=false bun run build`, served by `astro preview --port 4340` (Node 22.23.4).
- Headless Chromium (Playwright from `packages/site/node_modules`), desktop 1440x900 unless noted; phone 393x852, touch, DPR 3.
- Motion capture: `page.screenshot` bursts (actual paint timing, not the screencast) plus `recordVideo` where useful; ffmpeg extracts frames at 20 fps. Screencast "trail" copies are only reported when the screenshot burst shows them too.
- Timing: `document.getAnimations()` sampled during view transitions (duration, delay, easing, keyframes per pseudo-element), `performance.now()` around navigation, rAF interval sampling.
- Jank: CDP `Emulation.setCPUThrottlingRate` 4x, rAF frame-time p50/p95 and `longtask` PerformanceObserver while scrolling home and hovering cards.
- Reduced motion: `page.emulateMedia({ reducedMotion: "reduce" })`.
- Method follows the impeccable `animate` / `polish` / `critique` references: every motion must explain state, relationship or continuity; exit faster than entrance; interruptible; reduced-motion path keeps meaning.

## Findings

(in progress; confirmed so far)

- M3-01 (BROKEN): forward morph, both hero snapshots overflow the morphing box. `::view-transition-old/new(hero)` use `object-fit: cover` without `overflow: clip`, and Chromium paints replaced-element overflow outside the box. At t=40 ms the group is 804x362 at (108,412); the 16:9 old snapshot paints 804x452 at y 367-819 and the 3:1 new snapshot paints 1086x362 at x -33..1053. Fix: `overflow: clip` on both pseudo-elements (transitions.css:37-46). Evidence: motion/m3-01-*.png.
- M3-02 (MAJOR): card-to-banner video swap reveals the 1080p video on its first `playing`, then re-seeks it while visible: the banner freezes 205-226 ms on a frame 232-477 ms behind the card loop, then jumps (controller.ts:213-224).

## Checked and fine

(in progress)

## Top 10 to fix first

(in progress)
