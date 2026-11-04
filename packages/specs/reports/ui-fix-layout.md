# UI fix: layout (branch `fix/ui-layout`)

## Summary
Every page now shares one outer column, `--page-width` (built on `--page-margin`, `tokens.css`). Header, banner edge, text, h-card block and footer all start on the same left edge on every route. Text columns keep their own max-width, left-aligned inside that column (decision: left-aligned rather than centred, so the footer, header and heading share one edge, which is what the owner asked for).

## Findings
| Id | Change | Files |
|---|---|---|
| D-01 | Footer and `.footer-meta` (h-card, sound button) use `--page-width`; the `--footer-inset` special case is removed. h-card microformats untouched. | `SlashFooter.astro`, `_BaseLayout.astro` |
| D-05, M-02, M-17 | Garden index, notes and graph use the page column with a 70ch measure. The graph canvas was window-sized and spilled outside its box (393×659 inside 334×400), so it is now sized to its container, kept in sync by a ResizeObserver, clipped, and `zoomToFit` after the engine stops keeps every node inside. The "List view" summary is 44 px tall. | `_NoteLayout.astro`, `garden/index.astro`, `garden/graph.astro`, `GraphView.svelte` |
| D-09, M-03 | `--page-width` token; home, project, slash, stats, search, garden, lab and 404 all use it; per-layout magic paddings are removed. | `tokens.css`, layouts, pages |
| D-08, M-15 | Project header: `.nav-row` flex, `space-between`, `gap: var(--space-3)`, wraps. Measured at 1280: crumb 96–180, toggle 703–808. At 393: crumb 29–113, toggle 259–364 (gap ≥ 146 px). Link text stays "← All works". | `_WorkLayout.astro` |
| D-03 | New `src/pages/404.astro` on the base layout (light tokens, home link, footer, noindex). `wrangler.jsonc` already has `assets.not_found_handling: "404-page"`, so no change; I did not re-verify the key on developers.cloudflare.com because the egress proxy blocks it. | `pages/404.astro` |
| D-10 | `public/favicon.svg` (accent square with a white "u") and a 32×32 `favicon.ico`. `<link rel="icon">` points at both; the data-URI favicon is removed. | `public/`, `_BaseLayout.astro` |
| M-11 | `/search/` has a wordmark header linking home. | `search.astro` |
| D-13 | `_SlashLayout` gets a `crossLink` prop; the colophon turns it off. | `_SlashLayout.astro`, `colophon.astro` |
| M-06 (footer) | `footer a::after` gives a 44-px-tall hit area (≥44 wide) without changing the visual size. Measured: the visual `source` link stays 39×19.5. | `SlashFooter.astro` |

## Outer left edge (px), after
| Route | 1280 (h1 / main / footer / h-card) | 393 |
|---|---|---|
| `/`, `/lab/datamosh/` | 96 / 96 / 96 / hidden | 29.5 / 29.5 / 29.5 / hidden |
| `/now/ /uses/ /colophon/ /tops/ /stats/ /search/` | 96 / 96 / 96 / 96 | 29.5 ×4 |
| `/garden/`, `/garden/welcome/`, `/garden/graph/` | 96 ×4 | 29.5 ×4 |
| `/works/tactical-arena/` | 96 ×4 | 29.5 ×4 |
| `/nope/` (404) | 96 ×4 | 29.5 ×4 |

Before (reviews): 0 / 12 / 29 / 32 / 96 / 252 / 284 / 317 / 329.

## Tests
- New `tests/e2e/layout-chrome.spec.ts`: shared margin on 8 routes, 404, favicon, search header, header gap, garden gutter, footer hit area.
- `slash-pages.spec.ts` updated: colophon has 0 in-page cross-links.
- Screenshots in `specs/reports/ui-fix/layout/`: colophon, garden graph, project, search and 404 at 1280 and iPhone 15.

## Visual baselines expected to change
`landing.spec.ts`, `cards.spec.ts`, `transitions.spec.ts` and `image-pipeline.spec.ts` (home and project footers and layout widths; footer geometry changed). Not regenerated here.

## Gates
- Biome: clean (lefthook ran it on commit).
- `astro check`: 0 errors, 0 warnings.
- `type-coverage`: 100%.
- `knip` and `depcruise`: clean. `check:docs` passes.
- Unit tests: 550 pass, 70 fail in `card-pagefind-attrs.test.ts`. Identical without my changes, so pre-existing.
- E2E (fixtures build, visual specs excluded): 150 pass, 3 skipped, 1 fail. The failure is `typography.spec.ts` font preload, because Google Fonts is unreachable in this VM.
- `check:no-fixtures`: clean.
- `check:budgets`: 11 orphan-chunk errors (Sandbox/ec chunks). The same 11 appear on a clean `origin/main` build, so they are not from this change. The R4 failure from the brief did not show up in the `UTOFME_FIXTURES=false` build.

## Decisions and caveats
- Banner: its `max-width: 1280` with `margin: 0 auto` belongs to the banner worker. At viewports > ~1450 px it would centre inside the wider column rather than align left; I left it.
- Playwright's pinned browser build was missing, so I symlinked it to the installed Chromium under `/opt/pw-browsers` (outside the repo).
