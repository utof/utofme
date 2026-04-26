# Spec: Phase 1 — Card Grid MVP

## Goal
The home page renders a CSS-Grid of heterogeneous **work cards** (one of: `code` / `video` / `music` / `math` / `writing`) sourced from MDX files in `src/content/works/`. Each card has a uniform outer shell (hairline border, radius, padding) and a per-type inner thumbnail (`CodeThumb` / `VideoThumb` / `MusicThumb` / `MathThumb` / `WritingThumb`) plus a type-indicator glyph and metadata pills (date, tag count). A `/works` archive page shows the full list. Adding or removing an `.mdx` file under `src/content/works/` causes the grid on `/` and `/works` to update on rebuild; an invalid frontmatter field fails `bun x astro check` with a Zod error pointing to the offending file. **No interactivity** ships in Phase 1 — all hydration is deferred to Phase 2.

## Context / invariants
- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**, **Svelte 5 (runes)** islands. Phase 0 merge commit `78fae86` is the branch base.
- Output is `static`. **No SSR introduced in Phase 1.** No Astro Cloudflare adapter installed.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12** (Astro 6 + LHCI requirement, established in Phase 0).
- TypeScript `strict` + `astro/tsconfigs/strictest`; CI gates `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (via lefthook only) for `.astro` / `.svelte`.
- **Phase 0 invariants carry over and remain green:** all seven lefthook steps pass; LHCI mobile ≥ 95 on `/`; Axe-core zero violations on every shipped route; visual-regression snapshot stable across re-runs; `bun x size-limit` enforces the Phase 0 budget for `/`; `bun run build` emits zero `.js` chunks under `dist/_astro/` (the **0 KB JS first-load gate** holds for `/` and `/works`).
- **Library version policy** (CLAUDE.md): latest stable major is the default. New deps in this phase pin to current latest at plan-write.
- **Content lives in `packages/site/src/content/works/`** as `.md` and `.mdx`. The collection is named `works`.
- **Phase 0 layout primitives** (`<Stack>`, `<Cluster>`, `<Grid>`, `<Frame>` under `packages/site/src/components/`) are **the only layout primitives the cards may compose with**. Phase 1 does not introduce a fifth primitive; if a primitive feels missing, file an issue and reuse `<Frame>` + `<Stack>`.
- **No Astro `<Image />`/`getImage()` use yet**: image optimization is Phase 3.4. Cover images in this phase are **typed in the schema but NOT rendered** — Phase 1 card components are pure-CSS thumbs with no per-item imagery. ADR 0010 (MUST) documents this deferral.
- **Repo hygiene:** every exported function/class added in this phase must carry TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line — `bun run check:docs` enforces it.
- `import.meta.env.PROD` gates draft visibility; in dev/preview, drafts render with a `data-draft="true"` attribute so visual-regression and tests can distinguish them.

## Non-goals
- **No filter/sort UI.** No `<FilterBar>` Svelte island, no URL-synced state. → Phase 2.1.
- **No local search / Pagefind / cmd-K palette.** → Phase 2.2 / 2.3.
- **No hover preview, no view transitions, no staggered animation.** Card hover state is **CSS-only** (no JS island). → Phase 2.4.
- **No SSR routes** and **no Cloudflare adapter.** Static output remains the default. → Phase 4.
- **No image optimization pipeline.** No `astro:assets`, no `<Image />`, no `sharp`-driven `getImage()`. → Phase 3.4.
- **No MDX islands / Expressive Code / Sandpack / `<Sandbox />`.** Cards link out (or eventually to Phase 3 detail pages); Phase 1 ships **no** per-work detail route. → Phase 3.x.
- **No webmentions, RSS, sitemap, slash pages.** → Phase 4 / 6.
- **No grain overlay, no view transitions.** → Phase 4 / 7.
- **No Twoslash / Shiki dual-theme work** — kept under Phase 3.1.
- **Berkeley Mono webfont** stays out (ADR 0005); fallback OFL mono unchanged from Phase 0.
- **No multi-collection split.** A single discriminated-union collection is the choice — see ADR 0007.

## Interfaces

> **Note on code/CSS snippets in this section:** concrete snippets are *verified API surfaces* (import paths, function signatures, Zod method names), not implementation prescriptions. The plan refines exact implementation form, variable names, and composition details.

### Top-level paths added (predicted; the plan refines)
- `packages/site/src/content/works/` — content directory (one subdir per type *optional*; flat layout is also acceptable — plan resolves).
- `packages/site/src/content/fixtures/` (or `packages/site/tests/fixtures/content/`) — 10 seeded MDX fixtures (two per type) used by unit + e2e + visual-regression tests. **Fixtures must NOT ship in production** — plan resolves the exclusion mechanism (e.g. fixture loader scoped under `import.meta.env.MODE === "test"`, or fixtures live under `tests/fixtures/` and the collection's `glob.base` points at `src/content/works/`).
- `packages/site/src/content.config.ts` — content-collection config. **Filename is `src/content.config.ts`** (verified against current Astro 6 docs; *not* `src/content/config.ts`).
- `packages/site/src/components/Card.astro` — uniform outer shell.
- `packages/site/src/components/thumbs/CodeThumb.astro`
- `packages/site/src/components/thumbs/VideoThumb.astro`
- `packages/site/src/components/thumbs/MusicThumb.astro`
- `packages/site/src/components/thumbs/MathThumb.astro`
- `packages/site/src/components/thumbs/WritingThumb.astro`
- `packages/site/src/components/TypeGlyph.astro` — small SVG indicator (one `<svg>` per type).
- `packages/site/src/components/MetaPills.astro` — date + tag-count pill cluster.
- `packages/site/src/pages/index.astro` — **modified** (Phase 0 currently ships a typography specimen here; Phase 1 replaces specimen with grid; specimen content moves to `/typography` if retained, or is deleted — plan resolves).
- `packages/site/src/pages/works/index.astro` — `/works` archive route.
- `packages/site/src/lib/works.ts` — typed query helpers (`listWorks`, `sortByDateDesc`); every export carries TSDoc.
- `packages/site/tests/unit/content-schema.test.ts` — vitest + fast-check schema parse/safeParse coverage.
- `packages/site/tests/unit/works-query.test.ts` — vitest unit for `listWorks` / `sortByDateDesc`.
- `packages/site/tests/e2e/cards.spec.ts` — Playwright e2e for `/` + `/works` (visual-regression + Axe).
- `packages/site/stryker.conf.json` — Stryker config (vitest runner, scoped to schema + query helpers).
- `packages/site/tests/visual-regression/*` — new baselines for `/` and `/works`.

### Public exports introduced (must each obey docs-for-trust)
The following are the **only** public/exported symbols Phase 1 introduces. Each must carry TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line, enforced by `bun run check:docs`:
- `collections` (re-exported from `src/content.config.ts`).
- `worksSchema` (named export, the discriminated-union schema, exported separately for re-use in `lib/works.ts` tests + Stryker).
- `WorkEntry` (TypeScript type alias inferred from `worksSchema`).
- `listWorks(opts?)` from `src/lib/works.ts` — returns the sorted, draft-filtered list.
- `sortByDateDesc<T extends { data: { date: Date } }>(entries: T[]): T[]`.

Layout primitives, Card, Thumbs, TypeGlyph, MetaPills are `.astro` components consumed inside `packages/site/src/`; they don't carry JS exports and don't trigger `check:docs`.

### Schema (definitive shape — discriminated union over `type`)
The collection is named **`works`** and uses `z.discriminatedUnion("type", [...])` over the five type variants. **`z` and `defineCollection` import paths**:

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
```

Verified 2026-04-25 via `https://docs.astro.build/en/guides/upgrade-to/v6/`: *“import { z } from 'astro/zod'”* is the Astro 6 canonical path; `defineCollection` continues to come from `astro:content`. (Sources at end.)

**Base fields (shared across all five variants):**
| Field | Zod | Required? | Notes |
|---|---|---|---|
| `title` | `z.string()` | yes | |
| `slug` | `z.string().optional()` | no | If absent, derived from filename stem (`generateId` on the loader, OR Astro's default ID rule — Open Question 4). |
| `date` | `z.coerce.date()` | yes | Frontmatter is YAML string; coerced to `Date`. Zod 4: `z.coerce.*` input type is now `unknown` — YAML strings still parse correctly (resolved OQ#3; see Sources). |
| `updated` | `z.coerce.date().optional()` | no | |
| `tags` | `z.array(z.string()).default([])` | no (defaults to `[]`) | |
| `draft` | `z.boolean().default(false)` | no | Hidden when `import.meta.env.PROD === true`. |
| `summary` | `z.string().max(240).optional()` | no | Used in MetaPills + future hover preview. |
| `cover` | `z.object({ src: z.string(), alt: z.string() }).optional()` | no | **Schema-only in Phase 1 — NOT rendered** (see ADR 0010, promoted to MUST). No `<img>` emitted from cards; cover data reserved for Phase 3.4 detail pages where `astro:assets` `<Image />` ships. Avoids LH LCP regression from unoptimized images. |

**Per-type variants** (each variant is `z.object({ type: z.literal("..."), ...base, ... })`):

| `type` literal | Extra fields |
|---|---|
| `"code"` | `repo: z.url().optional()` (resolved OQ#6 — `z.url()` is the Zod 4 canonical form; `z.string().url()` is legacy and emits a deprecation path. Confirmed via `https://zod.dev/v4/changelog` 2026-04-25 + runtime probe: `typeof (await import('astro/zod')).z.url === 'function'` → `true`); `stack: z.array(z.string())` (required, no default — empty array allowed) |
| `"video"` | `duration: z.number()` (seconds, required); `youtube: z.string().optional()` (video ID or URL; plan resolves) |
| `"music"` | `bpm: z.number().optional()`; `listen: z.url().optional()` |
| `"math"` | `pdf: z.string().optional()` (path or URL — plan resolves); `arxiv: z.string().optional()` |
| `"writing"` | `wordCount: z.number().optional()`; `readingTime: z.number().optional()` |

**Loader:**
```ts
glob({ pattern: "**/*.{md,mdx}", base: "./src/content/works" })
```
**Open Question 7** — verified from Astro docs that `glob`'s `pattern` is `string | string[]`, both `"**/*.{md,mdx}"` (brace) and `"**/*.(md|mdx)"` (extglob) are valid; pick one for the spec and stick to it. Spec choice: **brace form `"**/*.{md,mdx}"`** (matches the research-doc example and is the more widely-recognized syntax).

**Draft filter (production-only) — canonical pattern:**
```ts
const works = await getCollection("works", ({ data }) =>
  import.meta.env.PROD ? data.draft !== true : true,
);
```
Verified 2026-04-25 via `https://docs.astro.build/en/guides/content-collections/`.

