# Phase 2 — Interactivity

## Goal

Promote the static card grid to an **interactive** experience while preserving Phase 1's invariants on routes that don't opt in. The grid on `/` and `/works` gains a **URL-synced filter+sort bar** (Svelte 5 island, `client:load`); a new `/search` route ships **Pagefind** local search; a global **⌘K command palette** (Svelte 5 island, `client:idle`) provides keyboard navigation, search, and theme/copy actions; the works grid gets a **hover/focus preview popover** and a site-wide **`<ClientRouter />`** view-transition with **staggered card animation**. With JavaScript disabled, every Phase 1 acceptance criterion still holds — filter/search/palette are progressive enhancements layered on the existing static grid.

## Context / invariants

- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**, **Svelte 5 (runes)** islands. Phase 1 merge commit `be54c7a` is the branch base; current branch is `phase/02-interactivity`.
- Output remains `static`. **No SSR introduced in Phase 2.** No Astro Cloudflare adapter installed.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12**; **TypeScript** `strict` + `astro/tsconfigs/strictest`; CI gates `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (lefthook only) for `.astro` / `.svelte`.
- **Phase 0 + 1 invariants carry over and remain green:** all seven lefthook steps pass; LHCI mobile ≥ 95 on `/` AND `/works` AND `/search`; Axe-core zero violations on every shipped route; visual-regression stable; `bun run check:docs` exits 0 for every new exported symbol.
- **Library version policy** (CLAUDE.md): latest stable major is the default. New deps in this phase pin to current latest at plan-write.
- **Svelte 5 (runes)**: this is the phase that **first registers** `@astrojs/svelte` in `astro.config.mjs`. Phase 0 declared the dep but did NOT register the integration (0-KB-JS first-load invariant for `/`). Phase 2 registers it. Per-route 0-KB-JS gate is **relaxed** for routes that hydrate islands — see "0 KB JS gate scope" below.
- **Svelte 5 (runes) only.** No legacy reactive-let. State stores via `$state` / `$derived` / `$effect`.
- **Existing Phase 0 layout primitives** (`<Stack>`, `<Cluster>`, `<Grid>`, `<Frame>`) and Phase 1 components (`<Card>`, `<TypeGlyph>`, `<MetaPills>`, thumbs) are **the only layout/visual primitives the new islands compose with.** Phase 2 does not introduce a sixth Astro layout primitive.
- **Discriminated-union schema** (`packages/site/src/content.config.ts`) and **typed query helpers** (`packages/site/src/lib/works.ts`) are the input source for both filter UI and Pagefind index metadata. Schema additions are out of scope; only **read paths** widen.
- `import.meta.env.PROD` gates draft visibility (Phase 1 invariant).
- **Repo hygiene:** every new exported function/class/component must carry TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line — `bun run check:docs` enforces it.
- **Branching:** all Phase 2 batches land on `phase/02-interactivity` → PR → CI green → **merge commit** (no squash, no rebase) into `main`. Tag `phase-2` on the merge SHA.

### 0 KB JS gate scope (relaxed for Phase 2)

- `/` and `/works`: **interactive** (FilterBar `client:load` hydrates). The 0-KB-JS post-build glob check (`scripts/no-js-check.ts`) is **renamed** `scripts/route-budget-check.ts` and now enforces a **per-route JS budget** via the existing `.size-limit.cjs`:
  - `/` and `/works`: ≤ **30 KB** gzipped first-load JS (FilterBar + Svelte runtime + ⌘K idle stub).
  - `/search`: ≤ **120 KB** gzipped first-load JS (Pagefind UI bundle is the dominant contributor).
- The literal "zero `.js` chunks under `dist/_astro/`" assertion is **retired** for Phase 2; replaced by per-route gzipped JS budgets in `.size-limit.cjs`. Phase 1's home/works **CSS+HTML** budgets (≤ 60 KB gzipped) are **unchanged**.
- Stryker thresholds and fast-check coverage from Phase 1 carry over and apply to new logic modules added in this phase.

## Non-goals

- **No SSR routes** and **no Cloudflare adapter.** Static output remains the default. → Phase 4.
- **No image optimization pipeline.** No `astro:assets`, no `<Image />`, no `sharp`. → Phase 3.4.
- **No detail pages per work.** Cards continue to link out via Phase 1's external-URL priority chain (`<a href={externalUrl}>`); Phase 2 does NOT introduce a `/works/[slug]` route. → Phase 3.x.
- **No Twoslash / Shiki / Sandpack / Expressive Code.** → Phase 3.1 / 3.3.
- **No webmentions, RSS, sitemap, slash pages.** → Phase 4 / 6.
- **No theme toggle.** Phase 2 ships only color-scheme detection via media query; ⌘K palette has a "Toggle theme" action stubbed but disabled until Phase 6 (IndieWeb polish) ships theme persistence per general-plan line 51 phase numbering.
- **No backend search service** (Algolia, Meilisearch, Typesense). Pagefind only.
- **No service worker / offline cache.** → Phase 6.
- **No multi-locale / i18n.** → out of plan.
- **No URL-state library** (`nuqs`, `svelte-url`). A ~30-line repo-local helper wraps `URLSearchParams` + `history.replaceState` per general-plan recommendation. ADR 0012 documents the choice **and** the multi-value tag encoding decision (see § Interfaces).
- **No persistence** of filter/sort beyond the URL. No `localStorage`, no cookies.

## Interfaces

> **Note on code/CSS snippets in this section:** snippets are *verified API surfaces* (import paths, function signatures, integration names) per context7 + Astro 6 docs fetched at spec-write 2026-04-26 — not implementation prescriptions. The plan refines exact form, names, and composition.

### Top-level paths added (predicted; the plan refines)

- `packages/site/src/components/FilterBar.svelte` — Svelte 5 island. `client:load`. Reads URL search params, writes back via `history.replaceState`, dispatches a `CustomEvent("works:filter")` consumed by the grid update path. **Listener teardown contract:** all document-level event listeners attach via Svelte 5 `$effect` returning a teardown; `astro:before-swap` fires the teardown before the body is replaced. Verified by Playwright: `document.eventListeners.length` (probed via Chrome DevTools Protocol) does not grow on repeat navigation `/` ↔ `/works`.
- `packages/site/src/components/CommandPalette.svelte` — Svelte 5 island. `client:idle` + `transition:persist` (per Astro 6 view-transitions docs, fetched 2026-04-26: a persisted island keeps DOM + state across navigations). ⌘K / Ctrl-K opens overlay. Loaded into `BaseLayout` so it is available site-wide. On mount, fires `window.dispatchEvent(new Event("palette:ready"))` so e2e tests can synchronise to a wall-clock anchor.
- `packages/site/src/components/Preview.svelte` — Svelte 5 island. `client:visible`. Renders a floating popover on card hover/focus (summary + date) honouring `prefers-reduced-motion`.
- `packages/site/src/components/SearchBox.astro` — wraps `<Search>` from `astro-pagefind/components/Search` for the `/search` page; provides our shell + a "no results" panel.
- `packages/site/src/lib/url-state.ts` — typed helper around `URLSearchParams` + `history.replaceState`. Exports: `readState()`, `writeState(partial)`, `subscribe(listener)`, `canonicalize(state)`. ~30–60 LOC. Every export TSDoc'd. **Multi-value tag encoding: repeated key (`?tag=a&tag=b`)**, NOT comma-separated. Reason: `URLSearchParams.getAll("tag")` is the canonical browser API for repeated keys; comma-separated would conflict with literal commas in tag names. Captured in ADR 0012.
- `packages/site/src/lib/filter.ts` — pure functions over `WorkEntry[]`: `filterByType`, `filterByTag`, `filterBySearch?` (text-only fallback when Pagefind isn't loaded), `applyFilters(entries, state)`. Mutation-tested.
- `packages/site/src/lib/keymap.ts` — keyboard binding helpers: `isMod(e)` (cmd on mac, ctrl on others), `parseChord(spec)`, `bindGlobalChord(spec, handler)` returning a teardown. Mutation-tested.
- `packages/site/src/pages/search.astro` — `/search` route. Uses `BaseLayout` + `<SearchBox>`.
- `packages/site/src/layouts/BaseLayout.astro` — **modified**: adds `<ClientRouter />` (from `astro:transitions`) inside `<head>`, mounts `<CommandPalette client:idle />` once.
- `packages/site/src/pages/index.astro` — **modified**: mounts `<FilterBar client:load>` above the works grid; preserves Phase 0 e2e sentinels and Phase 1 grid markup.
- `packages/site/src/pages/works/index.astro` — **modified** symmetrically: mounts `<FilterBar client:load>` above the grid.
- `packages/site/src/components/Card.astro` — **modified**: adds Pagefind index attributes per [Pagefind docs (fetched 2026-04-26)](https://pagefind.app/docs/metadata/) — `data-pagefind-meta="date,summary,title"` for **non-filterable display strings** (rendered in result rows); `data-pagefind-filter="type"` and one `data-pagefind-filter="tag"` per tag for **facetable** fields. Phase 2 ships **no facet UI** on `/search` (results show metadata only); the `data-pagefind-filter` attributes are added now to keep the index schema-correct for Phase 3+. Adds `transition:name={`card-${id}`}` for view-transition scoping, `data-preview-target` so the `<Preview>` island can attach. **Phase 1 invariant carried forward:** the CSS-only `outline: 1px solid currentColor` on hover/focus-visible (`01-card-grid-mvp.md:135`) remains active **simultaneously** with the popover — they are independent visual layers; both pass Axe and visual-regression. Popover uses `pointer-events: none` so hover-on-popover does not block the underlying card link click.
- `packages/site/astro.config.mjs` — **modified**: adds `svelte()` and `pagefind()` to `integrations`.
- `packages/site/scripts/no-js-check.ts` — **retired** (Phase 1's "zero `.js` chunks" gate is replaced by per-route `size-limit` budgets; ADR 0016). The script is deleted; budgets now live entirely in `.size-limit.cjs`.
- `packages/site/.size-limit.cjs` — **modified**: per-route JS budgets added (`/`, `/works`, `/search`), CSS+HTML budgets retained.
- `packages/site/lighthouserc.cjs` — **modified**: `url:` array adds `http://localhost:4321/search/`.
- `packages/site/tests/unit/url-state.test.ts` — vitest + fast-check round-trip / canonicalization properties.
- `packages/site/tests/unit/filter.test.ts` — vitest + fast-check filter idempotence / order-independence / monotonicity.
- `packages/site/tests/unit/keymap.test.ts` — vitest unit for `parseChord` + `isMod`.
- `packages/site/tests/e2e/filter.spec.ts` — Playwright: chip click → URL update → grid update → back-button → state restored. Also `javaScriptEnabled: false` parity check.
- `packages/site/tests/e2e/search.spec.ts` — Playwright (built preview only): query "synthesizer" → ≥ 1 music result; first-load JS for `/search` ≤ budget.
- `packages/site/tests/e2e/palette.spec.ts` — Playwright: ⌘K opens within 100 ms of `client:idle`; fuzzy match; Esc closes; focus trap.
- `packages/site/tests/e2e/preview.spec.ts` — Playwright: hover card → popover renders; `prefers-reduced-motion` disables animation.
- `packages/site/tests/e2e/transitions.spec.ts` — Playwright: navigate `/` → `/works` → no full-page reload; card `transition:name` morphs.
- `packages/site/.dependency-cruiser.cjs` — **modified** to allow Svelte components to import from `src/lib/`.
- `packages/site/knip.jsonc` — **modified**: `astro-pagefind` and any new dev deps added to the appropriate carve-outs as needed.

