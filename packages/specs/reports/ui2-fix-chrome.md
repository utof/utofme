# ui2-fix: chrome

Branch `fix/ui2-chrome`. Findings: P-04, P-05, P-06, P-10, P-01, P-11, the phone caption bar and the slash-page accent.

## Summary
Every page now shares one header. A fixed 44 px row holds the "utofme" wordmark on the left and the page controls on the right, at `--page-width`. Page titles are 36 px at one offset. The footer is tidier. The sound toggle looks like the Pause-motion toggle. Phone cards have a slimmer caption bar. Pages carry full share metadata, with a 1200×630 banner crop per project.

## Changes by finding

**P-05 / P-06, one header and one h1 rule**
- New `src/components/SiteHeader.astro`, mounted once in `_BaseLayout`, so it covers home, project, slash pages, stats, garden index/notes/graph, search, lab and 404.
- The controls slot is forwarded as `slot="controls"`. Home and project pages put `MotionToggle` there. Every non-minimal page also gets `SoundToggle` there.
- Home renders the wordmark as its `<h1>` (`wordmarkHeading`). Elsewhere it is a `<p>`.
- One global `main h1` rule in `_BaseLayout`: `--font-size-7`, margin `0 0 8px`. I removed the per-page h1 and wordmark CSS from `index`, `404`, `search`, `lab/datamosh`, `_SlashLayout` and `stats`. I also zeroed each page's top padding, because the header supplies the gap.
- `_WorkLayout.astro`: the toggle moved from `.nav-row` to the header slot, and `padding-block-start` went to 0. I also added an `ogImage` prop and a `title` change (bare title). The project worker owns the rest of that file.
- "← All works" stays as a small breadcrumb under the banner. The tests depend on it and the wordmark is not labelled as "all works".
- Project h1 keeps its own scoped size (28 px). That is the project worker's call.
- Measured at 1280, 1920, 393 and 852: the wordmark box is identical on every route, at x = page margin, y = 32, 71×44 (see "Measurements"). Titles are 36 px at y = 100 on all non-project pages (`now`, `garden` and `404` measured).

**P-04, footer and toggles**
- The h-card is now a single row: `utof.me — Personal site and portfolio. · GitHub @utof`. The mf2 markup is unchanged (`h-card`, `u-url p-name`, `p-note`, `rel=me`).
- On ≤480 px the tagline is visually hidden but kept in the DOM and for assistive tech, so the row reads `utof.me · GitHub @utof`.
- Both toggles use one shared `.site-ctl` rule: 1 px `--color-border-strong`, `--radius-sm`, 32 px high, mono 12 px.
- The sound toggle shows the speaker glyph plus the text "Sound on" / "Sound off".
- Decision: both toggles live in the header control slot. Pause motion is required there on home and project pages, and Sound joins it. Home stays minimal, with Pause motion only.
- The sound toggle's `aria-label` is removed so its accessible name matches the visible text. I updated its unit test.

**P-10, phone footer**
- At ≤480 px the order is copy and `source` on row 1 (`source` pushed right), then the nav on row 2 (`flex-basis:100%`, `space-between`).

**P-01, tap targets**
- One global rule covers `.site-ctl`, `footer a`, `.h-card a`, `nav.cross-link a` and the breadcrumb.
- Fine pointer: a centred `::before` of `max(100%, 44px)` square.
- Coarse pointer: real `inline-flex` boxes with `min-block-size` and `min-inline-size` of 44 px, so zones never overlap.
- The desktop footer nav gap went from 12 to 24 px so adjacent `::before` zones don't overlap.
- The new e2e `chrome.spec.ts` checks `document.elementFromPoint` at the four corners (±21 px) of each element's 44×44 box. It covers the wordmark, both toggles, footer links, h-card links, "more about me" links and the breadcrumb, on `/now/`, `/colophon/`, `/uses/` and a project page. It runs at 393×852 touch and at 1280×800 desktop. Before the fix it failed on the footer links and the breadcrumb.

**Phone card caption** (`Card.astro`)
- Under `(pointer: coarse), (max-width: 639px)`: `.cap__m` is hidden, `--cap-meta-h` is `0px`, and the reveal transform is `none`, including on hover. The description keeps its single ellipsised line. Desktop hover is unchanged.
- The e2e asserts a ratio below 0.36, `meta: none` and `transform: none`. The first card is about 30 % in the screenshot (`p393_.png`).

