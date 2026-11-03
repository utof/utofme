# ADR 0041 — Datamosh hover: simulated block feedback on Canvas 2D (flagged), plus a noindexed playground

**Status:** accepted (experimental, reversible; off by default)
**Date:** 2026-11-02

## Context

The masonry home (ADR 0040) already has an opt-in hover dither. The owner wants a
second, more aggressive hover effect that reads as **datamosh**: stale blocks of
the picture dragged along the cursor path, never refreshed, with the occasional
frozen or snapped-back block and, on entry, a bleed from the previously hovered
card.

Constraints that shaped the choice:

- **No GPU on the owner's Chrome.** `getContext("webgl2")` returns `null` and
  `navigator.gpu.requestAdapter()` returns `null`; Chrome has been removing the
  software WebGL (SwiftShader) fallback on purpose, and a forced SwiftShader
  feedback shader cost ~17.7 ms p50 at 480x500, slower than every CPU kernel
  measured. Headless CI Chrome still hands out SwiftShader, so a GPU path would look
  healthy in Playwright while the owner never sees it.
- **The look is block-quantised.** Datamosh is "inter-frame prediction applied to the
  wrong reference": whole-pixel vectors constant over 8-16 px blocks, copied without
  filtering, old pixels kept. That is exactly what a typed-array CPU kernel does
  natively, and it avoids the GPU feedback traps (8-bit history collapsing to
  black, bilinear history melting to mush).
- **Frame budget.** Aim for p50 <= 5 ms and p95 <= 10 ms of script per frame (RAIL).
  The existing 2D dither fallback measured 6-8 ms p50 and ~13 ms p95 on the owner's
  machine.
- **Animated GIF covers.** Every engine returns only frame 0 of an animated `<img>`
  from `drawImage`, `createImageBitmap` and `texImage2D`, so any per-frame effect on a
  GIF card needs its own decoder clock.
- **Accessibility.** WCAG 2.3.1 allows at most three general flashes per second, and
  at 240,000 px² a card gets no small-area exemption (it ends near 87,296 CSS px²).
- **Tuning is a taste problem.** No design review had been run on the site's real
  media; the constants of every reference implementation were found by moving
  sliders until it looked corrupted.

## Decision

1. **Simulate the codec, on Canvas 2D, as the primary and only backend this round.**
   `src/lib/datamosh/engine.ts` is a pure, DOM-free kernel: three RGBA planes as
   `Uint32Array` (source, two ping-pong history planes), per-block vectors, stale
   and lost-sector state. Each frame a block either refreshes from the source or
   copies the previous output displaced by `-mv`, with vectors written by pointer
   velocity times a smoothstep falloff, decayed, clamped and snapped to whole
   internal pixels. The shell (`card-mosh.ts`) mirrors the dither's shell: one shared
   overlay canvas re-parented into the hovered card's `<li>`, backing store at
   `round(CSS size x scale)` (default 0.5, independent of DPR) stretched with
   `image-rendering: pixelated`, `(pointer: fine)` and `prefers-reduced-motion`
   gates subscribed live, IntersectionObserver and visibility pausing, and
   `astro:before-swap` self-dispose. Unlike the dither it runs until the kernel
   reports `settled`, so the smear heals after the pointer leaves. Entry seeds the
   feedback plane with the previously hovered card's last frame (the "cut" between
   cards); `self` and `none` are options.
2. **One config, ~25 sliders.** `src/lib/datamosh/config.ts` holds the parameter
   table (`MOSH_PARAMS`); defaults, the `m-<key>` URL codec (non-default values only,
   clamped and snapped on decode) and the playground controls all derive from it.
   `backend` from the design report's table is omitted: the playground shows it as a
   read-only readout.
