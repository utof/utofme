# Home page

`/` is built in layers, so each kind of change touches one small file. Decision record: `packages/specs/adrs/0061-catalogue-home-curated-model.md`.

| Layer | File | Holds |
| --- | --- | --- |
| Project facts | `src/content/works/<slug>.mdx` frontmatter | `title`, `lede`, `date`, `stack`, `cover`, `topic`, `icon` |
| Topic registry | `src/data/topics.ts` | ordered `{ id, label }` list; the order is the order of sections |
| Curation | `src/data/home.ts` | `layout`, `hero`, `highlighted`, `featuredLabel` |
| Model | `src/lib/home/model.ts` | `buildHomeModel(works, curation, topics) → HomeModel` (pure, unit-tested) |
| 3D objects | `src/lib/home/objects/` | primitives, named objects, generic fallback, renderer, animation loop |
| Layouts | `src/components/home/<layout>/` | components that draw a `HomeModel` |
| Layout registry | `src/components/home/HomeLayout.astro` | layout key → root component |
| Page | `src/pages/index.astro` | load works → build model → render the curated layout |

A slug is the file name in `src/content/works/` without its extension.

## Add a project

1. Create `src/content/works/<slug>.mdx` with the usual frontmatter (`type`, `title`, `date`, `lede`, `stack`, `cover`, …).
2. Set `topic:` to an id from `src/data/topics.ts`. Without it the project is listed under "Other".
3. Optionally set `icon:` to a key from `src/lib/home/objects/named.ts`. Without it the project gets a generic object picked from its slug (always the same one).

It now appears in its topic's list. Nothing else to edit.

## Promote a project to hero or highlighted

Edit `src/data/home.ts`:

- `hero: "<slug>"` — the one big project (`null` for none).
- `highlighted: ["<slug>", …]` — the cards under it, in this order.

A slug that does not exist fails the build with a message naming the slug and this file. Hero and highlighted projects stay in their topic lists too.

## Add a topic

Add one line to `TOPICS` in `src/data/topics.ts`: `{ id: "robots", label: "Robotics" }`. Its position in the list is its position on the page. A topic with no projects is not shown.

## Add a 3D object

Add one entry to `NAMED_OBJECTS` in `src/lib/home/objects/named.ts`:

```ts
/** A lighthouse. */
lighthouse(m, t) {
	cyl(m, 0.4, 1.2, 8, [0, -0.2, 0], [238, 230, 207]);
	cone(m, 0.5, 0, 0.4, 8, [0, 0.6, 0], [181, 84, 60]);
	ico(m, 0.12, [0, 0.35 + Math.sin(t * 2) * 0.03, 0], [214, 169, 58]);
},
```

- Build it from the primitives in `mesh.ts`: `box`, `cone`, `cyl`, `ico`, `ring`, `torus`.
- Keep it within about ±1.2 units of the origin; y is up; colours are `[r, g, b]`, 0-255.
- `t` is seconds: use it for small movements (`Math.sin(t * 2) * 0.05`).
- The key (`lighthouse`) is now a valid `icon:` value. `tests/unit/home-objects.test.ts` checks every entry automatically.

## Add a home layout

1. Create `src/components/home/<name>/<Name>Home.astro`. Its only prop is `model: HomeModel<CollectionEntry<"works">>`. It renders the whole page through `_BaseLayout` (slots `head`, `header`, `footer`; props `bodyClass`, `preloadMono`) and reads nothing but the model.
2. Register it in `HomeLayout.astro`: add `"<name>": <Name>Home` to `LAYOUTS`.
3. Set `layout: "<name>"` in `src/data/home.ts`.

Data, the model and the object registry are shared; `catalogue/` can stay next to the new folder.

## Change the look of the catalogue

Colours, fonts, frame width, image ratios, object sizes and sticky heights are custom properties on `body.ct-home`, in the `<style is:global>` block of `catalogue/CatalogueHome.astro`. Header and footer links are in `catalogue/links.ts`.

## Hooks other code relies on

| Hook | Used by |
| --- | --- |
| `data-test="home-featured"`, `home-hero`, `home-highlighted`, `home-topic`, `home-row`, `home-row-more`, `home-row-open`, `home-jump` | e2e tests |
| `data-test="works-grid"` + `.card` (featured grid) | flagged `?dither` / `?mosh` hover effects, `check:budgets` |
| `data-home-item` with a `[data-type][data-tags]` descendant | the `/?type=&tag=` filter |
| `data-work-slug` + `data-vt-frame` (featured cards) | the card → banner morph (`src/lib/vt/hero-morph.ts`) |
| `canvas[data-home-obj]`, `data-obj`, `data-seed`, `data-big`, `[data-obj-host]` | the object loop (`src/lib/home/objects/stage.ts`) |
| `details[data-home-row]` | the one-open-row fallback (`src/lib/home/rows.ts`) |