### Verified APIs (context7 / Astro 6 docs, fetched 2026-04-26)

- `import { ClientRouter } from "astro:transitions";` — site-wide view transitions; mount inside `<head>` of `BaseLayout`. (Renamed from `<ViewTransitions />`; event timing changed — plan must verify any `astro:after-swap` hooks.) Source: `https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/view-transitions.mdx`.
- `import svelte from "@astrojs/svelte";` + `integrations: [svelte()]` — Svelte 5 integration. Source: `https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/integrations-guide/svelte.mdx`.
- `import pagefind from "astro-pagefind";` + `integrations: [pagefind()]` — Pagefind integration. Indexes after build, serves last index during dev.
- `import Search from "astro-pagefind/components/Search";` + `<Search id="search" className="..." uiOptions={{ showImages: false }} />` — Search component shell.
- Astro `client:*` directives: `client:load` (FilterBar), `client:idle` (CommandPalette), `client:visible` (Preview).
- `transition:name={...}` and `transition:animate={...}` — per-element view-transition opt-in.

### New pinned dev deps (latest stable; resolved at plan-write)

- `astro-pagefind` ^1 (current `1.x` line; latest exact pinned at plan-write).
- `pagefind` ^1.x — peer of `astro-pagefind`; the underlying static-search engine.
- **No `@astrojs/svelte` bump** — already declared in Phase 0 (`^7`), just not registered in config.
- **No `cmdk-sv` install in Phase 2.** The command palette is **rolled in-house** (~150–200 LOC) in `CommandPalette.svelte`. Reasons: (a) Svelte 5 ports of `cmdk-sv` and `svelte-command-palette` had inconsistent maintenance signals at spec-write (general-plan § Batch 2.3 evaluation matrix); (b) we already need `keymap.ts` for chord parsing — fold list-rendering on top; (c) zero new dep, zero peer-dep risk; (d) Phase 2 § "What to cut first" lists ⌘K as the cheapest-to-cut item, so minimizing supply-chain surface is the right call. ADR 0014 documents the choice.
- **No `nuqs` / `svelte-url` install** — repo-local `url-state.ts` (~30 LOC) per ADR 0012.

