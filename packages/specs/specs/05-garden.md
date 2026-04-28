# Phase 5 — Digital Garden (Obsidian Import)

## Goal

Publish a curated, hand-picked subset of the user's Obsidian vault as an interconnected digital garden under `/garden/`. Each note renders Obsidian-style `[[wikilinks]]` as resolved internal links, KaTeX math, callouts, and image embeds. Every note page shows a build-time backlinks footer ("notes that link here"). A force-directed graph view at `/garden/graph/` visualises the entire note network (nodes = notes, edges = wikilinks); a keyboard-accessible list view is the progressive-enhancement floor. Hovering over a wikilink (mouse or keyboard focus) shows a small preview card sourced from a build-time summary index.

## Context / invariants

- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**; **Svelte 5 (runes)** islands; **React 19** islands only on Sandbox-using pages (Phase 3). Phase 4 merge commit `11c48e9` is the branch base. Branch `phase/05-garden` cut from there.
- Output remains `static`. **No SSR introduced in Phase 5.** No Astro Cloudflare adapter installed. `/garden/`, `/garden/[slug]/`, `/garden/graph/` are all `getStaticPaths`-driven static routes.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12**; TypeScript `strict` + `astro/tsconfigs/strictest`; `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (lefthook only) for `.astro` / `.svelte`.
- **Phase 0 + 1 + 2 + 3 + 4 invariants carry over and remain green:**
  - All seven lefthook steps pass; all current Phase 4 vitest unit + Playwright e2e cases stay green (no count regression — exact totals re-measured at plan-write).
  - Per-route gzipped `size-limit` budgets from ADRs 0016, 0019, 0022 hold.
  - LHCI mobile Performance ≥ 0.85 on `/`, `/works`, `/search`, `/works/code-2/`, `/now/`, `/uses/`, `/colophon/`, `/stats/`. Phase 5 adds `/garden/`, `/garden/<sample-slug>/` to the LHCI URL list. `/garden/graph/` is **omitted from LHCI** because graph-render perf is dominated by canvas init + d3-force layout — neither is comparable to a content page on the same scoring rubric. The 60 fps interaction target is enforced by a Playwright performance assertion instead (see Acceptance criteria).
  - Axe-core zero violations on every shipped route, including `/garden/`, `/garden/[slug]/`, `/garden/graph/`.
  - Visual-regression baselines re-record where layout legitimately changes (new garden routes new; existing routes unchanged).
  - All Phase 1 / 2 / 3 / 4 features keep working — garden pages reuse the same primitives plus new wikilink + backlinks + graph affordances.
- **Library version policy** (CLAUDE.md): latest stable major is the default. New deps in this phase pin to current latest at plan-write. **Verified at spec-write 2026-04-27:** `astro-loader-obsidian@0.10.0` peer-deps `astro@^5.12.5` — **incompatible with our Astro 6 lock**. Spec therefore drops the loader plugin (general-plan §5.1 path b) and adopts the hand-rolled sync-script approach (path c) as **primary**, not fallback. ADR 0025 captures this decision with the npm-registry probe quote.
- **Repo hygiene:** every new exported function/class added in this phase carries TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line; `bun run check:docs` enforces.
- **Privacy / vault policy:** only notes whose frontmatter declares `publish: true` reach the published site. The sync script is a one-way `vault → src/content/notes/` copy with that filter applied. The site repo is the **public** copy of garden notes; the user's full vault is never committed. Notes already in `src/content/notes/` are owned by the sync script — running `bun run sync:vault` may overwrite or delete tracked files. Pre-sync diff review is the user's responsibility (handled by ordinary `git diff` before commit).
- **Branching:** all Phase 5 batches land on `phase/05-garden` → PR → CI green → merge commit (no squash, no rebase) into `main`. Tag `phase-5` on the merge SHA.

## Non-goals

- **No SSR routes, no Cloudflare adapter install.** Same static-first stance as Phase 4.
- **No comments / interactions on garden notes.** Pure read-only.
- **No multi-locale / i18n.**
- **No live edit-in-browser.** Editing happens in Obsidian; `bun run sync:vault` copies into the repo; commit + push deploys.
- **No automatic cron-driven sync from a remote vault.** The user runs `bun run sync:vault` locally before committing. Cloud-sync from the vault is out of scope.
- **No Obsidian Canvas (`.canvas`) rendering.** Out of scope; only `.md`/`.mdx` notes are imported. Canvas files in the vault are skipped silently.
- **No Dataview / Templater / community-plugin syntax.** Only vanilla Markdown + Obsidian wikilinks + `![[image]]` embeds + `> [!note]` callouts + `$math$` blocks. Anything else passes through as raw text.
- **No client-side full-text search across notes (separate from `/search`).** Phase 2's Pagefind index already crawls every published page; `/garden/[slug]/` pages are part of that crawl. No second search UI on `/garden/`.
- **No comments-system, ActivityPub publishing, or Webmentions.** Webmentions land in Phase 6.
- **No theme toggle.** Still Phase 6.
- **No client-side island on `/garden/` index or `/garden/[slug]/`** — these are zero-JS by default (only the global CommandPalette + LinkPreview hover island, and LinkPreview is mounted globally with `client:idle` / `client:visible` strategy chosen at plan-write to honour the route budget).
- **No deferred / virtualised note list on `/garden/`.** If the user grows the garden past ~500 notes the simple alphabetical list will need pagination — explicit phase 5+ extension.
- **Graph view does not implement community-detection colouring** (general-plan §5.5 mentions `graphology-communities-louvain`). Tag-based colour buckets only — see Architecture. Community detection is a Phase 5+ extension.

## Interfaces

> **Note on code/CSS snippets in this section:** snippets are *verified API surfaces* (import paths, function signatures, integration names) per context7 + npm-registry + GitHub-fetch probes performed at spec-write 2026-04-27 — not implementation prescriptions. The plan refines exact form, names, and composition.

### Top-level paths added (predicted; the plan refines)

- `packages/site/src/pages/garden/index.astro` — static route, lists every published note (primary: title via locale-locked `Intl.Collator("en", { sensitivity: "base" })`; secondary: `updated` desc). Renders a header + a flat `<ul>` of links + the global SlashFooter.
- `packages/site/src/pages/garden/[slug].astro` — `getStaticPaths`-driven detail page. Renders one note via `_NoteLayout`. The slug is derived from the note's filename (kebab-cased) — see "Slug strategy" below.
- `packages/site/src/pages/garden/graph.astro` — static route hosting the force-directed graph view. Imports `<GraphView>` Svelte island with `client:visible`. Provides a keyboard-accessible `<details>`-collapsed full notes list as fallback.
- `packages/site/src/layouts/_NoteLayout.astro` — note detail shell. Underscore-leading per Phase 3 convention. Wraps `_BaseLayout`. Renders `<header>` (title, dates, tag pills), `<article>` body slot (post-MDX with wikilinks resolved, math rendered, callouts styled), `<aside>` table of contents (auto-generated from h2s/h3s), `<footer>` backlinks block.
- `packages/site/src/components/Backlinks.astro` — server-rendered list of "notes that link here" for one note. Accepts `slug` prop, reads `src/data/backlinks.json` at build time, renders `<section class="backlinks">` with title + `<ul>` of links. Empty state ("no backlinks yet") rendered when none.
- `packages/site/src/components/LinkPreview.svelte` — Svelte 5 island. Mounted globally in `_BaseLayout` with `client:idle`. Listens for `mouseenter` / `focusin` on `a.wikilink` anchors site-wide. On hover fetches summary + first-paragraph text from `src/data/note-previews.json` (statically inlined as a `<script type="application/json">` payload — not a runtime fetch). Positions a floating card via `@floating-ui/dom`. Respects `prefers-reduced-motion`. Hides on `mouseleave` / `focusout` / Escape.
- `packages/site/src/components/GraphView.svelte` — Svelte 5 island. Wraps `force-graph@1` (vanilla canvas + d3-force). Loads `src/data/graph.json` (committed/built, statically inlined), renders nodes (notes) + edges (wikilinks). Click → navigate to `/garden/<slug>/`. Tag-bucket colouring. `prefers-reduced-motion` → render layout once then freeze.
- `packages/site/src/lib/notes.ts` — typed helpers: `getAllNotes()` (filtered to `publish:true`, sorted), `getNote(slug)`, `noteHref(slug)`. All exports mutation-tested.
- `packages/site/src/lib/wikilinks.ts` — slug-resolution shared between the remark plugin (build) and the GraphView island (runtime). One source of truth for slug-from-title rules.
- `packages/site/src/content.config.ts` — **modified**: adds a `notes` collection (MDX entries under `src/content/notes/`). The `works`, `slash`, `stats` collections are unchanged.
- `packages/site/src/content/notes/` — **new directory, committed**. Owned by the sync script. Contains `<slug>.mdx` files for every published note. A small *committed* fixture set is bootstrapped with the phase (≥ 6 notes covering: at least one with wikilinks to ≥ 2 other notes, one with a math block, one with a `![[image.png]]` embed, one with a `> [!note]` callout, one with no outgoing links so the orphan-fallback path renders, one with a YAML title that differs from its filename so the filename-vs-title slug rule is exercised). These are real notes, not Lorem.
- `packages/site/src/data/backlinks.json` — **new, committed**. Built by `scripts/build-backlinks.ts` (see below). Re-built at every commit; CI verifies it is up-to-date.
- `packages/site/src/data/note-previews.json` — **new, committed**. Map `{ [slug]: { title, summary, firstParagraph } }`. Built alongside backlinks. Used by the `<LinkPreview>` island.
- `packages/site/src/data/graph.json` — **new, committed**. `{ nodes: [{id, label, tags}], edges: [{source, target}] }`. Built alongside backlinks.
- `packages/site/scripts/sync-vault.ts` — **new build-time script**. Reads `OBSIDIAN_VAULT_PATH` env var (or first CLI arg). Walks the vault, skips `.obsidian/` and any directory whose name starts with `_`. For each `.md` file: parse frontmatter; if `publish: true`, copy to `packages/site/src/content/notes/<slug>.mdx` with a normalised frontmatter block. **The script is the user's local tool only — never runs in CI**.
- `packages/site/scripts/build-garden-data.ts` — **new build-time script**. Walks `src/content/notes/`, parses every note (frontmatter + body), extracts wikilinks via the same remark pipeline used for rendering, builds three artefacts: `backlinks.json`, `note-previews.json`, `graph.json`. Writes them to `src/data/`. Runs as `prebuild:garden` and as part of the `dev` cycle (a chokidar-watched dev hook, or a one-shot at `astro dev` start — plan picks the simplest).
- `packages/site/src/lib/wikilinks-remark.ts` — **new**. Custom unified plugin (or thin wrapper around `@portaljs/remark-wiki-link`) that resolves `[[Title]]` and `[[Title|alias]]` and `[[Title#heading]]` to internal href + alias + class `wikilink` + `data-target-slug` attribute. Unresolved targets render as `<span class="wikilink-broken">{raw}</span>` (no broken `<a href="undefined">`). The plan refines the exact wrapper-vs-fork choice after a context7 verify pass on `@portaljs/remark-wiki-link@1.2.0`'s public API for custom resolvers.
- `packages/site/src/lib/embed-remark.ts` — **new**. Custom unified plugin transforming `![[image.png]]` and `![[image.png|caption]]` into `<Picture>` references via Astro's `astro:assets` API (already used in Phase 3). Image filenames resolve against `src/content/notes/_assets/` (script `sync-vault.ts` copies vault images there).
- `packages/site/astro.config.mjs` — **modified**: extend the existing remark/rehype pipeline with `wikilinks-remark`, `embed-remark`, `remark-math`, `rehype-katex`, `remark-callout`. Pipeline order is **fixed** (see Architecture).
- `packages/site/package.json` — **modified**: adds `sync:vault`, `prebuild:garden` scripts; the `build` script chains `prebuild:stats && prebuild:garden && astro build`. Local `dev` runs `prebuild:garden` once at start (the data files are committed; running once at dev start refreshes them after a manual `sync:vault`).
- `packages/site/.gitignore` — unchanged. The `src/data/*.json` artefacts ARE committed (so CI builds without running the prebuild are still complete and so `git diff` surfaces unintended drift).
- `packages/site/.size-limit.cjs` — **modified**: adds 3 entries — `/garden/`, `/garden/<sample-slug>/`, `/garden/graph/`. Garden index + detail at `≤ 60 KB css+html`. **Graph-view route gets a per-route JS budget of `≤ 180 KB` gzipped** covering force-graph + d3-force-3d + GraphView.svelte; CSS+HTML at `≤ 60 KB`. **Mechanism for excluding the graph-vendor chunk from the global 420 KB site-js cap (locked at spec time):** `astro.config.mjs` adds `vite.build.rollupOptions.output.manualChunks = (id) => id.includes("force-graph") || id.includes("d3-force-3d") ? "graph-vendor" : undefined` so the chunk lands as `dist/_astro/graph-vendor-*.js`. The global `.size-limit.cjs` site-js entry uses a **negated glob** `["dist/_astro/*.js", "!dist/_astro/graph-vendor-*.js"]`. The graph-route entry includes `dist/_astro/graph-vendor-*.js` explicitly. Plan-time verifies `manualChunks` actually emits the named chunk under Astro 6's Vite — fall-back if not: raise the global cap to `≤ 600 KB` and drop the negation.
- `packages/site/lighthouserc.cjs` — **modified**: adds `/garden/`, `/garden/<sample-slug>/`. `/garden/graph/` deliberately excluded.
- `packages/site/knip.jsonc` — **modified**: register `scripts/sync-vault.ts`, `scripts/build-garden-data.ts`. Whitelist any vault-only deps (e.g. `gray-matter`) if Knip flags them.
- `packages/site/.dependency-cruiser.cjs` — **may need** widening to allow `scripts/**` to import from `src/lib/wikilinks.ts` (single source of truth for slug rules).
- `packages/site/tests/unit/notes-helpers.test.ts` — vitest for `getAllNotes`, `getNote`, `noteHref`.
- `packages/site/tests/unit/wikilinks.test.ts` — vitest + fast-check property tests on the slug resolver round-trip (every legal title round-trips slug→title→slug).
- `packages/site/tests/unit/wikilinks-remark.test.ts` — vitest covering the custom remark plugin: resolved targets, alias rendering, heading-anchored links, broken targets fall back to `<span class="wikilink-broken">`.
- `packages/site/tests/unit/embed-remark.test.ts` — vitest covering `![[image.png]]` → `<Picture>` transformation; missing-asset case logs warning and falls back to alt text.
- `packages/site/tests/unit/build-backlinks.test.ts` — vitest + **two fast-check properties on the backlink inverter** asserting mutual inversion: (P1) `∀ (A,B) ∈ forwardEdges, A ∈ backlinks(B)`; (P2) `∀ X ∈ backlinks(B), (X,B) ∈ forwardEdges` (no spurious entries). A third deterministic-write test asserts byte-identical re-runs against a fixed input.
- `packages/site/tests/unit/build-graph.test.ts` — vitest verifying graph.json shape (every edge's source/target is a known node id; no orphan edges).
- `packages/site/tests/unit/sync-vault.test.ts` — vitest covering `scripts/sync-vault.ts` against an in-memory fixture vault: only `publish:true` notes are copied; renamed-to-slug filenames; image-dir mirroring; `.obsidian/` skipped; running twice is idempotent.
- `packages/site/tests/e2e/garden-index.spec.ts` — Playwright e2e for `/garden/`: lists all 6+ committed notes, links resolve to detail pages, axe clean.
- `packages/site/tests/e2e/garden-detail.spec.ts` — Playwright e2e for `/garden/<sample-slug>/`: title renders, wikilinks resolve, broken wikilink renders styled span (not anchor), backlinks footer present, axe clean. **A second case** asserts a math-bearing note renders `.katex` markup, and a callout-bearing note renders the styled callout.
- `packages/site/tests/e2e/garden-graph.spec.ts` — Playwright e2e for `/garden/graph/`: canvas mounts within budget; node count matches `graph.json`; clicking a node navigates; keyboard fallback list reachable via Tab; axe clean (the canvas has `role="img"` + `aria-label`).
- `packages/site/tests/e2e/link-preview.spec.ts` — Playwright e2e for `<LinkPreview>`: hover over a wikilink reveals card within 200 ms (network-quiet baseline); focus also reveals; Escape dismisses; `prefers-reduced-motion` fixture suppresses animation.
- 6 new ADRs (0025–0030) — listed below.

### Verified APIs (context7 / npm-registry / GitHub-fetch probes, performed 2026-04-27)

- `defineCollection({ loader: glob({...}), schema })` — already verified Phase 3/4. `notes` collection uses `glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" })` so subfolders are allowed (the user may organise notes by topic in the vault).
- `import { getCollection, getEntry, render } from "astro:content";` — Astro 6 collection accessors. `getCollection("notes", entry => entry.data.publish)` filters to published notes when the schema retains `publish` as a field; the spec opts to **not** retain `publish` in the schema (the sync script is the gate; if a note is in `src/content/notes/`, it is published) — see Architecture for the trade-off.
- `import { Picture } from "astro:assets";` — already used Phase 3. The `embed-remark` plugin emits Picture references after collecting the resolved file path against `src/content/notes/_assets/`.
- `@portaljs/remark-wiki-link@1.2.0` — MIT, no peer-dep constraint. Public API per the GitHub README (verified 2026-04-27 via `https://raw.githubusercontent.com/datopian/portaljs/main/packages/remark-wiki-link/README.md`): `unified().use(wikiLinkPlugin, { aliasDivider: "|", permalinks, wikiLinkResolver, hrefTemplate, wikiLinkClassName, newClassName })`. **`permalinks: string[]`** is the array of known target permalinks (e.g. `["/garden/foo/", "/garden/bar/"]`) — the plugin tags each `[[link]]` as resolved iff the result of `wikiLinkResolver(name)[0]` matches an entry in `permalinks`; otherwise it sets `node.data.exists = false` and uses `newClassName`. **`wikiLinkResolver(name): string[]`** (renamed from older `pageResolver`) returns candidate page paths; we return `[`/garden/${noteSlug(name)}/`]`. **`hrefTemplate(permalink): string`** identity-passes here (our resolver already returns the full href). `wikiLinkClassName` defaults `"internal"`; we set it to `"wikilink"`. `newClassName` defaults `"new"`; we set it to `"wikilink-broken"`. **Resolved-vs-broken discrimination is therefore determined at build time by the `permalinks` array** — populated synchronously at Astro-config-load time by a `fast-glob` over `src/content/notes/**/*.{md,mdx}` that maps each filename to its slug-derived href (no separate `known-slugs.json` artefact, no plugin-init filesystem walk per parse). The list is stable for the duration of the build.
  - **Note (Phase 5 Task 4 implementation, 2026-04-28):** during implementation, `@portaljs/remark-wiki-link@1.2.0` was found to crash at runtime against `mdast-util-from-markdown@2.x` (transitive via `remark-parse@11`). Upstream maintainer (rufuspollock) closed datopian/portaljs#1059 noting the package is rebranded to `@flowershow/remark-wiki-link`. We pinned `@flowershow/remark-wiki-link@3.4.0` instead — same option surface (renames: `wikiLinkClassName`→`className`, `wikiLinkResolver`→`urlResolver` with `{filePath, heading, isEmbed}` arg, no `hrefTemplate` — we fold the href into `urlResolver`; `permalinks` semantics differ slightly so we drive resolution via `files: string[]` of slug bases + `format: "shortestPossible"` + `caseInsensitive: true`), same author, published 2026-02-18, fixed for v2 mdast.
- **Custom rehype `<a>`→`<span>` rewrite (in `src/lib/wikilinks-remark.ts`):** after `remark-rehype` materialises the wikilink as an `<a class="wikilink-broken" href="…">`, a small custom `unified` rehype plugin walks the hast tree (`unist-util-visit` over `element` nodes) and rewrites every `<a>` whose `properties.className` contains `"wikilink-broken"` into a `<span>` (drop `properties.href`, swap `tagName`). Test asserts no `href` attribute on broken anchors.
- `remark-math@6` + `rehype-katex@7` — both at current latest (verified npm registry probe 2026-04-27); `unified().use(remarkMath).use(rehypeKatex)` is the canonical chain. KaTeX CSS (`katex.min.css`) is added to `_NoteLayout` via `<link rel="stylesheet" href="...">` **only if** the note's frontmatter declares `math: true`; the plan codifies this conditional load to keep math-free notes free of the ~24 KB stylesheet.
- `@r4ai/remark-callout@0.6.2` — Obsidian-style `> [!note]` callout transformer. Verified MIT; tested against MDX. Adds CSS classes `callout`, `callout-{type}` for type ∈ `{note, info, tip, warning, danger, ...}`; we ship matching CSS in tokens.
  - **Note (Phase 5 Task 6 implementation, 2026-04-28):** during implementation, the un-namespaced `remark-callout@1.1.1` (rk-terence) was found to crash at runtime against `micromark@4.0.2` (the version we have via remark-parse@11) — `TypeError: chunks[startIndex].slice is not a function` thrown inside its `insideTitle` tokenizer. Same incompatibility class as the `@portaljs/remark-wiki-link` v1 → flowershow swap in Task 4. We pinned `@r4ai/remark-callout@0.6.2` (which the spec already listed as a documented alternative) — same Obsidian callout surface, micromark-v4 compatible. ADR 0030 (Task 12) records the swap rationale.
- `force-graph@1.51.4` — vasturiano. **MIT.** Canvas + d3-force physics (the lib's transitive dep is `d3-force-3d` — a 2D-compatible fork; it does NOT pull in `three.js` or any 3D runtime — verified via `npm view force-graph dependencies`). Framework-agnostic. Verified API: `new ForceGraph(<HTMLDivElement>).graphData({nodes, links}).nodeId("id").nodeLabel("label").nodeColor(getColour).linkSource("source").linkTarget("target").onNodeClick(node => navigate(...)).cooldownTicks(120).pauseAnimation()`. **No React dependency.** Drops directly into a Svelte 5 island via plain DOM mounting in `onMount`.
- `@floating-ui/dom@1.x` — MIT. `computePosition(referenceEl, floatingEl, { placement: "top", middleware: [offset(8), shift(), flip()] })` — used by `<LinkPreview>` to place the preview card above (or below if no room) the hovered wikilink anchor.
- `gray-matter@^4` — **NEW direct dep.** MIT. Earlier draft of this spec claimed gray-matter was transitive via Astro 6; **that claim was wrong** — verified 2026-04-27 by grepping `bun.lock`: zero matches; Astro 6 uses `js-yaml` + custom front-matter handling, not gray-matter. Adding `gray-matter@^4` as a direct dev-dep used only by `scripts/sync-vault.ts` and `scripts/build-garden-data.ts`. Knip ignoreDependencies adds `gray-matter` only if Knip flags it (it should not, because the script files are registered as Knip entries — verified shape against Phase 4 knip.jsonc).
- `github-slugger@^2` — already in `bun.lock` as a direct dep of `astro@6.1.9` + `@astrojs/markdown-remark@7` (transitive via Astro 6 itself; the rejected `astro-loader-obsidian` is NOT in our dep tree). Used by `src/lib/wikilinks.ts` for slug derivation. No new install.

### Notes frontmatter schema

```ts
// src/content.config.ts (extension)
const notesSchema = z.object({
  /**
   * Title as it appears in Obsidian. Becomes <h1>; also the wikilink target text.
   * Sync script copies from frontmatter `title:` if present, else falls back to filename.
   */
  title: z.string(),
  /** ISO date or YYYY-MM-DD; coerced to Date. */
  created: z.coerce.date(),
  /** ISO date or YYYY-MM-DD; coerced to Date. Optional — falls back to `created` when absent. */
  updated: z.coerce.date().optional(),
  /** Free-form taxonomy. Used for graph-view colour buckets and (future) filtering. */
  tags: z.array(z.string()).default([]),
  /** Set true on notes that contain $math$ blocks; gates KaTeX CSS load. */
  math: z.boolean().default(false),
  /** Optional: short summary used by <LinkPreview>. Sync script fills from a `summary:` frontmatter or the first ≤ 240 chars of body. */
  summary: z.string().max(240).optional(),
});
```

`publish` is intentionally **absent** from the runtime schema. The sync script is the single gate: only `publish: true` notes from the vault land in `src/content/notes/`. This avoids two failure modes: (1) a note appearing on the dev server that was unintentionally synced, (2) `getCollection` filter logic threaded through every page. Trade-off: a manually-placed file in `src/content/notes/` will publish even if it lacks `publish: true` — that is acceptable because the directory is owned by the sync script, and the user is the only one with commit access.

### Slug strategy

```ts
// src/lib/wikilinks.ts (canonical)
import slug from "github-slugger"; // transitive via Astro 6 + @astrojs/markdown-remark@7 (verified bun.lock 2026-04-27)
export function noteSlug(title: string): string;
```

- Slug = `github-slugger` of the title (lowercase, dashes for spaces, ASCII normalisation).
- Filenames in `src/content/notes/` are `<slug>.mdx`. The sync script renames at copy time when title slug ≠ source filename.
- Wikilink resolution: parse `[[Title]]` → `noteSlug("Title")` → look up against the set of known slugs. Hit → emit resolved link. Miss → emit `<span class="wikilink-broken">[[Title]]</span>`.
- Heading-anchored wikilinks (`[[Title#section]]`): slug + `#${slug(section)}`. The plan defines exact handling of sections that don't exist on the target.

### New pinned runtime/build deps (resolved at plan-write 2026-04-27 via npm-registry probes)

- `@portaljs/remark-wiki-link@1.2.0` — wikilink parser.
- `remark-math@6.0.0` + `rehype-katex@7.0.1` — math.
- `@r4ai/remark-callout@0.6.2` — Obsidian callouts. (Earlier draft pinned `remark-callout@1.1.1` (rk-terence); swapped 2026-04-28 due to micromark-v4 incompatibility — see § Verified APIs note.)
- `force-graph@1.51.4` — graph view (vanilla canvas).
- `@floating-ui/dom@1.x` — link-preview positioning.
- `gray-matter@^4` — **NEW direct dev-dep** (corrected from earlier draft — NOT a transitive of Astro 6; verified `bun.lock` zero matches). Frontmatter parsing in `scripts/sync-vault.ts` and `scripts/build-garden-data.ts`.
- `katex` — peer of rehype-katex, runtime CSS source. (CSS imported, not JS — see Architecture.)

No new react / svelte / astro core upgrades. No new test runners.

## Architecture

### Vault → repo sync (Batch 5.1)

The user maintains an Obsidian vault outside the repo. To publish changes:

```bash
export OBSIDIAN_VAULT_PATH=/path/to/vault
bun run sync:vault
git diff   # review changes, especially deletions
git add packages/site/src/content/notes/ packages/site/src/data/
git commit -m "garden: sync vault"
```

`scripts/sync-vault.ts` does:

1. Walk `OBSIDIAN_VAULT_PATH` recursively; skip `.obsidian/`, `.git/`, any dir whose name starts with `_`, any file whose name starts with `.`.
2. For each `.md` file: parse frontmatter (`gray-matter`); if `publish !== true`, skip.
3. Compute `slug = noteSlug(frontmatter.title || filename)`.
4. Normalise the body: strip frontmatter keys not in our schema; preserve `[[wikilinks]]` and `![[embeds]]` as-is (the build pipeline handles them); tag-list normalisation.
5. Write `packages/site/src/content/notes/<slug>.mdx`. Overwrite if exists.
6. For each wikilink-embed `![[image.png]]` referenced in the body, copy the source asset from the vault to `packages/site/src/content/notes/_assets/<image>` (with collision detection — log a warning if two source images would collapse to the same name).
7. After the walk completes: list all currently-tracked files in `src/content/notes/` and `_assets/`; **delete any not visited by this run** (so unpublishing in Obsidian = `publish: false` → next sync deletes the file). The user reviews the deletion in `git diff` before commit.
8. Print a summary: N notes synced, M deleted, P assets copied. **If any deletions would happen, print each path to be deleted prefixed with `D ` and remind the user that `git diff` is the safety net.**

The script accepts `--dry-run` (default off): when set, no writes/deletes occur — the script logs every action it WOULD take and exits 0. This is the recommended first invocation after a vault refactor.

The script never runs in CI. Its behaviour is unit-tested against an in-memory fixture vault.

**No symlinks.** The general-plan §5.1 rejects symlinks (sync corruption risk per the Obsidian docs reference); spec carries that decision forward (ADR 0025).

### Notes collection wiring

```ts
// src/content.config.ts (sketch)
const notes = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
  schema: notesSchema,
});
export const collections = { works, slash, stats, notes };
```

Pages access notes via `astro:content` exactly like Phase 3 detail pages. `getStaticPaths` in `src/pages/garden/[slug].astro` maps `getCollection("notes")` to one path per note. No filter on `publish` (gate is at sync time).

### Wikilink + embed pipeline (Batch 5.2)

Plugin order in `astro.config.mjs` is fixed:

```ts
markdown: {
  remarkPlugins: [
    embedRemark,        // ![[image]] → Picture references (must run before wiki-link)
    remarkWikiLink,     // [[Title]] → resolved or broken
    remarkMath,         // $...$ → math nodes
    remarkCallout,      // > [!note] → callout block
  ],
  rehypePlugins: [
    rehypeKatex,        // math → KaTeX HTML (after remark-math emits)
    // (existing Expressive Code plugins from Phase 3 stay)
  ],
},
```

Why this order:
- `embedRemark` runs first so `![[image]]` doesn't get caught by the wikilink plugin (which would otherwise see the inner `[[image]]` and emit a broken wikilink).
- `remarkMath` runs after wikilinks so `$\sum [[link]]^2$` (a math block containing a literal `[[`) is not double-transformed (math is escaped before wikilinks would parse it).
- `remarkCallout` runs after math so callouts can contain math.
- Rehype runs after all remark.

Wikilink resolution is **build-time only.** The mechanism is **locked at spec time** (no plan-time deferral): when `astro.config.mjs` is loaded, a synchronous `fast-glob` over `src/content/notes/**/*.{md,mdx}` produces the canonical `permalinks: string[]` array (each entry is `/garden/${noteSlug(filenameMinusExt)}/`). This array is passed to `@portaljs/remark-wiki-link` as the `permalinks` option. **No `src/data/known-slugs.json` artefact is written or committed** — the array is derived deterministically from the filesystem on every config load (dev, build, test alike). If a note is added but the dev server is not restarted, the user sees a broken-link styling on the new wikilink — restart picks it up. (Future: if this becomes painful, a chokidar watcher can re-derive on file events; out-of-scope for Phase 5.)

Image embeds: `![[diagram.png]]` → resolve `diagram.png` against `src/content/notes/_assets/`; emit an MDX import + `<Picture>` reference using the standard `astro:assets` API. Missing assets log a warning at build (not error) and emit alt text.

### Backlinks at build time (Batch 5.3)

`scripts/build-garden-data.ts`:

1. Walk `src/content/notes/`; for each note, parse frontmatter and body via `unified().use(remarkParse).use(remarkMdx).use(...)`.
2. Extract wikilinks via the same remark plugin used for rendering — single source of truth.
3. Build the directed edge list: `[{ source: A.slug, target: B.slug }, ...]`.
4. **Backlinks:** invert the edge list. For each note, list all sources that link to it. Sort using `new Intl.Collator("en", { sensitivity: "base" })` over the source title (locale-locked for build reproducibility — no host-locale drift between local Bun and CF Pages build runners).
5. Write `src/data/backlinks.json` (`{ [targetSlug]: [{ slug, title }, ...] }`).
6. **Note previews:** for each note, extract `summary` (frontmatter) or first paragraph (≤ 240 chars). Write `src/data/note-previews.json` (`{ [slug]: { title, summary, firstParagraph } }`).
7. **Graph data:** write `src/data/graph.json` (`{ nodes: [{id, label, tags}], edges: [{source, target}] }`). Edge list is sorted by `(source, target)` lexicographic (locale-locked); node list is sorted by `id` lexicographic.

**Deterministic-write contract (load-bearing for the CI freshness check):** all three artefacts MUST be byte-identical across runs given identical inputs. The script enforces:
- Recursive object-key sort on every emitted object (alphabetical, ASCII).
- Array sorts via the locale-locked Collator above; every array has a stable primary sort key documented in code.
- Trailing newline after the closing `}` (so `git diff` does not flag terminal-newline drift).
- 2-space indent (matches Biome's default JSON formatting).
- A unit test re-runs the writer against a fixed input twice and asserts byte-identical output.

The `<Backlinks>` Astro component imports `backlinks.json` directly:

```astro
---
import backlinks from "../data/backlinks.json";
const items = backlinks[Astro.props.slug] ?? [];
---
{items.length === 0
  ? <p class="empty">No backlinks yet.</p>
  : <section class="backlinks"><h2>Linked from</h2><ul>{...}</ul></section>}
```

**No client JS for backlinks.** Server-rendered HTML.

CI freshness check: `bun run prebuild:garden` is run as a lefthook step (or as a CI step) and `git diff --exit-code src/data/` fails the check if the committed artefact is stale relative to the current note set. This prevents merge-time drift between the `.mdx` notes and the data artefacts.

### Hover link previews (Batch 5.4)

`<LinkPreview>` is a Svelte 5 island in `_BaseLayout.astro` with `client:idle` (deferred to idle so it doesn't compete with first paint).

Behaviour:
- On mount: read `note-previews.json` from a `<script type="application/json" id="note-previews">` block server-rendered into the page (so the island doesn't refetch).
- Attach delegated `mouseover` / `focusin` listener on `document.body` (NOT `mouseenter` — that event does not bubble; document-level delegation requires `mouseover`/`mouseout` or `focusin`/`focusout`). Filter via `event.target.closest("a.wikilink[data-target-slug]")`.
- On hover/focus: extract `data-target-slug`, look up preview, position card via `@floating-ui/dom`, fade in (≤ 200 ms; reduced-motion: instant).
- On `mouseout` (delegated on body, filter same way) / `focusout` / `Escape`: hide.
- Card content: `<strong>title</strong>` + summary line (≤ 240 chars).
- ARIA: card has `role="tooltip"` + `aria-hidden` toggled.

**Budget:** the island ships under the existing site-js cap (420 KB). `@floating-ui/dom` is ~10 KB gzipped. The plan re-runs `size-limit` to confirm.

### Graph view (Batch 5.5)

`/garden/graph/` is a static page with a Svelte island `<GraphView client:visible>`.

`<GraphView>`:
1. On mount, dynamic-import `force-graph` (so the ~80 KB chunk loads only when this island activates).
2. Read `graph.json` from a server-rendered `<script type="application/json">` block.
3. Initialise `new ForceGraph(container).graphData(data)`:
   - `nodeId("id")`, `nodeLabel(node => node.label)`.
   - `nodeColor(node => tagColour(node.tags[0]))` — tag-bucket palette using existing CSS tokens (8 muted colours).
   - `linkSource("source")`, `linkTarget("target")`.
   - `onNodeClick(node => Astro's view-transition navigation to /garden/<id>/)`.
   - `cooldownTicks(120)` — cap layout iterations.
4. **Reduced-motion:** if `matchMedia('(prefers-reduced-motion: reduce)').matches`, run layout to completion synchronously then call `pauseAnimation()` so the canvas is static.
5. Canvas has `role="img"` + `aria-label="Graph view of garden notes; full list available below"`.
6. **Below the canvas**, a `<details><summary>List view</summary>...</details>` contains the same notes as `<ul>` of links — keyboard-reachable progressive enhancement floor.

**Performance acceptance:** with the committed fixture set (≥ 6 notes) the graph initialises and reaches static state within 2 s on Playwright's default Chromium. The 60 fps target during interaction is asserted via the Playwright `performance.measure` API around a `page.mouse.wheel` zoom action — fps ≥ 30 (relaxed from general-plan's 60 because Playwright's headless rendering is slower than user-facing Chrome; 30 fps is the real-user-perception floor).

**Tag colouring:** at most 8 distinct colour buckets. If the note set exceeds 8 distinct tag values, the 8 most-common tags get distinct colours and the rest share a "default" muted grey. The plan refines the palette source (token CSS variables).

**Keyboard interaction:** the canvas itself is not keyboard-interactive. The `<details>` list view IS — every note is reachable via Tab. This is the accessibility floor.

## Acceptance criteria

1. `bun run sync:vault` against the committed fixture vault (`tests/fixtures/vault/`) reproduces `src/content/notes/` byte-identically and is idempotent.
2. `bun run build` succeeds with no warnings; `astro build` lists at least 6 + 3 = 9 garden routes (≥ 6 detail + index + graph + future).
3. `/garden/` lists every committed note alphabetical by title.
4. `/garden/<slug>/` for each fixture note: title renders, body renders with wikilinks resolved (resolved → `<a class="wikilink">`, broken → `<span class="wikilink-broken">`), math-bearing note renders KaTeX, callout-bearing note renders styled callout, image-embed note renders `<Picture>` with optimised variants.
5. Backlinks footer on a note that is targeted by ≥ 1 other note shows that source; on a note no one links to, shows the empty state copy.
6. Hover (or keyboard focus) on any `.wikilink` reveals a preview card within 200 ms; Escape dismisses; `prefers-reduced-motion` suppresses fade.
7. `/garden/graph/` renders a canvas with node count = note count; clicking a node navigates to that detail page; the `<details>` keyboard fallback is reachable via Tab; canvas has `role="img"` + `aria-label`.
8. Axe-core: zero violations on `/garden/`, `/garden/<sample-slug>/`, `/garden/graph/`.
9. LHCI mobile Performance ≥ 0.85 on `/garden/`, `/garden/<sample-slug>/`. (`/garden/graph/` excluded — Playwright performance test guards perf separately.)
10. `size-limit` budgets all green: garden index/detail ≤ 60 KB css+html each; garden graph route ≤ 60 KB css+html and ≤ 180 KB JS; site-js cap ≤ 420 KB **unchanged** (LinkPreview is part of the global cap, GraphView is route-specific and excluded from the global cap because `client:visible` keeps it lazy).
11. CI fails if `src/data/*.json` artefacts are stale relative to `src/content/notes/`.

## Per-route size budgets summary

| Entry | Limit | Source of measurement |
|---|---|---|
| garden index css+html | 60 KB | `dist/garden/index.html` + `dist/_astro/*.css` (gzip) |
| garden detail css+html | 60 KB | `dist/garden/<sample-slug>/index.html` + ... |
| garden graph css+html | 60 KB | `dist/garden/graph/index.html` + ... |
| garden graph JS | 180 KB | All JS chunks loaded by `/garden/graph/` (gzip) |
| site js (existing global) | 420 KB | Unchanged. LinkPreview new — must fit under this cap. |

## ADRs to write (resolved at plan-write)

- **0025 — Vault import via custom sync script (not astro-loader-obsidian).** Driver: `astro-loader-obsidian@0.10.0` peer-dep `astro@^5.12.5` incompatible with our Astro 6 lock. Captures the `sync:vault` script contract and the rejected alternatives.
- **0026 — Force-graph (vanilla canvas) over Sigma.js for graph view.** Driver: aesthetic preference (Obsidian-feel) + framework-agnostic + lighter JS budget on a leaf route + canvas vs WebGL trade-off documented.
- **0027 — Wikilinks via `@portaljs/remark-wiki-link` + custom resolver.** Captures plugin choice, build-time resolution, broken-link styling.
- **0028 — Backlinks built at build time, not at runtime.** Captures the `prebuild:garden` script + CI freshness check.
- **0029 — Hover preview as Svelte 5 island with `client:idle` + delegated event listener.** Captures the budget impact, the `<script type="application/json">` payload mechanism (vs runtime fetch), the `mouseover`-not-`mouseenter` choice for delegation, and reduced-motion behaviour.
- **0030 — Math + callouts plugin chain (`remark-math` + `rehype-katex` + `@r4ai/remark-callout`).** Captures: (a) the conditional KaTeX CSS load gated on `math: true` frontmatter, (b) the rejection of MathJax (heavier, server-side cost) and of MDX-component math (loses raw `$...$` Obsidian compatibility), (c) the choice of `@r4ai/remark-callout@0.6.2` over `remark-callout@1.1.1` (rk-terence) — driver: 1.1.1 crashes at runtime against `micromark@4.0.2` per Task 6 implementation evidence. One ADR for the whole math+callout decision tree.

## Tests

- **Vitest unit:** `notes-helpers`, `wikilinks` (slug round-trip — fast-check property), `wikilinks-remark` (plugin output), `embed-remark` (Picture emit, missing-asset fallback), `build-backlinks` (inverter — fast-check property: ∀ A→B, A ∈ backlinks(B)), `build-graph` (every edge maps to a node), `sync-vault` (in-memory fixture vault — publish filter, slug rename, assets, idempotency).
- **Vitest integration (happy-dom):** `_NoteLayout` rendering with mocked content collection (TOC generation, backlinks footer presence).
- **Playwright e2e:** `garden-index`, `garden-detail` (multiple cases: wikilinks, math, callout, embed, broken link), `garden-graph` (canvas mount, click-navigate, keyboard fallback), `link-preview` (hover, focus, Escape, reduced-motion).
- **Visual regression:** new baselines for `/garden/`, `/garden/<sample-slug>/`, `/garden/graph/` (clip-region per Phase 4 strategy: `<main>`).
- **Axe-core:** every garden route, zero violations.
- **size-limit:** new entries listed above.
- **fast-check property tests:**
  - `noteSlug` round-trip (slug → "title" form → slug is stable for legal inputs).
  - Backlink inverter mutual-inversion (P1: ∀ (A,B) ∈ forwardEdges, A ∈ backlinks(B); P2: ∀ X ∈ backlinks(B), (X,B) ∈ forwardEdges).
  - Wikilink remark plugin: ∀ resolved title, the emitted href matches `noteHref(slug)`.
- **Stryker mutation (nightly):** `wikilinks.ts` slug rules, `build-garden-data.ts` inverter, `sync-vault.ts` filter logic, all new Zod schemas.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Vault sync deletes a note the user wanted to keep on the site | `git diff` before commit catches it; sync script logs deletions in summary; user-only-action review step. |
| Wikilink resolution is fragile when a note is renamed | The remark plugin warns at build for unresolved targets; CI fails the build if `--strict-wikilinks` flag is set (default off in this phase, on in a future hardening phase). For Phase 5: warn-only. |
| Force-graph bundle bloats the site beyond budget | `client:visible` keeps it off everything except `/garden/graph/`; per-route 180 KB cap. Plan re-measures before merge. |
| KaTeX CSS adds 24 KB to math-bearing notes | Conditional `<link rel="stylesheet">` based on `math: true` frontmatter — math-free notes pay nothing. |
| `prebuild:garden` slows iteration | Runs once at `astro dev` start; chokidar watch hook skipped for Phase 5 (re-run manually). Plan re-evaluates if user pain emerges. |
| Graph view fails accessibility (canvas is opaque to AT) | `<details>` list view is the floor; `role="img"` + `aria-label` on the canvas; axe-core enforced. |
| Privacy: a `publish: true` accident leaks a private note | The `git diff` step before commit is the gate. The script never auto-commits. |

## Rollback plan

If Phase 5 lands and a regression is discovered post-merge:

- Revert `phase/05-garden` merge commit on `main` (`git revert -m 1 <merge-sha>`); tag `phase-5` stays on the (now-orphaned) merge commit so phase history is preserved.
- The `notes` collection registration in `content.config.ts` is the only cross-cutting change; reverting removes it cleanly.
- All other Phase 5 files are isolated under `src/pages/garden/`, `src/components/{Backlinks,LinkPreview,GraphView}.*`, `src/lib/{notes,wikilinks,wikilinks-remark,embed-remark}.ts`, `src/data/*.json`, `scripts/sync-vault.ts`, `scripts/build-garden-data.ts`, `src/content/notes/**`. None touch existing Phase 4 code paths.

## Open questions for plan-write

- Exact `client:` directive for `<LinkPreview>` (`client:idle` vs `client:visible`) — measure both, pick the lower-budget winner.
- Whether `<GraphView>` should use `client:visible` or `client:only="svelte"`. The latter avoids SSR rendering of the canvas placeholder; the former keeps a static fallback noscript surface. Plan picks one.
- Whether `prebuild:garden` is also wired into a chokidar watcher for `astro dev`. Lean: no, run-once-at-start; revisit if the user reports stale data during local edits.
- Tag-colour palette source: existing tokens vs new garden-specific palette. Plan defines.

(Note: the prior draft listed a fifth OQ on whether the committed fixture notes are also the real garden seed. That is essentially decided — real seed — and is removed from the OQ list per spec-review.)

## Changelog

- **v1, 2026-04-27** — initial spec, written after a context7 + npm-registry + GitHub-fetch verification round.
- **v2, 2026-04-27** — applied Opus spec-review fixes:
  - **RED:** corrected `@portaljs/remark-wiki-link` API (option `wikiLinkResolver` not `pageResolver`; added `permalinks` array as the build-time resolution mechanism — no separate `known-slugs.json` artefact); corrected `gray-matter` from "transitive via Astro 6" (false) to NEW direct dev-dep; corrected `mouseenter` (does not bubble) → `mouseover` for delegated event handling.
  - **YELLOW:** corrected `remark-callout` author attribution (`rk-terence`, not `r4ai`) and softened "actively maintained in 2026" claim; fixed `github-slugger` attribution (Astro 6 + @astrojs/markdown-remark@7, not the rejected loader); pinned the rehype `<a>`→`<span>` rewrite plugin mechanism in spec; added deterministic-write contract for `build-garden-data.ts` (object-key sort, locale-locked Collator, trailing newline, 2-space indent, byte-identical re-run test); added `Intl.Collator("en", { sensitivity: "base" })` lock for `/garden/` index sort; added `--dry-run` flag to `sync-vault`; added ADR 0030 (math + callouts chain); locked size-limit chunk-exclusion mechanism (`vite.build.rollupOptions.output.manualChunks`); split backlink property test into two directions (P1 + P2); removed effectively-decided OQ5 from open questions.
