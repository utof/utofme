<!-- Research appendix for packages/specs/specs/09-project-view.md § P9-4 "Flash lint" (2026-11-03). Supersedes the whole-frame YAVG design there. -->
# Flash lint for short silent loops: a conservative WCAG 2.2 SC 2.3.1 approximation

Started 2026-11-03 23:20. Scope: P9-4 "Flash lint" in `packages/specs/specs/09-project-view.md` (about lines 255-270). Clips are 720x405 card loops and 1280x720 banners, silent, 3-8 s, made of game/RL replay footage (explosions, muzzle flashes, flashbangs) and UI-screenshot slideshows with hard cuts.


---

## 0. Bottom line

1. **Write our own detector (about 150 lines of TypeScript), do not adopt a tool as the gate.** Neither ffmpeg `photosensitivity` nor EA's IRIS implements the WCAG area rule, and both can pass or fail content for the wrong reasons (section 2.5). Our detector is cheap: per-cell zig-zag on linear luminance, a 10-degree-field area test via a summed-area table, and a 1 s event counter.
2. **Use IRIS (Python port, `pip install iris-pse-detection`) and ffmpeg `photosensitivity` only as non-gating cross-checks** at development time, never in CI.
3. The current spec design (whole-frame mean of gamma-encoded `YAVG`, 10 % change) is **not conservative in three independent ways**, all demonstrated below: (a) it dilutes localized flashes (a 160x160 px white flash on black in a 720x405 frame, 25 600 px, is 7.6 % in YAVG and never triggers); (b) it is blind to contrast reversals (left half white / right half black swapping: YAVG constant at 125.5, dYAVG = 0.0); (c) it measures gamma Y' on a 16-235 limited range, not linear relative luminance.
4. The honest ADR claim is "approximation of SC 2.3.1, tuned to over-flag; not a certification". IRIS says the same about itself.

---