### New runtime deps

- None directly. (`pagefind` is invoked at build time and ships its own runtime chunks via the integration; it is not imported as a normal ESM module from src.)

### No new Cloudflare bindings

- None. Static-only continues. Pagefind index is plain static assets under `dist/pagefind/`.

### Build-time external fetches

- `pagefind` runs **after** `astro build` over `dist/`. No external network calls. Indexing uses local HTML.

## Success criteria (falsifiable)

Each line is a concrete pass/fail check. Plan must wire each into CI.

### Build / install / typecheck

- [ ] `bun install` resolves cleanly with the new dev deps; `bun.lock` text-format committed.
- [ ] `bun run dev` serves `/`, `/works`, `/search` on `localhost:4321` with no console errors.
- [ ] `bun run build` produces `packages/site/dist/index.html`, `packages/site/dist/works/index.html`, `packages/site/dist/search/index.html`, AND a `packages/site/dist/pagefind/` directory containing the index.
- [ ] `bun run preview` (`wrangler dev` against built `dist/`) returns HTTP 200 for `/`, `/works`, `/search`, AND `/pagefind/pagefind.js` with `Content-Type: application/javascript`.
- [ ] `bun x astro check` exits 0.

### Lint / format / hygiene

- [ ] `bun x biome check .` exits 0.
- [ ] `bun x prettier --check '**/*.{astro,svelte}'` exits 0.
- [ ] `bun x type-coverage --at-least 100 --strict` exits 0.
- [ ] `bun x knip` reports zero unused (deps, exports, files) — `astro-pagefind` is a `package.json` dep, registered in config, so it is *used*.
- [ ] `bun x depcruise --validate .dependency-cruiser.cjs packages/site/src` exits 0.
- [ ] `bun run check:docs` exits 0 — every new exported symbol has TSDoc with `@see` / `@issue` / `Why:`.

