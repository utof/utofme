# ADR 0044 — Video loops pipeline (AV1 + H.264 MP4, offline encode, committed outputs, flash lint)

Status: accepted (phase 09, P9-4) · Date: 2026-11-03

## Context

Phase 09 puts short, silent, looping project clips on the home cards, the project banner and the gallery.
Sources are game/RL replay footage and UI-screenshot slideshows that live outside the repo (`UTOFME_MEDIA_ROOT`).
The site is static-first on Cloudflare Workers Assets: builds and CI must not need ffmpeg or the owner's media.
The clips contain explosions, muzzle flashes and hard cuts, so photosensitivity (WCAG 2.2 SC 2.3.1) matters.

## Decision

1. **Formats: MP4 only, two codecs per size.** AV1 (`libsvtav1 -preset 4`, crf 38 card / 36 banner) first, H.264
   (`libx264 -preset veryslow`, crf 26 / 24, High profile, level pinned to 3.0 card / 3.1 banner) second.
   *(Banner values superseded by the Addendum below.)*
   Both `-an -pix_fmt yuv420p -movflags +faststart`, BT.709 tagged. **No GIF** (10–50× larger, 256 colours, no seek control).
2. **Frames: 768×432 card/gallery, 1280×720 banner.** The spec's 720×405 has an odd height that neither encoder accepts.
   *(Banner is now 1920×1080; see the Addendum. The card frame is per work since Addendum 2: 768×432 is only the 16:9 default.)*
3. **Offline encode, committed outputs.** `bun run media:encode` (needs ffmpeg + media root) writes
   `public/loops/<slug>/<size>.<sha256-8>.<av1|h264>.mp4`, a poster PNG, gallery stills and `src/data/loops.json`.
   `bun run check:media` needs neither and verifies manifest ↔ files (missing, byte or hash mismatch, orphans); CI runs it before `build`.
4. **`type` attributes are derived from `ffprobe`**, never hard-coded: H.264 High@3.0 → `avc1.64001E`, @3.1 → `avc1.64001F`,
   AV1 Main `seq_level_idx` n → `av01.0.<nn>M.08` (measured: card `04`, banner `05`).
   Note: without `-level:v`, `x264 -preset veryslow` raises the level (measured 4.0 card / 5.0 banner), hence the pinned levels.
5. **Hard cuts only** (`concat`, no `xfade`, no audio); shots are 1.0–2.0 s so cut-induced transitions stay ≤ 1/s.
6. **Flash lint gates every encode** (exit 4). It analyses the *final H.264 encode of each size* (what viewers get), not the FFV1 master.

### Flash lint: what it is and is not

The flash lint is **a conservative approximation of WCAG 2.2 SC 2.3.1, built to over-flag. It is not a certification.**
It follows `packages/specs/specs/09-appendix-flash-lint.md` §3:

- ffmpeg decodes to linear-light float cells (4 px cells at 768 wide, 8 px at 1280); TS computes relative luminance per cell.
- A per-cell zig-zag detector counts peak-to-valley swings ≥ 0.1 as transitions; the "darker state < 0.8" rule applies to general flashes.
- Red: IRIS-style scalar rule (`R/(R+G+B) ≥ 0.8`, swing of `(R−G−B)` ≥ 20/320), no 0.8 exemption.
- Area gate: events that end within a few frames must cover ≥ 25 % of a 341×256 CSS-px field (summed-area table over field-sized
  rectangles), scaled by `videoWidth / renderWidthCss` (**card 1200, banner 1280**, recorded per loop in the manifest).
- The loop is analysed as three concatenated copies and windows end in the middle copy, so the seam and cuts at the seam count.
- **Fail** at ≥ 7 area-qualified events in any closed 1 s window (strictly more than 3 flashes — stricter than WCAG by one
  transition); **warn** at ≥ 5; **fail** a sustained average ≥ 4 transitions/s over the loop (warn ≥ 3), because a loop never ends.

