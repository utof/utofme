# Phase 3 — Content Pipeline

## Goal

Promote the works grid from "cards that link out" to **fully readable in-site content**. Each work fixture under `src/content/works/` gains a `/works/[slug]` detail page that renders the MDX body with a real image pipeline, syntax-highlighted code blocks, optional Svelte islands embedded inside MDX, and an optional live-runnable Sandpack island for code-execution articles. Cards on `/` and `/works` flip from "external URL or `<article>` no-link" to **always linking to the detail page** when the fixture has body content; the external-URL chain (`repo` / `youtube` / `listen` / `arxiv` / `pdf`) becomes a secondary "open external" link inside the detail page header.

## Context / invariants

- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**; **Svelte 5 (runes)** islands. Phase 2 merge commit `19d9a32` is the branch base. Branch `phase/03-content-pipeline` cut from there.
- Output remains `static`. **No SSR introduced in Phase 3.** No Astro Cloudflare adapter installed.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12**; TypeScript `strict` + `astro/tsconfigs/strictest`; `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (lefthook only) for `.astro` / `.svelte`.
- **Phase 0 + 1 + 2 invariants carry over and remain green:**
  - All seven lefthook steps pass; all 123 vitest unit tests + 67 active Playwright e2e cases stay green.
  - Per-route gzipped `size-limit` budgets from ADR 0016 (home/works/search css+html ≤ 60 KB; site js ≤ 60 KB; pagefind-ui ≤ 100 KB) hold.
  - LHCI mobile Performance ≥ 0.85 on `/`, `/works`, `/search` (ADR 0017).
  - Axe-core zero violations on every shipped route.
  - Visual-regression baselines re-record only where layout legitimately changes.
  - All Phase 2 features (FilterBar, Preview, CommandPalette, Pagefind UI, ClientRouter, staggered animation) keep working.
- **Library version policy** (CLAUDE.md): latest stable major is the default. New deps in this phase pin to current latest at plan-write.
- **Repo hygiene:** every new exported function/class added in this phase carries TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line; `bun run check:docs` enforces.
- **No Cloudflare Images binding.** Astro 6's default image service is **Sharp** at build time (verified context7 `/withastro/docs` `guides/images.mdx` 2026-04-26: *"Sharp is the default image service used for `astro:assets`"*). No extra config key is needed for the static-only build. The `imageService: "compile"` option referenced in the general-plan is **only available on the `cloudflare()` adapter**, which we deliberately do not install (Phase 0 + ADR 0004). Static-only invariant preserved at zero cost.
- **Cover schema:** ADR 0010 promised the cover field would surface in Phase 3.4. ADR 0010 is **superseded by ADR 0018** (`0018-image-pipeline-via-astro-assets`) delivered with this phase.
- **Branching:** all Phase 3 batches land on `phase/03-content-pipeline` → PR → CI green → merge commit (no squash, no rebase) into `main`. Tag `phase-3` on the merge SHA.

## Non-goals

- **No SSR routes.** Static output remains the default. → Phase 4.
- **No `/stats` live data, no `/now` / `/uses` / `/colophon` / `/tops` slash pages.** → Phase 4.
- **No webmentions, RSS, sitemap.** → Phase 6.
- **No Pyodide / QuickJS in Sandpack.** Phase 3 ships JS/TS/React templates only; Python sandboxes wait for Phase 5 garden if at all.
- **No StackBlitz WebContainers.** Sandpack (with `@codesandbox/sandpack-react`, accepting the React runtime as an island-only cost) covers every Phase 3 use case.
- **No Twoslash.** Per general-plan recommendation (line 356), Twoslash is skipped; Expressive Code without Twoslash is the default. If a future article needs inline TS hovers, file an issue and ship the `expressive-code-twoslash` plugin in a later phase.
- **No content-collection rename.** The `works` collection from Phase 1 stays. **Targeted schema migration** is in scope: `cover.src` flips from `z.string()` to the `image()` helper (`schema: ({ image }) => z.object({ cover: z.object({ src: image(), alt: z.string() }).optional(), ... })`) so `<Image />` can ingest it with build-time validation. This is a **breaking change to the `cover` field type** (`string` → `ImageMetadata`) accepted as the unavoidable cost of unblocking ADR 0018; all existing fixtures keep `cover` undefined so the migration is no-op for the current test corpus. New fixture(s) supplied for image-pipeline acceptance set `cover: { src: ./../../assets/works/<file>.jpg, alt: "..." }`. No other schema shape changes.
- **No theme toggle** (still Phase 6). EC dual-theme switches via `prefers-color-scheme` only.
- **No multi-locale / i18n.** → out of plan.
- **No detail-page URL canonicalization beyond `slug`.** Slug = entry.id (or schema-supplied `slug` field) per Phase 1 OQ#4 (still open). Resolved in this phase: `Astro.url.pathname === '/works/' + entry.id`. The schema's `slug?` field becomes a non-functional alias (warning logged at content-load if it differs from `entry.id`) until a follow-up nit decides to drop it.

## Interfaces

> **Note on code/CSS snippets in this section:** snippets are *verified API surfaces* (import paths, function signatures, integration names) per context7 + Astro 6 docs fetched at spec-write 2026-04-26 — not implementation prescriptions. The plan refines exact form, names, and composition.

### Top-level paths added (predicted; the plan refines)

- `packages/site/src/pages/works/[...slug].astro` — dynamic route generated via `getStaticPaths` over `getCollection("works")`. Renders the MDX body inside a detail-page layout. Injects `<a>` to external URL (if any) in the page header.
- `packages/site/src/layouts/_WorkLayout.astro` — detail-page shell. Wraps `_BaseLayout` + adds article markup (`<article>`, `<header>`, `<time>`), `<MetaPills>` reused, breadcrumb back to `/works`, optional cover image at top, body slot for MDX.
- `packages/site/src/components/mdx/Sandbox.astro` — wraps a `<SandboxIsland client:visible />`. Accepts `template`, `files`, `dependencies`, `readOnly` props from MDX.
- `packages/site/src/components/SandboxIsland.tsx` — React island (yes, React, accepted per general-plan line 395). Uses `@codesandbox/sandpack-react`'s `<Sandpack>` component with theme tokens matching Expressive Code (light/dark via `prefers-color-scheme`).
- `packages/site/src/components/CoverImage.astro` — wraps `<Image />` from `astro:assets`. Accepts `src` (from frontmatter) + `alt`. Generates AVIF + WebP responsive variants at build via `sharp`.
- `packages/site/src/components/mdx/Counter.svelte` — example Svelte 5 island for embedding inside MDX (acceptance test of Batch 3.2).
- `packages/site/ec.config.mjs` — Expressive Code config. `themes: ["github-light", "github-dark"]`; copy button enabled; word-wrap off; frame style configured.
- `packages/site/astro.config.mjs` — **modified**: registers `astro-expressive-code` integration; registers `@astrojs/react` integration for the Sandpack island. **Integration ordering** (EC before MDX) is treated as an OQ (see #1) — verified empirically at plan-time by building both orderings on a fixture; not asserted as canonical here because neither EC nor MDX docs explicitly state the rule (only ecosystem usage suggests it).
- `packages/site/src/content.config.ts` — **modified**: schema migrates `cover.src` from `z.string()` to the Astro `image()` helper (`schema: ({ image }) => …`), enabling build-time validation + `<Image />` ingestion. Adds `wide?: boolean` flag for full-bleed cover layout. The Phase 1 `defineCollection` shape changes from value-form `{ schema: worksSchema }` to function-form `{ schema: ({ image }) => z.discriminatedUnion("type", [...]) }`. No other shape changes.
- `packages/site/src/components/Card.astro` — **modified**: thin caller — outer element is `<a href={cardHref(entry)}>` if `cardHref` returns non-empty, else `<article>`. The decision logic moves entirely into `lib/works.ts:cardHref` so it is mutation-testable. Adds `data-test="card-link-detail"` when href starts with `/works/` and `data-test="card-link-external"` when href is an external URL — distinguishes the two branches for e2e. ADR 0021 amends ADR 0011.
- `packages/site/src/lib/works.ts` — **modified**: add `hasBody(entry): boolean` (pinned predicate: `typeof entry.body === "string" && entry.body.trim().length > 0`); `detailUrl(entry): string` returning `/works/${entry.id}/`; `cardHref(entry): string` — the Phase 3 ADR-0021 link decision (returns `detailUrl(entry)` if `hasBody(entry)`, else the Phase 1 external-URL chain, else falls back to `""` and Card.astro emits `<article>` instead of `<a>`). All three exports are mutation-tested.
- `packages/site/src/content/works/<existing fixtures>` — **modified**: 4 of the 11 fixtures gain MDX body content (1 with code blocks for EC test, 1 with a Svelte island, 1 with a Sandpack, 1 plain prose).
- `packages/site/src/content/works/cover-fixture.mdx` — **new** fixture with a real cover image to exercise the image pipeline.
- `packages/site/src/assets/works/<filename>.{jpg,png}` — placeholder cover image binary committed for the test fixture (small, ≤ 100 KB raw).
- `packages/site/tests/e2e/detail.spec.ts` — Playwright e2e for `/works/[slug]` (renders MDX, EC code blocks, image, Svelte island).
- `packages/site/tests/e2e/sandbox.spec.ts` — Playwright e2e for the Sandpack page (lazy-load, runs, isolated React runtime).
- `packages/site/tests/e2e/image-pipeline.spec.ts` — Playwright e2e for image optimization (srcset, AVIF, lazy).
- `packages/site/tests/unit/works-helpers.test.ts` — vitest for `hasBody` / `detailUrl`.
- `packages/site/.size-limit.cjs` — **modified**: per-page JS budget for `/works/[slug]/` with Sandpack ≤ 200 KB gzipped (React + Sandpack runtime); pages without Sandpack ≤ 60 KB (existing site js ceiling).
- `packages/site/lighthouserc.cjs` — **modified**: add 1 representative `/works/[slug]/` URL to the LHCI url list.
- `packages/site/playwright.config.ts` — **may need** bumping `webServer.timeout` if Sandpack first-mount slows e2e.
- `packages/site/.dependency-cruiser.cjs` — **may need** widening to allow MDX → island imports.
- `packages/site/knip.jsonc` — **modified**: `astro-expressive-code`, `@codesandbox/sandpack-react`, `@astrojs/react`, `react`, `react-dom`, `sharp` — register as expected (some auto-detected, some need ignoreDependencies).

### Verified APIs (context7 / Astro 6 docs, fetched 2026-04-26)

- `import { Image } from "astro:assets";` + `<Image src={myImage} alt="..." widths={[...]} sizes="..." />` — built-in image pipeline; uses `sharp` at build for AVIF/WebP.
- `import { getImage } from "astro:assets";` — programmatic image transform (used in `CoverImage.astro` for picture-element fallback if needed).
- `import expressiveCode from "astro-expressive-code";` + `integrations: [expressiveCode(), mdx()]` — verified API surface. Ordering relative to `mdx()` is unverified by canonical docs; OQ#1 resolves empirically at plan-time.
- `ec.config.mjs` exports default config; `themes: ["github-light", "github-dark"]` produces a `prefers-color-scheme` media query automatically.
- `import { Sandpack } from "@codesandbox/sandpack-react";` — React component; `<Sandpack template="react" files={...} options={{ theme: "auto" }} />`.
- `import react from "@astrojs/react";` + `integrations: [react()]` — official React integration; required for `client:only="react"`.
- `<Counter client:visible />` inside `.mdx` — Svelte 5 island; `@astrojs/svelte` + `@astrojs/mdx` already registered (Phase 2 Task 1).

### New pinned dev deps (resolved at spec polish 2026-04-26 via npm registry probes)

- `astro-expressive-code` `^0.41` — current stable `0.41.7` (npm registry, fetched 2026-04-26). **Caveat:** `0.x` packages treat **minor bumps as breaking** per semver; `^0.41` ranges patches only. Plan re-verifies the latest `0.x` line at install.
- `@codesandbox/sandpack-react` `^2.20` — current stable `2.20.0` (npm registry, fetched 2026-04-26). `peerDependencies.react: "^16.8.0 || ^17 || ^18 || ^19"` — accepts React 19 (resolves OQ#3).
- `@astrojs/react` `^5` — `5.0.4` is current; declares `astro: 6.x` peer + accepts `react@19` and `@types/react@^19` per its `peerDependencies` (npm registry, fetched 2026-04-26). Resolves OQ#2.
- `react` `^19` and `react-dom` `^19` — peers of the above.
- `@types/react` `^19` and `@types/react-dom` `^19` — required for `astro/tsconfigs/strictest` + `type-coverage --at-least 100 --strict` to pass on the React island. NOT mentioned in the general-plan but load-bearing for our TS gates.
- `sharp` (peer of `astro:assets` — auto-installed by `bun install` — Astro 6's default image service).

**Production runtime cost:** the React + Sandpack runtime ships only on pages that use `<Sandbox>` (general-plan reports ~40 KB gz for React alone, ~150 KB gz for full Sandpack — uncalibrated until plan-time measurement; see OQ#7). Pages without `<Sandbox>` ship 0 bytes of React.

### No new Cloudflare bindings

- None. Static-only continues. `imageService: "compile"` keeps `sharp` at build.

### Build-time external fetches

- `astro:assets` does NOT fetch externally; it transforms local `src/assets/` files via `sharp`. No new build-time network surface.

## Success criteria (falsifiable)

Each line is a concrete pass/fail check. Plan must wire each into CI.

### Build / install / typecheck

- [ ] `bun install` resolves cleanly with the new prod + dev deps; `bun.lock` text-format committed.
- [ ] `bun run dev` serves `/`, `/works`, `/search`, AND a representative `/works/[slug]/` on `localhost:4321` with no console errors.
- [ ] `bun run build` produces a `dist/works/<slug>/index.html` for every non-draft fixture in `getCollection("works")`. Drafts excluded in prod build.
- [ ] `bun run preview` (`wrangler dev` against built `dist/`) returns HTTP 200 for `/`, `/works`, `/search`, and a sampled detail page with `Content-Type: text/html`.
- [ ] `bun x astro check` exits 0 with the new schema additions.

### Lint / format / hygiene

- [ ] `bun x biome check .` exits 0.
- [ ] `bun x prettier --check '**/*.{astro,svelte}'` exits 0.
- [ ] `bun x type-coverage --at-least 100 --strict` exits 0.
- [ ] `bun x knip` reports zero unused (deps, exports, files) — new deps register correctly.
- [ ] `bun x depcruise --validate .dependency-cruiser.cjs packages/site/src` exits 0.
- [ ] `bun run check:docs` exits 0 — every new exported symbol carries TSDoc with `@see` / `@issue` / `Why:`. **New exports introduced in Phase 3** (must each have TSDoc):
  - `lib/works.ts`: `hasBody`, `detailUrl`, `cardHref`.
  - `content.config.ts`: schema is now function-form `({ image }) => …`; the exported `worksSchema` and `WorkEntry` type aliases stay (re-exports preserved); no new top-level exports.
  - `components/CoverImage.astro` props interface (Astro components export their `Props` interface implicitly when typed).
  - `components/mdx/Sandbox.astro` props interface.
  - `components/SandboxIsland.tsx` props interface (React component).
  - `components/mdx/Counter.svelte` props interface.

### Per-route + per-page JS budgets (`.size-limit.cjs`)

- [ ] Phase 2 budgets unchanged (home/works/search css+html ≤ 60 KB; site js ≤ 60 KB; pagefind-ui ≤ 100 KB).
- [ ] **Detail pages without Sandpack:** total JS ≤ 60 KB gzipped (same as site js — pages re-use Phase 2 islands plus the small reading-time MDX components). Counted via `dist/works/<slug>/index.html` + `dist/_astro/*.js`.
- [ ] **Detail pages with Sandpack:** total JS budget is **advisory at spec-time, pinned at plan-time after measurement.** The plan-worker builds a single Sandpack fixture page, runs `gzip -c dist/_astro/<sandpack chunks>.js | wc -c`, and pins the budget at `measured_size + 20% headroom`. General-plan cites ~150 KB Sandpack + ~40 KB React = ~190 KB gzipped as the rough order; if measurement lands within ±25 % of that, the budget is `measured + 20%`; if it diverges by >25 %, the spec is amended with a stated reason. **Pages without `<Sandbox>` continue to share the site js ≤ 60 KB ceiling** (React not loaded there).
- [ ] `bun x size-limit` exits 0 against built `dist/`.

### Functional — `/works/[slug]` detail page

- [ ] Every non-draft fixture has a working detail page at `/works/<entry.id>/`.
- [ ] Draft fixtures (`draft: true`) are NOT generated as detail pages in prod (`import.meta.env.PROD` gate consistent with Phase 1).
- [ ] Each detail page renders `<h1>{title}</h1>`, `<time datetime={...}>{date}</time>`, the MDX body, and a "Back to /works" link.
- [ ] If the fixture has any external URL (`repo` / `youtube` / `listen` / `arxiv` / `pdf`), a secondary "open external" `<a>` is rendered in the detail-page header. The Phase 1 external-URL priority chain (ADR 0011) is preserved on the secondary link.
- [ ] Cards on `/` and `/works` link to `/works/<entry.id>/` when `hasBody(entry) === true`. Cards without body fall back to the Phase 1 external-URL chain (ADR 0011 amended). Asserted in `tests/e2e/cards.spec.ts`: a fixture with body has `<a href^="/works/" data-test="card-link-detail">`; a fixture without body but with `repo` has `<a href={repo} data-test="card-link-external">`; a fixture with neither renders `<article>` (no link).
- [ ] A11y: `<article>` wraps the body; `<h1>` is the only h1 on the page; Axe-core zero violations.
- [ ] **`transition:name` morph anchor:** detail page's `<h1>` (or hero block) carries `transition:name="card-${entry.id}"`. Asserted in `tests/e2e/detail.spec.ts`: exactly one element with `[transition:name^="card-"]` exists per page (Astro's "name appears at most once per page" rule). Cross-page morph itself is a best-effort smoke-tested similarly to Phase 2 Task 12 case 5 (no flake-prone deep assertion).
- [ ] Visual-regression: 1 baseline per representative detail-page variant (1 EC code, 1 Sandpack page, 1 plain prose, 1 cover-image).

### Functional — Expressive Code (Batch 3.1)

- [ ] A `.mdx` fixture with a `\`\`\`js` code fence renders with: title (from `// title:` first-line directive), copy button visible, syntax highlighting applied.
- [ ] Theme switches automatically via `prefers-color-scheme`. With `page.emulateMedia({ colorScheme: "dark" })`, code-block background becomes the dark-theme color; with `light`, the light-theme color.
- [ ] No JS runtime added to non-Sandpack detail pages from EC. EC's copy-button is a per-page **inlined** `<script>` (≤ 1 KB; resolved OQ#8) — counts against the per-page CSS+HTML budget (≤ 60 KB), not the site js budget. Per-detail-page CSS+HTML stays ≤ 60 KB.

### Functional — Embedded islands (Batch 3.2)

- [ ] Two instances of the same `<Counter client:visible>` Svelte island in one MDX file have unique `$props.id()` values; clicking one does not change the other (state isolation).
- [ ] Hydration directive policy documented in the spec (this section): `client:visible` is the default for islands embedded in MDX; `client:load` only when the island must be ready before scroll.
- [ ] Island bundle: a detail page with one `<Counter>` ships ≤ 60 KB gzipped JS (within the per-page non-Sandpack budget).

### Functional — Sandpack (Batch 3.3)

- [ ] A `<Sandbox template="react" files={...}>` MDX component renders a live React playground.
- [ ] Typing in the editor re-runs within ≤ 1 s (relaxed from general-plan's 500 ms — measured budget; if ≤ 500 ms is reachable on CI, raise the gate).
- [ ] No console errors on a clean page load.
- [ ] **Pages without `<Sandbox>` ship 0 bytes of React.** Verified by post-build glob: detail pages without Sandbox MDX content do NOT include `react` / `react-dom` in their bundled chunks.
- [ ] Sandpack page hits the plan-pinned Sandpack budget (advisory ~190 KB gzipped, finalized at plan-time); pages without Sandpack hit the 60 KB budget.

### Functional — Image pipeline (Batch 3.4)

- [ ] Built HTML for the cover-fixture detail page contains an `<img>` (or `<picture>`) with `srcset` listing multiple widths.
- [ ] Modern browsers (Playwright Chromium) load AVIF; WebP fallback exists in `<picture>` source order; PNG/JPG fallback as final.
- [ ] LH LCP image on the cover-fixture page is the AVIF variant.
- [ ] `loading="lazy"` on cover image (NOT hero — though Phase 3 doesn't ship a hero per se; if added later, `fetchpriority="high"`).
- [ ] **No passthrough fallback ships:** built `dist/` does NOT contain a literal copy of the source `src/assets/works/<file>.{jpg,png}` asset; only optimized `_astro/*.{avif,webp,jpg}` variants exist. Asserted by `tests/e2e/image-pipeline.spec.ts` post-build glob. (Guards against the schema-migration regression where `cover.src` slips back to `string` and ships unoptimized.)
- [ ] No regression in LHCI mobile Performance ≥ 0.85 on `/`, `/works`, `/search`, AND the new sampled detail page URL.

### Tests

- [ ] Vitest: `tests/unit/works-helpers.test.ts` covers `hasBody` and `detailUrl`. Property tests for `detailUrl` round-trip.
- [ ] Playwright e2e: `detail.spec.ts`, `sandbox.spec.ts`, `image-pipeline.spec.ts` — all green on built preview.
- [ ] Phase 0 + 1 + 2 e2e remain green (no regressions in cards, filter, search, palette, preview, transitions, landing, primitives, typography).
- [ ] Visual-regression: detail-page baselines added; existing baselines re-recorded only if Phase 3 layout changes touched them.

### Branch / merge

- [ ] `git push origin phase/03-content-pipeline` → PR opened → CI green → merge commit (no squash, no rebase) into `main` → `phase-3` tag on merge SHA → `*.workers.dev` redeploys.

## Critical modules (mutation-tested)

Stryker nightly extends to:

1. `packages/site/src/lib/works.ts` — three new exports: `hasBody`, `detailUrl`, `cardHref`. Mutating the URL prefix (`/works/` → `/work/`) MUST be caught. Mutating the `cardHref` decision (`hasBody` branch flipping to external) MUST be caught by an e2e or unit test (e2e is the oracle for Card.astro since `.astro` is out of Stryker scope, but `cardHref` itself is pure TS and IS mutation-testable).

Existing Phase 1 + 2 Stryker targets unchanged: `content.config.ts`, `lib/works.ts (sortByDateDesc, listWorks)`, `lib/url-state.ts`, `lib/filter.ts`, `lib/keymap.ts`. Threshold floor `≥ 80%` mutation score holds. Plan re-verifies the schema-migration impact on existing `content.config.ts` Stryker pass and updates fixtures if needed (the function-form `schema: ({ image }) => …` may surface new mutants).

**Out of scope for Stryker in Phase 3:** `.astro` files (unchanged exclusion), `.svelte` islands (Playwright covers), `.tsx` React island (no logic — pure Sandpack wrapper).

## Property tests (`fast-check`)

- `detailUrl` round-trip — for any `entry` with `id` matching `[a-z0-9-]+`, `detailUrl(entry).startsWith("/works/")` AND `detailUrl(entry).endsWith("/")` AND `detailUrl(entry).slice(7, -1) === entry.id` (id round-trips).
- `hasBody` predicate — for any string `s`, `hasBody({ body: s })` equals `s.trim().length > 0`. The pinned predicate: `typeof entry.body === "string" && entry.body.trim().length > 0`. fast-check arbitrary covers: empty `""`, whitespace `"   \n\t"`, single char `"a"`, large strings, unicode whitespace.
- `cardHref` exhaustive branches — for the Cartesian product of `(hasBody ∈ {true,false}) × (externalUrl ∈ {undefined, "https://..."})`, the returned href matches the expected branch (detailUrl when hasBody, externalUrl when no body but external present, `""` otherwise). 4 deterministic cases + property over fixture-shaped arbitraries.

(Other lib helpers stay where they are; no new property test for the React island or Sandpack — they are integration-level, covered by Playwright.)

## Dependencies on previous phases

- **Phase 0** (merge `78fae86`) — Astro 6, TS strictest, lefthook, Vitest, Playwright, Axe, visual-regression, size-limit, LHCI, Astro Fonts API, layout primitives.
- **Phase 1** (merge `be54c7a`) — content-collection schema, `lib/works.ts`, Card components, fixtures.
- **Phase 2** (merge `19d9a32`) — FilterBar / Preview / CommandPalette / Pagefind UI / ClientRouter / staggered animation. Site js budget retired the literal zero-JS gate.
- **Branch** must be cut from `19d9a32` on `main`. (Confirmed: `phase/03-content-pipeline` HEAD = `19d9a32` at branch creation.)
- `@astrojs/svelte` and `astro-pagefind` already registered (Phase 2 Task 1). `@astrojs/mdx` registered since Phase 0. Phase 3 adds `astro-expressive-code` and `@astrojs/react`.

## ADRs to write (delivered with this phase)

- **`0018-image-pipeline-via-astro-assets`** — supersedes ADR 0010 (cards-no-image-pipeline-yet). Documents the choice of `astro:assets` `<Image />` + `imageService: "compile"` (build-time `sharp`) over runtime Cloudflare Images. Reason: keeps the static-only invariant; no runtime CF Images spend; AVIF + WebP responsive variants suffice. Cost: build-time CPU during `astro build`. Source: `https://docs.astro.build/en/guides/images/`.
- **`0019-sandpack-react-island-budget`** — accepts the React + Sandpack ~150–200 KB runtime cost as an island-only loader. Reason: Sandpack covers JS/TS/React playgrounds zero-config; alternatives (StackBlitz WebContainers, framework-agnostic `sandpack-client` driven from Svelte) are higher implementation cost or more bloat. Pages without `<Sandbox>` ship 0 bytes of React. Documents the 200 KB per-page budget for Sandpack-using pages. Source: general-plan line 380–404.
- **`0020-expressive-code-no-twoslash`** — chose `astro-expressive-code` (with default Shiki + dual-theme + copy button + frames) over plain Shiki and over Shiki Twoslash. Reason: EC's plugin ecosystem matches Astro Docs' own choice; Twoslash is niche, the EC Twoslash plugin is community-maintained, and inline TS hovers are not load-bearing for this site's typical content. Cost: zero runtime JS overhead beyond a tiny copy-button script. Source: general-plan line 354–360, EC docs.
- **`0021-detail-page-as-default-card-link`** — amends ADR 0011 (card-click-target-strategy). Cards now link to `/works/[slug]/` when `hasBody(entry) === true`; otherwise fall back to the Phase 1 external-URL priority chain (`repo` / `youtube` / `listen` / `arxiv` / `pdf`); otherwise `<article>` (no link). The detail page in turn links out to the external URL. Source: spec § Functional — detail page; ADR 0011.

## Open questions (each FIRES the verify-or-not rule before plan-write)

The plan-writer MUST resolve every remaining question below with a context7 / WebFetch citation (URL + access date) and pin the answer in the plan doc.

1. **`astro-expressive-code` + `@astrojs/mdx` ordering** — neither EC nor MDX docs explicitly state an ordering rule (verified context7 `/expressive-code/expressive-code` 2026-04-26). General-plan line 348 cites Starlight's convention only. **Plan resolution:** build a 2-fixture probe (EC-then-MDX vs MDX-then-EC) at Task 1 of execution; pick the ordering whose code-fence rendering is correctly themed in built HTML. File a follow-up nit if EC docs ever pin an explicit rule.

2. ~~**`@astrojs/react@^5` Astro 6 compatibility**~~ **Resolved at spec polish 2026-04-26.** `@astrojs/react@5.0.4` declares Astro 6.x peer + accepts `react@19` + `@types/react@^19` (npm registry, fetched 2026-04-26). Pin `^5`; no further verification.

3. ~~**`react@^19` Sandpack peer compat**~~ **Resolved at spec polish 2026-04-26.** `@codesandbox/sandpack-react@2.20.0` `peerDependencies.react: "^16.8.0 || ^17 || ^18 || ^19"` — React 19 IS supported (npm registry, fetched 2026-04-26). Pin `^19`.

4. ~~**`getStaticPaths` + body availability**~~ **Resolved at spec polish 2026-04-26.** Astro 6 deprecated `entry.render()`; the canonical API is `import { render } from "astro:content"; const { Content } = await render(entry);` (verified context7 `/withastro/docs` `guides/upgrade-to/v6.mdx` 2026-04-26). Plan uses the new API; works for both `.md` and `.mdx` since both are part of the content-collection pipeline.

5. **`Astro.url.searchParams` on detail pages** — Astro static routes don't populate `searchParams` at build. Detail-page URL canonical form: `/works/<entry.id>/` with trailing slash (matches Phase 0 trailing-slash convention). Plan locks this canonicalization in `[...slug].astro` via the `getStaticPaths` `params` shape.

6. ~~**Image pipeline `imageService: "compile"`**~~ **Resolved at spec polish 2026-04-26.** That key is a Cloudflare-adapter option; we don't install the adapter (ADR 0004). Astro 6's default image service is **Sharp at build time** for `astro:assets` — no extra config (verified context7 `/withastro/docs` `guides/images.mdx` 2026-04-26). Plan adds NOTHING to `astro.config.mjs` beyond the existing config.

7. **Sandpack page budget calibration** — measure the actual gzipped first-load on a fixture page using `<Sandbox template="react">`. Plan pins the budget at `measured + 20% headroom` after a single-fixture build. If measurement diverges from the general-plan order-of-magnitude (~190 KB) by >25 %, spec is amended with stated reason.

8. ~~**EC `<script>` injection scope**~~ **Resolved at spec polish 2026-04-26.** Per EC docs (`https://expressive-code.com/key-features/code-component/`, fetched 2026-04-26): the copy-button JS is inlined per-page as a small inline script (≤ 1 KB), NOT a separate chunk under `dist/_astro/`. Therefore it counts against the **per-page CSS+HTML budget** (≤ 60 KB), not the site js budget. Plan measures the per-detail-page CSS+HTML delta to confirm headroom.

9. **Card → detail-page ARIA / semantic correctness** — Phase 3 amends ADR 0011: `<a href={detailUrl}>` if hasBody else original ADR 0011 chain. Verify Axe-core zero violations on **both branches** (a fixture with body, a fixture without). Plan adds two assertions in `tests/e2e/cards.spec.ts`:
    - hasBody fixture → outer `<a>` href starts with `/works/` + `data-test="card-link-detail"`.
    - no-body fixture with `repo` → outer `<a>` href is the repo URL + `data-test="card-link-external"`.

10. **MDX with Svelte island: same component twice on one page** — verify Svelte 5 `$props.id()` uniqueness in Astro islands. General-plan line 369 cites a past Astro fix. Plan adds an MDX fixture with two `<Counter />` islands; e2e asserts they each have unique `data-svelte-h=` attributes AND independent click-counter state.

11. ~~**Cover image schema validation**~~ **Resolved at spec polish 2026-04-26.** Schema migrates `cover.src` from `z.string()` to the Astro `image()` helper via the function-form `schema: ({ image }) => z.discriminatedUnion(…)`. Verified context7 `/withastro/docs` `guides/images.mdx` 2026-04-26 + `reference/modules/astro-content.mdx` (SchemaContext example). This is the breaking schema change documented in § Non-goals.

12. ~~**`/works/[slug]/` ClientRouter morph**~~ **Resolved at spec polish 2026-04-26.** Astro 6 `transition:name` matches across pages and element types as long as the name appears at most once per page (verified context7 `/withastro/docs` `guides/view-transitions.mdx` § "Naming a transition" 2026-04-26: *"the provided `transition:name` value can only be used once on each page"*). Phase 2 added `transition:name="card-${id}"` on the Card outer element; Phase 3 detail page pairs `transition:name="card-${id}"` on the detail-page `<h1>` (or hero block). Plan adds a Playwright assertion that exactly one `[transition:name^="card-"]` element exists on each page; cross-page morph itself is best-effort smoke-tested (same fragility as Phase 2 Task 12 case 5).