### Per-route JS budgets

- [ ] `.size-limit.cjs` declares per-route gzipped first-load JS budgets for `/` (≤ 30 KB), `/works` (≤ 30 KB), `/search` (≤ 120 KB).
- [ ] `bun x size-limit` exits 0 against built `dist/`.
- [ ] CSS+HTML budgets from Phase 1 (`/` and `/works` ≤ 60 KB gzipped) remain green.

### Functional — FilterBar (`/`, `/works`)

- [ ] `?type=video` shows only video cards; URL canonicalized (default values omitted).
- [ ] Multi-tag union via `?tag=a&tag=b` (or comma-separated — plan picks one and documents). Empty result set renders an "empty" panel with reset link.
- [ ] `?sort=title` toggles the order; reload preserves it.
- [ ] Browser back/forward restores prior filter state without full-page reload (`history.replaceState` is used for in-page updates; explicit chip clicks may use `history.pushState` so back works — plan resolves).
- [ ] **JS disabled**: full grid renders (no JS-blocked layout shift, no console error). FilterBar UI is hidden (`hidden` attribute removed by the island on mount, with `nojs` fallback).
- [ ] A11y: chips are `<button>` with `aria-pressed` reflecting selection; reset is a `<button>`. Axe-core zero violations.

### Functional — Search (`/search`)