Dropped from the original spec design: whole-frame `YAVG` mean (gamma-encoded, limited range, dilutes localized flashes,
blind to contrast reversals).

The three knobs that decide the verdict: `renderWidthCss` (per size), `delta` (0.1) and the `dark` exemption (on).

**Where it can still under-flag** (appendix §3.1, §4.2): viewers closer than the assumed distance or zooming; displays brighter
than, or with transfer curves other than, sRGB (and HDR); content partly cropped by `object-fit: cover` (we analyse the full frame,
which errs the safe way); sub-frame flicker from the browser compositing a 30 fps clip on a 60/120/144 Hz display; codec behaviour
absent from the decode we test (we decode H.264 only; the AV1 encode is not separately analysed); and a viewer rendering wider than
`renderWidthCss` (the CSS must cap the rendered width at that value). Passing does not prove compliance; failing means "re-cut or
shrink the flashing area". IRIS and PEAT remain advisory. IRIS itself states it "is not intended to guarantee, certify or otherwise
validate" compliance.

## Alternatives

- **GIF / animated WebP / APNG**: far larger for the same quality; GIF has no inter-frame codec worth the name.
- **WebM (VP9/AV1)**: no Safari fallback story as simple as MP4/H.264; MP4 + AV1 is playable on current Safari/Chrome/Firefox.
- **Encode in CI / at build**: needs the owner's media root and ffmpeg in CI; committed outputs keep builds hermetic.
- **ffmpeg `photosensitivity` filter or IRIS as the gate**: neither implements the WCAG area rule; used only as optional cross-checks.
- **Whole-frame luma lint (original design)**: see above; not conservative.

## Consequences

- Repo grows by a few hundred KB per loop (budgets: card/gallery file > 300 KB fails, > 150 KB warns; banner > 1 MB fails, > 600 KB warns).
- Changing encoder settings or the filtergraph requires bumping `ENCODER_VERSION` (changes every recipe hash → re-encode).
- The lint is a heavy-ish step (a few seconds per loop) and needs `zscale` (libzimg); without it `media:encode` exits 2.
- Prune of superseded hashed files is automatic for re-encoded slugs; directories of removed slugs are reported by `check:media` and removed by hand.

## Addendum 2026-11-04 — banner raised to 1920×1080 (owner: "banner too low quality")

**Status:** accepted. Amends decisions 1, 2 and 4 and the banner budgets above; card/gallery settings are unchanged.

**Diagnosis (measured on the live site, 1280×900 viewport, DPR 2).** The banner is a 3:1 crop shown up to 1280 CSS px wide,
so it covers up to 2560 device px, but two assets were far smaller than that:

- the **video** was 1280×720, i.e. roughly a 2× browser upscale; for the UI-screenshot slideshows the encode first downscaled
  the 1440 px screenshot sources to 1280, then the browser enlarged them again;
- the **poster** (the first paint, and the only picture under reduced motion or "pause motion") was cut from the *card* master,
  so `poster.png` was 768×432 and its largest `<Picture>` candidate was 768 w (`widths` of `[640, 1280]`, sharp does not upscale).
  That is a 3.3× upscale (at 2560 device px) of a 768 px AVIF, with visible block artefacts around text.

**Decision.**

1. **Banner frame 1920×1080** (16:9 master, still cropped 3:1 by CSS). Card/gallery stays 768×432.
2. **CRFs** (`SIZE_SPECS` in `scripts/lib/loops-core.ts`, `crfFor()`): slideshows (UI text) AV1 **28**, H.264 **20**;
   montage and transcode loops (game/sim footage) AV1 **30**, H.264 **22**. Card CRFs are unchanged (38 / 26) and do not depend on the kind.
   Chosen by encoding linsae, godot-ctcs and tactical-arena at several CRFs and comparing size and SSIM/PSNR against the FFV1 master:
   the files stay far below the new budget, so the cost of the lower CRFs is small. Unchanged: `-preset 4` / `-preset veryslow`,
   `-tune stillimage` for H.264 slideshows, `-an -pix_fmt yuv420p -movflags +faststart`, BT.709 tags.
