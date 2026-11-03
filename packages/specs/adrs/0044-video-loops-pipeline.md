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
   *(Banner is now 1920×1080; see the Addendum.)*
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

## Sources

- WCAG 2.2 SC 2.3.1 — https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- WCAG 2.2 glossary (general flash, red flash, relative luminance) — https://www.w3.org/TR/WCAG22/
- G176 / G19 — https://www.w3.org/WAI/WCAG22/Techniques/general/G176 · https://www.w3.org/WAI/WCAG22/Techniques/general/G19
- ITU-R BT.1702-3 — https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1702-3-202311-I!!PDF-E.pdf
- MDN codecs parameter — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter
- FFmpeg filters (concat, zscale) — https://ffmpeg.org/ffmpeg-filters.html
- Appendix — `packages/specs/specs/09-appendix-flash-lint.md`; spec — `packages/specs/specs/09-project-view.md` § P9-4
