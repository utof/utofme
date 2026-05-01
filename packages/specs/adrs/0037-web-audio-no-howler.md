# ADR 0037 — Web Audio API direct, no `howler.js`

**Status:** accepted
**Date:** 2026-05-01 (Phase 7)

## Context

Phase 7 ships a minimal UI sound layer: a soft ping on `[data-sound]` element
hover, and a deeper tone on cmd-K (command palette) open. Two clips, each
≤ 200 ms. Sound is **off by default**; visitors opt in via a `SoundToggle`
control. The toggle state is persisted in localStorage.

Two options for the audio implementation:

1. Pull an audio library (`howler.js` or similar).
2. Hand-roll with the Web Audio API directly.

Bundle constraint: Phase 5 left 13 KB of site-js headroom (406.54 / 420 KB).
Phase 7 spec §T2 sub-cap for the inline sound script: ≤ 800 B gzip.

## Decision

Hand-rolled IIFE inside `SoundToggle.astro`'s `<script is:inline>` block.
The implementation uses `AudioContext` + `decodeAudioData` + `BufferSource.start()`
directly. The `AudioContext` is constructed lazily on the first user gesture
(the toggle click) to satisfy browser autoplay policy.

Format probe: `AudioContext.createBuffer` is always available; for the asset
fetch the code checks `canPlayType("audio/webm;codecs=opus")` and falls back to
mp3 (Safari ≥ 14.1 supports both pathways).

Audio assets are CC0 sine-wave synths generated via `ffmpeg aevalsrc`; combined
4.6 KB, within the 40 KB audio asset cap.

Actual inline script size: **746 B gzip** (≤ 800 B sub-cap).

## Alternatives

- **`howler.js`** (~30 KB minified). The library solves cross-browser
  `<audio>` quirks and sprite sheets — features irrelevant for two sub-200 ms
  clips. Importing howler would consume the entire remaining 13 KB site-js
  headroom. Rejected on budget grounds alone.
- **`<audio>` element.** Simpler API, but `HTMLAudioElement.play()` carries
  ~50 ms of decode latency on first call vs ~5 ms for a pre-decoded
  `BufferSource.start()`. For UI sounds meant to feel instantaneous the latency
  difference is perceptible. Rejected.

## Consequences

- `AudioContext` must be constructed inside a user-gesture handler; the inline
  script documents this constraint with an inline comment.
- The lazy-init pattern means the first toggle click both enables sound **and**
  constructs the context — no pre-warming. Acceptable for a default-off feature.
- Audio asset format duplication (webm + mp3) doubles storage but keeps both
  pathways under test in CI.
- Inline script is hand-maintained alongside any future clip additions; no
  automated sync check exists (gap accepted — clips are unlikely to change).

## Sources

- [MDN — Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN — Autoplay policy / AudioContext](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#autoplay_policy)
- [MDN — `AudioBufferSourceNode`](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode)
- T2 commits `c90d9c3` + `f9e5ed4`; Phase 7 spec §T2