## 1. Exact WCAG 2.2 definitions

Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (glossary: *flash*, *general flash and red flash thresholds*, *relative luminance*; fetched this session), [Understanding SC 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) (updated 17 Sep 2025), [G176](https://www.w3.org/WAI/WCAG22/Techniques/general/G176), [G19](https://www.w3.org/WAI/WCAG22/Techniques/general/G19), [G15](https://www.w3.org/WAI/WCAG22/Techniques/general/G15), [ITU-R BT.1702-3 (11/2023)](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1702-3-202311-I!!PDF-E.pdf).

### 1.1 SC text and pass logic
> "Web pages do not contain anything that flashes more than three times in any one second period, or the flash is below the general flash and red flash thresholds."

Thresholds (glossary): content is below the threshold if **either**
- "there are no more than three general flashes and / or no more than three red flashes within any one-second period; **or**
- the combined area of flashes occurring concurrently occupies no more than a total of .006 steradians within any 10 degree visual field on the screen (25% of any 10 degree visual field on the screen) at typical viewing distance".

So content **fails only if both conditions are violated**: more than 3 flashes in 1 s **and** a combined flashing area above 25 % of a 10-degree field. Our lint must AND them, and must conservatively treat "area" as pixel area in the rendered size.

### 1.2 General flash and the 0.80 condition
> "A general flash is defined as a pair of opposing changes in relative luminance of 10% or more of the maximum relative luminance (1.0) where the relative luminance of the darker image is below 0.80; and where 'a pair of opposing changes' is an increase followed by a decrease, or a decrease followed by an increase."

- The 10 % is **10 % of 1.0 in linear relative luminance** (an absolute 0.1 step), not 10 % of gamma-encoded Y'. 0.1 linear is a big step in the darks (sRGB 0 to 89 is 0.1) and a small one in the brights (sRGB 242 to 255 is 0.113).
- The "darker image below 0.80" carve-out removes bright-on-bright flicker. 0.80 linear is sRGB 231/255 (about 0.906 encoded). Equivalent in BT.1702-3: 20 cd/m2 difference when the darker image is below 160 cd/m2, with SDR peak white assumed 200 cd/m2 (so 0.1 and 0.8 of white). HDR above 160 cd/m2 uses Michelson contrast 1/17.
- Exception clause: "a fine, balanced, pattern such as white noise or an alternating checkerboard with squares smaller than 0.1 degree" does not violate. We should **not** implement that exception (over-flagging is allowed).

### 1.3 Transition and flash (Note 2)
> "A transition is the change in relative luminance ... between adjacent peaks and valleys in a plot of relative luminance ... against time. A flash consists of two opposing transitions."

Consequence: a **gradual** ramp is still one transition if it is a monotone peak-to-valley swing of at least 0.1. A crossfade does not remove a transition, it only slows it. What fixes a flash is fewer swings, not softer swings.

### 1.4 Relative luminance
> L = 0.2126 R + 0.7152 G + 0.0722 B, with R = Rs/12.92 if Rs <= 0.04045 else ((Rs + 0.055)/1.055)^2.4, Rs = R8bit/255 (same for G, B).

Note 2: before May 2021 the constant was 0.03928; "no practical effect". Note 3: evaluate in sRGB unless another colour space is known. Note 4: for dithered colours use the average colour. Per-pixel, 8-bit LUT of 256 entries is enough (IRIS ships exactly that LUT in `config/appsettings.json`, `FlashDetection.sRGBValues`).

### 1.5 Red flash (WCAG 2.2 wording)
> "A red flash is defined as any pair of opposing transitions involving a saturated red." Note 3: one transition is either to or from a state with R/(R+G+B) >= 0.8, and "the difference between states is more than 0.2 (unitless) in the CIE 1976 UCS chromaticity diagram" [ISO 9241-391].

The Understanding page gives the maths: distance = sqrt((u'1-u'2)^2 + (v'1-v'2)^2), u' = 4X/(X+15Y+3Z), v' = 9Y/(X+15Y+3Z), with X = 0.4124564R + 0.3575761G + 0.1804375B, Y = 0.2126729R + 0.7151522G + 0.0721750B, Z = 0.0193339R + 0.1191920G + 0.9503041B, R,G,B being the **linear** 0-1 values from the relative-luminance definition.

Two problems for a lint: (a) black has no chromaticity (X+15Y+3Z = 0), so red<->black is undefined in the formula; (b) red<->dark-red has the same chromaticity (distance 0) and is only caught by the luminance rule. IRIS uses the older Harding-lineage rule instead (`src/RedSaturation.h:34-49`): pixel is saturated red if linear R/(R+G+B) >= 0.8, red value = (R-G-B) x 320 (clipped at 0), and a red transition is a swing of at least 20 in that value (config `RedSaturation.FlashThreshold: 20`), i.e. a swing of 0.0625 in linear (R-G-B). For saturated reds R-G-B >= 0.75 R, so this rule is a **superset** of the WCAG 2.2 u'v' rule except for very dim reds (linear R below about 0.083, sRGB below about 82/255). **Recommendation: use the IRIS scalar rule** (simple, same zig-zag machinery as luminance, more conservative), optionally OR-ed with the u'v' rule for dim reds.

### 1.6 The 10-degree field and its scaling
- "using a 341 x 256 pixel rectangle anywhere on the displayed screen area when the content is viewed at 1024 x 768 pixels will provide a good estimate of a 10 degree visual field for standard screen sizes and viewing distances (e.g., 15-17 inch screen at 22-26 inches). This resolution of 75 - 85 ppi is known to be lower, and thus more conservative than the nominal CSS pixel resolution of 96 ppi" (glossary Note 1).
- Understanding: "Substituting CSS pixels for the original pixel block means that the combined area of flashing becomes 341 x 256 CSS pixels, or a flashing area of 87,296 CSS pixels." [measured arithmetic: 341 x 256 = 87 296 correct]
- G176: 25 % of that field is "a contiguous area of **21,824 sq pixels** (any shape)"; any single flashing event smaller than that passes the thresholds. 21 824 / 87 296 = 0.25 exactly.
- The field is **in CSS px, not in video px**. So the threshold in video pixels is `21 824 x s^2` with `s = videoWidth / renderedCssWidth`. A bigger rendering shrinks the field in video pixels and makes the test stricter. Understanding: "Content should be analyzed at the largest scale at which a user may view the content" (their example: a video that also plays full screen is analysed at full screen).
- Higher-resolution screens: "Higher resolutions displays showing the same rendering of the content yield smaller and safer images so it is lower resolutions that are used to define the thresholds." The page gives **no formula** for other resolutions; it relies on the CSS-pixel framing. G176 Formula 2 gives one for a known display: field = 4:3 rectangle 10 deg x 7.5 deg, width = distance x 0.1745, height = distance x 0.1309, times pixels-per-length, safe area = width x height / 4.
- Why the 341x256 is already generous to us in the conservative direction: the glossary defines "CSS pixel: visual angle of about 0.0213 degrees", so 10 degrees would be 10/0.0213 = 469 CSS px wide, i.e. a 469x352 field of 165 000 CSS px, 1.9 times bigger than 87 296. Using 341x256 as the field is therefore about 1.9x stricter than the nominal CSS-pixel angle. [arithmetic, not a W3C statement]
- Closer viewing (phones at 30 cm, zoom, magnifiers) is explicitly *not* covered: "Users that are closer to their screens than the idealized viewing distance will be affected by flashing areas that normatively pass." That is the argument for G19 (3/s regardless of area), which "is independent of screen resolution or viewing distance".

### 1.7 "Any one second period"
Not defined anywhere beyond the phrase. Interpretation sources:
- G19: "Check that there are no more than three flashes during any 1-second period. If there are three flashes, check that the Light/Dark status at the end of the 1-second period is the same as at the start." "3.5 flashes = seven transitions" fails; three flashes = six transitions is allowed.
- BT.1702-3 Guideline 1: "more than three flashes (i.e. six changes in luminance as described above) within any one-second period", and "successive flashes for which the leading edges are separated by 360 ms or more are acceptable in a 50 Hz environment or ... 334 ms or more in a 60 Hz environment, irrespective of their brightness or screen area."
- It is a **sliding** window (any), not calendar seconds.

### 1.8 Loops and cuts
- Understanding: "For short clips that might be looped (such as GIF animations), the content should be analyzed while looping." So the seam (last frame to first frame) is part of the signal, and so is the lag across it.
- BT.1702-3: "Rapidly changing image sequences (for example, fast cuts) are provocative if they result in areas of the screen that flash, in which case the same constraints apply as for flashes." (This covers our slideshow hard cuts.)
- BT.1702-3 also: "a sequence of flashing images lasting more than five seconds might constitute a risk even when it complies with the guidelines above." A looping card never ends, so any sustained 2-3 flashes/s is a real concern (IRIS flags 2-3 flashes/s over 5 consecutive seconds as an "extended flash failure", README).
- BT.1702's area rule is 25 % of the **screen**, WCAG's is 25 % of the **10-degree field**. WCAG is the stricter of the two for large screens.

---

## 2. Existing tools (as of Nov 2026)

### 2.1 ffmpeg `photosensitivity` filter
Source: `libavfilter/vf_photosensitivity.c` ([master](https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/vf_photosensitivity.c); copyright Vladimir Panteleev 2019, 2020, 2022, 2026; LGPL 2.1+). Docs: [ffmpeg-filters, photosensitivity](https://ffmpeg.org/ffmpeg-filters.html#photosensitivity) ("Reduce various flashes in video, so to help users with epilepsy.").

- **Options** (doc/filters.texi, source `:60-65`): `frames`/`f` (2-240, default 30, "how many frames to use when filtering"), `threshold`/`t` (float >= 0.1, default 1, "Lower is stricter"), `skip` (1-1024, default 1, pixels to skip when sampling), `bypass` (bool, default off, "Leave frames unchanged"), and `blend` (0-1, default 1; **present in master, absent from the local 6.1.1 build**, `ffmpeg -h filter=photosensitivity` shows only frames/threshold/skip/bypass). Pixel formats: **RGB24/BGR24 only** (`:326`).
- **What it measures** (`:30`, `:80-130`, `:178-190`, `:200`, `:218-241`): the frame is reduced to an **8x8 grid of mean R,G,B (gamma-encoded 8-bit)**; per-frame "badness" = sum over 64 cells x 3 channels of |difference to the previous frame's grid|; a weighted moving average of the last `frames` badness values is compared against `64*4*256*threshold/128` (= 512 x threshold) times the history length. If exceeded, it blends the new frame toward the previous one so the flash is damped.
- **Report-only mode: yes.** `bypass=1` leaves frames untouched (`:237`), and the verbose log (`-v verbose`: `badness: <old> -> <new> / <thr> (<pct>% - OK|EXCEEDED)`) or, more robustly, `metadata=print` exposes `lavfi.photosensitivity.badness` (= new_badness/threshold; >= 1.0 means it would have intervened), `.fixed-badness`, `.frame-badness`, `.factor` (`:285`). Use `metadata=print`, because ffmpeg collapses repeated log lines ("Last message repeated n times") so the verbose log undercounts steady-state frames [measured].
  ```
  ffmpeg -nostats -v error -i in.mp4 -vf "format=rgb24,photosensitivity=bypass=1,metadata=print:file=-" -f null -
  ```
- **What it corresponds to:** a heuristic *flicker-energy limiter*, calibrated for "make a video safer", not WCAG. Differences from SC 2.3.1:
  - gamma-encoded RGB, not linear luminance; no 0.1 / 0.8 logic;
  - L1 energy of change, so a monotone fade and an actual flash look the same; no opposing-pair logic;
  - no area logic (the 8x8 grid just sums);
  - "1 second" is `frames` frames (30 = 1 s only at 30 fps);
  - no red rule;
  - frame 0 is diffed against an all-zero grid (initial `last_frame_e`), so any non-black first frame spikes [measured: a static gray clip reports 1.55x threshold and stays above 1.0 for 11 frames].
- **Verdict:** fine as a cheap smoke test, wrong as a WCAG gate (it flags a legal 2 Hz full-frame strobe at 8x and a legal near-white flicker at 3x, and has no concept of area scaling).

### 2.2 EA IRIS
[github.com/electronicarts/IRIS](https://github.com/electronicarts/IRIS): "EA's photosensitivity analysis tool", **BSD 3-Clause**, C++17, latest release **1.1.0 (2024-04-21)**, last push **2025-01-14**, not archived, 241 stars. README states it "is not intended to guarantee, certify or otherwise validate visual content's compliance", and the library logs the same on startup (`src/VideoAnalyser.cpp`).

- **Build deps:** CMake >= 3.21, Ninja, vcpkg (`vcpkg.json`: gtest, nlohmann-json, spdlog, giflib, **opencv with features ffmpeg + contrib**), plus FFmpeg libs (`find_package(FFMPEG REQUIRED)`). CMake presets for Linux exist (`CMakePresets.json`: `linux-debug/release`), but the 1.1.0 release notes say "The IRIS console application (example) is included for Windows". Not installed on this machine (no cmake/ninja/vcpkg/opencv4), so I did **not** build it; a cold vcpkg OpenCV build is a long step I would not want in CI (unmeasured).
- **CLI** (example app, `example/main.cpp`): `-j` JSON output, `-v <path>` video, `-p` pattern detection on/off. Output: per-frame CSV (`Results/<name>/framedata.csv`) with columns Frame, Time Stamp, Flash Area Luminance, Average Luminance Difference Accumulation, Flash Area Red, ..., Luminance Transitions, Red Transitions, extended-fail counts, per-frame results (0 pass, 1 warning, 2 extended fail, 3 fail); optional `result.json`.
- **Rules implemented** (README + source): luminance flash and red-saturation flash with the WCAG/BT.1702 thresholds (luminance 0.1, dark 0.8; red 20 on the (R-G-B)x320 scale), fail when more than 3 flashes (6 transitions) in any 1 s, "warning" from 4 transitions/s, "extended fail" for 4-6 transitions/s over 5 s, optional spatial-pattern check (stripes >= 6, 0.5 s).
- **Why it is not conservative for our use** (read from source):
  1. Transition magnitude is the **whole-frame mean** of per-pixel linear luminance (`Flash.cpp:67-79` `FrameMean`, `FlashDetection.cpp:74-75`). It is gated by an area test, but the area is `frameSize.area() * AreaProportion` with `AreaProportion: 0.25` of the **analysed frame** (`Flash.cpp:29`, `config/appsettings.json` `FlashDetection.AreaProportion`), not of the 10-degree field, and the test counts any non-zero pixel difference (`cv::countNonZero`, `Flash.cpp:83-86`). Both effects dilute: a flash must cover 25 % of the frame **and** push the whole-frame mean by 0.1.
  2. The dark-state rule is applied to the **frame means** (`Flash.cpp:97,104`), not per pixel.
  3. Red uses whole-frame mean of the red measure the same way (`RedSaturation.h`).
  4. Default `FrameResizeEnabled: false`; if enabled it uses `cv::resize` (bilinear) on gamma values.
  Lowering `AreaProportion` helps the area gate but cannot fix the mean dilution: a flash filling 3.7 % of the frame can never move the frame mean by 0.1.
- **Python port:** [iris-pse-detection 1.1.2](https://pypi.org/project/iris-pse-detection/) (MIT, github.com/tokoroten/iris-pse-detection, deps numpy >= 1.22, opencv-python >= 4.6, scipy >= 1.8, Python >= 3.10). `pip install` worked here in seconds and analysed a 2 s 720x404 clip in about 0.5 s. Author warns of tiny float differences vs C++. Handy as a cross-check, not as the gate.

### 2.3 PEAT and Harding FPA
- [PEAT](https://trace.umd.edu/?p=719) (Trace Center, Univ. of Maryland): free, **Windows only** (listed Vista/7/10, XP restricted; "PEAT only works with Firefox in Windows 10"), version 1.6 (no date seen), screen-capture based analysis, general + red + extended flash. Per a secondhand listing it is open except for a proprietary analysis engine. It is a GUI tool, not scriptable; fine for a one-off human spot check on a Windows box, useless for CI. W3C names it in G15/G19/G176 as the reference tool.
- Harding FPA: commercial, aimed at broadcast/games (PEAT's own page says broadcast/film/gaming should use it). Not evaluated.

### 2.4 Other libraries
No npm package implementing SC 2.3.1 for video files was found (search only, not exhaustive). Third-party, unverified by me: [LoopGlitch26/flashdetect](https://github.com/LoopGlitch26/flashdetect) (Python/OpenCV, stale since 2023-03), OMARVII/Neuroshield and Pi-0r-Tau/epi-lens (browser extensions, JS, early). None are mature enough to gate a build.

### 2.5 Experiment: how the approaches behave on synthetic clips [measured]

| Clip | Truth under WCAG (render 1024) | Spec design: YAVG max step (10 % = 25.5) | ffmpeg photosensitivity (max x threshold) | IRIS (py port) | Our prototype (Rw 1024) |
|---|---|---|---|---|---|
| static gray | pass | - | 1.55x, 11 frames >= 1 (first-frame artifact) | pass | pass |
| full frame black/white, 2 Hz (4 transitions/s) | pass | 219 (flags) | 8.07x (flags) | PassWithWarning | passes the 1 s count (5 events max) but **SUSTAINED** (4.0/s) fails a looping clip |
| full frame 3 Hz (6 transitions/s) | borderline: 3 flashes/s | 219 | 11.26x | **LuminanceFlashFailure** (1 frame) | **FAIL** (7 events in closed 1 s, intended) |
| hard cuts every 5 frames (3 flashes/s) | borderline | 219 | 11.16x | PassWithWarning | FAIL (same as 3 Hz) |
| full frame 5 Hz | fail | 219 | 18.27x | FAIL | FAIL |
| sine 1 Hz fade (gradual) | pass | - | 3.63x (flags) | - | pass |
| sine 5 Hz fade (gradual) | fail | 110 (43 %, flags) | 16.74x | FAIL | FAIL |
| near-white 242 <-> 255 at 5 Hz | pass (darker state >= 0.8) | - | 3.08x (flags) | pass | pass |
| square 100x100 (10 000 px) 5 Hz | pass (below 10.8 k) | 7.5 (3.0 %, no flag) | 0.62x (no flag) | pass | pass |
| square 140x140 (19 600 px) 5 Hz | **fail** | 14.8 (**5.8 %, MISSED**) | 1.23x (flags) | **pass (MISSED)** | FAIL |
| square 160x160 (25 600 px) 5 Hz | **fail** | 19.3 (**7.6 %, MISSED**) | 1.60x | **pass (MISSED)** | FAIL |
| square 200x200 (40 000 px) 5 Hz | **fail** | 30.1 (11.8 %, flags) | 2.51x | **pass (MISSED)** | FAIL |
| left/right halves swap black/white at 5 Hz (contrast reversal) | **fail** | 0.0 (constant 125.5, **MISSED**) | 17.53x (flags) | **pass (MISSED)** | FAIL |
| pure red <-> black 5 Hz | fail | - | 6.04x | Lum + Red fail | FAIL (lum + red) |
| red 255 <-> 60 5 Hz | fail | - | 4.66x | Lum + Red fail | FAIL (lum + red) |

Reading the table:
- The spec's design misses every localized flash up to about 13 % of the frame and misses contrast reversals entirely.
- IRIS misses all four localized squares because the squares are below its 25 %-of-frame gate (and below the mean dilution). It would, if a game-capture clip were analysed as a TV image, be correct by BT.1702's 25 %-of-screen rule, but that is not our situation.
- ffmpeg `photosensitivity` is over-sensitive to anything that changes (legal 2 Hz, near-white, slow sine) and is not area-aware, so it cannot approximate the SC.
- The same square clips with our detector at other render widths (video 720 px wide): Rw 720 -> 100 and 140 pass, 160 fails; Rw 1280 -> all fail (A = 6.9 k px); Rw 1920 / 2560 -> all fail (A = 3.1 k / 1.7 k px). **The render width you assume decides the verdict**, which is why the assumed largest size has to be an explicit, versioned parameter in the recipe.

---

## 3. A concrete conservative algorithm (TypeScript over ffmpeg frames)

### 3.1 Design choices and what each does to false negatives
| Choice | Conservative because |
|---|---|
| Per-cell **linear** luminance, not whole-frame mean | no dilution; localized flashes keep their full 0.1+ swing |
| Cells are small (4x4 px for 720 wide, 8x8 for 1280) and averaged in **linear light** | thin features are not smeared; averaging in gamma underestimates linear brightness of mixed cells and would under-flag sparks |
| Zig-zag swing detector with hysteresis delta = 0.1 | each peak-to-valley swing of >= 0.1 is one transition (matches Note 2), noise reversals < 0.1 neither create nor split transitions |
| Union of rising **and** falling cells counted as flashing area | catches contrast reversal and wipes (mean-based methods cancel) |
| Area measured as **sum of flashing cells inside any field-sized rectangle** (summed-area table), not required to be contiguous | superset of "contiguous (any shape)"; also catches scattered sparks |
| Field = 341x256 CSS px, scaled by the **largest** assumed render width | smaller field in video px = lower area threshold |
| Loop is analysed cyclically (3 copies, windows evaluated in the middle copy) | includes the seam and hard cuts at the seam, per Understanding |
| Closed 1 s window, fail at **>= 7** events (strictly more than 3 flashes) | a sustained 3 Hz strobe counts 7 in a closed window and fails; WCAG would pass it, we do not |
| Red: IRIS-style scalar rule (superset of u'v' for non-dim reds), no 0.8 exemption | extra conservative |
| Add the **sustained-rate** rule for loops (see 3.4) | looped content never ends; BT.1702 5 s remark; IRIS "extended failure" |
| Analyse the **final decoded encodes** (AV1 and H.264), not only the FFV1 master | lossy codecs add temporal pulsing; what ships is what users see |

Known ways it can still **under-flag** (be honest about these in the ADR): viewers closer than the assumed distance or zooming (WCAG itself cannot cover this), displays brighter or with other transfer curves than sRGB, a flash occurring in a region partly cropped by `object-fit: cover` (we analyse the full frame, which is the conservative direction), sub-frame flicker created by the browser's compositing of a 24/25/30 fps clip on a 60/120/144 Hz display, and codec behaviour not present in the decode we test.

### 3.2 Field and area table (rendered 16:9 at full viewport width)
Formula: `s = videoWidth / renderedCssWidth`; field = `min(videoDims, 341s x 256s)` video px; area threshold `A = 21 824 s^2` video px. As a fraction of the frame, `A / frameArea = 21 824 / (Rw x Rh)` in CSS px, **independent of the native video resolution**.

| Rendered width Rw (CSS px) | Frame fraction | 720x405: field px | 720x405: A px | 1280x720: field px | 1280x720: A px |
|---|---|---|---|---|---|
| 720 (card at native size) | 7.5 % | 341x256 | 21 824 | - | - |
| **1024 (1024x768-equivalent, full width)** | **3.70 %** | **240x180** | **10 790** | **426x320** | **34 100** |
| 1280 | 2.37 % | 192x144 | 6 905 | 341x256 | 21 824 |
| 1440 | 1.87 % | 171x128 | 5 455 | 303x228 | 17 240 |
| 1920 (banner on a 1080p monitor) | 1.05 % | 128x96 | 3 069 | 227x171 | 9 700 |
| 2560 | 0.59 % | 96x72 | 1 726 | 171x128 | 5 456 |

(Rw = 720 for the 720-wide card means s = 1; for a card narrower than the field height the field is clamped to the frame.)
Practical reading: with the banner at full viewport width on a 1920 CSS px monitor, anything flashing over about 1 % of the frame (9 700 video px, e.g. 98x98 px of the 1280x720 frame) counts. That is why the verdict depends on a cap: **set a CSS `max-width` for the banner and card video (for example 1280 CSS px) and lint at that width.** Recording the assumed `renderWidthCss` in `loops.json` (e.g. `flash: { renderWidthCss, maxPerSecond, ... }`) makes the claim falsifiable.

### 3.3 Pseudo-code
```
params: Rw (CSS px, assumed largest render width), fps, N frames, delta=0.1, dark=0.8, redDelta=20/320
s      = W / Rw
field  = (min(W, 341*s), min(H, 256*s))           // video px
A      = min(fieldArea, 0.25*341*256*s*s)         // video px that must flash inside one field
T      = max(1, round(fps/30))                    // alignment tolerance, frames

1. frames -> cells
   ffmpeg: yuv->rgb24 with BT.709 + range tags explicit, then zscale to LINEAR float, then scale=flags=area to GWxGH
   (cell = 4 px for 720, 8 px for 1280).  r,g,b linear per cell.
   L   = .2126r + .7152g + .0722b
   red = (r/(r+g+b) >= .8) ? max(0, r-g-b) : 0

2. per cell, per channel (L with dark rule, red without), run over 3 concatenated copies of the loop:
   zig-zag:  keep (pivot, ext, extIdx, dir).
     rising:  v > ext -> ext=v, extIdx=t ;  ext - v >= delta -> emit event(end=extIdx) if (!dark || pivot < 0.8); pivot=ext; dir=falling
     falling: symmetric (emit if min(pivot, ext) < 0.8 for L)
   -> events {cell, end frame}

3. cluster events in time and space:
   for each frame f with events (ascending), skipping f < next:
     mask = cells with an event ending in [f, f+T]
     if count(mask) < A/cellArea: continue
     SAT = summed-area table(mask)
     if any field-sized rectangle has sum*cellArea >= A:  emit flashEvent(f); next = f+T+1

4. count: fail if there are >= 7 flashEvents with t_last - t_first <= 1.0 s (closed window), window ending in the middle copy
   (red evaluated separately; fail if either fails)
5. sustained: events in the middle copy / loopDuration >= 4 per s  -> fail for looped content (warn >= 3 per s)
```
Event time stamps are the frame where the swing **ends** (peak or valley), so a hard cut is stamped at the cut frame and a ramp at its end.


### 3.4 Thresholds that are policy, not WCAG
- **Fail** at >= 7 events (more than 3 flashes) in any closed 1 s window, per area-qualified event. This is stricter than WCAG by one transition.
- **Warn** (print, do not fail) at >= 5 events in 1 s (2.5+ flashes).
- **Sustained rate for loops:** average >= 4 transitions/s (2 flashes/s) over the loop or any 5 s cyclic window = fail. The prototype implements the whole-loop average only. Reason: IRIS "extended failure" (4-6 transitions/s for 5 s) and BT.1702's 5-second remark; a loop repeats forever.
- Optional exemption tier: events whose darker state is >= 0.8 are ignored (the spec's carve-out). If you prefer to over-flag, drop the `dark` argument; the cost is false positives on bright light-theme UI slides that only change by 10-20 %.

### 3.5 Cost
- **Prototype [measured]:** 720x405, 60 frames, 3 copies: 0.65-1.05 s end to end including ffmpeg decode (unoptimised JS, full-res block averaging). 1280x720, 240 frames: **11.9 s, 1.1 GB RSS** (whole raw buffer held in memory; Math.floor in the inner loop). Fine for a one-off, too slow and heavy for lefthook.
- **Recommended pipeline [measured, command validated]:** let ffmpeg do the heavy lifting and hand TS 180x101 linear-light float cells:
  ```
  ffmpeg -v error -i loop.mp4 -fps_mode passthrough \
    -vf "scale=in_range=tv:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24,\
  zscale=rin=full:r=full:min=709:m=709:tin=iec61966-2-1:t=linear:npl=100,format=gbrpf32le,scale=180:101:flags=area" \
    -f rawvideo -pix_fmt gbrpf32le -
  ```
  Output is planar G, B, R float32 per frame: 60 frames = 13 089 600 bytes = 60 x 180 x 101 x 3 x 4 exactly. The white square's cell values came back as 1.0000 (max) / 0.0000 (min) / 0.0674 (mean vs expected 0.0672). Needs `--enable-libzimg` (present in Ubuntu's build; check `ffmpeg -filters | grep zscale` in CI). A first attempt that put the yuv->linear conversion inside `zscale` failed ("no path between colorspaces") so the `scale` step to rgb24 is needed. After that the TS side is only the zig-zag (cells x frames x 3 copies) plus a summed-area table per candidate frame: for 14 400 to 18 400 cells and 240 x 3 frames that is a few tens of millions of simple operations, well under 1 s.
- Memory with that pipeline: 3 copies x 240 frames x 18 k cells x 4 B = about 52 MB for L, the same for red. Stream if needed.

---

## 4. Recommendation

### 4.1 What to use
| Option | Role |
|---|---|
| **Own detector (section 3)** | **The gate** in `media:encode` and `check:media`. Falsifiable, tunable, conservative by construction, 150 LOC, no new native dependency (ffmpeg is already required). |
| ffmpeg `photosensitivity=bypass=1` | optional, non-gating **diagnostic** printed next to the verdict ("would the ffmpeg filter have intervened?"). Not area-aware, hence it flags legal clips. |
| IRIS (Python port) | **manual cross-check** when a clip is borderline. Not in CI: it under-flags localized flashes (its area gate is 25 % of the frame and uses frame means), and the C++ build chain (vcpkg OpenCV + FFmpeg) is heavy. |
| PEAT / Harding FPA | optional one-off human validation on a Windows machine before shipping a hero loop; not automatable. |

### 4.2 What the ADR should honestly claim
Suggested wording:
> The flash lint is a conservative **approximation** of WCAG 2.2 SC 2.3.1, built to over-flag. It evaluates every loop cyclically at its final encoded form, using linear relative luminance per 4-8 px cell, a 10-degree-field area test of 341x256 CSS px scaled to the largest rendered width we allow (`renderWidthCss`, recorded per loop), a pair-of-opposing-swings detector with the 0.1 step and 0.8 dark-state rules, an IRIS-style saturated-red rule, and a closed 1 s window that fails at seven or more qualifying transitions. It also fails sustained rates of four or more transitions per second because loops do not end. It is **not a certification** and does not model closer viewing distances, zoom, HDR, or display-side processing. Passing it does not prove compliance; failing it means "re-cut or shrink the flashing area". Reference tools (IRIS, PEAT) are advisory only. IRIS itself states it "is not intended to guarantee, certify or otherwise validate" compliance.

Also say what was dropped from the original design: whole-frame `YAVG` (gamma, limited range, dilutes, blind to reversal); and name the three knobs that decide the verdict (`renderWidthCss`, `delta`, `dark` exemption on/off).

### 4.3 Practical content rules for RL / game footage and slideshows
Derived from the thresholds above (rules of thumb, my synthesis, not W3C text):
1. **One flash event per second at most, two per 1.5 s at the very most.** A flash = brightening then darkening. The hard limit is 3 per second and the loop-sustained limit 2 per second, so aim for gaps of >= 0.5 s between flash events (>= 15 frames at 30 fps; BT.1702 treats leading edges >= 334 ms apart as acceptable regardless of size).
2. **Flashbangs and white-outs:** at most one per loop, never at the seam (a white-out at the end that cuts to a dark first frame is a second transition). Prefer a clip where the white-out fades over >= 0.5 s *and* is not followed within 0.5 s by another bright event. A fade does not make it a non-flash, it only lowers the rate.
3. **Muzzle flashes and full-auto fire:** 600+ RPM is 10 events per second at any area above the threshold: that fails by itself. Use semi-auto or burst footage, or crop so the muzzle flash area is below the A of the capped render width (about 98x98 px at 1280x720 / render 1920, about 185x185 px at render 1024). Do not depend on the small-area exemption unless the video element has a CSS `max-width`.
4. **Explosions with orange/red fireballs:** bright orange (R high, G ~0.2-0.5 linear, B ~0) satisfies R/(R+G+B) >= 0.8, i.e. "saturated red". Large flickering fireballs at > 3 Hz fail the red rule. Pick a moment where the fireball is steady or leaving frame.
5. **Slideshow hard cuts:** hold each slide >= 0.5 s (15 frames at 30 fps), prefer 1-2 s. Never alternate light-theme and dark-theme full-frame screenshots faster than 2 per second; a cut between a light and a dark UI is a full-frame 0.5-0.9 luminance swing. Crossfading does not help unless it lengthens the holds.
6. **Make the loop seam quiet:** cut the loop where the first and last frames are similar, or add a held frame at the seam. The seam counts as a transition.
7. **Keep any flashing content small and capped:** set `max-width` on cards and banners and record `renderWidthCss` in the recipe; the lint scales the area with it.
8. **Non-normative mitigation:** under `prefers-reduced-motion: reduce`, show the poster instead of autoplaying/hover-playing the loop. It does not replace the lint (SC 2.3.1 is Level A and applies to content as shipped) but removes the exposure for the users most at risk.

---

## 5. Open items / caveats
- **Did not build IRIS C++** (no cmake/ninja/vcpkg here). Everything said about IRIS behaviour comes from reading source and from the Python port's output on synthetic clips; the port may differ slightly at thresholds (its author says so).
- PEAT details are from search-result snippets (version 1.6, Windows-only, proprietary engine) and were not independently verified; no download attempted.
- The prototype uses BT.709 untagged-YUV assumptions and sRGB transfer. Browsers decode BT.709-transfer video slightly differently from the sRGB curve; effect on a 0.1 step is small but not zero.
- The red rule in the prototype is the IRIS scalar rule only; the u'v' rule is described but not implemented.
- Clustering tolerance `T = 1` frame at 30 fps merges events closer than 2 frames; for sustained strobes above 15 transitions/s the count is halved, which is still far over the limit. Per-placement (rather than global-OR) event tracking would reduce false positives for footage with two separate small flashing areas; not implemented.
- Video encoders may alter luminance of flat flashes by +/-1-2 code values; the 0.1 hysteresis absorbs that.
- Real footage will be less clean than synthetic squares; before locking thresholds run the lint on the actual RL clips and inspect the fail list. Expect over-flagging at `renderWidthCss` 1920.
- The `testsrc2` 1280x720 test pattern (busy counters and moving bars) fails the lint at Rw 1920 with 12 events in 1 s: busy synthetic content over-flags, as intended.

## Sources
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ (SC 2.3.1 text and glossary entries)
- Understanding SC 2.3.1: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
- G176 (small safe area): https://www.w3.org/WAI/WCAG22/Techniques/general/G176
- G19 (3 flashes): https://www.w3.org/WAI/WCAG22/Techniques/general/G19
- G15 (tool): https://www.w3.org/WAI/WCAG22/Techniques/general/G15
- ITU-R BT.1702-3 (11/2023): https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1702-3-202311-I!!PDF-E.pdf (Guideline 1, Note 3, Note 4, Annex 3)
- ffmpeg filter docs: https://ffmpeg.org/ffmpeg-filters.html#photosensitivity ; source https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/vf_photosensitivity.c ; doc/filters.texi at master (section photosensitivity, line 20565)
- IRIS: https://github.com/electronicarts/IRIS (README, `src/Flash.cpp`, `src/FlashDetection.cpp`, `src/RedSaturation.h`, `src/RelativeLuminance.h`, `src/TransitionTracker.cpp`, `config/appsettings.json`, `vcpkg.json`, `CMakeLists.txt`, `CMakePresets.json`, release 1.1.0)
- IRIS Python port: https://pypi.org/project/iris-pse-detection/ ; https://github.com/tokoroten/iris-pse-detection
- PEAT: https://trace.umd.edu/?p=719 ; https://ds.gpii.net/node/4345
- Third-party listings (unverified): https://awesome.ecosyste.ms/projects/github.com%2Floopglitch26%2Fflashdetect

---

