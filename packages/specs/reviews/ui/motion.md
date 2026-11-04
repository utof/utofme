# Motion UI review (round 3)

Lens: motion and interaction. Read-only review; no product code changed.

Base: `origin/fix/ui-wave2-r` @ 4202c3a (main plus the ui2 project and chrome fixes). Astro 7.4.5.

## Method

- Production build: `UTOFME_FIXTURES=false bun run build`, served by `astro preview --port 4340` (Node 22.23.4).
- Headless Chromium from `packages/site/node_modules` (Playwright 1.59.1), desktop 1440x900 unless noted; phone 393x852, touch, DPR 3.
- **Frame-exact view-transition frames.** On `astro:before-swap` the probe waits for `viewTransition.ready`, pauses every `::view-transition-*` animation, then sets each animation's `currentTime` to t (0, 40, 80 ... 450 ms) and takes a `page.screenshot`. This shows the real composited state at a known time with no screencast involved. The "stacked copies" seen mid-morph are real, not a screencast trail: they show up in these paused screenshots, in both chromium-headless-shell and full Chromium (new headless), and they match the computed geometry of `::view-transition-old/new(hero)` to the pixel (M3-01).
- **Timing.** `document.getAnimations()` inventory per navigation (duration, delay, easing, keyframes). An in-page log records `astro:*` events, `viewTransition.ready/finished`, media events (`playing`, `seeking`, `seeked`) and `data-ready` mutations, stamped with `performance.now()`.
- **Hover.** Per-rAF sampling of the computed `transform` (media scale, caption translateY) and of the meta opacity.
- **Jank.** CDP `Emulation.setCPUThrottlingRate` 1x/4x. rAF intervals sampled only inside the `vt:ready`..`vt:finished` window, `longtask` PerformanceObserver, and a CDP CPU profile (200 µs sampling). Software-composited headless runs at a 30 Hz cadence and drops VT frames on its own, so the frame numbers come from new-headless Chromium on the laptop GPU (`--use-angle=gl`, WebGL renderer reported "Quadro RTX 3000"). They are still headless: use them for relative comparison, not as field data.
- **Other.** Network throttling (4 Mbps, 150 ms RTT) for the lightbox. `reducedMotion: "reduce"` contexts. Flash analysis of every `*.h264.mp4` loop: per-frame relative luminance (whole frame and quadrants), counting opposing ≥10 % changes within any 1 s window.
- **Proposed fixes.** Each CSS fix marked "verified" was injected into the live page through an init-script `<style>` and re-captured with the same probe.
- The impeccable `animate` / `polish` references set the bar. Motion must explain continuity or state. Exits run faster than entrances but must not snap. Motion must be interruptible, and the reduced-motion path must keep its meaning.

## Findings