**Type narrowing (required for TS strictest):** consumers (`Card.astro`, `lib/works.ts`) must narrow on `entry.data.type === "code"` before reading `entry.data.repo` / `entry.data.stack`, etc. The discriminated-union schema is what makes this narrowing sound.

**Resolved OQ#1 — narrowing works natively in Astro 6 (empirical probe 2026-04-25):** `astro sync` generates `.astro/content.d.ts` with `getCollection` typed to return `CollectionEntry<C>[]` where `CollectionEntry<C>.data = InferEntrySchema<C>`. For a `z.discriminatedUnion` schema, `z.infer<...>` produces a TypeScript discriminated union; TS narrows it correctly on `entry.data.type === "code"`. Negative access (`entry.data.duration` without narrowing) produces `TS2339`. **No manual type-guard helper is required.** Probe results:
- `src/probe.ts` (valid narrowing): tsc exit 0, zero errors.
- `src/probe-zod.ts` (`z.infer<typeof worksSchema>` + narrowing): tsc exit 0, zero errors — `data.stack.join(", ")` inside `if (data.type === "code")` compiles cleanly; `z.url()` and `z.discriminatedUnion` verified present and callable in `astro/zod`.
- `src/probe-fail.ts` (negative probe): tsc exit 2, `error TS2339: Property 'duration' does not exist on type 'WorksData'. Property 'duration' does not exist on type 'CodeData'.`
The success criterion at L203 (`expectTypeOf` / `tsd` type-test) stands as-is.

