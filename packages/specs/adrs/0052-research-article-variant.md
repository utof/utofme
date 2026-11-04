# 0052 — Research-article variant of the works page

Status: accepted (phase 10, spec P10-1)

## Context
`/works/tactical-arena/` becomes a long-form interactive research article but must keep the card → banner morph (ADR 0046), the banner loop, its place in the works collection and the prev/next order. The Tier S project layout (ADR 0049, spec 09 P9-8) assumes a short body, a gallery and a lede-sized subtitle. A second collection or a second route would lose the card, the feeds and the neighbours.

## Decision
- **One route, two layouts.** Presence of `article` in the frontmatter selects `_ArticleLayout.astro` in `src/pages/works/[...slug].astro`; absent, `_WorkLayout.astro` renders exactly as before.
- **The banner is shared.** The banner block (markup, `ProjectStill` fallback and `.banner` CSS) moved verbatim into `ProjectBanner.astro`; golden markup tests (`tests/fixtures/banner-golden/`) pin the extraction for a loop and a still cover, so the morph and `banner-quality.spec.ts` are unaffected.
- **Layout.** Banner → header (breadcrumb and eyebrow share the `.nav-row`; `h1` = `article.headline`, `.lede` = `article.dek`; meta with "Updated") → hidden `u-url` → `nav[aria-label="Sections"]` → `.e-content.article-body` → prev/next. The body is a CSS grid from 1200 px (text 38rem, aside 18rem, a `rest` track so `fig--full` reaches the page width); one column below. Figures take `fig--text|wide|full` from `Figure.astro`.
- **Server-rendered conveniences.** MDX `h2` and `aside` map to `SectionHeading.astro` (adds the `#` anchor with `aria-label`) and `Note.astro` (`role="note"`, since a bare `<aside>` in `<main>` fails Axe's top-level-landmark rule). No client JS.
- **Lab pages never ship.** `/lab/figures/<id>/` and `/lab/article-layout/` exist only when `UTOFME_FIXTURES` is true. Because `getStaticPaths` only applies to dynamic routes, the layout lab is `src/pages/lab/[layout].astro` with a single path.

## Alternatives
- **A separate `articles` collection.** Rejected: duplicates the card, feeds, sitemap and prev/next wiring, and breaks the morph.
- **A prop on `_WorkLayout` to switch variants.** Rejected: the two shells share only the banner and the end matter; one file with two grids and two header anatomies is harder to test.
- **A client script for heading anchors.** Rejected: costs first-view JS and fails with scripts off.

## Consequences
- Both layouts duplicate a few header rules (`h1`, `.lede`, `.nav-row`); the banner CSS has a single home.
- MDX authors write plain `##` headings and `<aside>`; the components map handles anchors and the note role.
- The lab layout page is a static dynamic-route file, not `article-layout.astro`.

## Sources
- https://docs.astro.build/en/guides/routing/#static-routes-take-priority
- https://docs.astro.build/en/guides/integrations-guide/mdx/#assigning-custom-components-to-markdown
- https://dequeuniversity.com/rules/axe/4.11/landmark-complementary-is-top-level
- packages/specs/adrs/0046-card-banner-morph.md
