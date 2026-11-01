# ADR 0042 — Adopt the v21 visual language (tokens, type, hairlines)

## Status
Proposed — experiment on branch `design/v21-tokens`, on top of the light-only masonry home (ADR 0040).

## Context

The light-only masonry home (ADR 0040) strips `/` to "name + media + footer". The owner
likes the minimalism of **v21**, a separate design system (a Figma-clean neutral palette,
Geist type, hairline-driven separation, one blue accent) and wants to see it applied here.
v21 targets a dense note-taking app. Only its foundations carry over to a portfolio site;
its app shell (sidebar, topbar, feed bubbles, composer) does not.

What carries over:
- **Neutrals:** canvas `#FFFFFF`, panel `#FAFAFA`, hover `#F4F4F4`, hairline `#E6E6E6`, border `#D9D9D9`; text `#1E1E1E` (never `#000`), body `#444`, secondary `#757575`.
- **One accent:** Figma blue `#0D99FF` for focus, selection and links only.
- **Type:** Geist (UI + headings, 600, −0.02em), Geist Mono (code, meta, key caps), Newsreader (editorial moments only).
- **Shape:** sharp by default (2 / 4 / 6 / 10 px radii). Cards are hairline rectangles with no shadow, and they lift by a 1 px shadow on hover. Real elevation is used only for the command palette.
- **Motion:** 140 ms hover, 220 ms enter, `cubic-bezier(0.2, 0.7, 0.2, 1)`, no bounce. The palette opens with a 0.96 → 1 scale.
- **Focus:** a box-shadow ring, never an outline.

## Decision

Map the v21 tokens onto the existing token names in `src/styles/tokens.css`, so that
components keep working unchanged, and add the v21 tokens that have no counterpart
(`--font-size-ui`, `--font-size-7/8`, `--leading-*`, `--tracking-*`, `--radius-xs/bubble/pill`,
`--shadow-hairline/focus`, `--ease-out`, `--color-surface-hover/active`, `--color-border-strong`,
`--color-text-body/faint`, `--color-focus(-tint)`, `--color-link(-hover)`). Then:

- Fonts: Fraunces → **Newsreader** (variable, roman + italic) and Commit Mono (local woff2) → **Geist Mono** (Google provider). Geist stays.
- Global element defaults in `_BaseLayout.astro` at zero specificity (`:where()`): headings, links, focus ring, selection, `hr`, `kbd` key caps.
- Page headings switch from the serif to Geist 600.
- Restyle `Card` (v21 card + quiet media meta row), `SlashFooter` (13 px meta), `MetaPills` (v21 tag chip), `FilterBar` (v21 small outline buttons) and `CommandPalette` (v21 palette: 10 px radius, `--shadow-lg`, 4 px backdrop blur).

Deviations from v21, with reasons:
- **Link text uses `#0064C2`** (v21 "accent-press"), not `#0D99FF`. `#0D99FF` on white is about 2.9:1, which fails WCAG AA for text (4.5:1).
- **Focus ring = 2 px accent inside a 4 px tint halo.** v21's `--shadow-focus` lists the 2 px tint first, so the tint paints over the 1 px accent ring and the ring disappears on white.
- **Body stays at 16 px.** v21's 14 px body is app density. v21 itself bumps "reading-heavy surfaces" to 16 px.
- **The time-of-day accent shifts stay** (ADR 0038). They still drive `--color-accent`, which the cursor uses. v21's fixed blue lives in the new `--color-focus` / `--color-link` instead. Dropping time-of-day to honour v21's single-accent rule would be a separate decision.
- **Spacing indices are unchanged.** Both systems are on a 4 pt grid. Renumbering `--space-*` would shift every layout without changing the look.

## Alternatives

- **Keep the current look** (Fraunces headings, zinc neutrals): no work, but not what the owner asked to try.
- **Import v21's `colors_and_type.css` wholesale:** it loads fonts from the Google Fonts CDN at runtime (the site self-hosts through the Astro Fonts API), redefines `--space-*` with different steps, and sets global `html, body` styles that fight the existing cascade.
- **Port the v21 React UI kit:** it is an app shell built for a note feed, with no counterpart on a portfolio, and the kit itself is labelled "cosmetic recreations, not production-ready".

## Consequences

- One commit on top of the masonry work, so the look can be compared and reverted as a unit.
- `src/assets/fonts/CommitMono-400.woff2` is no longer referenced. It is kept until this experiment is accepted.
- ADR 0005's Commit Mono decision is superseded *if* this is accepted. The Berkeley Mono foot-gun invariant still stands.
- The mono face now comes from Google Fonts at build time, like Geist, so offline builds lose the local mono guarantee.
- Visual-regression baselines change (they are already stale after ADR 0040).

## Sources

- v21 design system: `colors_and_type.css`, `README.md` ("Visual foundations"), `preview/{buttons,chips-tags,key-caps,command-palette}.html` (owner-supplied bundle, not in this repo).
- https://fonts.google.com/specimen/Newsreader
- https://fonts.google.com/specimen/Geist+Mono
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://docs.astro.build/en/guides/fonts/
