# ui3-fix — ui (graph, lightbox, palette, toggles)

Branch `fix/ui3-ui`. Review: `packages/specs/reviews/ui/motion.md` (M3-xx). Measured on the production build (`UTOFME_FIXTURES=false`, `astro preview`), Chromium, fallback fonts. Frames in `packages/specs/reports/ui3-fix/ui/`.

## Findings

| id | change | files | before → after |
|---|---|---|---|
| M3-05 | Reduced motion (or Pause motion) now warms the layout up (`warmupTicks(200)`, `cooldownTicks(0)`), zooms to fit, paints, and pauses from `onEngineStop` one frame later. Pausing before first paint was the bug. | `GraphView.svelte` | non-transparent canvas pixels 0 → 1531 (`before/after-graph-reduced.png`) |
| M3-06 | `show()` preloads the still and `decode()`s it (250 ms cap) before `showModal()`. The `<img>` box comes from `data-w/data-h` (`--w`, `--ar`), so it is full size in the first open frame. Dialog and backdrop fade 180 ms in / 120 ms out (opacity + 0.98→1 scale, `@starting-style` + `allow-discrete`), off under reduced motion and Pause motion. The src is cleared 200 ms after close so the exit fade still shows the picture. | `lightbox.ts`, `Gallery.astro` | 4 Mbps/150 ms RTT, 1440×900: first open frame dialog 1406×50 / img 0×0 → 1378×786 / 1179×737 (opacity 0, then eased to 1406×802 / 1203×752). Touch 393×852 DPR2: 401×68 / 0×0 → 393×298 / 370×231. No strip, no jump. |
| M3-07 | Image, size and caption are swapped together after the next still is decoded; both neighbours are warmed on every open/step. | `lightbox.ts` | caption never leads the image; covered by unit + e2e |
| M3-13 | Backdrop gets the same 220 ms fade-in as the panel; exit is a 120 ms fade (+0.98 scale on the panel), node removed after it. Instant under reduced motion / Pause motion. | `CommandPalette.svelte` | backdrop opacity at t=0/60/120/220 ms: pop (no animation) → 0 / 0.76 / 0.95 / 1; backdrop gone at ~124 ms (was 0) |
| M3-14 | `navigate()` from `astro:transitions/client` for palette Enter/click and graph node click (Mod+Enter still opens a new tab). | `CommandPalette.svelte`, `GraphView.svelte` | `window` marker survives palette navigation (e2e) |
| M3-09 | Sound renders before the `controls` slot. | `_BaseLayout.astro` | Pause motion at 1280: x 1071–1184 on `/`, 950–1063 on a project → 1071–1184 on both |
| M3-11 | Hover exit eased in-out: media 300 ms, caption 200 ms `cubic-bezier(.4,0,.2,1)`. | `Card.astro` (4 lines) | per review fix; the exit no longer starts with an expo-out slope |
| M3-15 | Dropped the unpaired `transition:name` on slash, stats and note titles. | `_SlashLayout.astro`, `stats.astro`, `_NoteLayout.astro` (line-local, not in my brief) | titles now follow the root cross-fade |
| M3-16 | Cursor ring: time-based lerp (60 ms constant), rAF sleeps when within 0.1 px and wakes on `pointermove`. I did not add `view-transition-name: cursor` (morph worker's transitions.css). | `CustomCursor.svelte` (not in my brief) | no idle rAF; trail independent of frame rate |

Left to others / not done: M3-01–04, 08, 10, 12 (morph/loop workers); M3-17 (media re-encode, needs source footage and ffmpeg recipes).

## Tests
- New `tests/e2e/ui3-motion.spec.ts`: graph paints (non-blank) under reduced motion; lightbox image/dialog non-zero at the first open frame, and stepping shows caption and `src` together; palette Enter keeps a `window` marker; backdrop has an animation; Pause motion right edge equal on `/` and a project.
- Unit: `lightbox.test.ts` (async show, decode gate, size vars), `cursor.test.ts` (rAF wakes on pointermove).
- Existing tests updated for deliberate behaviour changes: `palette.spec.ts` (2 hidden-timeouts 300→1000 ms because of the 120 ms exit), `chrome.spec.ts` (Pause motion is now the right-most control).
- Before the fix the new tests' preconditions failed on the old build (0 canvas pixels, 1406×50 strip, 119 px offset, no animation).
- Visual specs expected to change (coordinator regenerates): `landing.spec.ts` (header control order on project/slash views if shot there), `cards.spec.ts` (hover-exit curve only mid-transition, likely none), `transitions.spec.ts` (title names). I did not run them.

## Gates (this VM)
- biome check on src/tests clean; astro check 0 errors; type-coverage 100.00 % (34832/34832); knip clean (2 pre-existing config hints); depcruise no violations; check:docs ok (all via lefthook on commit).
- Unit (fixtures build): 58 files, 642 passed, 1 skipped.
- E2E (fixtures build, excluding screenshot specs): 182 passed; failures only `typography.spec.ts` preload (Google Fonts unreachable here) and, under 4 workers, `palette.spec.ts` "opens ≤150 ms" (294 ms under load; passes 4/4 alone, 520–580 ms test time).
- `UTOFME_FIXTURES=false` build: `check:no-fixtures` clean. `check:budgets`: project first-view JS 32.1 KB (≤40; +0.6 KB), `/garden/graph/` 30.4 KB, all routes ok; exit 1 only from the same 11 "chunk not reachable" sandbox/react errors reported on unmodified main in earlier reports.

## Decisions
- Reduced-motion graph also honours Pause motion (same `isMotionPaused()` as the loops).
- Lightbox waits at most 250 ms for decode; slower networks open with the reserved box and the picture fades in as it paints.
- Palette exit uses a `shown`/`open` split instead of `svelte/transition`, to avoid an extra bundle.