| id | sev | page | viewport | what's wrong (measured) | evidence | likely source |
|---|---|---|---|---|---|---|
| M3-01 | BROKEN | `/` ↔ `/works/<slug>/` | desktop (any width where the banner is not 16:9) | Both hero snapshots paint outside the morphing box for the whole 450 ms. Forward t=0: the 3:1 banner paints 1022x341 at x −100..922 over a 606x341 card. t=40: box 804x362, old paints 804x452, new paints 1086x362. Back t=0: the card spills 140 px above and below the banner box, over the header and the title. | `motion/m3-01-*.png` | `src/styles/transitions.css:37-46` |
| M3-02 | MAJOR | `/works/<slug>/` after the forward morph | all | The 1080p swap is revealed on its first `playing`, then re-seeked while visible. It freezes 205–226 ms on a frame 232–477 ms behind the card loop, jumps, and pops from blurred 768 px to a sharp 1920 px frame. | `motion/m3-02-card-vs-banner-rendition-dpr2.png` + event log below | `src/lib/loops/controller.ts:71-75, 177-226` |
| M3-03 | MAJOR (shows once M3-01 is fixed) | `/` ↔ `/works/<slug>/` | desktop | Crop mismatch at t=0. The snapshots crop at 50 %, but banners use a per-project focus (enth 8 %, tactical 10 %, maxwell 5 %, eeg 0 %). Forward, the banner crop sits on top from frame 1, so the card jumps to a zoomed band. Back starts on a different vertical band. | `motion/m3-03-crop-pop-fwd-t0.png`, `motion/m3-03-crop-pop-back-t0.png` | `transitions.css:37-46`, `src/lib/vt/hero-morph.ts` |
| M3-04 | MAJOR | `/` ↔ `/works/<slug>/` | desktop + phone | The site header blanks out on every card ↔ project morph. Wordmark ink: 42 % at 40 ms, 7 % at 80 ms, 0 % from 100 to 140 ms, 45 % at 200 ms, 95 % at 300 ms. It is invisible for about 90 ms and under half strength for about 170 ms. | `motion/m3-04-header-blink-*.png`, `motion/m3-04-phone-fwd-*.png` | `transitions.css:67-78`, `src/components/SiteHeader.astro:23` |
| M3-05 | BROKEN (reduced-motion path) | `/garden/graph/` | all | With `prefers-reduced-motion: reduce` the graph canvas never paints: 0 non-transparent pixels after 5 s, against 2,023 for the same 6 nodes without the setting. | `motion/m3-05-graph-normal-vs-reduced-motion.png` | `src/components/GraphView.svelte:137, 148` |
| M3-06 | MAJOR | project pages, gallery lightbox | all | The first open of each image paints a 1406x50 caption strip at y=425, then snaps to 1406x802. That is 1 frame locally and 167 ms at 4 Mbps/150 ms RTT, followed by a mostly white box until 406 ms. The 78 % black backdrop also appears and disappears in a single frame. | `motion/m3-06-lightbox-open-90ms-240ms-4mbps.png` | `src/lib/lightbox.ts:44-58`, `src/components/Gallery.astro:140-195` |
| M3-07 | MINOR | gallery lightbox, ←/→ | all | When stepping, the caption changes at 1–2 ms but the image only on `load`: 13–18 ms locally, 346–496 ms throttled. During that time the previous picture sits under the next caption, with no loading cue. | `motion/m3-07-lightbox-step-120ms-caption-mismatch.png` | `src/lib/lightbox.ts:44-52, 65-70` |
| M3-08 | MINOR | `/works/<slug>/` → Back → `/` | all | Back remounts all 7 card loops at frame 0 (all `playing` 179–198 ms after Back, ct 0.000). The morph leaves the banner at frame T and lands on frame 0, a content cut at the start of the morph, and the whole grid restarts in sync. | event log below | `src/lib/loops/controller.ts:228-256` |
| M3-09 | MINOR | `/` ↔ project ↔ slash pages | desktop | The header controls move between routes. "Pause motion" is at x=1222 on home and x=1103 on projects (119 px), because "Sound" is appended after it. It is absent on slash pages, where "Sound" sits at x=1221. | header geometry below | `src/layouts/_BaseLayout.astro:120-123` |
| M3-10 | MINOR | Back morph | desktop, 4x CPU | 100 ms freeze inside the Back morph at 4x: VT-window frames p50 16.7 / p95 50.1 / max 100 ms. Forward: p95 33.4, max 49.9. Input → first morph frame: 95–103 ms at 1x, 136–245 ms at 4x. | numbers below | `controller.ts:231-235, 246-256` |
| M3-11 | POLISH | `/` card hover | desktop fine pointer | The hover exit snaps. In the first ≤31 ms after mouseleave the zoom drops 39 % (1.05 → 1.0305, about 6 px per edge in one frame) and the caption covers 65 % of its 26 px travel. | hover samples below | `src/components/Card.astro:286-297` |
| M3-12 | POLISH | `/` → project | desktop | The forward caption bar (`hero-cap`) is left behind. It fades in place at the card's bottom over 120 ms while the image flies to the banner, so it reads as detached at t=40 ms. | `motion/m3-01-morph-overflow-t40-vs-clip.png` (bottom-left of the right half) | `transitions.css:49-51` |
| M3-13 | MINOR | Ctrl+K palette, all pages | desktop | The backdrop (white 40 % + 4 px blur) is at full strength in frame 1. Close removes backdrop and panel in one frame. Only the panel animates in: opacity 0.80 at 72 ms, 0.99 at 179 ms, scale 0.96 → 1. | sample log below | `src/components/CommandPalette.svelte:264-280, 336-382` |
| M3-14 | MINOR | palette results, garden graph nodes | all | These links hard-reload instead of using the ClientRouter: no 200 ms cross-fade, and loops, islands and fonts start again. | code | `CommandPalette.svelte:153`, `GraphView.svelte:141` |
| M3-15 | POLISH | slash pages, notes | all | The unique `transition:name`s on page titles never pair, so they only add mismatched fades: old title 250 ms UA `ease`, new title 180 ms `cubic-bezier(.76,0,.24,1)`, rest of the page 200 ms `ease`. | VT inventory below | `src/layouts/_SlashLayout.astro:39`, `src/pages/stats.astro:21`, `src/layouts/_NoteLayout.astro:32` |
| M3-16 | POLISH | all (fine pointer) | desktop | The cursor ring's lerp depends on frame rate: ×0.18 per frame gives ~250 ms of trail at 60 Hz, ~125 ms at 120 Hz, ~500 ms at 30 Hz. The rAF loop never sleeps (3 s idle with the pointer still: +21.6 ms script, +49.5 ms task time). The ring is part of the root snapshot, so it blinks with M3-04. | metrics below | `src/components/CustomCursor.svelte:19-41` |
| M3-17 | POLISH | `/`, project banners | all | 5 of 7 loops are encoded at 10 fps (eeg, enth, godot-ctcs, gr-demo-learn, linsae) next to 30 fps neighbours. Each wrap costs ~3 frames (rVFC gap 100–133 ms). Four loops end on a hard cut (61–79 % of pixels change at the seam). | seam numbers below | `packages/site/media/recipes/*.json` (`fps`), `scripts/encode-loops.ts` |