3. **Real GIF frames through `ImageDecoder`.** `gif-source.ts` feature-detects
   `ImageDecoder` and `isTypeSupported("image/gif")`, fetches the GIF once with
   `cache: "force-cache"` (small per-URL byte cache), and decodes one frame at a time
   on the GIF's own clock, closing every `VideoFrame`. Anywhere it cannot (no
   `ImageDecoder`, error, `gifSource: "frame0"`) the card is a frozen frame 0, which
   reads as "the decoder lost its keyframe". Writing frames into the source plane
   never resets the feedback plane.
4. **WCAG 2.3.1 flash cap in the kernel.** Every high-contrast event (the
   hover-entry cut, a lost-sector toggle, a forced full "GOP" refresh) must win a
   slot from a limiter that grants at most `flashCap` (<= 3) events in any 1000 ms
   window; otherwise the event is skipped (cut) or deferred (GOP, sector expiry).
   It is a sliding window rather than a refilling token bucket, because a bucket of
   capacity `cap` refilling at `cap` per second would allow `2 x cap` in one second.
   The continuous smear itself is not a flash.
5. **Flag, not default.** `?mosh` / `?mosh=0` via `resolveFlag("mosh", ...)`,
   persisted like the dither's flag; `src/pages/index.astro` dynamically imports the
   module only when the flag is on, so the default page ships nothing. `mosh` and
   `dither` are mutually exclusive on the grid (`mosh` wins). `/?mosh&m-block=8&...`
   carries tunables.
6. **Playground at `/lab/datamosh/`.** A static page with a small masonry (still and
   GIF covers interleaved, so the cut and the GIF path can both be tried) and a Svelte
   island with the generated controls, Reset / Copy JSON / Copy URL, an Effect select
   (mosh | dither | off, one mounted at a time) and calibration readouts: active
   backend, internal size, active blocks, p50/p95 kernel ms over the last 120 frames,
   `ImageDecoder` and `VideoDecoder.isConfigSupported({ codec: "vp8" })` support, and
   `hardwareConcurrency`. Running the dither on the same page turns the
   host-versus-owner's-VM gap into a number. `_BaseLayout` gained a `noindex` prop
   (emits `<meta name="robots" content="noindex">`) and `sitemapFilter` excludes
   `/lab/`.
7. **Licences.** Nothing is copied. The design is informed by MIT code (Fanton's
   data-mosh; Keijiro's Kino/Datamosh, whose shader header is MIT while its repo
   `LICENSE` is the Unlicense) and attributed in the `engine.ts` header comment. GPL
   sources (datamoshlive, supermosh, alexr4/datamoshing-GLSL, `@ffmpeg/core`),
   unlicensed code (hydra-datamosh), Commons Clause code (react-bits) and Shadertoy
   defaults were read for technique at most and contribute no lines. Anything later
   ported from an MIT/BSD/Unlicense source needs its notice in a code comment.

## Alternatives

- **WebGL2 fragment-shader port of the same loop** (RGBA8 NEAREST ping-pong,
  `texelFetch`, probing with `failIfMajorPerformanceCaveat: true`). Same look, but
  unavailable on the owner's browser and slower than the CPU kernel under SwiftShader.
  Kept as an optional later GPU tier once the look is approved; the owner could not
  see it.
- **WebCodecs VP8 / H.264 keyframe-drop or delta-repeat.** The most authentic pixels
  and ~1.5-2.4 ms per frame, but the codec picks the vectors (it ignores the cursor),
  it needs a build-time encode and per-card assets (a new-dependency decision), VP9
  needs error-resilient encoding, AV1 cannot be moshed, and H.264 may be missing in
  distro Chromium builds. Candidate for a later playground "codec" mode.
- **MSE segment splice.** Same pixels as WebCodecs with less per-frame control.
- **ffmpeg.wasm.** ~10 MB gzip, ~0.04x native speed: an authoring tool, not a hover
  tool.
- **SVG `feTurbulence` + `feDisplacementMap`.** Keeps no history, so it cannot drag
  stale pixels; rejected.
