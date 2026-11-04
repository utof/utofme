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

(in progress)

## Checked and fine

(in progress)

## Top 10 to fix first

(in progress)
