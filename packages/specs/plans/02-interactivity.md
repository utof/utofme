# Phase 2 — Interactivity (Plan)

> Plan for `packages/specs/specs/02-interactivity.md` (Phase 2). All batches land on `phase/02-interactivity`. Execution via `/subagent-driven-development` (Sonnet workers); reviews by Opus.

## Prerequisites & assumptions

- Branch: `phase/02-interactivity` cut from `main` at `be54c7a`. (Confirmed.)
- Phase 1 invariants are green (lefthook 7-step, LHCI ≥ 95 on `/` + `/works`, Axe 0 violations, visual-regression baselines for `/` and `/works` recorded).
- Bun ≥ 1.2; Node ≥ 22.12.
- Pinned new deps (verified at plan-write 2026-04-26):
  - `astro-pagefind` `^1.x` (latest at install; readme on context7 shows `1.x` lineage). Plan worker re-verifies the exact patch via `bun add astro-pagefind` and pins from the lockfile.
  - `pagefind` `^1.x` — peer of `astro-pagefind`. **OQ#10 verified at plan-write:** `astro-pagefind`'s `package.json` lists `pagefind` as a `peerDependency`, so we explicitly install it. (Plan-worker will run `bun add astro-pagefind pagefind` together.)
- No bump to `@astrojs/svelte` (`^7` already present; OQ#1 resolved at spec polish).

## Resolved open questions (from spec § Open questions)

The following OQs were verified at plan-write 2026-04-26 and pinned here. Spec OQs that remain (#3, #4, #6, #11, #12) get resolutions below.

### OQ#3 — Pagefind dev-time behaviour
**Resolved.** From `astro-pagefind` README (context7 `/shishkin/astro-pagefind`, fetched 2026-04-26): the integration runs Pagefind after `astro build` and serves the **last-built** index during `bun run dev`. On a fresh clone with no prior build, `dist/pagefind/` does not exist and the `<Search>` component shows an empty results panel. **Plan**: `/search` displays a `<noscript>`-style fallback `<p data-pagefind-dev-fallback>Search becomes available after the first <code>bun run build</code>.</p>` shown when `window.pagefind` is `undefined` after 2 s; the e2e suite (`tests/e2e/search.spec.ts`) only runs against built preview, never `dev`.

### OQ#4 — `<ClientRouter />` event timing
**Resolved.** From context7 `/withastro/docs` view-transitions.mdx (fetched 2026-04-26): `astro:after-swap` fires immediately after the new page replaces the old; `astro:page-load` fires once new page is visible + blocking resources loaded; `astro:before-preparation` fires before navigation begins. **Plan**: FilterBar attaches its document listeners inside Svelte 5 `$effect(() => { ...; return teardown })`; teardown is invoked automatically when the island re-mounts after a route swap. Because FilterBar is `client:load` (NOT `transition:persist`), Astro re-instantiates it on each route arrival — the `$effect` lifecycle handles attach/teardown atomically without manual `astro:before-swap` wiring.

### OQ#6 — `/search` JS budget split
**Resolved.** Pagefind UI ships a single bundle from `dist/pagefind/pagefind-ui.js` plus the chunked index. Astro's bundler does NOT re-bundle these (they live under `dist/pagefind/`, not `dist/_astro/`). The `<ClientRouter />` runtime ships under `dist/_astro/`. **Plan**: `.size-limit.cjs` declares two separate entries for `/search`:
  - `entry "search-page-js"`: `dist/_astro/*.js` for the route — ≤ 30 KB gzipped (covers ClientRouter + any small client islands).
  - `entry "pagefind-ui"`: `dist/pagefind/pagefind-ui.js` (+ `pagefind.js` chunk) — ≤ 100 KB gzipped.
  - **Combined `/search` first-load JS** (page-js + pagefind-ui auto-loaded by `<Search>`) stays ≤ 120 KB per spec.

### OQ#11 — Visual-regression baseline strategy
**Resolved.** ClientRouter injects `<style data-astro-transition-scope="..."></style>` and may add `data-astro-transition-persist` attrs to `<body>`. **Plan**: re-record all visual-regression baselines (`/`, `/works`, `/search`) inside Task 12 — the same task that mounts `<ClientRouter />`. Use Playwright's `mask` option to hide the volatile transition-scope attrs only if pixel diff exceeds `maxDiffPixelRatio: 0.02` (current Phase 1 setting). No special masking expected for the `<style>` injection (it does not appear in body screenshots).

### OQ#12 — `size-limit` JS-budget glob shape
**Resolved.** `@size-limit/file` measures the gzipped byte size of the listed files **as a whole**; pointing one entry at `dist/index.html` captures HTML + inlined CSS + inlined scripts together. To avoid double-budgeting against the existing Phase 1 CSS+HTML budget on the same path, **JS budgets target externalised chunks only** (`dist/_astro/*.js`). Inlined micro-scripts emitted for `client:load` are small (< 1 KB each, per Astro behaviour) and ride within the existing CSS+HTML 60 KB budget; if measurement shows they push CSS+HTML over budget, plan amends per-task. **Plan: `.size-limit.cjs` entries:**
```js
[
  // Phase 1 carry-over (CSS+HTML combined per route)
  { name: "home css+html", path: ["dist/index.html", "dist/_astro/*.css"], gzip: true, limit: "60 KB" },
  { name: "works css+html", path: ["dist/works/index.html", "dist/_astro/*.css"], gzip: true, limit: "60 KB" },
  // Phase 2 additions
  { name: "search css+html", path: ["dist/search/index.html", "dist/_astro/*.css"], gzip: true, limit: "60 KB" },
  { name: "site js (all routes)", path: ["dist/_astro/*.js"], gzip: true, limit: "30 KB" },  // FilterBar + Preview + CommandPalette + Svelte runtime, shared
  { name: "pagefind ui js", path: ["dist/pagefind/pagefind-ui.js"], gzip: true, limit: "100 KB" },
]
```
Note: a single `site js` budget is used (not per-route) because Astro bundles `client:load` / `client:idle` / `client:visible` islands into shared chunks; per-route attribution is brittle. The 30 KB ceiling matches the spec's per-route 30 KB target.

---

## Task list (13 tasks)

Branching: each task is one commit on `phase/02-interactivity`. After every task, the lefthook + CI checks must remain green; each task's RED/GREEN tests must be visible in the commit history (test files added in the same commit as the implementation that makes them green, or in an immediate prior commit per TDD).

### Task 1 — Register integrations + BaseLayout already exists

**Goal:** Register `@astrojs/svelte` and `astro-pagefind` in `astro.config.mjs`. **`_BaseLayout.astro` already exists** (Phase 1) at `packages/site/src/layouts/_BaseLayout.astro` with the underscore prefix and is consumed by `src/pages/index.astro:13` and `src/pages/works/index.astro:11`. **No rename in Task 1** — keep the underscore filename to avoid touching Phase 1 import sites in the same commit. Subsequent tasks (10, 12) reference `_BaseLayout.astro` exactly. Confirm 0 KB JS first-load on `/` and `/works` is still met (no islands hydrated yet).

**Acceptance:**
- `bun run build` emits no new `<script>` chunks under `dist/_astro/` (no islands shipped in this commit; integrations register but no `client:*` directive yet exists in the source).
- `bun x astro check` exits 0.
- All Phase 0 + 1 e2e remain green.

**Files:**
- `packages/site/astro.config.mjs` — add `import svelte from "@astrojs/svelte"; import pagefind from "astro-pagefind";` and `integrations: [mdx(), svelte(), pagefind()]`.

**Note:** `_BaseLayout.astro` is left untouched in Task 1. Tasks 10/12 add `<ClientRouter />` and `<CommandPalette>` mount inside `_BaseLayout.astro`.

**TDD:**
- RED: `tests/e2e/landing.spec.ts` already covers Phase 0 sentinels — re-run to confirm green after integrations register.
- GREEN: edit `astro.config.mjs` only.

**Hygiene:** `bun x knip` must remain green. `astro-pagefind` is registered in config → not unused. `pagefind` peer-dep gets installed in Task 11; if knip flags it now (before Task 11) raise the issue and add to `knip.jsonc` in this task.

---

### Task 2 — `lib/url-state.ts` + property tests

**Goal:** Tiny URL-state helper (~30–60 LOC). Pure functions — no DOM dependency in the export surface beyond `URLSearchParams` (which is universal).

**Files:**
- `packages/site/src/lib/url-state.ts` — exports `readState()`, `writeState(partial)`, `subscribe(listener)`, `canonicalize(state)`, plus a `FilterState` type.
- `packages/site/tests/unit/url-state.test.ts` — Vitest + `@fast-check/vitest` properties.

**Type / interface (informative — worker decides exact field names):**
```ts
export interface FilterState {
  type?: "code" | "video" | "music" | "math" | "writing";
  tags: string[];        // multi-value via repeated key
  sort: "date" | "title";
  search?: string;
}
export function readState(url?: URL | string): FilterState;
export function writeState(state: Partial<FilterState>): void;
export function canonicalize(state: FilterState): URLSearchParams;
export function subscribe(listener: (s: FilterState) => void): () => void;
```

**Multi-value encoding:** repeated key (`?tag=a&tag=b`) — see ADR 0012. `URLSearchParams.getAll("tag")` reads; `params.append("tag", v)` writes; canonicalization sorts tags alphabetically and omits the `tag` key entirely if empty.

**Default values (omitted from canonical URL):** `type=undefined` (no `type` key), `tags=[]` (no `tag` keys), `sort="date"` (default — omitted), `search=undefined` (no `q` key).

**TDD:**
- RED: write all four property tests first (round-trip, no-default-leakage, sort-canonicalization, subscribe-fires-on-change). Run `bun x vitest run` — confirm all RED.
- GREEN: minimal implementation.
- REFACTOR: dedupe canonicalization between `writeState` and `canonicalize` (writeState uses canonicalize internally).

**Stryker:** add `src/lib/url-state.ts` to `stryker.conf.json` `mutate` array. Threshold: `≥ 80%`.

**TSDoc:** every export carries `Why:` line. `check:docs` enforces.

---

### Task 3 — `lib/filter.ts` + property tests

**Files:**
- `packages/site/src/lib/filter.ts` — exports `filterByType<E>`, `filterByTag<E>`, `filterBySearch<E>`, `applyFilters<E>(entries, state)`.
- `packages/site/tests/unit/filter.test.ts` — properties: order-independence, monotonicity, empty/total, idempotence.

**Type:**
```ts
import type { WorkEntry } from "../content.config";
export type EntryLike<E extends WorkEntry = WorkEntry> = { data: E["data"] };
export function applyFilters<E extends EntryLike>(entries: readonly E[], state: FilterState): E[];
```

**Behaviour:**
- `state.type` filters by `entry.data.type === state.type` (default: pass-through).
- `state.tags` filters by **set inclusion**: `state.tags.every(t => entry.data.tags.includes(t))` (AND across selected tags). If `state.tags` is empty, pass-through.
- `state.search` is a no-op in this module (Pagefind handles search; `filterBySearch` is exported as a helper for the no-JS fallback grid which is not shipped in Phase 2 — kept as a stub returning the input for the grid path; Pagefind owns the `/search` route).
- **No sort** — sort is the caller's responsibility (FilterBar render path).

**TDD:** RED → GREEN → REFACTOR. Run all properties before any implementation lands.

**Stryker:** add `src/lib/filter.ts` to `mutate` array.

---

### Task 4 — `lib/keymap.ts` + property tests

**Files:**
- `packages/site/src/lib/keymap.ts` — `isMod(e: KeyboardEvent | { metaKey: boolean; ctrlKey: boolean }, platform?: "mac" | "others")`, `parseChord(spec: string)`, `bindGlobalChord(spec: string, handler: () => void): () => void`.
- `packages/site/tests/unit/keymap.test.ts` — fast-check round-trip + mac/others variant property.

**Detail:**
- `parseChord("Mod+K")` returns `{ key: "k", mod: true }`. The match function `match(e)` fires when `(platform === "mac" ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k"`.
- Platform detection: `navigator.platform` (or `navigator.userAgentData?.platform`) — `parseChord` accepts an explicit `platform` override for tests so no real navigator dependency is needed.
- `bindGlobalChord` attaches a `keydown` listener, returns a teardown.

**TDD:** RED → GREEN → REFACTOR.

**Stryker:** add `src/lib/keymap.ts` to `mutate` array.

---

### Task 5 — `<FilterBar.svelte>` island

**Goal:** Svelte 5 (runes) component reading URL state, dispatching filter events, writing back to URL via `writeState`.

**Files:**
- `packages/site/src/components/FilterBar.svelte` — `<script lang="ts">` using `$state`, `$derived`, `$effect`. Imports `readState`, `writeState`, `subscribe` from `$lib/url-state`. Renders type chips (`<button aria-pressed>`), tag chips, sort dropdown, reset button.
- `packages/site/tests/e2e/filter.spec.ts` — Playwright e2e (chip click → URL update → grid update → back-button → reset).

**Behaviour:**
- On mount: `let state = $state(readState());`. `$effect` subscribes to `popstate` to re-read URL; teardown removes the listener.
- On chip click: update `state.tags` / `state.type` / `state.sort`; call `writeState(state)`; dispatch `new CustomEvent("works:filter", { detail: state })` on `document`.
- Visible-only-with-JS: render with `data-filter-bar` and a sibling `<noscript>` style hides the bar in nojs; alternatively, the `hidden` attribute is removed only inside `onMount`. Choice: hidden-by-default + remove-on-mount (simpler, no `<noscript>` style needed; inline at top of file).

**FilterBar listens to `astro:after-swap` only if state-loss is observed** — verified in this task's Playwright run; if state survives navigation correctly, no manual wiring needed (per OQ#4 resolution).

**Grid update path (Astro page side):**
- The page renders the *full* card list server-side (Phase 1 behaviour).
- A small **`<script is:inline>`** in `index.astro` / `works/index.astro` (must be `is:inline` to skip Astro bundling and execute synchronously before paint, avoiding CLS — see `https://docs.astro.build/en/guides/client-side-scripts/#opting-out-of-processing`):
  - On document load AND on `astro:page-load` (Task 12 carry-over): read URL params, apply `[hidden]` to cards whose `data-type` / `data-tags` don't match.
  - Listen on `document` for `works:filter` → re-apply.
- This keeps the no-JS fallback (full grid renders, no `[hidden]`) and the JS path (filter via toggling `hidden`).
- The inline script is < 1 KB.

**TDD:**
- RED: `tests/e2e/filter.spec.ts` — six test cases:
  1. Click `type=video` chip → `?type=video` in URL → only video cards visible.
  2. Add `tag=synth` → `?type=video&tag=synth` → narrow further.
  3. Click reset → URL strips params; all cards visible.
  4. Back button restores prior filter (from step 2).
  5. With `javaScriptEnabled: false`, full grid renders, filter bar is hidden, no console error.
  6. **Hard-refresh on `?type=video`** (`page.goto('/?type=video')`) → only video cards visible BEFORE any user interaction (verifies the inline script reads URL on initial load, not just on `works:filter`).
- GREEN: implementation as above.

**A11y:** chips are `<button aria-pressed>`, sort is `<select>` with a label, reset is `<button>`. Axe-core integrated via existing harness.

**Bundle budget check:** after build, `bun x size-limit` reports `home-js` ≤ 30 KB and `works-js` ≤ 30 KB.

---

### Task 6 — Wire FilterBar into `/` and `/works` + visual-regression rebaseline

**Goal:** Mount `<FilterBar client:load>` above the works grid on `/` and `/works`. Preserve Phase 0 sentinels. Add `data-type` and `data-tags` to each Card output for the inline filter script. Re-record visual-regression baselines.

**Files:**
- `packages/site/src/pages/index.astro` — mount FilterBar, add inline filter script.
- `packages/site/src/pages/works/index.astro` — same.
- `packages/site/src/components/Card.astro` — emit `data-type={data.type}` and `data-tags={data.tags.join(",")}` on the outer element. (NOT the Pagefind attrs — those land in Task 8.)
- `packages/site/tests/e2e/landing.spec.ts` — assert FilterBar is present (visible) on cold load AND `data-test` sentinels still resolve.
- Visual-regression baselines re-recorded on this task.

**TDD:**
- RED: extend existing `tests/e2e/landing.spec.ts` with one assertion: `await expect(page.getByRole("toolbar", { name: "filter" })).toBeVisible();`. RED until FilterBar is mounted.
- GREEN: mount; visual-regression `--update-snapshots`.

**Note on Phase 0 sentinels:** `<h1>utofme</h1>`, hidden `<code>v1</code>`, `[data-test="typography-specimen"]` wrapper, Stack/Cluster/Frame markers — all preserved (Phase 1 invariant carry-over).

---

### Task 7 — `<Preview.svelte>` island

**Goal:** Hover/focus popover with `pointer-events: none`, `role="tooltip"`, reduced-motion honour.

**Files:**
- `packages/site/src/components/Preview.svelte` — `<script lang="ts">` using `$state` for visible-target id; renders absolutely-positioned popover. Listens for `mouseover` / `focusin` on `[data-preview-target]` elements (event delegation on `document`).
- `packages/site/tests/e2e/preview.spec.ts` — five test cases:
  1. Hover card → popover visible within 50 ms.
  2. Click card → navigation happens (popover does not block).
  3. Reduced-motion: `await page.emulateMedia({ reducedMotion: 'reduce' })`, hover card, assert popover is visible AND `getComputedStyle(popover).animationName === 'none'`.
  4. Esc closes popover.
  5. Card without `summary` (the new fixture variant) → popover renders without summary cleanly.

**Mount:** `<Preview client:visible />` page-level in `index.astro` and `works/index.astro` (NOT in `_BaseLayout.astro` — page-level mount is what naturally excludes `/search` without prop drilling). Earlier plan text said "in BaseLayout"; that was a copy-paste from the spec and would have included `/search`. Page-level mount is the correct implementation.

**Pointer-events:** popover wrapper has `pointer-events: none` always — interaction never blocks the underlying card.

**Reduced-motion CSS:**
```css
@media (prefers-reduced-motion: reduce) {
  .preview { animation: none; transition: none; }
}
```

**TDD:** RED → GREEN. New fixture: `packages/site/src/content/works/writing-3-no-summary.md` with `summary` omitted.

---

### Task 8 — `<Card.astro>` Pagefind + transition + preview attrs

**Goal:** Add Pagefind index attributes, view-transition name, preview-target marker.

**Files:**
- `packages/site/src/components/Card.astro` — add inside the outer element:
  - **Pagefind metadata:** Pagefind allows only ONE inline `key:value` per `data-pagefind-meta` attribute, and it must be the trailing item (per `https://pagefind.app/docs/metadata/`, fetched 2026-04-26). Use the **per-element form**: emit one hidden child span per metadata field:
    ```astro
    <span data-pagefind-meta="title" hidden>{data.title}</span>
    <span data-pagefind-meta="date" hidden>{data.date.toISOString().slice(0, 10)}</span>
    {data.summary && <span data-pagefind-meta="summary" hidden>{data.summary}</span>}
    ```
  - **Pagefind filters:** one inline `key:value` per `data-pagefind-filter` (per docs: capturing from element content). Emit:
    ```astro
    <span data-pagefind-filter="type" hidden>{data.type}</span>
    {data.tags.map((tag) => <span data-pagefind-filter="tag" hidden>{tag}</span>)}
    ```
  - `transition:name={`card-${entry.id}`}` on the outer link/article element.
  - `data-preview-target={entry.id}` for the Preview island.
  - `data-type={data.type}` and `data-tags={data.tags.join(",")}` (Task 6 carry-over).
  - Phase 1 invariants preserved: outer element is `<a href={externalUrl}>` if any external URL, else `<article>`; CSS hover outline unchanged.

**TDD:**
- RED: extend `tests/e2e/cards.spec.ts` with one assertion: card with type `code` exposes a child element with `data-pagefind-filter="type"` whose `textContent === "code"`. (Pagefind filter values are read from element content, not attribute value, per the docs.)
- RED: new `tests/unit/card-pagefind-attrs.test.ts` — for each of the 5 type variants, render `Card.astro` (via Astro Container API or a Vitest snapshot fixture) and assert the rendered HTML contains the expected `data-pagefind-meta="title"`, `data-pagefind-meta="date"`, optional `data-pagefind-meta="summary"`, `data-pagefind-filter="type"`, and one `data-pagefind-filter="tag"` per tag. This guards against future regressions to the Pagefind attribute schema.
- GREEN: edit Card.astro.
- Visual-regression: card grid pixels unchanged (attrs are on hidden spans; no visible diff). Existing baseline holds.

**Index validation:** Task 11's `tests/e2e/search.spec.ts` will assert `pagefind.search("code")` returns results — that is the integrated index check.

---

### Task 9 — `<CommandPalette.svelte>` island + focus trap

**Goal:** Self-contained ⌘K palette in ~150–200 LOC.

**Files:**
- `packages/site/src/components/CommandPalette.svelte` — `<script lang="ts">` uses `$state` for `open`, `query`, `selectedIndex`, `actions: Action[]`. Imports `bindGlobalChord` from `$lib/keymap`.
- `packages/site/tests/e2e/palette.spec.ts` — eight test cases:
  1. Page emits `palette:ready`; ⌘K opens palette in ≤ 100 ms.
  2. Esc closes; focus returns to trigger.
  3. Typing `wor` filters action list (fuzzy match on `Go to /works`).
  4. Up/Down keys move selection; Enter activates.
  5. ⌘+Enter on a navigate action calls `window.open(target, "_blank")`. Asserted by **stubbing `window.open`** (set `await page.exposeFunction(...)` or assign a spy in `page.evaluate`) and observing the call. Cross-browser `Cmd+Enter` → new-tab is unreliable in Playwright; use the spy instead. Test runs on all browsers (chromium/firefox/webkit) since the assertion is on `window.open`, not the browser's native shortcut.
  6. Outside click closes.
  7. Tab cycles strictly within palette children (focus trap).
  8. With `prefers-reduced-motion: reduce`, no enter/exit animation but palette visible.

**Action set (Phase 2 stub):**
```ts
const actions: Action[] = [
  { id: "goto-home", label: "Go to home", kind: "navigate", target: "/" },
  { id: "goto-works", label: "Go to works", kind: "navigate", target: "/works" },
  { id: "goto-search", label: "Go to search", kind: "navigate", target: "/search" },
  { id: "copy-url", label: "Copy current URL", kind: "action", run: () => navigator.clipboard.writeText(location.href) },
  // theme toggle stubbed/disabled per spec — not added until Phase 6.
];
```

Pagefind search-from-palette integration is **deferred** — palette only fuzzy-matches the `actions` list in Phase 2. (General-plan § Batch 2.3 mentions "Search '...'" action; Phase 2 ships the navigate/copy actions only; search inside the palette is a Phase 2.5/3 nice-to-have.)

**Focus trap:** roll-your-own — listen to `keydown`, on Tab/Shift+Tab compute the next/prev focusable child within the palette dialog, call `.focus()` on it, `preventDefault`. Focusable selector: `'a, button, input, [tabindex]:not([tabindex="-1"])'`.

**ARIA:** dialog has `role="dialog" aria-modal="true" aria-labelledby="palette-title"`; live region announces "Command menu open" on open.

**On mount:** `document.documentElement.dataset.paletteReady = "true"` (canonical readiness primitive — survives ClientRouter `<body>` swaps because `<html>` attributes persist across swaps). Playwright synchronizes via `waitForFunction(() => document.documentElement.dataset.paletteReady === "true")`. The `palette:ready` window event mentioned in the spec is **dropped in favour of the dataset flag** — file a follow-up nit to align the spec wording.

**TDD:** RED → GREEN. Run all 8 cases.

**Bundle budget:** after Task 9, `bun x size-limit` reports `home-js` and `works-js` ≤ 30 KB; palette adds ≤ 12 KB gzipped.

---

### Task 10 — Mount palette in BaseLayout + `transition:persist`

**Goal:** Mount `<CommandPalette client:idle transition:persist>` once in `BaseLayout`.

**Files:**
- `packages/site/src/layouts/_BaseLayout.astro` — add `<CommandPalette client:idle transition:persist />` just before `</body>`. **Bare `transition:persist` (no value)** — per Astro 6 docs (context7 `/withastro/docs` § Maintaining state, fetched 2026-04-26), the named-value form pairs `transition:persist="name"` with `transition:name="name"` for matching disparate elements across pages. Our palette lives at the same DOM position in `_BaseLayout.astro` on every route, so bare-form persistence (DOM + state retained) is sufficient.
- `packages/site/tests/e2e/palette.spec.ts` — add a 9th case: open palette, navigate `/` → `/works`, palette stays open with the same query (state preserved).

**TDD:** RED on the new persistence assertion (without `transition:persist` it fails); GREEN with the directive.

---

### Task 11 — `/search` route + Pagefind UI

**Goal:** New `/search` page using Astro-Pagefind's `<Search>` component. Includes a dev-fallback panel.

**Files:**
- `packages/site/src/components/SearchBox.astro` — wraps `<Search>` from `astro-pagefind/components/Search`. Reads `q` from `Astro.url.searchParams` (does not require SSR — runs at request time only on dev preview; production builds use the static query param).
  - Actually Astro static routes do NOT have `Astro.url.searchParams` populated at build time — the `<Search>` component reads `q` from `window.location.search` client-side via the Pagefind UI.
  - We pass `query={undefined}` and let Pagefind UI read the URL itself.
- `packages/site/src/pages/search.astro` — uses `BaseLayout`, mounts `<SearchBox>`, has the dev-fallback panel.
- `packages/site/tests/e2e/search.spec.ts` — six cases:
  1. Searching `synthesizer` returns ≥ 1 music result on built preview.
  2. Searching `nonexistent-token-zzz` shows the no-results panel.
  3. First-load JS for `/search` page-html ≤ 30 KB; `pagefind-ui.js` ≤ 100 KB (size-limit gate).
  4. Draft-fixture title query → 0 results (draft exclusion).
  5. `<Search>` mounts (`role="search"` is present after page-load).
  6. Dev mode: visiting `/search` with `bun run dev` shows the dev-fallback panel within 2 s.

**Dev-fallback markup (Phase 2 spec OQ#3 resolution):**
```astro
<noscript><p>Search requires JavaScript.</p></noscript>
<div data-pagefind-dev-fallback hidden>Search becomes available after the first <code>bun run build</code>.</div>
<script>
  if (!window.location.search) {
    setTimeout(() => {
      if (typeof window.pagefind === "undefined") {
        document.querySelector("[data-pagefind-dev-fallback]")?.removeAttribute("hidden");
      }
    }, 2000);
  }
</script>
```

**Pagefind built-output assertion (added):** the Playwright run starts `bun run preview` against the built `dist/`. After build, assert `fs.existsSync('packages/site/dist/pagefind/pagefind.js')` AND `fs.existsSync('packages/site/dist/pagefind/pagefind-ui.js')` in a small Node test step (executed from `bun x playwright test`'s globalSetup or as the first case in `tests/e2e/search.spec.ts` via `test.beforeAll`). This proves the integration ran during `astro build`.

**TDD:** RED on case 1 (Pagefind not installed yet → 0 results). GREEN with install + index built.

**LHCI:** add `http://localhost:4321/search/` to `lighthouserc.cjs` `url:` array. Assert ≥ 0.95 mobile Performance.

**Knip:** `astro-pagefind` is registered in config → not unused. `pagefind` is a dep but only invoked at build time — knip may flag it. **OQ#10 resolution at plan-time: run `bun x knip` after install; if `pagefind` is flagged, add to `packages/site/knip.jsonc` `ignoreDependencies`**. Document the outcome in this task's commit message.

---

### Task 12 — `<ClientRouter />` + staggered animation + visual-regression rebaseline

**Goal:** Site-wide view transitions, CSS-stagger on cards, re-record baselines.

**Files:**
- `packages/site/src/layouts/_BaseLayout.astro` — add `import { ClientRouter } from "astro:transitions";` and `<ClientRouter />` inside `<head>`.
- `packages/site/src/components/Card.astro` — already has `transition:name="card-${id}"` from Task 8.
- `packages/site/src/styles/transitions.css` (new) — CSS-stagger:
  ```css
  [data-component="grid"] > * { animation: card-in 200ms ease-out backwards; animation-delay: calc(var(--i) * 30ms); }
  @keyframes card-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    [data-component="grid"] > * { animation: none; }
  }
  ```
- `packages/site/src/pages/index.astro` and `works/index.astro` — set `style={`--i: ${i}`}` on each card via the `entries.map((entry, i) => ...)` loop.
- `packages/site/tests/e2e/transitions.spec.ts` — seven cases:
  1. Navigate `/` → `/works` does not produce a new `PerformanceNavigationTiming` entry.
  2. `astro:page-load` fires once per nav.
  3. With `reducedMotion: 'reduce'`, `getComputedStyle(card).animationDelay === '0s'` for every card.
  4. Without reduced-motion, the third card's `animationDelay` parses to ≈ 60ms (`parseFloat(getComputedStyle(card).animationDelay) === 0.06` after unit normalisation; tolerate `60ms` or `0.06s`).
  5. Card with same `transition:name` morphs (CSS view-transition fires) — verified by snapshotting the page during navigation; **note**: this is best-effort; if cross-browser flakiness arises, fall back to asserting the `transition-group-...` style is injected.
  6. Visual-regression: re-recorded baselines for `/`, `/works`, `/search` — these baselines fully replace the Task 6 baselines.
  7. **Listener-leak probe (CDP):** repeat-navigate `/` ↔ `/works` 5× and assert the count of `document` event listeners attached by FilterBar is bounded (≤ 2× initial count). Use Chrome DevTools Protocol: `await client.send('DOMDebugger.getEventListeners', { objectId: ... })` for the document object. Skipped on firefox/webkit projects.

**TDD:** RED: existing visual-regression baselines fail after `<ClientRouter />` injection due to attr/style noise. **Update baselines** (`--update-snapshots`) and commit them in this task. The new transition tests are added in this task too.

**Phase 1 visual-regression maxDiffPixelRatio: 0.02** stays — sufficient for ClientRouter-induced noise in our experience. Filed as nit #22 already; no change needed.

---

### Sizing note (CLAUDE.md inline-fix gate)

The CLAUDE.md inline-fix gate is for **nits**; feature task sizing is governed by judgement, not the cap. Task 9 (CommandPalette), Task 12 (ClientRouter + stagger + visual-regression), and Task 13 (gate retire + 5 ADRs + sweep) all exceed the 4-impl-files / 120-line-churn cap because they ship cohesive features. The Opus reviewer round-cap (1) still applies; if a task review returns more than ~5 substantive findings, split mid-task. **Plan defers Task 13 ADRs** to a `13b` follow-up commit on the same branch (5 ADRs, one per commit) so the gate-retire commit (`13a`) stays focused. Tasks 9 and 12 are not pre-split; if the implementer sees the diff growing past ~250 LoC, request a split via the controller.

### Task 13a — Retire `no-js-check.ts` + per-route `size-limit` budgets + extend LHCI

**Goal:** Lock in the new gates; run the full pre-PR sweep. ADRs land in 13b (separate commits per ADR).

**Files:**
- `packages/site/scripts/no-js-check.ts` — **deleted**.
- `packages/site/package.json` — remove `check:no-js` if it exists.
- `packages/site/.size-limit.cjs` — replace with the OQ#12 form.
- `packages/site/lighthouserc.cjs` — `url:` array contains all three routes.

**Final sweep (run locally before PR — same as the ADR commits in 13b will run):**
- `bun run dev` — sanity check.
- `bun run build && bun run preview` — Pagefind index built; search works; LHCI ≥ 0.95.
- All seven lefthook steps green.
- `bun x vitest run` green.
- `bun x size-limit` all entries within budget.
- `bun x playwright test` all e2e green.

### Task 13b — ADRs 0012–0016 (one commit per ADR)

**Goal:** Write the five ADRs as separate commits to keep each diff small.

**Commits:**
- `packages/specs/adrs/0012-url-state-roll-your-own.md`
- `packages/specs/adrs/0013-pagefind-over-fuse-minisearch.md`
- `packages/specs/adrs/0014-cmdk-rolled-in-house.md`
- `packages/specs/adrs/0015-client-router-and-staggered-animation.md`
- `packages/specs/adrs/0016-route-budget-replaces-zero-js-gate.md`

**ADR skeleton (CLAUDE.md):** Context · Decision · Alternatives · Consequences · Sources (URLs).

After 13b: open PR; CI must be green; merge commit (no squash, no rebase) into `main`; `phase-2` tag.

---

## Dependency graph between tasks

```
1 (integrations + BaseLayout)
 ├─ 2 (url-state) ─┐
 ├─ 3 (filter)    ─┼─ 5 (FilterBar) ─ 6 (wire FilterBar) ─┐
 ├─ 4 (keymap)    ─┘                                      │
 │                                                        ├─ 12 (ClientRouter + stagger + rebaseline) ─ 13 (sweep + ADRs)
 ├─ 7 (Preview)                                           │
 │   └─ 8 (Card mods: transition:name, pagefind, preview-target) ─┤
 ├─ 9 (CommandPalette) ─ 10 (mount palette + persist) ────┤
 └─ 11 (/search route + Pagefind UI) ─────────────────────┘
```

Tasks 2/3/4 are independent — can be parallel. Task 5 needs all three. Tasks 6, 7, 8 mostly independent. Task 12 needs 8 (transition:name lives on Card). Task 13 finalizes.

Sequential execution by `/subagent-driven-development` is fine; parallel speeds throughput but risks merge conflicts on Card.astro / BaseLayout.astro / index.astro (3 hot files).

## Per-task review protocol (CLAUDE.md)

- **Implementer:** Sonnet subagent.
- **Reviewers:** Opus subagent. Both spec-compliance review AND code-quality review run after each task. Review-round cap = 1 (per CLAUDE.md). After cap, accept residual nits and queue them as `gh issue create -R utof/utofme -l nit`.
- File issues **immediately** upon review return; in parallel with next-task dispatch (per user's standing direction in Phase 1 work session).

## Branch / merge

Each task = one commit on `phase/02-interactivity`. After Task 13:
- `git push origin phase/02-interactivity`.
- `gh pr create -R utof/utofme --base main` with summary of 13 tasks.
- CI green required.
- `gh pr merge <NN> -R utof/utofme --merge` (merge commit; no squash, no rebase per CLAUDE.md branching rule).
- `git tag phase-2 <merge-sha> && git push --tags`.
- Delete remote + local branch.

## Risk log

- **Pagefind metadata schema is restrictive** (one inline `key:value` per `data-pagefind-meta`/`-filter` attr; must be the trailing item). Card.astro must use the per-element form (one hidden `<span data-pagefind-meta="key">value</span>` per metadata field). Re-verify against `https://pagefind.app/docs/metadata/` and `https://pagefind.app/docs/filtering/` at Task 8 commit time. The Task 8 unit snapshot test (`tests/unit/card-pagefind-attrs.test.ts`) is the regression guard.
- **Pagefind dev-mode UX**: a fresh `git clone` + `bun run dev` shows the empty search panel with the fallback message. Documented; not a regression.
- **Visual-regression flake on CI** (Phase 1 nit #22): ClientRouter may push the `maxDiffPixelRatio` higher; if 0.02 is insufficient, raise to 0.03 in transitions.spec.ts only.
- **Svelte 5 + `transition:persist` interaction**: per Astro docs, persisted islands keep state across nav; verified at plan-write via context7. If state loss is observed in CI, the fallback is `client:load` (re-mount per route) with `astro:after-swap` to restore palette state from `sessionStorage` — file as a follow-up nit if observed.
- **Pagefind UI 100 KB budget**: a fresh measurement at plan-time may show 110 KB. If so, raise the budget to the measured value + 5 KB headroom and document in commit + nit.
- **`@astrojs/svelte@^7` lockfile churn**: registering an integration that was previously `devDependencies`-only-but-not-in-config may pull in additional Svelte-5 runtime chunks at build. Already accounted for in the 30 KB budget.

## Memory / hygiene reminders

- No `Co-Authored-By: Claude` in commits.
- No mention of Claude / sessions / AI in PR / issue / commit text.
- Update `progress.md` only — no other auto-memory edits, no CLAUDE.md edits without explicit ask.
- Repo `.gitignore` rule for `*.md` outside `packages/specs/**` and `/README.md` etc. — Phase 2 doesn't add new prose outside specs; nothing to whitelist.