**P-11, share metadata**
- New `src/lib/seo.ts`: `pageTitle` gives `<page> · utofme` (home gives `utofme`) and does not double the suffix. `absoluteUrl` builds absolute URLs from `Astro.site`.
- `MetaHead` emits `canonical`, `theme-color`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:type`, `og:image` (with width and height) and `twitter:card=summary_large_image`, plus `twitter:title`, `twitter:description` and `twitter:image`.
- `og:type` is `article` for `/works/*` and `website` elsewhere.
- Page titles are now bare strings (e.g. "Garden", "Search", "Garden graph", "Not found").
- Projects: `src/lib/og-image.ts` (`projectOgImage`) builds the image at build time with `getImage` from `astro:assets`, from the banner loop's poster (else the cover), as a 1200×630 `fit: cover` JPEG. The vertical focus maps to sharp's top/center/bottom gravity. The route `works/[...slug].astro` passes it to `_WorkLayout`, which forwards it to `_BaseLayout`.
- Other pages use `public/og-default.png`, a plain 1200×630 wordmark card I generated with sharp. It is 11 KB.
- Tests: unit tests for `seo`, `og-image` and `MetaHead`. The e2e checks the og:image URL returns 200 and decodes to 1200×630.

**Accent on slash pages**
- Hover and focus underlines on links in `main` take `#0d99ff` at 2 px. I used `--color-focus`, the fixed #0d99ff. `--color-accent` shifts with the time of day (ADR 0038), so it would not be #0d99ff at night.
- Link text stays `--color-link` (#0064c2, AA). The footer, h-card and wordmark hovers use the same underline colour.

## Measurements
Layout numbers are `getBoundingClientRect` at 1280×800, 1920×1080, 393×852 and 852×393. 1920 and the two phone viewports were taken at DPR 2.

| Check | Value |
|---|---|
| Wordmark box (left, top, width, height), home / now / garden / 404 / project | 1280: 96,32,71,44. 1920: 144,32,71,44. 393: 29,32,71,44. 852: 64,32,71,44. Identical on every route per viewport. |
| Header box | 0–76 px tall, `--page-width` wide. 1280: 1088. 1920: 1632. 393: 334. 852: 724. |
| Page title (h1) size and top, non-project pages | 36 px, top = 100 on `now`, `garden` and `404`, at all four viewports. |
| Project h1 | 28 px, unchanged. |
| Controls | 32 px high at y = 38. On a project at 1280 both toggles are 113 px wide (x = 950 and 1071). Right edge = header right edge (1184). |
| Hit areas | Pass the four-corner `elementFromPoint` check on every element listed above. |

- Review "before" numbers: the review lists Pause motion at x = 715–820 against a banner edge at 1332 (P-02), and h1 tops of 32/37/106 px (P-06).
- I did not take a "before" build. The review screenshots are on `origin/review/ui2-polish` under `packages/specs/reviews/ui/polish/`.
- The `after` screenshots are in `packages/specs/reports/ui2-fix/chrome/`. There are 11 files, none wider than 1280 px at DPR 1, and 786 px at DPR 2:
  - `d1280_*.png` (desktop): home, now, garden, 404 and a project.
  - `p393_*.png` (phone portrait): the same routes.
  - `l852_works_tactical-arena_.png` (phone landscape): a project page.
- `currentSrc` was not relevant to this area, so I did not measure it.

## Tests
Run against a local `astro preview` of the production build, with a throwaway Playwright config that points at `/opt/pw-browsers/chromium` (not committed).
- Full vitest: 640 tests, all pass once the fixture build exists. `card-pagefind-attrs` reads a fixtures `dist`, so it fails against a `UTOFME_FIXTURES=false` build; that is how that spec works, not a regression.
- Playwright e2e, excluding the visual specs (`cards`, `landing`, `transitions`, `image-pipeline`): 173 passed, 3 skipped, 2 failed.
  - `layout-chrome` "search has a header with a home link" looked for the link in `main`. I fixed the test to look in the header.
  - `typography` "preload link for local mono font exists" fails here with no font preload link. Google Fonts can't be fetched in this VM, so I take it as environmental. I did not confirm it on `main`.
- Updated old tests: `layout-chrome` (removed the nav-row gap test and the `::after` footer test, both superseded by `chrome.spec.ts`), `footer` (the sound toggle is no longer in the footer block), `sound-toggle` (label assertions).
- New: `tests/e2e/chrome.spec.ts` (18 tests), `tests/unit/seo.test.ts`, `tests/unit/og-image.test.ts`, extra cases in `tests/unit/metahead.test.ts`.

## Visual specs expected to change
Baselines are not regenerated in this VM. The coordinator should regenerate these on a GitHub runner after merge:
- `landing.spec.ts` (home gets the new header and a changed footer),
- `cards.spec.ts` (caption bar on touch/narrow),
- `transitions.spec.ts` (header and footer on the pages it captures),
- `image-pipeline.spec.ts` (project page top).

## Gates
- `biome check`: clean.
- `astro check`: 0 errors, 0 warnings, 1 pre-existing hint.
- `type-coverage --at-least 100 --strict`: 100.00 % (33815 / 33815).
- `knip`: passes on my files. It prints two configuration hints, "Remove from ignoreDependencies" for `wrangler` and `lefthook`, which already appear on `main`.
- `depcruise`: clean.
- `check:docs`: clean.
- `UTOFME_FIXTURES=false` build: OK.
- `check:no-fixtures`: clean.
- `check:budgets`: every route is within budget; `/` warns on loop sizes (R6). It exits 1 on 11 "chunk not reachable from any route" errors (`SandboxIsland`, `ec`, `base`, etc.). `main` fails the same way in the same VM with a fresh `dist`, so I did not cause it and did not touch it.

## Decisions and leftovers
- The breadcrumb stays. Both controls are in the header slot. Both decisions are explained above.
- Home keeps only Pause motion because home is the `minimal` layout. It never had the sound toggle (ADR 0040).
- The datamosh lab's page title no longer uses the serif font; it follows the global h1 rule.
- Not done: nothing from the brief, apart from the visual baselines (not regenerated, as instructed).