- [ ] Pagefind index built into `dist/pagefind/` with one entry per non-draft work + one per page (≥ 12 entries on the 10-fixture corpus).
- [ ] **Draft exclusion:** with `import.meta.env.PROD === true`, no Pagefind index entry's `meta.title` matches a draft fixture's title. Asserted in `tests/e2e/search.spec.ts`: query the fixture-known-draft title → expect 0 results.
- [ ] Searching `synthesizer` returns ≥ 1 music result.
- [ ] Searching `nonexistent-token-zzz` shows the no-results panel.
- [ ] First-load JS for `/search` ≤ 120 KB gzipped (size-limit gate).
- [ ] A11y: `role="search"`, query input has `<label>`, results announce count via `aria-live="polite"`.
- [ ] Search works only on **built preview** (Pagefind-by-design); spec documents and plan tests `bun run dev` shows a graceful "search unavailable in dev" panel.

### Functional — Command palette (⌘K)

- [ ] After `page.waitForEvent("console", { predicate: ... })` OR `page.waitForFunction(() => window.__paletteReady === true)` resolves on cold-load (set by the Svelte mount via `palette:ready`), ⌘K (mac) / Ctrl-K (others) opens within **100 ms** of the keypress (`page.keyboard.press('Meta+K')` → `expect(palette).toBeVisible({ timeout: 100 })`).
- [ ] Esc closes the palette and returns focus to the trigger.
- [ ] Typing `abot` highlights "About" (placeholder action for now — plan resolves the action set).
- [ ] Up/Down navigate; Enter activates; ⌘Enter opens in new tab.
- [ ] Focus is trapped inside the palette while open; Tab cycles within.
- [ ] Closes on outside click.
- [ ] Screen-reader announces "Command menu open" via `aria-live`.
- [ ] Bundle: palette adds ≤ 12 KB gzipped to first-load JS on `/` and `/works` (subset of the 30 KB budget; 12 KB chosen to leave headroom for the Svelte 5 runtime share + focus-trap helper).
- [ ] Focus trap correctness: with palette open, Tab cycles strictly within palette children; Shift+Tab from the first child moves to the last; Tab from the last child moves to the first. Asserted in `tests/e2e/palette.spec.ts`.
- [ ] A11y: dialog has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Axe-core zero violations.

### Functional — Hover preview

- [ ] Hover (or keyboard focus) on a card shows the popover within **50 ms**.
- [ ] `prefers-reduced-motion: reduce` disables the popover **animation** but the popover still appears (information parity).
- [ ] Popover content: title, date, type badge, AND `summary` if present. Popover renders gracefully when `summary` is absent (Phase 1 schema makes `summary` optional — `01-card-grid-mvp.md:89`); a fixture with `summary: undefined` is asserted in `tests/e2e/preview.spec.ts`.
- [ ] Popover uses `pointer-events: none`; click-through to the underlying card link is preserved — verified in `tests/e2e/preview.spec.ts`: hover card → wait for popover → click card → expect navigation to the card's external URL.
- [ ] Hides on blur / mouse-leave / Esc.
- [ ] A11y: popover has `role="tooltip"`, `aria-describedby` chain from card → popover.

### Functional — View transitions

- [ ] `<ClientRouter />` mounted in `BaseLayout`.
- [ ] Navigating `/` ↔ `/works` does not produce a new `PerformanceNavigationTiming` entry (`page.evaluate(() => performance.getEntriesByType('navigation').length)` stays constant) AND `astro:page-load` fires once per nav (single SPA navigation). The `<body>` IS replaced by ClientRouter's swap algorithm — the test does NOT use a body-MutationObserver.
- [ ] Cards with the same `transition:name="card-${id}"` morph between routes when the same work is in both grids (it is, since `/works` lists everything).
- [ ] Staggered card animation on first paint via CSS `animation-delay: calc(var(--i) * 30ms)` — `--i` set inline by the grid loop. Under `page.emulateMedia({ reducedMotion: 'reduce' })`, `getComputedStyle(card).animationDelay === '0s'` for every card on `/` and `/works` (asserted in `tests/e2e/transitions.spec.ts`). Browser-native View Transitions auto-disable under reduced-motion (no CSS rule needed for the morph itself).
- [ ] No regression in LHCI mobile ≥ 95 on `/`, `/works`, `/search`.