3. **H.264 level pinned to 4.0** for the banner (1080p30 needs ≥ 4.0). **Codecs strings measured with `ffprobe`** on the real encodes:
   H.264 High level 40 → `avc1.640028`; AV1 Main `seq_level_idx` 8 → `av01.0.08M.08` (card stays `avc1.64001E` / `av01.0.04M.08`).
4. **Banner size budgets:** encoder fail > **2.5 MB**, warn > **1.5 MB** (was 1 MB / 600 KB), in `SIZE_SPECS.banner`;
   `packages/site/route-budgets.config.ts` R6 `bannerMax` / `bannerWarn` carry the same numbers (was 1,000,000 B / 600 KB).
   This supersedes the banner limits in `specs/09-project-view.md` (R6 and the "Project" budget row). Measured after the change:
   the largest banner file is 1.02 MiB (godot-ctcs H.264, 1,069,186 B), the AV1 files are 91–465 KiB. The LCP poster budget (≤ 200 KB at 1280 w) is unchanged and still met.
5. **Flash lint geometry:** `cellPx` 12 for the banner, so the grid is still 160×90 (an 8 CSS px cell at the 1280 px render cap);
   `renderWidthCss` stays 1280. All seven banners keep their previous lint verdict (pass, or the same two warns).
6. **Poster:** `media:encode` now cuts `poster.png` from the **banner master** when the recipe has a banner (1920×1080), else from the card master.
   `LoopMedia.astro` offers banner poster widths `[640, 960, 1280, 1920, 2560]` capped at the source width (never above it, because sharp
   does not upscale), with `sizes="(min-width: 1280px) 1280px, 100vw"` unchanged. Card posters still use `[384, 768]`; the build downsizes from the larger source.
7. `ENCODER_VERSION` 2 → 3, so every recipe hash changes. The seven banner-bearing project loops and `fixture-testsrc` were re-encoded;
   the card-only gallery loops (`modified-maxwell-taichi-pml`, `tactical-arena-smokes`) were not (their outputs would be byte-identical).

**Consequences.**

- Banner video bytes per page rise (AV1, which most browsers pick: 91–465 KiB, was 43–220 KiB); H.264 is the fallback for browsers without AV1.
  The banner still loads nothing before `load` (`preload="none"`), so the first-view budget is unaffected.
- The repo grows by about 3.2 MB of poster PNGs (0.98 MB → 4.2 MB for the eight banner loops) and about 3.2 MB of banner MP4s (3.0 MB → 6.2 MB); the encoder prunes the superseded hashed files.
- The remaining softness is in the sources: the slideshow screenshots are 1200–1500 px wide and the tactical-arena crops are 560–764 px wide,
  so on a DPR-2 screen they are still magnified 1.7–3.3×. Anything sharper needs re-captured sources at 2× (≥ 2560 px wide).
- Re-running `bun run media:encode --all --force` re-encodes the card-only loops too; their bytes are expected to be identical.

## Addendum 2 2026-11-04 — card aspect is per work (owner: "where the gifs/videos are square, the card is square")

**Status:** accepted. Amends decision 2 (card frame), the manifest `aspect` field, the poster rule of Addendum 1 (6) and the flash lint's card
render width. The banner (1920×1080, shown 3:1 / 16:9), its crops, CRFs, budgets and codecs strings are unchanged. Numbering: new ADR numbers 0050 and 0051 are
reserved by the phase 09 close report, so this is an addendum rather than a new number.