### M3-01 — hero snapshots overflow the morphing box (BROKEN)

- **Repro.** At 1440x900, click any card on `/` (tested: enth, tactical-arena, gr-demo-learn), or press Back from any project page.
- **Measured** (computed style of the pseudo-elements at t=40 ms on enth, plus a screenshot):
  - `::view-transition-group(hero)` is 804x362.375 at (108, 411.9).
  - `::view-transition-old(hero)` and `-new(hero)` are 804x362 with `object-fit: cover`.
  - The 16:9 old image paints at its cover size, 804x452 (y 367–819). The 3:1 new image paints 1086x362 (x −33..1053), past the viewport's left edge.
  - At t=0 the new image already covers the neighbouring column (`m3-01-morph-fwd-t0-overflow.png`).
  - Back has the mirror problem (`m3-01-morph-back-t40-overflow.png`).
- **Cause.** Chromium paints a replaced element's `object-fit` overflow unless `overflow` clips it. The VT pseudo-elements default to `overflow: visible`.
- **Fix** (verified, `m3-01-morph-overflow-t40-vs-clip.png` right half). Add `overflow: clip;` to the existing `::view-transition-old(hero), ::view-transition-new(hero)` rule. This is the recipe in Chrome's "Handle changes in aspect ratio" section (`animation: none; mix-blend-mode: normal; height: 100%; overflow: clip;`), https://developer.chrome.com/docs/web-platform/view-transitions/same-document. Ship together with M3-03.

### M3-02 — banner rendition swap: freeze, jump and blur-to-sharp pop (MAJOR)

- **Repro.** Click a card and watch the banner during the last third of the morph.
- **Event log** (ms after click, local preview, 1440x900):
  - **enth**
    - `vt:ready` 194, morph anims 241, `vt:finished` 782.
    - The banner video is inserted at ct 3.799.
    - `playing` at 686 sets `data-ready` (now visible, on top) at ct 3.799.
    - It immediately starts `seeking` to 4.276 (drift > 0.1 s); `seeked` at 912.
    - So for 226 ms the top layer shows a frame 477 ms older than the card loop underneath, then jumps forward. The card video is removed at 938.
  - **linsae.** Revealed at 445 at ct 3.740, re-seek to 3.971, `seeked` at 650: frozen 205 ms, 232 ms stale.
  - **tactical-arena.** Drift 30 ms, so there is no re-seek, only the sharpness step.