### Performance / Lighthouse

- [ ] LHCI mobile Performance ≥ 0.95 on `/`, `/works`, `/search` (5-run optimistic, mobileSlow4G throttling).
- [ ] LHCI Accessibility = 1.0 on the same routes.
- [ ] No CLS regression on the works grid (FilterBar mounts above-the-fold without pushing cards).

### Tests

- [ ] Vitest: `url-state.test.ts`, `filter.test.ts`, `keymap.test.ts` — green.
- [ ] fast-check property tests (see § Property tests).
- [ ] Stryker mutation score on critical modules ≥ 80 % (see § Critical modules).
- [ ] Playwright e2e: `filter`, `search`, `palette`, `preview`, `transitions` — green on built preview.
- [ ] Visual-regression: re-recorded baselines for `/` (with FilterBar), `/works`, `/search`. Mask widened where the FilterBar lives.
- [ ] Phase 0 + Phase 1 e2e remain green.

### Branch / merge

- [ ] `git push origin phase/02-interactivity` → PR opened → CI green → **merge commit** (no squash, no rebase) into `main` → `phase-2` tag on the merge SHA → `*.workers.dev` redeploys.

## Critical modules (mutation-tested)

Stryker nightly extends to:

1. `packages/site/src/lib/url-state.ts` — round-trip of `readState`/`writeState`/`canonicalize`. Mutating canonicalization (e.g., flipping the "omit defaults" condition) MUST be caught by a property test.
2. `packages/site/src/lib/filter.ts` — `applyFilters` selector logic. Mutating the `&&` between type and tag predicates MUST be caught. **Scope boundary:** `applyFilters` does NOT call into Phase 1's `lib/works.ts:sortByDateDesc`. Sort is applied by the caller (the FilterBar render path), not inside `applyFilters`. Phase 1's `sortByDateDesc` Stryker scope is unchanged.
3. `packages/site/src/lib/keymap.ts` — `parseChord` + `isMod` platform detection. Mutating `e.metaKey` ↔ `e.ctrlKey` MUST be caught.