**Diagnosis.** Every card was a 16:9 crop (`aspect: z.literal("16:9")`, 768×432, `.loop-frame { aspect-ratio: 16 / 9 }`), so the three-column home
masonry (CSS multi-column, ADR 0040) split the seven works 3/3/1 with equal-height tiles; a square simulation was letterboxed and a phone-style UI cut to a band.

**Decision.**

1. **Recipe.** `cardAspect` (optional, default `16:9`), one of `1:1 · 4:5 · 3:4 · 4:3 · 3:2 · 16:10 · 16:9`; per shot / per slide an optional `cardCrop`
   (source px), which **replaces** `crop` on the card master only. `aspect` stays the master (banner) aspect, `16:9`.
2. **Frames** (`CARD_FRAMES`, `scripts/lib/loops-core.ts`): about the old pixel area (331,776 px, all within ±5 %), even sides, multiples of the 4 px flash-lint cell so
   the lint grid stays whole: `1:1 576×576 · 4:5 512×640 · 3:4 504×672 · 4:3 672×504 · 3:2 696×464 · 16:10 736×460 · 16:9 768×432`. Every card encode probes to the
   same codecs strings as before (`avc1.64001E`, `av01.0.04M.08`; H.264 level 3.0 holds: at most 40,320 macroblocks/s against the 40,500 limit at 30 fps).
3. **Manifest.** `cardAspect` is required; the card rendition's width/height must match it (±1 %); `cardPosterPath` (`card-poster.png`, next to `posterPath`) is required for a
   non-16:9 card that has a banner and forbidden for a card-only loop. The encoder also writes it for a 16:9 card with a `cardCrop`.
   `posterPath` stays cut from the banner master; the card poster is cut from the card master at `poster.at`.
4. **`LoopMedia`.** The frame's `aspect-ratio` is the rendition's own `width / height` (`--loop-ar`), cards and gallery use the card poster when there is one, the card
   poster `srcset` is `[384, min(768, poster width)]`, and the card `sizes` hint is the real masonry column (`MASONRY_COLUMN_SIZES`, 439 px from 1635 px viewports,
   `26.7vw + 3px` from 1100 px; it was `33vw`, up to 44 % too wide). The gallery keeps its own looser hint.
5. **No persisted card video for a differently framed card.** `transition:persist` hands the CARD video to the banner, which then cross-fades to the banner video.
   With separate framings that is a visible jump (an up to 2.7× upscaled tight crop, then a different crop), so a card with a `cardPosterPath` does not persist; the banner mounts its own video
   over its own poster. Cards framed like the banner (`eeg-ads1299-lab`, the gallery loops) are unchanged.
6. **Flash lint render width.** `renderWidthCss` for a card is `frame width × 1200 / 768` (`renderWidthCssFor`), i.e. the lint keeps the 16:9 card's worst-case
   magnification of 1.5625 CSS px per video px for every aspect (16:9 stays 1200; a 576 px square is assumed at 900, a 504 px portrait at 788). The 1200 was a magnification
   cap, not a layout width, and it guarded the cases where a card is shown far wider than its column (the persisted card video in a 1340 px banner, the gallery). A card with its own
   framing no longer persists (decision 5) and is not used in galleries, so its real maximum is the masonry column (about 480 CSS px, 0.95 CSS px per video px for the 504 px portrait),
   and the new assumption still keeps a 1.6× margin over it. Applied as a *width* instead, 1200 CSS px would assume a 1200 px tall square tile that no layout can show.
   **This changes two verdicts, measured on the final recipes with the old rule:** modified-maxwell-taichi (1:1) fails with 7 qualified events in a 1 s window
   (limit 7) and passes with 2; tactical-arena (3:4) fails with 9 and warns with 5 (the same 5 as its 16:9 card). The rest are identical under both rules.
   The alternative that keeps the old rule is a different framing for those two (4:3 or 16:9 with the old wide band crop); it was rejected because the owner asked for square tiles.
   `eeg-ads1299-lab` still persists its 16:9 card into the banner, under the unchanged 1200 assumption.
