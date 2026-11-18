# 0061 — Catalogue home with a curated model and swappable layouts

Status: accepted. Amends 0040 (the home is still light-only; the masonry is no longer the home page).

## Context

- The home page was one masonry of every work (ADR 0040): no hierarchy, no grouping, and nothing to scan once the list grows towards fifty projects.
- The chosen design, "X · Catalogue", has a sticky header with jump links, one hero project, a grid of highlighted projects and one dense list per topic, each project with a small spinning low-poly object.
- The owner will add projects, change which one is the hero and which are highlighted, and may replace the whole layout later (another candidate is "W · Island map"). None of that should need a component edit.
- The page must keep working with no JavaScript, and keep the site's media pipeline (responsive covers, loop videos, "Pause motion", per-route budgets).

## Decision

Five layers, each replaceable without touching the others:

1. **Per-project facts in frontmatter.** The works schema gains `topic` (an id from the topic registry; missing → the "Other" group) and `icon` (a key of the 3D-object registry; missing → a generic object seeded from the slug). Both are validated at build time.
2. **Topic registry**, `src/data/topics.ts`: an ordered list of `{ id, label }`. Its order is the order of the sections.
3. **Curation file**, `src/data/home.ts`: `layout`, `hero`, `highlighted`, `featuredLabel`. Editorial choices only.
4. **Pure model builder**, `src/lib/home/model.ts`: `buildHomeModel(works, curation, topics) → HomeModel` (`hero`, `highlighted`, `groups`, `counts`). No Astro imports and no DOM. A curated slug that is not among the works throws, naming the slug, the field and the file. Every work is in exactly one group; empty topics are omitted; a project that is neither hero nor highlighted appears only in its topic's list.
5. **Layouts as folders**, `src/components/home/<layout>/`: the root component takes the `HomeModel` as its only prop and renders the whole page through `_BaseLayout`. `HomeLayout.astro` is the registry (layout key → component); `pages/index.astro` only loads works, builds the model and renders the layout named in the curation file.

Supporting decisions:

- **`_BaseLayout` gains slots and two props instead of a fork:** `head`, `header`, `footer` slots (the last two replace `SiteHeader` / `SlashFooter` when filled), `bodyClass`, and `preloadMono`. Every other page renders exactly as before.
- **Design tokens are custom properties on `body.ct-home`** (colours, fonts, frame width, ratios, object sizes, sticky heights), declared in one block in `CatalogueHome.astro`. No inline styles carry design values.
- **Fonts:** Michroma and Jersey 15 (both OFL) are self-hosted latin subsets, registered through the Astro Fonts API `local` provider with `display: swap`, and emitted only on the home page. Both are preloaded there (both are in the first viewport); the mono preload is switched off on the home.
- **Rows are native `<details name="home-row">`.** Expand/collapse, Enter/Space and "one open at a time" come from the browser; with no JS the row still opens and its project link is ordinary content. The summary holds no links, so nothing interactive is nested. A 10-line fallback closes other rows in browsers without `name`. The open row spans the grid through `:has(details[open])`.
- **3D objects are a registry of mesh functions** (`src/lib/home/objects/`): primitives (`box`, `cone`, `cyl`, `ico`, `ring`, `torus`), one entry per named object, a seeded generic fallback, a pure projection/shading function and a 2D-canvas painter. One shared `requestAnimationFrame` loop at ~14 fps draws only canvases an `IntersectionObserver` reports visible, and stops when none is visible, the tab is hidden or motion is paused (the site toggle, which follows `prefers-reduced-motion`). Every canvas gets one still frame at mount. Canvases are `aria-hidden`.
- **Kept from the masonry home:** "Pause motion", the `/?type=&tag=` deep-link filter (now over every project element on the page) and the flag-gated `?dither` / `?mosh` hover effects (bound to the featured grid, which keeps `data-test="works-grid"` and `.card` elements). The card → banner morph still starts from the featured cards (`data-work-slug` + `data-vt-frame`). `Card.astro` and `lib/masonry.ts` stay: `/lab/datamosh/` and `LoopMedia` use them.

## Alternatives

- **Hard-code the seven projects in the layout, as the mock does.** Rejected: every new project or change of hero would be a component edit, and a second layout would duplicate the list.
- **A `featured: hero | highlighted` field in frontmatter.** Rejected: "exactly one hero" and the order of the highlights are properties of the page, not of a project; two files claiming `hero` would need a tie-break. One curation file states both in one place.
- **Free-text `topic` in frontmatter.** Rejected: one typo makes a new section. The registry also carries the order and the label.
- **`<button aria-expanded>` rows toggled by script (the mock's approach, minus `div role="button"`).** Rejected: with no JS the row would need a second, plain-link rendering; `<details>` gives both from one markup.
- **three.js / WebGL for the objects.** Rejected: a runtime dependency and one GL context per canvas for a few dozen flat triangles at 32-56 px.
- **Forking `_BaseLayout` for the home.** Rejected: head, SEO, palette, router and the h-card would drift apart; three slots and two props cover the difference.

## Consequences

- Adding a project is a content file; promoting it is one string in `src/data/home.ts`; a new topic is one line; a new object is one registry entry; a new home layout is one folder and one registry line. The steps are in `packages/site/src/components/home/README.md`.
- Fixture works have no `topic`, so fixture builds show them in an "Other" section; the deployed site (fixtures off) has no "Other" section while every real work has a topic.
- The home page ships its own script (object loop + row fallback) and two extra font files; the route's budgets are checked by `check:budgets`.
- Visual-regression baselines that include the home header must be regenerated.
- A browser without `:has()` (before 2023) shows an open row in its own column instead of across the grid; nothing is hidden.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details#name
- https://developer.mozilla.org/en-US/docs/Web/CSS/:has
- https://docs.astro.build/en/reference/font-provider-reference/#local
- https://docs.astro.build/en/reference/astro-syntax/#astroslotshas
- https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- packages/specs/adrs/0040-light-only-masonry-home.md
- packages/specs/adrs/0011-card-click-target-strategy.md