Out of scope for Stryker in Phase 2: `.svelte` files (Stryker can mutate `<script>` blocks but the cost/benefit on UI islands is poor; covered by Playwright instead), `.astro` files (unchanged from Phase 1's exclusion).

## Property tests (`fast-check`)

- **`url-state` round-trip** — for any `state ∈ FilterState`, `readState(writeState(state)) ≡ canonicalize(state)`. Validates idempotence + canonicalization stability.
- **`url-state` no-default leakage** — for any `state` whose value equals the default for its key, the URL produced by `writeState(state)` does NOT contain that key.
- **`filter` order-independence** — for any permutation `π`, `applyFilters(π(entries), state)` is a permutation of `applyFilters(entries, state)`. (Filter does not impose order; sort does.)
- **`filter` monotonicity** — adding a chip strictly narrows or holds the set: `|applyFilters(xs, s ∪ {c})| ≤ |applyFilters(xs, s)|`.
- **`filter` empty / total** — `applyFilters(xs, ∅) ≡ xs` and `applyFilters([], s) ≡ []`.
- **`keymap.parseChord`** — for any chord string `c`, parse-then-format yields the canonical form (case + key-order normalized). Round-trip property.
- **`keymap.parseChord` platform variant** — for any chord using `Mod` (e.g., `Mod+K`), `parseChord(chord, { platform: "mac" })` produces a matcher that fires on `metaKey: true, ctrlKey: false` events; `{ platform: "others" }` fires on `metaKey: false, ctrlKey: true` events. Mock event objects supplied by the property test (no real navigator dependency).

fast-check seed is fixed in CI for reproducibility (carry-over from Phase 1).

## Dependencies on previous phases

- **Phase 0** (merge `78fae86`) — Astro 6, TS strictest, lefthook, Vitest, Playwright, Axe, visual-regression, size-limit, LHCI, Astro Fonts API, layout primitives.
- **Phase 1** (merge `be54c7a`) — content-collection schema (`worksSchema`, discriminated union), `lib/works.ts` (`listWorks`, `sortByDateDesc`), `<Card>`, thumbs, `<TypeGlyph>`, `<MetaPills>`, fixtures, `/` + `/works` routes, e2e + visual-regression baselines, Stryker + fast-check installed.
- **Branch** must be cut from `be54c7a` on `main`. (Confirmed: `phase/02-interactivity` HEAD currently equals `be54c7a` at branch creation.)
- `@astrojs/svelte@^7` is already in `devDependencies` (Phase 0); Phase 2 only registers it in `astro.config.mjs`.

## ADRs to write (delivered with this phase)

- **`0012-url-state-roll-your-own`** — chose a ~30-line repo-local helper over `nuqs` (React-only, no Svelte port) and over `svelte-url` (abandoned, last commit > 18 months at spec-write — plan re-verifies). **Also captures the multi-value tag encoding choice: repeated key (`?tag=a&tag=b`) over comma-separated.** Source: general-plan lines 269–283 (Batch 2.1).
- **`0013-pagefind-over-fuse-minisearch`** — chose Pagefind for `/search` over Fuse.js / MiniSearch / Algolia / backend services. Reason: bundles a lazy chunked index, ≤ 100 KB first-load on hundreds of pages; Starlight's default; build-time-only; no runtime egress. Cost: search works on built preview only (no `bun run dev`). Source: `https://pagefind.app/`, `https://github.com/CloudCannon/pagefind`.
- **`0014-cmdk-rolled-in-house`** — chose to roll the ⌘K palette in `CommandPalette.svelte` (~150–200 LOC) over `cmdk-sv` / `svelte-command-palette` / `@mateothegreat/svelte5-command-palette`. Reason: Svelte 5 maintenance signals across the three options were inconsistent at spec-write (general-plan lines 308–321, Batch 2.3 evaluation matrix); we already need `keymap.ts`; ⌘K is the designated "cut first" item per general-plan § 5 line 706 ("What to Cut First"), so minimizing supply-chain surface is right-sized. Cost: ~150–200 LOC of accessibility plumbing (focus trap, ARIA). Focus-trap correctness is verified by the Playwright assertion in § Functional — Command palette.
- **`0015-client-router-and-staggered-animation`** — chose to add `<ClientRouter />` site-wide (Astro 6 view transitions) plus CSS-stagger + `transition:name` on cards over a JS-driven animation library. Reason: native CSS-stagger + browser view-transitions API give zero JS overhead; animated cards on first paint via CSS-only; cross-route morphing for shared cards. Source: `https://docs.astro.build/en/guides/view-transitions/` (fetched 2026-04-26). Cost: must verify `prefers-reduced-motion` handling (CSS-author surfaces only — browser-native morph auto-disables); must verify no `astro:after-swap` regressions for FilterBar state. **Phase 6 dependency note:** the "Toggle theme" action stubbed in the palette is gated behind Phase 6 (theme persistence) per general-plan Phase numbering 0–6 + opt-in 7.
- **`0016-route-budget-replaces-zero-js-gate`** — Phase 1's "zero `.js` chunks under `dist/_astro/`" hard gate is retired in favour of per-route gzipped JS budgets enforced by `size-limit`. Reason: Phase 2 introduces hydrated islands; the literal "zero JS" gate is no longer correct, but the **spirit** (route-by-route budget) is preserved. Budgets: `/` ≤ 30 KB, `/works` ≤ 30 KB, `/search` ≤ 120 KB. The gate is still **stricter** than the general-plan target of "100 KB for `/search`" — this is an intentional tightening.

## Open questions (each FIRES the verify-or-not rule before plan-write)

The plan-writer MUST resolve every question below with a context7 / WebFetch citation (URL + access date) and pin the answer in the plan doc.

1. ~~**`@astrojs/svelte@^7` Svelte-5-runes status**~~ **Resolved at spec polish 2026-04-26.** `@astrojs/svelte@^7` IS the Svelte-5 line per Astro docs: *"This Astro integration enables rendering and client-side hydration for your Svelte 5 components. For Svelte 3 and 4 support, install `@astrojs/svelte@5` instead."* Source: context7 `/withastro/docs` — `src/content/docs/en/guides/integrations-guide/svelte.mdx` (fetched 2026-04-26). No bump needed.

2. ~~**Pagefind metadata vs filter attributes**~~ **Resolved at spec polish 2026-04-26.** Pagefind exposes two distinct attribute classes — see § Interfaces / `Card.astro` line for the resolution. Plan only re-verifies the exact fixture mapping (which tag values become filter values).

3. **Pagefind dev-time behaviour** — confirm the integration's documented behaviour ("uses the last built index during dev"; first-time dev shows a graceful empty state). Plan resolves the dev-mode UX (the `/search` route's behaviour when no `dist/pagefind/` exists yet).

