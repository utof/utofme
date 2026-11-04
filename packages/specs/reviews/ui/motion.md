# Motion UI review (lens: motion)

## Method
- Local production build (`UTOFME_FIXTURES=false bun run build`, `astro preview` on :4321), desktop Chromium 1440x900 via Playwright.
- Videos via `recordVideo`, frames extracted with ffmpeg; CDP 4x CPU throttling for jank sampling.
- Google Fonts unavailable: fallback fonts, no typeface judgements.

## Findings
(in progress)

## Progress notes (work in progress, partial)
- Morph forward (tactical-arena, enth, godot-ctcs, linsae): VT starts ~150-220 ms after click; hero group 450 ms; old(hero) fades 200 ms while new(hero) uses UA default 450 ms ease fade, so mid-flight the media is semi-transparent over white (see morph-fwd-tactical-08..10.png).
- Pause motion: instant (50 ms), persisted, reload shows poster; loops pause off-screen.
