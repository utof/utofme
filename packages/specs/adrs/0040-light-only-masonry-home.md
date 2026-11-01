# ADR 0040 — Light-only site + image-first masonry home (MVP)

**Status:** accepted (MVP, reversible)
**Date:** 2026-10-27

## Context

The home page is being re-skinned into a white, media-first masonry portfolio
("clean but rich — the media does the talking"). The site is built piece by
piece, so the MVP strips the home page down rather than adding to it.
Dark mode (ADR 0035), the filter bar, per-card type glyphs / meta pills, and
the hover Preview popover all compete with the media and are out of scope for
the MVP — but the user wants them kept in the codebase, not deleted.

## Decision

- **Light-only via a flag, not deletion.** `LIGHT_ONLY` in
  `packages/site/src/lib/theme.ts` (default `true`) makes the dark path inert:
  `<html data-theme="light">` is set statically; `MetaHead` injects
  `forcedLightThemeScript()` (never reads `localStorage` or
  `prefers-color-scheme`) instead of `inlineThemeScript()`; `_BaseLayout` does
  not render `ThemeToggle`; `tokens.css` sets `color-scheme: light` on `:root`.
  The `[data-theme="dark"]` and `prefers-color-scheme` blocks stay in
  `tokens.css`, but their selectors can no longer match. Expressive Code
  (`ec.config.mjs`) and Sandpack (`SandboxIsland.tsx`) are pinned to their
  light themes as well. Flip `LIGHT_ONLY` to `false` (and revert those two
  one-line pins) to restore the system/light/dark cycle.
- **Hide, don't delete.** `index.astro` no longer renders `FilterBar`,
  `TypeGlyph`, `MetaPills`, `Preview`, `ClickCounter` or the typography
  sentinel. All components, the Zod `type` field and their tests remain;
  `/works/` still renders the full filterable grid.
- **Masonry via CSS multi-column** (`columns` + `break-inside: avoid`), gutter
  driven by the single token `--masonry-gap`. Items flow **column-major**
  (top-to-bottom, then the next column), not row-major.
- **GIF covers use a plain `<img>`, stills use `<Picture>`.** Astro's sharp
  service runs with `pages: -1`; AVIF and PNG outputs of an animated GIF come
  out as one tall still with all frames stacked (measured: 28 frames of a
  600x327 GIF became a single 600x9156 AVIF), so `<Picture formats={["avif",
  "webp"]}>` would serve a broken first source. WebP/GIF outputs stay animated.

## Alternatives

- `display: grid-lanes` (native masonry) — not adopted for the MVP; would give a
  different item order per browser unless used purely as an enhancement.
- `<Image format="webp">` for GIFs (animated WebP, ~65 % smaller in a sample
  test) — viable follow-up, but lossy re-encoding softens line-art GIFs.
- A JS masonry library — new dependency, not justified for the MVP.

## Consequences

- Several e2e specs that assert the old home (filter bar, `data-component`
  primitives, click counter, sound toggle, preview popover, landing/transition
  screenshots, dual-theme code blocks, theme toggle) no longer hold on `/`.
- Newest-first order reads down each column rather than across a row.

## Addendum: hover dither (flagged, off by default)

A slight ordered-dither effect on card hover, behind a flag so the default page
ships none of it.

- Flag: `?dither` / `?dither=1` turns it on and persists
  `localStorage['utofme:dither']='1'`; `?dither=0` turns it off and clears it
  (`src/lib/flags.ts`). The loader `<script>` in `src/pages/index.astro` only
  `import()`s `src/lib/dither/card-dither.ts` when the flag is on.
- Plain WebGL2, no three.js, no new dependency. ONE shared canvas is moved onto
  the hovered card's `<img>` (browsers cap live WebGL contexts at ~16); the image
  is uploaded as a mipmapped texture, GIFs re-uploaded per frame so they keep
  animating. Bayer 8x8 threshold, 4 levels/channel, 2 CSS px cells, blended in
  with a radius falloff and short pointer trail; fades out on leave.
- Only `(pointer: fine)`; `prefers-reduced-motion` gets a flat static dither with
  no trail; no WebGL2 / failed texture upload leaves the plain card.
- Knobs (`CONFIG` at the top of the module): mode, pixelSize, levels, strength,
  radius, trail, ambient.
- Ported from the owner's React reference (shader tables, trail falloff, lifecycle).

## Sources

- https://docs.astro.build/en/reference/errors/unsupported-image-format/
- https://docs.astro.build/en/reference/modules/astro-assets/ (`<Picture>`)
- `node_modules/astro/dist/assets/services/sharp.js` (`pages: -1`, GIF→WebP)
