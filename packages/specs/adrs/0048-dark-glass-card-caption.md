# 0048 — Dark-glass card caption and "zoom + reveal" hover

Status: accepted; blur opt-in pending a no-GPU perf check (phase 9, decisions D20/D21, spec P9-7)

Numbering note: the spec's "ADRs to write" list calls this ADR 0050 and gives 0048 to the Pause-motion control. The owner assigned 0048 to this decision when closing the phase; the Pause-motion ADR keeps no number here and can take 0050.

## Context
The masonry home shows media at its natural aspect ratio. Titles must stay legible over any frame, including white slides and Wikimedia diagrams, without hiding the media behind a card frame. The owner's Chrome has no GPU, so any per-frame cost on top of a playing `<video>` is a risk.

## Decision
- **Caption bar** flush at the bottom of the media, no radius: `--caption-bg: rgb(16 16 16 / .62)`, **all text `#fff`** (title 600 15 px, one-line description `lede ?? summary` 13 px, meta `year · stack` 11 px mono).
- **Contrast is a fill property.** Worst case is white media: the bar composites to ≈ `rgb(107 107 107)` and `#fff` reads 5.34:1 (≥ 4.5:1, WCAG 1.4.3). Blur cannot lower that, because a white frame blurs to white. `src/lib/contrast.ts` and `tests/unit/contrast.test.ts` prove the ratio; an e2e computed-style check covers the fill.
- **Hover = "zoom + reveal"**: the frame's children scale 1.05 (560 ms in / 340 ms out, `cubic-bezier(.23,1,.32,1)`); the bar slides up to reveal the meta line (transform/opacity only, 220/160 ms; meta fades in 160 ms after 60 ms). 50 ms intent delay on enter only. Gated by `(hover:hover) and (pointer:fine)`, `prefers-reduced-motion: no-preference` and `html:not([data-motion=paused])`. Touch, reduced motion and paused motion show the meta line without any scale or translate. `:focus-visible` gets the same end state, ungated for the reveal.
- **No Backdrop Root** between the bar and the media (no `filter`, `opacity < 1`, `mask`, `clip-path` on the figure) so an opt-in blur would see the video.
- **`backdrop-filter` is opt-in and off by default**: `--caption-blur: none`; `<html data-caption-blur>` turns it on, only for the hovered/focused bar, inside `@supports`, never in a `transition`. Reason: over a playing video the bar is re-blurred every decoded frame ([Chrome: animating a blur](https://developer.chrome.com/blog/animated-blur/)).
- Rule for flipping it on: run the `@perf` Playwright check with the no-GPU flags (`--disable-software-rasterizer --use-gl=disabled`), 4 loops playing and one card hovered, 3 s of `requestAnimationFrame` intervals with and without blur; enable only if p95 rises by ≤ 4 ms. **That check has not been run**, so the shipped state is blur off.

## Alternatives
- **Opaque or solid-colour caption.** Safe contrast but hides the media and looks heavy on dark frames.
- **Always-on `backdrop-filter`.** Prettier, but unmeasured cost on the no-GPU target and a Backdrop Root constraint on every ancestor.
- **Per-frame text colour switching** (sample the frame, pick black or white). Needs pixel reads on playing video; fragile and flickers.
- **Reference hover (700 ms, grid-row expansion).** Animates layout; replaced by compositor-only transforms.

## Consequences
- White text on a fixed fill means contrast never depends on the media.
- Enabling blur later is a one-attribute change plus recording the measured numbers in a follow-up ADR.
- Visual baselines for `/` change with this caption; they must be regenerated on a runner with the web fonts (`update-visual-baselines.yml`).

## Sources
- https://www.w3.org/TR/WCAG22/#contrast-minimum
- https://www.w3.org/TR/compositing-1/#simplealphacompositing
- https://drafts.csswg.org/filter-effects-2/ (Backdrop Root)
- https://developer.chrome.com/blog/animated-blur/
- packages/specs/specs/09-project-view.md § P9-7
- packages/specs/reports/09-w4-card.md