- **Where it lands.** The swap lands 238–445 ms into the 450 ms morph. On the CDN the 0.2–1 MB banner takes longer to arrive, so the stale gap grows.
- **Sharpness step.** It comes on top of that: `m3-02-card-vs-banner-rendition-dpr2.png` shows the same frame from the 768 px card file stretched to the banner at DPR 2 (left) against the 1920 px banner file (right).
- **Fix** (`controller.ts`):
  1. Mark the upgrade video (`next.setAttribute("data-upgrade", "")`). Make the generic `playing → data-ready` reveal in `mountLoops` (`:71-75`) skip `[data-upgrade]`.
  2. In `upgradeBannerLoops`, reveal it inside `settle()`: after the re-align `seeked` (or straight away when drift ≤ 0.1 s), call `next.requestVideoFrameCallback(() => { next.setAttribute("data-ready", ""); next.requestVideoFrameCallback(drop); })`. Keep the 500 ms fallbacks.
  3. Seek predictively to cut the second seek: on `playing`, `next.currentTime = old.currentTime + 0.15`.
  4. Turn the sharpness step into a resolve with `.loop-frame video[data-loop-size="banner"] { transition: opacity 180ms var(--ease-out); }` (inside `prefers-reduced-motion: no-preference`).

### M3-03 — crop and layer mismatch at the ends of the morph (MAJOR once M3-01 is fixed)