### URL routes added or changed
- `/` (modified) — replaces Phase 0 typography specimen with the card grid. Specimen content either deleted or moved to `/typography` — plan resolves; spec mandates **the home route MUST render the grid**.
- `/works` (added) — full archive, same grid layout, no top-N truncation.

No other routes ship in Phase 1.

### Card visual contract
- **Outer shell:** identical for all five types — hairline border `1px solid color-mix(in srgb, currentColor 15%, transparent)` (matches Phase 0 token convention), `border-radius: var(--radius-2)` (token introduced if missing — plan resolves), `padding: var(--space-3)`, `background: transparent`, `display: grid; grid-template-rows: auto 1fr auto; gap: var(--space-2)`.
- **Inner thumbnail:** per-type component (CSS-only; no `<img>` for the thumb itself in Phase 1 — covers are separate). Each thumb has `aspect-ratio: 16 / 10` and fills the card's middle row.
- **Type indicator glyph:** small SVG (≤ 24×24 px) placed top-left or top-right inside the outer shell — plan resolves position; uniform across types so the visual rhythm is preserved.
- **Metadata pills:** date (`YYYY-MM-DD` formatted; locale-stable to avoid CI snapshot drift) + tag count (`{n} tags` or `{n}`). One pill per metadatum.
- **Hover state:** CSS-only — `outline: 1px solid currentColor` on hover/focus-visible; no transform, no transition longer than 150 ms (respects `prefers-reduced-motion`).
- **Card click target / href strategy (resolved OQ#11):** if `data.repo` / `data.youtube` / `data.listen` / `data.arxiv` / `data.pdf` is present, the card outer shell is `<a href={externalUrl}>` pointing to that URL (in priority order: `repo` → `youtube` → `listen` → `arxiv` → `pdf`); otherwise the shell is `<article>` with no `<a>` wrapper and no `href="#"` placeholder. Phase 3 replaces `<article>` cards with detail-page `<a>` hrefs. This strategy ships no JS, avoids dead links, and keeps Axe clean (no `href="#"` anti-pattern). See ADR 0011.
- **Keyboard focus:** cards with an `<a href>` are tab-focusable in source order; `<article>` cards are not in the tab sequence (intentional — no link = nothing to activate). Focus ring visible on `<a>` cards (uses focus-visible outline above).
- **Hairline scaling under DPR:** the 1px border uses `device-pixel-ratio`-aware width — token strategy decided in plan.

### Grid contract
- `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`.
- `gap: var(--space-4)`.
- Composes `<Grid>` (Phase 0 primitive) — `<Grid as="ul">` is the wrapper, each card is an `<li>`.
- Above 1280px viewport, max 4 columns (CSS `max-width` clamp on the grid container; plan picks the exact ceiling).
- Below 480px, single column.

### Lefthook & CI gates
No changes to the seven-step lefthook chain. Stryker is **not** added to lefthook (it runs nightly per CLAUDE.md § "Tests every batch"). The plan must add a `test:mutation` npm script and a nightly CI workflow (or extend `ci.yml` with a `schedule:` trigger), separate from PR CI.

### `size-limit` budget for Phase 1
- **JS first-load on `/` and `/works`: 0 KB hard fail** — same gate as Phase 0. The custom `bun -e` post-build glob check that asserts `dist/_astro/*.js` is empty stays in place; if Phase 1 introduces a dynamic import for some reason, the gate flips red and the spec is wrong.
- **CSS + HTML transfer-size on `/` (with 10 fixture cards): ≤ 60 KB gzipped** — bumped from Phase 0's 30 KB to absorb the card CSS + 10 cards' worth of inline data (titles, summaries, tags, dates rendered server-side as text). Plan must verify the actual measurement after a build of the 10 fixtures and tighten if achievable.
- **CSS + HTML transfer-size on `/works` (with 10 fixture cards): ≤ 60 KB gzipped.**

## External services / runtime deps

### New pinned production dep (latest stable major; resolved at plan-write)
- `@astrojs/mdx` ^5 — verified 2026-04-25 against the integration's CHANGELOG (`https://github.com/withastro/astro/blob/main/packages/integrations/mdx/CHANGELOG.md`): `5.0.1` set `peerDependencies.astro` to `6.0.0`; latest 5.x is the Astro-6-aligned line. Plan pins exact version. Reason: Phase 1 requires `.mdx` content support (the `glob({ pattern: "**/*.{md,mdx}" })` loader matches `.mdx` files but parsing them requires the integration).

### New pinned dev deps (latest stable; resolved at plan-write)
- `@stryker-mutator/core` ^9 — verified 2026-04-25 via `https://github.com/stryker-mutator/stryker-js/releases`: `v9.6.1` is current (April 10, 2026). **Invocation: `bunx stryker run`** (resolved OQ#8 — empirical probe 2026-04-25: `bun add -D @stryker-mutator/core@^9` installed `9.6.1`; `bunx stryker --version` → `9.6.1`, exit 0; `npx stryker --version` → `9.6.1`, exit 0 — both work; spec uses `bunx` for consistency with repo toolchain). The nightly CI job uses `oven-sh/setup-bun@v2` + `bunx stryker run`; `actions/setup-node@v4` is NOT required for Stryker (unlike LHCI). Reason: ADR 0006 deferred Stryker to Phase 1; this is the phase that ships content-collection loaders + Zod schemas — Stryker's first useful target.
- `@stryker-mutator/vitest-runner` ^9 — same major as core; vitest is already the unit runner in Phase 0.
- `@stryker-mutator/typescript-checker` ^9 — required for TS-strictest projects so mutants that break types are reported as `Killed` (faster) instead of survivors.
- `fast-check` ^4 — verified 2026-04-25 via `https://github.com/dubzzz/fast-check/releases`: latest is `v4.7.0` (April 2025). Reason: ADR 0006 deferred fast-check; this phase ships Zod schemas — first useful target for property tests.
- `@fast-check/vitest` ^0.4 — vitest binding (the latest line as of April 2026). Reason: integrates `fc.assert` with vitest's `it` and shrinking output.

### New dev-only fixtures
- 10 MDX files (2 per type) under `tests/fixtures/content/works/` (or `src/content/works/` with a draft flag — plan resolves the location). They must not ship in production; plan resolves whether the prod build excludes them via a fixture-only `glob` base or via `draft: true` + the production filter.

### No new Cloudflare bindings
- None. Workers-Assets static-only continues. No KV / R2 / DO. **No SSR.**

### No build-time external fetches added
- Astro Fonts API still downloads Fraunces + Geist + CommitMono OFL during build (unchanged from Phase 0). MDX integration is local; no remote fetch.

## Success criteria (falsifiable)
Each line is a concrete pass/fail check. Plan must wire each into CI.

### Build / install / typecheck
- [ ] `bun install` resolves cleanly with the new prod + dev deps; `bun.lock` text-format committed.
- [ ] `bun run dev` serves `/` and `/works` on `localhost:4321` with no console errors.
- [ ] `bun run build` produces `packages/site/dist/index.html` AND `packages/site/dist/works/index.html` AND **no `.js` chunks under `dist/_astro/`**.
- [ ] `bun run preview` (`wrangler dev` against built `dist/`) returns HTTP 200 for `/` AND `/works` with `Content-Type: text/html`.
- [ ] `bun x astro check` exits 0 with the 10 valid fixtures present.
- [ ] `bun x astro check` exits **non-zero** with a Zod parse error pointing at the offending file when a fixture is mutated to violate the schema (e.g., `type: video` without `duration`). Test fixture lives under `tests/fixtures/invalid/` and is asserted in a vitest unit (`packages/site/tests/unit/schema-violations.test.ts`).

### Lint / format / hygiene
- [ ] `bun x biome check .` exits 0.
- [ ] `bun x prettier --check '**/*.{astro,svelte}'` exits 0.
- [ ] `bun x type-coverage --at-least 100 --strict` exits 0.
- [ ] `bun x knip` reports zero unused (deps, exports, files).
- [ ] `bun x depcruise --validate .dependency-cruiser.cjs packages/site/src` exits 0.
- [ ] `bun run check:docs` exits 0 — every new exported symbol (`worksSchema`, `WorkEntry`, `listWorks`, `sortByDateDesc`, `collections`) has TSDoc with `@see` / `@issue` / `Why:`.

### Bundle / perf
- [ ] `bun x size-limit` reports **0 KB JS** for `/` AND `/works` (gate from Phase 0 post-build glob extended to the new route).
- [ ] `bun x size-limit` reports **CSS + HTML ≤ 60 KB gzipped** on `/` and on `/works` (with the 10 fixtures present).
- [ ] **Lighthouse mobile ≥ 95** (Performance) on **both** `/` and `/works` — measured by `npx lhci autorun` against built preview in CI; LHCI config extended to assert both routes.
- [ ] First contentful paint includes at least one card before any client-side hydration (verified: no JS chunks shipped, so this is structural).

### Visual & accessibility
- [ ] **Visual-regression** snapshots stable on **`/` and `/works`** across two CI runs with no source change in `src/styles/`, `src/pages/`, `src/components/`. `maxDiffPixelRatio: 0.001`. Variable-typography H1 region masked as in Phase 0.
- [ ] `@axe-core/playwright` passes on `/` AND `/works` with **zero violations**.
- [ ] Tab-through on `/` focuses each `<a href>` card in source order; focus ring visible (Playwright assertion via `expect(page.locator('article a').first()).toBeFocused()` after Tab press — only linked cards are in the tab sequence per ADR 0011).
- [ ] `prefers-reduced-motion: reduce` disables all transitions/animations on cards (CSS check via Playwright forced color-scheme + reduced-motion emulation).

### Schema / content behaviour
- [ ] `getCollection("works")` returns 10 entries (2 per type) with the 10 valid fixtures present.
- [ ] Adding `tests/fixtures/content/works/_test-add.mdx` causes the home grid to gain one card after `bun run build`. (Verified by a Playwright test that runs build inside the CI job for this assertion only, OR by a vitest integration test that imports the collection module — plan picks one.)
- [ ] Removing a fixture file decreases the grid count by one on rebuild.
- [ ] `data.draft = true` entries are absent from `getCollection("works")` when `import.meta.env.PROD === true`; present when `PROD === false`. Asserted by a vitest unit that mocks `import.meta.env.PROD`.
- [ ] Per-type narrowing compiles under TS strictest: a vitest type-test (using `expectTypeOf` from vitest, OR a `tsd` snippet — plan picks one) asserts that inside `if (data.type === "code")`, `data.repo` is `string | undefined` and `data.stack` is `readonly string[]` (or `string[]`); accessing `data.duration` outside the `video` narrow fails compilation.

### Tests every batch (per CLAUDE.md)
- [ ] `bun x vitest run` shows ≥ N green tests covering: schema parse round-trip (fast-check property), schema safeParse error shape (fast-check), `sortByDateDesc` invariant (fast-check), draft filter behaviour, schema violation detection. Plan resolves N (expect ≥ 8).
- [ ] `bun x playwright test` shows ≥ 4 green e2e tests: home renders 10 cards, `/works` renders 10 cards, Axe clean on both, visual-regression baseline matches.
- [ ] `bun x stryker run` (NIGHTLY only — not on PR CI) reports **mutation score ≥ 80%** on the modules listed under "Critical modules". Plan resolves the threshold (this spec asserts ≥ 80% as the floor; tighter thresholds may be set per-module in the Stryker config).

### Phase 0 invariants still hold
- [ ] All Phase 0 lefthook + CI checks remain green (Biome, Prettier, astro-check, type-coverage, knip, depcruise, check:docs, size-limit, vitest, playwright, axe, LHCI, visual-regression).
- [ ] `document.fonts.ready` resolves within 200 ms on built preview (existing Phase 0 test continues to pass).
- [ ] Self-hosted mono `.woff2` returns immutable cache header from Workers Assets in production — existing skipped test stays skipped (deferral unchanged).

### Branch / merge
- [ ] `git push origin phase/01-card-grid-mvp` → PR opened → CI green → **merge commit** (no squash, no rebase) into `main` → `phase-1` tag on the merge SHA → `*.workers.dev` redeploys.

## Critical modules (mutation-tested)
Per ADR 0006 (Phase 0) + the new ADR 0008 (Phase 1), Stryker nightly runs over:
1. `packages/site/src/content.config.ts` — the discriminated-union schema. Mutating `z.literal("code")` to `z.literal("xode")` MUST be caught by a fast-check property test or a vitest fixture.
2. `packages/site/src/lib/works.ts` — `listWorks` (draft filter + sort) and `sortByDateDesc`. Mutating the comparator direction MUST be caught.

**Out of scope for Stryker in Phase 1:** `.astro` files (Stryker can't mutate them meaningfully), thumb components (no logic), TypeGlyph/MetaPills (no logic). The schema + query helpers are the only "logic" in Phase 1.

## Property tests (`fast-check`)
- `worksSchema.parse` round-trip: for every variant's arbitrary (`fc.record(...)`), parsing valid input and re-serializing yields a value that re-parses identically. Validates the schema's idempotence.
- `worksSchema.safeParse` failure shape: for arbitrary records that violate **one** required field, `safeParse` returns `{ success: false }` and the issue path includes the violated field name. Validates discriminated-union narrowing semantics.
- `sortByDateDesc` invariants:
  - Idempotent: `sort(sort(xs)) ≡ sort(xs)`.
  - Monotone: for any `i < j`, `result[i].data.date >= result[j].data.date`.
  - Permutation: result is a permutation of input (same multiset).
- Draft filter invariant: for any input list, `listWorks({ env: "prod" })` excludes all `draft: true` entries; `listWorks({ env: "dev" })` includes them. Property: `count(prod) ≤ count(dev)`, equality iff no drafts present.

Property tests live in `tests/unit/content-schema.test.ts` and `tests/unit/works-query.test.ts`. fast-check seed is fixed in CI for reproducibility (`fc.configureGlobal({ seed: <int> })` in test setup).

## Dependencies on previous phases
- **Phase 0** must have shipped (it has — merge commit `78fae86`).
  - Astro 6 + TS strictest + 100% type-coverage live.
  - Lefthook 7-step pipeline live.
  - Vitest + Playwright + Axe + visual-regression + size-limit + LHCI all live and configured.
  - Layout primitives (`<Stack>`, `<Cluster>`, `<Grid>`, `<Frame>`) live and the cards compose with them.
  - 0 KB JS first-load gate live (custom post-build glob check).
  - Astro Fonts API set up (Fraunces + Geist + CommitMono OFL) — cards inherit Phase 0 type system.
- Branch must be cut from the **`78fae86` merge commit** on `main`. (Confirmed: current branch `phase/01-card-grid-mvp` HEAD is `78fae86`.)
- ADR 0006 (defer Stryker + fast-check to Phase 1) is honoured by this phase — both land here.

## ADRs to write (delivered with this phase)
- **`0007-single-collection-discriminated-union`** — chose ONE `works` collection over five (`code`, `video`, `music`, `math`, `writing`) collections. Alternatives: five collections (per-directory, decoupled schemas). Reason: heterogeneous home grid wants `getCollection("works")` to return one sortable list with TypeScript-narrowed per-type fields. Cost: schemas live in one file; if any type's fields explode in scope, refactor candidate is in scope. Source: research-doc lines 178–185 + `https://docs.astro.build/en/guides/content-collections/`.
- **`0008-stryker-and-fast-check-targets`** — which modules get mutation/property tests in Phase 1 and why (schema + query helpers; not `.astro` or trivial render code). Pins Stryker `^9` + fast-check `^4` + `@fast-check/vitest` `^0.4`. Threshold floor `≥ 80%` mutation score. Source: CLAUDE.md § "Tests every batch" + ADR 0006 deferral.
- **`0009-mdx-vs-md-policy`** — when to write `.mdx` vs `.md`. Phase 1 ships **both** through one glob (`{md,mdx}`), but the policy resolved here is: prefer `.md` for plain prose; use `.mdx` only when an MDX feature is needed (custom components, JSX expressions). Phase 1's fixtures should include at least one `.md` and at least one `.mdx` to exercise both. Source: research-doc lines 178–225.
- **`0010-cards-no-image-pipeline-yet`** (MUST — promoted from optional) — documents that Phase 1 treats `cover` as **schema-only**; no `<img>` is rendered in card components. Rationale: (a) plain `<img loading="lazy">` for unoptimized cover images would create an LH LCP regression on the 10-card fixture grid, risking the ≥ 95 mobile performance gate; (b) `astro:assets` `<Image />` ships in Phase 3.4 alongside detail pages that will actually need the cover. Source: research-doc § Phase 3.4; spec § "Context / invariants" line "No Astro `<Image />`/`getImage()` use yet".
- **`0011-card-click-target-strategy`** — documents the Phase 1 card href decision: render `<a href={externalUrl}>` when `data.repo` / `data.youtube` / `data.listen` / `data.arxiv` / `data.pdf` is present (first non-null wins); otherwise render `<article>` (no link). Alternatives: `href="#"` placeholder (dead link, Axe violation risk); `aria-disabled` non-link (confusing for AT users). Phase 3 replaces `<article>` cards with detail-page links. Source: spec OQ#11 recommendation; WCAG 2.2 SC 2.1.1 (keyboard); ADR 0008 (no JS in Phase 1).

## Open questions (each FIRES the verify-or-not rule before plan-write)
The plan-writer MUST resolve every question below with a WebFetch citation (URL + access date) and pin the answer in the plan doc.

1. ~~**`getCollection("works")` typing**~~ **Resolved at spec polish 2026-04-25.** `astro sync` generates `CollectionEntry<"works">.data = InferEntrySchema<"works">` which for a `z.discriminatedUnion` schema resolves to the full TypeScript discriminated union. TS narrows correctly: positive probe (tsc exit 0, zero errors on `entry.data.stack` inside `if (entry.data.type === "code")`); negative probe (tsc exit 2, `TS2339: Property 'duration' does not exist on type 'WorksData'` without narrowing). No manual type-guard helper is needed. The plan's `expectTypeOf` test asserting `data.repo` is `string | undefined` inside the `"code"` narrow STANDS. See resolved body in § "Schema / Type narrowing" above.

2. **Zod 4 `z.discriminatedUnion("type", […])`** — Confirmed via `https://zod.dev/api` (fetched 2026-04-25): the call shape **did NOT change** from Zod 3 — it remains `(discriminatorKey, [array])`, NOT an options-object form. Plan should re-verify on the **exact `astro/zod` re-export** (not the public Zod package), since Astro 6 ships Zod 4 internally; it is conceivable the re-export omits some APIs. Sub-test: a `bun -e` one-liner `import('astro/zod').then(m => console.log(typeof m.z.discriminatedUnion))` should log `"function"`.

3. ~~**`z.coerce.date()` semantics in Zod 4**~~ **Resolved at spec polish 2026-04-25.** `z.coerce.date()` works for YAML-string frontmatter in Zod 4: Zod 4 widens `z.coerce.*` input type to `unknown` (was `string`) — this is a loosening, not a breaking change. YAML frontmatter strings are `unknown` from Astro's perspective anyway, so the schema continues to parse correctly. Plan must include a fast-check property test: `fc.string()` filtered to ISO-8601 shapes parses to a `Date` instance. Source: `https://zod.dev/v4/changelog` (fetched 2026-04-25).

4. **Slug derivation** — Astro's `glob` loader generates IDs by default (`generateId` is optional and defaults to a slugified path-relative-to-base, sans extension). Verify whether the schema's optional `slug` field overrides Astro's default ID, or whether `slug` and `id` are independent (Astro 5 / 6 split). Source: `https://docs.astro.build/en/reference/content-loader-reference/`. Plan must specify exactly how a fixture file `notes/2026-04-foo.mdx` is addressable — by `id`, by `slug`, or both — and which the `<Card>` `href` uses.

5. ~~**Cover image rendering in Phase 1**~~ **Resolved at spec polish 2026-04-25.** Cover images are **schema-only in Phase 1**: the `cover` field is captured in the Zod schema for future use but is NOT rendered anywhere in Phase 1 card components. Thumbs are CSS-shape only (per research-doc § "per-type thumbnail shapes"). Rationale: unoptimized `<img loading="lazy">` cover images would risk LH LCP regression on the 10-card fixture grid (≥ 95 mobile gate); `astro:assets` `<Image />` ships in Phase 3.4. ADR 0010 is MUST (promoted). No `<img>` tag in `Card.astro` or any thumb component in Phase 1.

6. ~~**Zod 4 `z.url()` vs `z.string().url()`**~~ **Resolved at spec polish 2026-04-25.** Use `z.url()` — confirmed top-level in `astro/zod` (runtime probe: `typeof (await import('astro/zod')).z.url === 'function'` → `true`; exit 0). `z.string().url()` is the Zod 3 legacy path; Zod 4 moved string-format validators to top-level (`z.url()`, `z.email()`, `z.uuid()`) per `https://zod.dev/v4/changelog` (fetched 2026-04-25). Schema uses `z.url()` for `repo` (code), `listen` (music). Plan does NOT need to re-verify this.

7. **`glob` pattern syntax** — `https://docs.astro.build/en/reference/content-loader-reference/` (fetched 2026-04-25) shows `pattern: "**/*.(md|mdx)"` (extglob) as canonical example; research-doc uses `"**/*.{md,mdx}"` (brace). Spec choice: **brace form**. Plan verifies via a unit test that BOTH forms match the same fixture set; if they diverge, brace form wins (and we file an issue against the docs). Also verify that the Astro fixture-collection's micromatch flavour supports brace expansion (it does, via `picomatch` / `tinyglobby` — but verify in the actual install).

8. ~~**Stryker + Bun compatibility**~~ **Resolved at spec polish 2026-04-25.** `bunx stryker --version` → `9.6.1`, exit 0. `npx stryker --version` → `9.6.1`, exit 0. Both invocations work. Spec uses `bunx stryker run` for consistency with the repo's `bunx`-first convention. The nightly CI job requires only `oven-sh/setup-bun@v2`; `actions/setup-node@v4` is NOT required for Stryker (unlike LHCI which spawns Chromium via Node). Probe: `bun add -D @stryker-mutator/core@^9` in a clean `/tmp` dir installed `9.6.1` in 1.98 s.

9. **Stryker's vitest runner config under happy-dom** — happy-dom is the Phase 0 vitest env. Verify `@stryker-mutator/vitest-runner` runs vitest in happy-dom mode end-to-end, or whether mutation-tested files (schema + query helpers — pure logic, no DOM) need a Node-only vitest project to keep mutation runs fast. Source: `https://stryker-mutator.io/docs/stryker-js/vitest-runner/`. Plan resolves whether to run Stryker against the full vitest config or a scoped `vitest.mutation.config.ts`.

10. **MDX-with-frontmatter-only files vs MDX-with-JSX** — Phase 1 ships content that is **mostly** frontmatter + prose body. JSX-in-MDX (custom components, expressions) is Phase 3. Plan must either (a) lint-block JSX expressions in Phase 1 fixtures via a remark plugin / pre-commit grep, or (b) document that JSX in `.mdx` is **allowed but unused** (renderers won't process it because Phase 1 ships no detail pages). Spec preference: **allow JSX in fixtures, never render the body** — the card grid only reads frontmatter via `data`, not the body.

11. ~~**Card click target / `<a>` href**~~ **Resolved in spec body 2026-04-25.** See § "Card visual contract / Card click target" above and ADR 0011. Decision: `<a href={externalUrl}>` when an external URL field is present (priority: `repo` → `youtube` → `listen` → `arxiv` → `pdf`); otherwise `<article>` (no link). `href="#"` placeholder is rejected (Axe SC 2.1.1 risk); `aria-disabled` is rejected (confusing AT interaction with no action). Phase 3 replaces `<article>` cards with detail-page links.

12. **Where do fixtures live in production builds?** Spec proposes `tests/fixtures/content/works/` outside `src/content/works/`. But the discriminated-union schema lives on a `glob` rooted at `./src/content/works`. Resolve: do fixtures live under `src/content/works/` with `draft: true` (and rely on the production filter to hide them), OR under `tests/fixtures/` with a separate test-only collection? Spec preference: **fixtures under `src/content/works/` with `draft: true`** — keeps the production schema honest and lets visual-regression render them in dev/preview without a separate loader. Trade-off: `tests/fixtures/` strictly outside `src/` is cleaner; plan picks one with a stated reason.

13. **`@fast-check/vitest` peer-dep range vs Vitest version** — `@fast-check/vitest@^0.4` declares a `peerDependencies` range for `vitest`. The Phase 0 vitest install must satisfy that range. Verify at plan-write by running `bunx jq '.peerDependencies' node_modules/@fast-check/vitest/package.json` (after `bun install` with the new deps) and confirming the installed vitest version (currently pinned in `packages/site/package.json`) falls within the declared range. If it doesn't, bump vitest or pin `@fast-check/vitest` to a compatible version and cite the reason.

14. **`@astrojs/mdx` behavior under Bun's Vite loader** — `@astrojs/mdx@5.x` is a Vite plugin integration. Under Bun's bundler (which Astro 6 uses via `output: 'static'` + the Vite Bun plugin), verify that a stub `.mdx` file with YAML frontmatter and a short prose body builds to HTML without error. Verify at plan-write by adding `@astrojs/mdx` to the Phase 1 dev install and running `bun run build` against a single fixture MDX file. Failure mode to watch for: missing Vite transform for `.mdx` → build error or empty body. Source: `https://github.com/withastro/astro/blob/main/packages/integrations/mdx/CHANGELOG.md` (fetched 2026-04-25); `https://docs.astro.build/en/guides/integrations-guide/mdx/` (fetched 2026-04-25).

## Sources (URL + access date)
- `2026-04-25-general-plan` § "Phase 1 — Card Grid MVP" (lines 172–260).
- `https://docs.astro.build/en/guides/content-collections/` (fetched 2026-04-25): canonical config filename `src/content.config.ts`; `defineCollection` from `astro:content`; `z` from `astro/zod`; `glob({ pattern, base })` from `astro/loaders`; draft-filter pattern with `import.meta.env.PROD`.
- `https://docs.astro.build/en/guides/upgrade-to/v6/` (fetched 2026-04-25): Astro 6 ships Zod 4; `z` import path is `astro/zod`; `z.string().url()` → `z.url()`; `z.string().email()` → `z.email()`; `.default()` must match output type; error message API moved from `{ message }` to `{ error }`.
- `https://astro.build/blog/astro-6/` (fetched 2026-04-25): Zod 4 powers content schema validation in Astro 6; canonical import is `import { z } from 'astro/zod'`.
- `https://docs.astro.build/en/reference/content-loader-reference/` (fetched 2026-04-25): `glob()` signature `(options: GlobOptions) => Loader`; `pattern: string | string[]`; `base: string | URL` (default `"."`); `generateId` optional; `retainBody` default `true`. Example pattern `"**/*.(md|mdx)"` (extglob); brace form `"**/*.{md,mdx}"` is also valid micromatch.
- `https://zod.dev/api` (fetched 2026-04-25): `z.discriminatedUnion("status", [...])` signature unchanged from Zod 3.
- `https://zod.dev/v4/changelog` (fetched 2026-04-25): string-format methods (`.url()`, `.email()`, `.uuid()`, etc.) moved from `ZodString` instance to top-level `z` namespace; `z.coerce.*` input type now `unknown`.
- `https://github.com/withastro/astro/blob/main/packages/integrations/mdx/CHANGELOG.md` (fetched 2026-04-25): `@astrojs/mdx@5.0.1` set `peerDependencies.astro` to `6.0.0`; the 5.x line is the Astro-6-aligned major.
- `https://docs.astro.build/en/guides/integrations-guide/mdx/` (fetched 2026-04-25): install via `npx astro add mdx` or manual `npm install @astrojs/mdx`; register via `integrations: [mdx()]` in `astro.config.*`. (Page itself shows v5.0.3 example; matches the Astro-6 line.)
- `https://github.com/stryker-mutator/stryker-js/releases` (fetched 2026-04-25): StrykerJS `v9.6.1` is the latest stable as of 2026-04-10.
- `https://github.com/dubzzz/fast-check/releases` (fetched 2026-04-25): `fast-check@4.7.0` is the latest stable major (April 2025); `@fast-check/vitest@0.4.0` is the current vitest binding.
- `https://stryker-mutator.io/docs/stryker-js/getting-started/` (fetched 2026-04-25): install via `npm init stryker@latest`; vitest runner package exists; documented prerequisites are Node + npm (Bun support not documented in official docs; empirical probe 2026-04-25 confirmed `bunx stryker --version` exit 0 — OQ#8 resolved).
- `packages/specs/specs/00-foundations.md` — Phase 0 spec (pattern reference, invariants).
- `packages/specs/plans/00-foundations.md` — Phase 0 plan (pattern reference).
- `packages/specs/adrs/0006-defer-stryker-and-fast-check-to-phase-1.md` — Phase 0 ADR that promised Stryker + fast-check land here.

## Reviewer briefing (paste verbatim into the spec-review Task prompt)
> This is the spec for Phase 1 of the utofme project. **Read `CLAUDE.md` first** ("Verify-or-not", "Disagreement protocol", "Inline-fix gate", review-round cap = 1, "Library version policy"). Use `mcp__codebase-memory-mcp__*` before Grep/Glob; **context7 is currently disconnected — use WebFetch / WebSearch / `gh` for ALL library / API verification.** Plan doc `2026-04-25-general-plan` uses `pnpm` — substitute `bun`. Output must be falsifiable: cite file:line + URL with access date. Tag findings as **blocker** vs **nit**. Apply the inline-fix gate from `CLAUDE.md`. **Specifically scrutinize:**
> 1. Whether the schema shape (OQ#6 resolved: `z.url()` confirmed; OQ#2: discriminated-union via `astro/zod` re-export) is correctly verified against the **live install** Astro 6 will provide. OQ#1 (narrowing), OQ#3 (z.coerce.date), OQ#5 (cover schema-only), OQ#6 (z.url), OQ#8 (bunx stryker), OQ#11 (card href) are all **resolved in the spec body** — do not re-open them.
> 2. Whether the 0 KB JS gate genuinely holds with `@astrojs/mdx` installed (the integration is build-time only; runtime impact should be zero — verify the `dist/_astro/*.js` glob still empty).
> 3. Whether the success criteria are falsifiable as written (every line is a command + expected outcome).
> 4. Whether the 14 Open Questions are exhaustive — 6 are resolved inline (OQ#1, #3, #5, #6, #8, #11); 8 remain for plan-write (OQ#2, #4, #7, #9, #10, #12, #13, #14). Flag any API the spec names without verification.