4. **`<ClientRouter />` event timing in Astro 6** — Astro 6 changed `astro:after-swap` timing. Verify whether the FilterBar's `client:load` hydration re-runs across navigations or persists. Source: `https://docs.astro.build/en/guides/view-transitions/`. Plan must wire FilterBar state into `astro:before-preparation` / `astro:after-swap` if state-loss is observed.

5. ~~**`transition:persist` vs re-mount for `<CommandPalette>`**~~ **Resolved at spec polish 2026-04-26.** `<CommandPalette>` uses `transition:persist` per Astro 6 view-transition docs (context7 `/withastro/docs` § "Maintaining state", fetched 2026-04-26: *"if that component exists on the next page, the island from the old page with its current state will continue to be displayed"*). Plan adds a Playwright assertion that palette open-state survives `/` → `/works` navigation. ⌘K listener attaches once at first hydration; teardown contract is unchanged because the island never unmounts during a session.

6. **Pagefind UI bundle size** — measure actual gzipped first-load JS for `/search` on the 10-fixture corpus. If > 120 KB the budget is wrong, not the implementation; spec amends with a verified number. The 120 KB is split in `.size-limit.cjs` as: Pagefind UI ≤ 100 KB + `<ClientRouter />` runtime ≤ 20 KB; if the split is impractical (because both ship via Astro's bundler), plan documents the inability and gates the combined number. Source: `bunx pagefind --help` + post-build measurement.

7. ~~**`type-coverage` / `check:docs` scope on `.svelte` / `.astro` files**~~ **Resolved at spec polish 2026-04-26.** TSDoc enforcement (`bun run check:docs`) and `type-coverage` are scoped to **`.ts` modules only** (`url-state.ts`, `filter.ts`, `keymap.ts`, plus all Phase 1 `.ts`). Svelte-component-prop docs and `<script lang="ts">` blocks in `.astro` are NOT in scope for the docs/coverage gates in Phase 2 — `astro check` is the type oracle for those. Reason: the existing `check:docs` ts-morph walker (Phase 0) was authored against `.ts`; widening it to parse `.svelte` / `.astro` is a Phase 6 polish item and out of scope here. Plan does NOT need to add a Svelte TSDoc gate.

8. ~~**URL state encoding for multi-value tags**~~ **Resolved at spec polish 2026-04-26.** Repeated-key (`?tag=a&tag=b`) — see § Interfaces / `url-state.ts` line. Captured in ADR 0012's body alongside the rolled-not-imported decision.

9. **`prefers-reduced-motion` honour propagation** — for the *CSS-author surfaces* (card stagger animation + Preview popover animation), a single `@media (prefers-reduced-motion: reduce)` block covers both. The browser-native View Transitions API auto-disables the morph under reduced-motion (not subject to the CSS rule). Plan provides one Playwright test per CSS-author surface: stagger (asserted at `tests/e2e/transitions.spec.ts`) and popover (asserted at `tests/e2e/preview.spec.ts`).

10. **Knip + Pagefind interaction** — `pagefind` is a peer of `astro-pagefind`. Knip may or may not need an explicit ignore. Plan resolves by running `bun x knip` after install and adding the ignore only if knip flags it. Source: `packages/site/knip.jsonc`.

11. **Visual-regression baseline strategy under view transitions** — `<ClientRouter />` injects `<style>` tags into `<head>` and adds attributes (`data-astro-transition`) that may break existing snapshots. Plan resolves: either re-record baselines with the router mounted, or mask the affected attributes via `mask-color`.

12. **`size-limit` JS-budget config shape** — `.size-limit.cjs` currently asserts CSS+HTML totals via `path: ["dist/index.html", "dist/_astro/*.css"]`. Plan resolves the exact `path:` glob for capturing first-load JS without double-counting (e.g., `dist/_astro/*.js` PLUS the inline scripts that Astro inlines for `client:load`). Source: `https://github.com/ai/size-limit#how-it-works`.