7. `ENCODER_VERSION` stays 3 (filtergraph, CRFs and colour tags are unchanged for 16:9; the recipe hash already covers `cardAspect` and `cardCrop`). The banner files of every re-encoded
   work came out byte-identical.

**Per work** (sources are under the media root; `cardCrop` only where noted):

| work | card | frame | why | flash |
|---|---|---|---|---|
| tactical-arena | 3:4 | 504×672 | mixed 4800×2739 viewer screenshots (3D view is 3000×1500) and a 2240×2240 grid replay; portrait slices (`cardCrop`) of the 3D view and the lower middle of the grid | warn (5 events, as before) |
| eeg-ads1299-lab | 16:9 | 768×432 | 1395×744 / 1550×713 plots are wide; unchanged | pass |
| enth | 3:2 | 696×464 | 1200×800 UI snapshots, shown uncropped | pass |
| godot-ctcs | 16:10 | 736×460 | 1440×900 screenshots, shown uncropped | pass |
| gr-demo-learn | 16:10 | 736×460 | a 3200×1800 two-plot figure (`cardCrop` 2880×1800 keeps both plots) and 1440×1100 doc pages (900 px window) | pass |
| linsae | 4:5 | 512×640 | 1440×900 window screenshots whose content is a 720 px feed column; per slide 720×900 `cardCrop` (the PDF slide: its 600×750 pane) | pass |
| modified-maxwell-taichi | 1:1 | 576×576 | a square plot letterboxed in 2304×1296; the centre square (no `cardCrop`) drops only the two axis titles | pass |

Measured (production build, `/`): card frames are exactly these aspects; at 1920×1080 the three columns are 844 / 865 / 999 px tall with 2 / 3 / 2 cards
(1280×800: 665 / 683 / 786); on a phone one column. A model of the balancer (the contiguous split with the shortest tallest column) predicted the same split before encoding.

**Consequences.**

- Card files stay within the 150 / 300 KB budget (largest: godot-ctcs H.264 210,840 B and enth 156,012 B, both warn; they warned before at 203,715 B and 178,058 B). Narrower cards are softer
  on DPR-2 screens: at a 439 px column a card has 1.75 (16:9), 1.68 (16:10), 1.59 (3:2), 1.31 (1:1), 1.17 (4:5) and 1.15 (3:4) video px per CSS px, against the 2.0 a DPR-2 screen wants.
  Raising a frame costs bytes roughly linearly in area.
- Six card posters (`card-poster.png`, 0.8 MB in all) are added; `check:media` also checks them.
- **Follow-ups, not done here:** (a) at 3 columns the head of column 3 is DOM card 6, so `EAGER_CARDS` / `eagerCardCount` (4) leave a first-viewport card lazy; raising both to 6 needs the
  `route-budgets` fixtures and tests updated. (b) R4 selects `.loop-media`, but `LoopMedia` renders `.loop-frame`, so R4 never sees a real home card; fix the selector together with (a).
  (c) the card → banner morph's upscaled snapshots are blurrier at 3 columns (a 387 px card snapshot grows to 1224 px) for every aspect.

## Sources

- WCAG 2.2 SC 2.3.1 — https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- WCAG 2.2 glossary (general flash, red flash, relative luminance) — https://www.w3.org/TR/WCAG22/
- G176 / G19 — https://www.w3.org/WAI/WCAG22/Techniques/general/G176 · https://www.w3.org/WAI/WCAG22/Techniques/general/G19
- ITU-R BT.1702-3 — https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1702-3-202311-I!!PDF-E.pdf
- MDN codecs parameter — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter
- FFmpeg filters (concat, zscale) — https://ffmpeg.org/ffmpeg-filters.html
- Appendix — `packages/specs/specs/09-appendix-flash-lint.md`; spec — `packages/specs/specs/09-project-view.md` § P9-4
