# 09 · W4 — card treatment, loop playback, Pause motion, home LCP

Branch `p09/w4-card` (from `origin/phase/09-project-view`, Astro 7.4.5, Node 22.23.4).

## What was built
- `LoopMedia.astro` per the shared contract: `.loop-frame[data-loop-frame][data-slug]` with a `<Picture>` poster underlay (lazy unless `eager`; `fetchpriority="high"` only with `priority`) and a stacked `<video data-loop muted loop playsinline preload="none" aria-hidden width height>` with AV1 then H.264 `<source>`s, no `autoplay`, no `poster`. `persistId` adds `transition:persist`. The video is `opacity:0` until `data-ready` (set on first `playing`). Reads `src/data/loops.json` + `src/assets/loops/<slug>/poster.png`; throws a clear error for an unknown slug. Test seams: optional `entry` / `poster` props.
- `src/lib/loops/controller.ts`: `mountLoops(root, deps)` (IntersectionObserver `threshold 0.25`, `rootMargin 200px 0px`; play when intersecting and allowed, pause otherwise; `data-ready` on first `playing`; re-syncs on `utofme:motion` and `visibilitychange`; rejected `play()` leaves the poster; disposer never pauses) and `bindLoops()` (no loop bytes before window `load` on a full load; remount on `astro:page-load`; dispose on `astro:before-swap`; idempotent). `saveData` respected. `LoopMedia.astro` bundles the `bindLoops()` script.
- `src/lib/motion.ts` (`resolvePaused` truth table, `isMotionPaused`, `setMotionPaused`, `syncMotionAttribute`, `MOTION_KEY = "utofme:motion"`, `MOTION_EVENT = "utofme:motion"`; default follows `prefers-reduced-motion`; mirrored on `<html data-motion>`). `MotionToggle.astro`: button with `aria-pressed` and "Pause motion"/"Play motion" label, re-binds on `astro:page-load`, restores `<html data-motion>` on `astro:after-swap`, honours live OS preference changes. Rendered in the `/` header (`/works/` shows no loops, so no toggle there; W5 adds it to project pages).
- `src/lib/contrast.ts` (`relativeLuminance`, `contrastRatio`, `compositeOver`); unit test proves white on rgba(16,16,16,.62) over pure white ≈ 5.34:1.
- `src/lib/card-caption.ts`: `captionParts` (title, `lede ?? summary` — omitted when empty, meta `year · ≤3 stack`, `started–date` range), `coverLoop`, `optionalFlag`. Reads schema-v2 fields structurally so it compiles before and after W1 merges.
- `Card.astro` media variant: `a.card[data-work-slug]` > `.card-figure` > `div[data-vt-frame]` (slot `thumb`) + `div.cap[data-cap]` (h2 title, optional p description, p meta). Static `transition:name` removed. `data-fixture` added when the frontmatter flag is set. All existing `data-*`, `data-test` and Pagefind spans kept. Caption: dark glass `--caption-bg` rgb(16 16 16/.62), all text `#fff` (title 600 15px, description 13px, meta 11px mono), flush bottom, no radius, `z-index:2`. Hover = zoom + reveal exactly per the brief (frame **children** scale 1.05, 560/340 ms `cubic-bezier(.23,1,.32,1)`; bar `translateY` reveal 220/160 ms; meta opacity 160 ms with 60 ms delay; 50 ms intent delay on enter only) inside `@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)` and `html:not([data-motion=paused])`. `:focus-visible` gets the same end state ungated (zoom still gated by reduced-motion/paused). Touch, reduced motion and paused: no scale/translate, meta visible. No filter/opacity/mask/clip-path on the figure.
- `CoverImage.astro`: `eager` / `priority` props. `index.astro`: first 4 DOM cards eager, card 1 `priority` (column-major masonry, review finding 5); `cover.loop` selects `LoopMedia` (`alt=""` in card context, `persistId="loop-<id>"`).
- `tokens.css`: `--caption-bg`, `--caption-fg`, `--caption-blur` (`none`), `--caption-blur-on`, `--cap-pad`, `--cap-meta-h`.
- `src/data/loops.json` = `{}` (byte-identical to W2's, so the merge is clean).

## Decisions
- **Blur**: `--caption-blur: none` by default. Opt-in via `<html data-caption-blur>`, applied only to the hovered/focused bar inside `@supports`. The no-GPU Chrome perf check (`@perf` spec, spec P9-7) was **not** run here: no GPU-less owner Chrome and out of this task's e2e scope. It must run before enabling the flag.
- `/works/` unchanged (default bordered variant, no loops).
- Manifest types: a structural `LoopEntryLike` in `LoopMedia.astro` instead of importing W2's `manifest.ts` (not merged here); swap for `LoopEntry` after merge.
- `LoopMedia` fixes the frame at `aspect-ratio:16/9`. W5's banner should pass a `class` that sets `aspect-ratio:auto; height:100%` inside its 3:1 `.banner`. `--focus` (object-position y) is read from the frame's inherited custom property; Card does not set it yet (needs W1's `cover.focus`).
- #121 deferred (no changes to `src/lib/dither` / `datamosh`).
- Updated `tests/unit/card-pagefind-attrs.test.ts`: the old "has `data-astro-transition-scope`" block now asserts `data-work-slug` and no scope.

## Tests
- Unit (new): contrast (5), motion (12 incl. truth table), card-caption (6), controller (8, fake IntersectionObserver), loop-media Container-API markup test (6: muted/loop/playsinline/preload none/aria-hidden/width/height, no autoplay/poster, AV1 then H.264, lazy vs eager+high, persist marker, alt).
- Playwright (new, desktop-Chrome context for hover): `p09-card.spec.ts` (dark-glass computed styles, hover reveal + zoom + leave, focus-visible parity, paused disables zoom, exactly one `fetchpriority=high` and first card not lazy, Axe on `/`), `p09-motion.spec.ts` (toggle, persists across reload and a ClientRouter navigation and Back, keyboard, reduced-motion default). All 9 pass locally using Chromium at `/opt/pw-browsers/chromium` through a scratchpad config (the repo config expects a different Playwright browser build).
- Loop e2e on real loops (poster → video reveal, off-screen pause, no `.mp4` before `load`) is **not written**: there are no `loops.json` entries or content with `cover.loop` on this base. A tiny H.264 test clip and poster live in `tests/fixtures/loops/` for the follow-up.

## Gate output (packages/site)
- `biome check` (errors): clean. `astro check`: 0 errors / 0 warnings / 1 hint (pre-existing). `type-coverage`: 100.00%. `knip`: clean (one pre-existing config hint). `check:docs`: clean. `depcruise`: no violations. `prettier --check`: clean.
- Unit suite: 439 passed, 12 failed (all `card-pagefind-attrs` "data-pagefind-meta=date" — whitespace in the built HTML, pre-existing), 1 skipped. `bun run build`: OK (29 pages).
- Full e2e: 176 passed, 4 failed: `cards`/`landing`/`transitions` visual-regression baselines of `/` (expected: the caption treatment changes the pixels; baselines need regenerating on a machine with the web fonts — this container cannot fetch Google Fonts) and `typography` mono preload (font fetch, pre-existing).

## Open issues
- Regenerate `/` visual baselines (cards, landing, transitions).
- Run the `@perf` no-GPU blur/AV1 check, then decide `data-caption-blur`.
- Add loop e2e once W1/W2 content exists.