- **Pre-baked moshed video swapped in on hover.** Authentic and ~0 runtime cost, but
  no cursor, extra bytes per card and a build step; a possible static tier.
- **WebGPU.** Needs an adapter; none on the owner's machine.
- **Other ways to read GIF frames.** omggif (MIT, ~3 KB gzip) is the universal
  decoder if `ImageDecoder` coverage (Chrome/Edge, Firefox 133+, Safari only in
  Technology Preview) proves too thin; converting GIFs to `<video>` and reading
  `requestVideoFrameCallback` would also cut download size but changes the card's
  media element and belongs in its own ADR.
- **Extract the dither's shell into a shared host** now. Cleaner long-term, but out
  of scope for this change; the only edit to `card-dither.ts` is an optional
  `onFrame` timing hook.

## Consequences

- Kernel cost is flat and small. Measured on the dev VM (Playwright Chromium) at ~615x821 CSS px, internal 308x410, default config: p50 2.4 ms, p95
  3.0 ms per frame including `putImageData`; the 2D dither on the same page took
  ~22 ms p50. The numbers are from one host and the playground is the instrument
  for re-measuring on the owner's browser.
- Pointer-driven gestures are saturating by default (`gain` 2 with `decay` 0.94
  clamps almost any motion at `maxVector`); direction matters more than speed.
  Tuning, not code, is the follow-up.
- A GIF card costs an extra source update (decode, downscale, `getImageData`,
  ~5-6 ms) on frames where the GIF advances, at most ~20 times a second.
- The overlay is opaque while hovered and drifts against the underlying `<img>`
  animation; the heal-and-fade on leave hides the seam.
- The dither still reads frame 0 of GIF cards (`texImage2D` / `drawImage` of an
  animated `<img>`), so it likely shows a frozen dither over a moving GIF. That
  deserves its own issue; it is not fixed here.
- Playwright e2e for hover must run in a desktop (fine-pointer, non-touch) context:
  the config's Pixel 5 project reports `(pointer: coarse)` and the effect, correctly,
  stays off.
- The `/lab/` route is a maintained tool: keep it noindexed and out of the sitemap.

## Sources

- https://github.com/niccolofanton/data-mosh (MIT; shaders, skip / lost sector / mismatch rules)
- https://github.com/niccolofanton/data-mosh/blob/HEAD/datamosh-demo/src/datamosh/shaders.ts
- https://github.com/niccolofanton/data-mosh/blob/HEAD/datamosh-demo/src/datamosh/index.ts
- https://github.com/keijiro/KinoDatamosh (MIT shader header, Unlicense repo)
- https://github.com/keijiro/KinoDatamosh/blob/master/LICENSE
- https://github.com/graciegould/react-corruption (MIT; default values used as slider seeds)
- https://ompuco.wordpress.com/2018/03/29/creating-your-own-datamosh-effect/
- https://github.com/furniture3k/Video-Datamosher/blob/main/site/docs/what-is-datamoshing.md
- https://www.epidemicsound.com/blog/how-to-datamosh/
- https://www.w3.org/TR/webcodecs/
- https://github.com/geikha/datamoshlive (GPL, technique only)
- https://github.com/supermosh/supermosh.github.io (GPL, technique only)
- https://github.com/emptyflash/hydra-datamosh (no licence, idea only)
- https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md (MIT + Commons Clause, not ported)
- https://html.spec.whatwg.org/multipage/canvas.html (animated images draw their default frame)
- https://bugs.webkit.org/show_bug.cgi?id=74779
- https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder
- https://caniuse.com/mdn-api_imagedecoder
- https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/
- https://github.com/deanm/omggif
- https://developers.cloudflare.com/workers/static-assets/headers/
- https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
- https://developer.chrome.com/blog/chrome-138-beta
- https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
- https://web.dev/articles/rail
- https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- https://ffmpegwasm.netlify.app/docs/performance