- **Forward.** `-new(hero)` (the banner's 3:1 band) is on top from frame 1. With clipping, frame 1 shows a centre band zoomed ~1.7x instead of the card's full 16:9 frame (`m3-03-crop-pop-fwd-t0.png`: left is the card at rest, right is morph frame 1).
- **Both directions.** The snapshots crop at `object-position: 50% 50%`, while banners use `--focus` (enth 8 %, tactical 10 %, maxwell 5 %, eeg 0 %). The band therefore shifts vertically as the morph ends (forward) or starts (Back; `m3-03-crop-pop-back-t0.png`).
- **Fix** (verified for forward and Back on enth, `m3-01-fix-verified-fwd-sheet.png`, `m3-01-fix-verified-back-sheet.png`):

```css
::view-transition-old(hero),
::view-transition-new(hero) {
	/* existing: width/height 100 %, object-fit: cover, mix-blend-mode: normal, opacity 1, animation: none */
	overflow: clip;
	object-position: 50% var(--vt-focus, 50%);
}
@keyframes vt-hero-out { to { opacity: 0; } }
/* forward: the card stays on top and crops down, then hands over to the banner */
html[data-vt-morph][data-astro-transition="forward"]::view-transition-old(hero) {
	z-index: 1;
	animation: vt-hero-out 150ms ease-in 300ms both;
}
/* Back: the banner dissolves into the card early, which also hides M3-08's frame cut */
html[data-vt-morph][data-astro-transition="back"]::view-transition-old(hero) {
	z-index: 1;
	animation: vt-hero-out 200ms ease-out both;
}
```

- **Wiring the focus.** `hero-morph.ts` sets `--vt-focus` on `<html>`. Forward: read it in `astro:before-swap` from `e.newDocument.querySelector(".banner")?.style.getPropertyValue("--focus")`. Back: read it in `astro:before-preparation` from the live banner. Remove it in `clearAll`.
- **Direction attribute.** `data-astro-transition` is Astro's direction attribute (`DIRECTION_ATTR` in `astro@7.4.5/dist/transitions/router.js:33`). The existing reduced-motion `!important` kill switch still wins.

### M3-04 — header blanks out on every morph (MAJOR)

- **Repro.** Start on `/` at scrollY 0 and click Tactical Arena. Phone has the same issue (`m3-04-phone-fwd-*`, frame 3 is pure white apart from the hero).
- **Cause.** The M-14 fade-through (old root 120 ms, new root 220 ms after 140 ms; timings confirmed by `getAnimations()`) also takes the header, which is identical on both pages. Ink samples are listed in the table row above.
- **Fix** (verified: wordmark and controls ink constant at 0.137 / 0.055 for every sampled t):

```css
.site-header { view-transition-name: site-header; }            /* SiteHeader.astro */
::view-transition-group(site-header) { animation: none; }       /* transitions.css */
```

The header is then lifted out of the root fade and never moves. Its control set switches at frame 1, which pairs with M3-09. Plain navigations keep their behaviour.

### M3-05 — garden graph is blank under reduced motion (BROKEN for that audience)

- **Cause.** `GraphView.svelte:148` calls `fg.pauseAnimation()` synchronously, straight after construction. force-graph has not painted a frame yet, so `cooldownTicks(1)` + `zoomToFit(0)` never render.
- **Fix.** Use `.warmupTicks(reduced ? 120 : 0).cooldownTicks(reduced ? 0 : 120)` so the layout is computed before the first paint. Move the pause into `onEngineStop`: `fg?.zoomToFit(0, 32); if (reduced) requestAnimationFrame(() => fg?.pauseAnimation())`. `warmupTicks`, `cooldownTicks`, `pauseAnimation` and `onEngineStop` are all in `force-graph@1.51.4/dist/force-graph.d.ts:129, 161-168`.

### M3-06 — lightbox opens as a strip, then snaps; no enter or exit (MAJOR)

- **Rect log** (first open on `/works/linsae/`, throttled):
  - 46 ms: `dlg 1406x50@425 img 0x0`.
  - 213 ms: `dlg 1406x802@49`, still mostly blank.
  - 406 ms: image `load`.
- **Local preview.** The same strip lasts one frame. A reopen of a cached image is full size in the first frame.
- **Fix.**
  - Give the `<img>` its box before `showModal()`. `Gallery.astro` already has `it.src.width/height`: emit `data-w`/`data-h` on the button and set `img.width`/`img.height` in `show()`. The existing `max-height` + `object-fit: contain` then keeps the box stable.
  - Before `showModal()`, `await Promise.race([img.decode(), new Promise((r) => setTimeout(r, 250))])`.
  - Add a short enter/exit, 180 ms in and 120 ms out, gated by `prefers-reduced-motion: no-preference`. It needs Chromium 117+ / Safari 17.5+ and degrades to instant: https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style

```css
.lightbox, .lightbox::backdrop {
	opacity: 0;
	transition: opacity 120ms var(--ease-out), overlay 120ms allow-discrete, display 120ms allow-discrete;
}
.lightbox[open], .lightbox[open]::backdrop { opacity: 1; transition-duration: 180ms; }
@starting-style { .lightbox[open], .lightbox[open]::backdrop { opacity: 0; } }
```

### M3-07 — lightbox step: caption ahead of the image (MINOR)

**Fix.** In `show()`, preload the next image (`const n = new Image(); n.src = full; await n.decode()`), then set `img.src`, `img.alt` and `cap.textContent` together. On open and on every step, warm the neighbours `stepIndex(i, ±1)` with `new Image().src`. An optional 120 ms opacity dip on the `<figure>` gives a cue when decoding is slow.

### M3-08 — Back restarts every loop at frame 0 (MINOR)

**Fix.** In `astro:before-preparation` on Back, store `{ slug, t: banner.currentTime }` (`sessionStorage` or `history.state`). In `mountLoops`, seed that card's `currentTime` before `play()`. M3-03's Back fade already dissolves the remaining cut. See M3-10 for staggering the other six loops.

### M3-09 — header controls move between routes (MINOR)

- **Geometry** (1440x900):
  - `/`: `utofme@108`, `Pause motion@1222`.
  - `/works/*`: `Pause motion@1103`, `Sound@1221`.
  - Slash pages, `/garden/`, `/search/`, 404: `Sound@1221`.
- **Fix.** Render `{!minimal && <SoundToggle />}` before `<slot name="controls" />` in `_BaseLayout.astro:120-123`. "Pause motion" then keeps the right edge on both loop routes, which are the morph routes.

### M3-10 — Back morph hitch under CPU load (MINOR)

- **VT-window frame intervals** (GPU headless, 1440x900):

| run | p50 | p95 | max |
|---|---|---|---|
| forward 1x | 16.7 | 33.4 | 50 |
| Back 1x | 16.7 | 33.4 | 66.6 |
| forward 4x | 16.7 | 33.4 | 49.9 |
| Back 4x | 16.7 | 50.1 | 100 |

- **Long tasks before the morph at 4x:** 155 ms (forward, tactical), 78 ms (Back), 68 ms (linsae).
- **CPU profile at 4x:** the top self time is `focus` 68.8 ms. That is the forced layout of the new page from `target.focus()` in `hero-morph.ts`; it would happen before capture anyway. Next come `replaceWith` 52.7 ms (Astro swap) and `parseFromString` 25 ms (Back).
- **Why Back stutters.** The group animates `width`/`height`, so it runs on the main thread. Back starts 7 video decoders mid-morph (`playing` at 179–198 ms).
- **Fix.** When `data-vt-morph` is set, `remount()` should mount only the hero card's loop. Defer the other loops to `viewTransition.finished` (or `requestIdleCallback`) and stagger them about 50 ms apart.

### M3-11 — card hover exit snaps (POLISH)

- **Enter** is good. Zoom is at 84 % by 225 ms and settled by about 475 ms. The caption is up by 275 ms, the meta at 0.84 by 175 ms.
- **Rapid in/out** (150 ms, and 4 cycles at 120 ms) reverses without snapping; the largest per-frame scale step is 0.0101.
- **Exit.** It reuses the expo-out `cubic-bezier(.23,1,.32,1)` at 340 ms, with an initial slope of about 4.3. The largest per-frame step is 0.0195, in the first frame after leave.
- **Fix** (`Card.astro:289, 293, 296`):
  - Rest-state media: `transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1)`.
  - `.cap`: `transform 200ms cubic-bezier(0.4, 0, 0.2, 1)`.
  - Keep the `.cap__m` opacity at 160 ms.
  - The exit stays shorter than the 560 ms entrance but no longer jumps.

### M3-12 — forward caption bar left behind (POLISH)

**Fix.** Set `::view-transition-old(hero-cap) { animation-duration: 80ms; animation-timing-function: ease-in; }` so it is gone before the image has visibly moved. Keep the Back timing (160 ms after 300 ms), which lands with the card.

### M3-13 — palette backdrop pops; no exit (MINOR)

- **Fix.** Give `[data-palette-backdrop]` the same 220 ms opacity ramp as the panel.
- **Add an exit.** Wrap the `{#if open}` children with Svelte transitions, e.g. `out:fade={{ duration: 120 }}` on the backdrop and `out:scale={{ start: 0.98, duration: 120, opacity: 0 }}` on the panel. Respect reduced motion by passing `duration: 0` when the media query matches.

### M3-14 — palette and graph navigation bypass the router (MINOR)

**Fix.** `import { navigate } from "astro:transitions/client"` and call `navigate(action.target)` at `CommandPalette.svelte:153` and `navigate(\`/garden/${n.id}/\`)` at `GraphView.svelte:141`.

### M3-15 — vestigial title names (POLISH)

**Inventory for `/now/ → /uses/`:**
- `old(root)` / `new(root)`: 200 ms `ease`.
- `old(slash-now)`: 250 ms UA fade-out.
- `new(slash-uses)`: `astroFadeIn` 180 ms `cubic-bezier(0.76,0,0.24,1)`.

**Fix.** Drop the `transition:name`s; the root cross-fade already covers titles. Alternatively, give every page title one shared name so they cross-fade in place on the same curve.

### M3-16 — cursor ring loop (POLISH)

**Fix.**
- Use a time-based lerp: `const k = 1 - Math.exp(-dt / 60)`.
- Stop the rAF once `Math.hypot(target.x - pos.x, target.y - pos.y) < 0.1`, and restart it on `pointermove`.
- Give the ring `view-transition-name: cursor` with `::view-transition-group(cursor) { animation: none; }` so it does not blink during morphs.

### M3-17 — loop frame rate and seams (POLISH)

- **Frame rates** (from `ffprobe`):
  - 10 fps: eeg-ads1299-lab, enth, godot-ctcs, gr-demo-learn, linsae.
  - 30 fps: tactical-arena, modified-maxwell-taichi.
- **Wrap stall** (rVFC gap): 100–133 ms for the 10 fps loops, 33 ms for the 30 fps ones.
- **Seam** (pixels changing by more than 24/255 between the last and first frame):

| loop | changed at seam |
|---|---|
| godot | 78.7 % |
| gr-demo | 73.0 % |
| eeg | 61.3 % |
| tactical | 57.6 % |
| enth | 11.8 % |
| linsae | 2.0 % |
| maxwell | 0.0 % |

- **Fix.** Raise `fps` to 24–30 in `media/recipes/{eeg-ads1299-lab,enth,godot-ctcs,gr-demo-learn,linsae}.json` where the source has continuous motion (cursor, scrolling). In `encode-loops.ts`, add a 150–200 ms cross-fade from the last shot into the first at the loop seam for the multi-shot reels.

## Checked and fine

- **Morph choreography matches the spec in both directions:**
  - `group(hero)` 450 ms `cubic-bezier(.2,.7,.2,1)`.
  - Old root 120 ms `ease`, fill forwards; new root 220 ms `ease` after 140 ms, fill backwards.
  - `hero-cap`: old 120 ms (forward); new 160 ms after 300 ms (Back), so the caption lands with the card.
- **The persisted card video keeps playing through the forward morph** (ct 3.88 → 4.17 across it; no restart, no black frame).
- **Interruption is robust.** Tested Back 150 ms after a click, two cards clicked 60 ms apart, and Back + Forward 250 ms apart. Afterwards there are 0 `[data-vt-hero]`/`[data-vt-cap]` marks, no `data-vt-morph`, no console errors, and the next morph runs normally.
- **Focus.** After Back, focus returns to the card link without `:focus-visible` for mouse users (no stray ring). Keyboard Tab gives the same end state as hover, with no intent delay (67 % of the zoom at 97 ms), which suits keyboard use.
- **Loops start and stop on scroll.** IntersectionObserver pauses off-screen loops and starts them on entry; godot-ctcs was `playing` 181 ms after scrolling in.
- **No pop when a loop's poster gives way to the video.** Posters match frame 0 (mean abs diff 0.7–3.7/255).
- **Pause motion.** All 7 loops pause within 72 ms of the click (including Playwright's click latency). The state persists in localStorage and across reload, and `aria-pressed` flips. Hover zoom is off while paused, and the project banner shows the poster.
- **`prefers-reduced-motion: reduce`.** Loops default to posters. Hover zoom and caption slide are off, and the caption is static with its meta visible. The morph has 0 animations (`finished` 30 ms after `ready`). The palette animation is `none`. The cursor loop is not scheduled.
- **Flash safety.** At most 1 flash per second in any loop or quadrant (WCAG 2.3.1 allows 3). The Konami hue cycle is 3 s linear.
- **Default navigation** is a 200 ms plus-lighter cross-fade on every non-morph route. Tested: `/ → /now/`, `/now/ → /uses/`, `/uses/ → /colophon/`, `/garden/ → /garden/graph/`, `/search/ → /`, 404 → `/`, project → `/now/`, project → project. The header holds steady in all of them.
- **No horizontal jump from scrollbars.** Classic scrollbars were enabled: 15 px on long pages, none on `/now/`, and the header x stays at 108.
- **Phone 393x852.** The banner is 16:9 there, so the morph has no aspect change and no overflow. Tap → morph → Back is clean apart from M3-04. The caption bar is static (no hover), and the Back caption lands with the card.
- **Scrolling and hovering at 4x CPU** (GPU headless): wheel scroll p50 16.7 / p95 33.4 / max 50 ms with 0 long tasks; hover sweep p95 33.3 / max 50 with 0 long tasks.
- **Search** results render within one or two frames (21 ms) with no staggered growth.
- **Lightbox.** Reopening a cached image is full size in frame 1. Focus returns to the thumbnail of the last image shown, with no scroll jump.

## Top 10 to fix first

1. M3-01: add `overflow: clip` to the hero snapshots. One line, and the most visible breakage on the site's signature motion.
2. M3-03: in the same CSS block, add `object-position` from the banner focus and order the layers by direction. Verified frames are in `motion/m3-01-fix-verified-*`.
3. M3-04: name the site header so it stops blanking out on every card click.
4. M3-02: reveal the 1080p banner only after its re-align seek and one painted frame, and cross-fade it in 180 ms. This removes the freeze, jump and blur pop.
5. M3-05: the garden graph is empty for reduced-motion users; use `warmupTicks` and pause after the first paint.
6. M3-06: give the lightbox image its size and decode it before opening, and add a 180/120 ms fade.
7. M3-07: preload the lightbox neighbours and swap caption and image together.
8. M3-10 + M3-08: defer the six non-hero loops until the Back morph finishes, and seed the hero loop's time.
9. M3-13 + M3-14: palette backdrop fade, a 120 ms exit, and `navigate()` instead of `location.href`.
10. M3-09: put the Sound toggle before the page controls so "Pause motion" stops jumping 119 px.

After those: M3-11 (hover exit curve), M3-12 (caption fade 80 ms), M3-15 (drop vestigial title names), M3-16 (cursor loop), M3-17 (10 fps loops and seams).

## Not covered

- Real Safari/Firefox (no VT cross-browser pass), a physical phone, and field frame timing: everything above is headless Chromium.
- Fonts are served locally by the Astro Font API with `font-display: optional`, so the first load may use the fallback (wordmark 71 px vs 75 px wide). This does not change between client-side navigations, so there is no swap flash.
