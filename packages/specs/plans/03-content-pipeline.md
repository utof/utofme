# Phase 3 — Content Pipeline (Plan)

> Plan for `packages/specs/specs/03-content-pipeline.md`. All batches land on `phase/03-content-pipeline` (cut from `19d9a32` on `main`). Execution via `/subagent-driven-development` (Sonnet workers); reviews by Opus.

## Prerequisites & assumptions

- Branch: `phase/03-content-pipeline` cut from `main` at `19d9a32`. (Confirmed.)
- Phase 0 + 1 + 2 invariants are green at the branch base (123 vitest, 67 active e2e, all 7 lefthook steps, LHCI ≥ 0.85 on `/`, `/works`, `/search`).
- Bun ≥ 1.2; Node ≥ 22.12.
- Pinned new deps (verified at spec polish 2026-04-26 via npm registry):
  - `astro-expressive-code` `^0.41` — current `0.41.7`. **0.x semver caveat:** minor bumps are breaking; lockfile pinned.
  - `@codesandbox/sandpack-react` `^2.20` — current `2.20.0`. React 16/17/18/19 peers OK.
  - `@astrojs/react` `^5` — current `5.0.4`. Astro 6 + React 19 + `@types/react@^19` peers OK.
  - `react` `^19`, `react-dom` `^19`, `@types/react` `^19`, `@types/react-dom` `^19`.
  - `sharp` — auto-installed by Astro for `astro:assets` (no explicit add needed; verify in Task 1).

## Resolved open questions (from spec § Open questions)

The spec resolved OQs 2, 3, 4, 6, 8, 11, 12 at spec polish. Plan resolves the remainder:

### OQ#1 — `astro-expressive-code` + `@astrojs/mdx` ordering
**Plan resolution:** Task 1 builds two probe configs in sequence: (a) `[expressiveCode(), mdx(), svelte(), pagefind()]`, (b) `[mdx(), expressiveCode(), svelte(), pagefind()]`. After each, build a 1-fixture-MDX-with-code-fence file and inspect the rendered HTML for the EC `<style>` injection. Pin the ordering whose code-fence renders with EC theming (Starlight uses ordering (a)). Document outcome in Task 1 commit message + ADR 0020. Empirical-only; no docs cite the rule.

### OQ#5 — Detail-page URL canonical form
**Plan resolution (verified 2026-04-26):** Phase 0 `astro.config.mjs` does NOT set `trailingSlash` (default = `"ignore"`). **Task 1 adds `trailingSlash: "always"`** to lock the canonical form. `getStaticPaths` returns `params: { slug: entry.id }`; the route file is `src/pages/works/[...slug].astro` (rest-param to support nested folders if added in Phase 5). Astro emits `dist/works/<id>/index.html` → URL `/works/<id>/`. The Phase 0 `<a href="/works/">` link in `_BaseLayout` and Phase 1 / 2 e2e use no-slash forms (`/works`, `/`); Astro's static build still serves them via the directory-index (no broken links). The slug-alias warning in spec OQ#5 is **dropped** — the schema's `slug?` field is left in place but no warning is emitted (simpler; revisit if collisions ever surface).

### OQ#7 — Sandpack budget calibration
**Plan resolution:** Task 11 (Sandpack island) builds a single fixture page using `<Sandbox template="react">` with one minimal example file, then runs:
```bash
gzip -c dist/_astro/*.js | wc -c
```
Pin `.size-limit.cjs` `sandpack page js` budget at `(measured + 20% headroom)`. If measurement diverges from the general-plan estimate (~190 KB) by >25 %, file an issue and amend the spec. Acceptable upper bound: 250 KB gzipped (a Sandpack page is opt-in per article).

### OQ#9 — Card → detail-page ARIA / e2e branches
**Plan resolution:** **Task 6** (Card.astro modification) adds `data-test="card-link-detail"` when href starts with `/works/` and `data-test="card-link-external"` when href is external; Card.astro emits `<article>` (no link) when `cardHref` returns empty string. Task 6's `tests/e2e/cards.spec.ts` extension covers all three branches with axe-core (existing harness).

### OQ#10 — Svelte 5 `$props.id()` uniqueness in MDX
**Plan resolution:** Task 12 adds an MDX fixture (`writing-mdx-island.mdx`) with two `<Counter />` instances. e2e asserts:
- Two distinct DOM nodes with `data-svelte-h=` attrs (Svelte 5 hash-based hydration markers).
- Clicking counter A changes A's count; counter B's count stays.

If `$props.id()` does NOT produce unique values in Astro 6, fall back to passing an explicit `id` prop from MDX (`<Counter id="a" />` / `<Counter id="b" />`) and document.

---

## Task list (13 tasks)

Each task is one commit on `phase/03-content-pipeline`. After every task, lefthook + CI checks must remain green.

### Task 1 — Register integrations (EC + React) + verify EC↔MDX ordering

**Goal:** Add `astro-expressive-code` and `@astrojs/react` integrations to `astro.config.mjs`. Resolve OQ#1 empirically.

**Files:**
- `packages/site/astro.config.mjs` — add `import expressiveCode from "astro-expressive-code"; import react from "@astrojs/react";`. Add to `integrations` array. EC ordering pinned by probe. **Also add `trailingSlash: "always"`** to lock detail-page URL canonical form (resolves OQ#5 above; default is `"ignore"`).
- `packages/site/ec.config.mjs` — new file. `themes: ["github-light", "github-dark"]`, `frames: { showCopyToClipboardButton: true }`, default styling.
- `packages/site/package.json` — install: `bun add react@^19 react-dom@^19` (prod deps); `bun add -d astro-expressive-code@^0.41 @astrojs/react@^5 @codesandbox/sandpack-react@^2.20 @types/react@^19 @types/react-dom@^19` (dev deps). Bunfig handles peers.
- `packages/site/knip.jsonc` — add any flagged deps to `ignoreDependencies` (likely `react`, `react-dom`, `@types/react`, `@types/react-dom` if knip doesn't auto-detect tsx component imports).

**TDD:**
- RED: existing `tests/e2e/landing.spec.ts` re-runs after install — confirm green (no regressions from registration alone).
- GREEN: install + register + ec.config.mjs.
- Verification: a 1-line MDX file with a JS code fence renders with EC-themed HTML output (verify via `dist/works/<fixture>/index.html` grep for EC class names like `expressive-code` or the styled `<pre>`).

**Hygiene:** lefthook 7 steps green. `bun x knip` resolves the new deps. `bun run check:docs` passes — only ec.config.mjs is added (no source TS exports).

**Acceptance:**
- `bun install` resolves cleanly.
- `bun run build` succeeds with both integrations registered.
- `bun x astro check` exits 0.
- 67 e2e remain green (no detail page yet, so no regression).

---

### Task 2 — Migrate `cover` schema to `image()` helper

**Goal:** Schema-incompatible migration (per spec § Non-goals): `defineCollection({ schema: worksSchema })` → `defineCollection({ schema: ({ image }) => …discriminatedUnion(…) })` with `cover: z.object({ src: image(), alt: z.string() }).optional()`.

**Files:**
- `packages/site/src/content.config.ts` — schema migration. The `worksSchema` named export now becomes a function `({ image }) => z.discriminatedUnion(...)` instead of a static value. The `WorkEntry` type alias regenerates correctly via `CollectionEntry<"works">["data"]`.
- `packages/site/src/lib/works.ts` — type imports may need adjustment if `WorkEntry` shape changes.
- `packages/site/tests/unit/content-schema.test.ts` — update fixture-shape arbitraries: `cover.src` becomes `ImageMetadata` (or in tests, a mocked object matching the shape Astro's image-loader returns).

**TDD:**
- RED: `tests/unit/content-schema.test.ts` § "parses cover with src and alt" (currently passes `{ src: "img.png", alt: "..." }`) fails because `cover.src` now requires `ImageMetadata`-shaped value. Update the test to `safeParse` against an `ImageMetadata` mock: `{ src: "/_astro/img.hash.png", width: 1280, height: 720, format: "png" }` and assert `cover.src.width > 0` AND `alt` preserved — this **replaces** the old Stryker-killing case (kills `cover: z.object({})` mutant by asserting on inner shape).
- GREEN: schema migration + fixture-arbitrary update.

**Note:** Existing fixtures under `src/content/works/` do NOT have `cover` set (verified at spec time). The migration is no-op for them. Task 5 supplies the cover-image fixture.

**Acceptance:**
- `bun x astro check` exits 0.
- Plan-worker runs Stryker locally after Task 2 commit (`cd packages/site && bunx stryker run`) and confirms ≥ 80% mutation score on `content.config.ts`. Document the measured score in the commit message.

---

### Task 3 — `lib/works.ts` adds `hasBody`, `detailUrl`, `cardHref` + property tests

**Files:**
- `packages/site/src/lib/works.ts` — add 3 exports. Pinned predicate per spec: `hasBody = entry => typeof entry.body === "string" && entry.body.trim().length > 0`. `detailUrl = entry => `/works/${entry.id}/``. `cardHref` returns `detailUrl(entry)` if `hasBody(entry)`, else the Phase 1 external-URL chain (`repo` → `youtube` → `listen` → `arxiv` → `pdf`), else `""`.
- `packages/site/tests/unit/works-helpers.test.ts` — new. Property tests per spec.
- `packages/site/stryker.conf.json` — add new function names to mutation scope (file is already in `mutate`).
- `packages/site/vitest.mutation.config.ts` — add `tests/unit/works-helpers.test.ts` to `include`.

**TDD:** RED → GREEN → REFACTOR. **3 properties + 4 deterministic cases:**
1. Property: `detailUrl` round-trip — `detailUrl(entry).slice(7, -1) === entry.id` for any `entry.id` matching `[a-z0-9-]+`.
2. Property: `hasBody` predicate — for any `s ∈ string`, `hasBody({ body: s }) === (s.trim().length > 0)`. Arbitrary covers empty, whitespace-only, single-char, multi-line, unicode.
3. Property: `cardHref` Cartesian — `fc.record({ data: WorkEntryArb, body: fc.option(fc.string()), repo: fc.option(fc.webUrl()) })` covers all 4 quadrants of `(hasBody × externalUrl)`. Asserts: hasBody → starts with `/works/`; !hasBody && externalUrl → equals externalUrl; neither → equals `""`.
4. Deterministic: `cardHref({ data: { type: "code", repo: "https://x" }, body: "" })` returns `"https://x"`.
5. Deterministic: `cardHref({ data: { type: "writing" }, body: "hello" })` returns `/works/<id>/`.
6. Deterministic: `cardHref({ data: { type: "writing" }, body: "" })` returns `""`.
7. Deterministic: `cardHref({ data: { type: "code", repo: "https://x" }, body: "hello" })` returns `/works/<id>/` (detailUrl wins).

**Hygiene:** TSDoc with `Why:` on each new export.

**Acceptance:** lefthook 7 steps green; new vitest count = previous + ≥ 12 cases.

---

### Task 4 — Detail page route `[...slug].astro` + `_WorkLayout.astro` + plain MDX bodies

**Goal:** Generate one detail page per non-draft fixture using `getStaticPaths` + `render(entry)` from `astro:content`. Adds plain MDX bodies to 3 fixtures so detail pages have content from commit-1 (avoids leaving CI red between commits — folded former Task 7 in).

**Files:**
- `packages/site/src/pages/works/[...slug].astro` — new. `getStaticPaths` over `getCollection("works", e => import.meta.env.PROD ? !e.data.draft : true)`. Body via `await render(entry)` → `<Content />`. Wrapped in `_WorkLayout`. TSDoc-style frontmatter top comment with `Why:` linking to plan Task 4.
- `packages/site/src/layouts/_WorkLayout.astro` — new. `<article>` wrapper, `<header>` with `<h1>`, `<time>`, breadcrumb `<a href="/works/">← All works</a>`, `<MetaPills>` reused from Phase 1, optional `<CoverImage>` slot if `data.cover`, optional secondary external-URL `<a>` if any external URL present, `<slot />` for body. **Props interface exported with TSDoc + `Why:` line per check:docs.**
- `packages/site/src/content/works/code-2.md`, `writing-2.md`, `music-2.md` — modified to add ~3 paragraphs each so Task 4's body assertion isn't RED.
- `packages/site/tests/e2e/detail.spec.ts` — new. Cases:
  1. Every non-draft fixture has a page at `/works/<id>/` (returns 200).
  2. **Draft fixtures (`draft: true`) do NOT generate static files:** `fs.existsSync('packages/site/dist/works/<draft-id>/index.html') === false`. (Filesystem oracle — works regardless of preview-server 404 behavior.)
  3. `<h1>` matches `entry.data.title`.
  4. `<time datetime>` matches the fixture's date.
  5. Breadcrumb back to `/works`.
  6. Secondary external-URL link is present iff fixture has `repo` / `youtube` / `listen` / `arxiv` / `pdf`.
  7. Axe-core zero violations.
  8. `transition:name="card-<id>"` exists on exactly one element per page.
  9. Body content visible: for the 3 fixtures with bodies, `<article p>` first paragraph is non-empty.

**TDD:** RED on all 9 cases (no detail route exists); GREEN with implementation + 3 fixture body edits in the same commit.

**Acceptance:** All 9 cases green; existing 67 e2e remain green; lefthook gauntlet green.

---

### Task 5 — `CoverImage.astro` + image-pipeline e2e + cover fixture

**Goal:** Render an optimized cover image when `entry.data.cover` is set. New fixture exercises the pipeline.

**Files:**
- `packages/site/src/components/CoverImage.astro` — new. Wraps `<Image src={data.cover.src} alt={data.cover.alt} widths={[320, 640, 960, 1280]} sizes="(min-width: 800px) 800px, 100vw" loading="lazy" />`.
- `packages/site/src/content/works/cover-fixture.mdx` — new. Frontmatter sets `cover: { src: "../../assets/works/cover-fixture.jpg", alt: "..." }` + minimal MDX body.
- `packages/site/src/assets/works/cover-fixture.jpg` — new. Small placeholder JPEG (≤ 100 KB raw, 1280×720 or similar).
- `packages/site/src/layouts/_WorkLayout.astro` — modified to render `<CoverImage>` when `data.cover` is set.
- `packages/site/tests/e2e/image-pipeline.spec.ts` — new. Cases:
  1. Built `dist/works/cover-fixture/index.html` contains an `<img>` (or `<picture>`) with `srcset` listing ≥ 3 widths.
  2. AVIF variant exists in srcset (or `<source type="image/avif">`).
  3. WebP variant exists.
  4. **Passthrough check:** `dist/assets/works/cover-fixture.jpg` does NOT exist; only `dist/_astro/cover-fixture.<hash>.{avif,webp,jpg}` variants exist.
  5. `loading="lazy"` on the cover image.
  6. LCP element on cover-fixture page is the AVIF variant (verified via Performance API or LH).

**TDD:** RED on cases 1-6; GREEN with implementation.

**Acceptance:** All 6 cases green; LHCI mobile Performance on the cover-fixture detail page ≥ 0.85.

---

### Task 6 — Card.astro flips to `cardHref` + cards-spec amendments

**Goal:** Move card link decision logic from inline Card.astro to `cardHref(entry)` (Task 3). Add `data-test` attributes for the two branches.

**Files:**
- `packages/site/src/components/Card.astro` — replace the existing `externalUrlFor` inline logic with `import { cardHref } from "$lib/works"`. Outer element: `<a href={href} data-test={href.startsWith("/works/") ? "card-link-detail" : "card-link-external"}>` if `href !== ""`, else `<article>`. Phase 2 attributes (data-pagefind-meta/filter spans, transition:name, data-preview-target, data-type, data-tags) all preserved.
- `packages/site/tests/e2e/cards.spec.ts` — extend with 3 cases:
  1. Fixture with body → outer `<a>` has `href^="/works/"` and `data-test="card-link-detail"`.
  2. Fixture without body but with `repo` → outer `<a>` has `href={repo}` and `data-test="card-link-external"`.
  3. Fixture with neither → outer element is `<article>` (no `<a>`); axe-core zero violations on this branch.

**TDD:** RED on the new assertions; GREEN with the Card.astro refactor.

**Acceptance:** Existing 67 e2e + 3 new = 70 e2e green. Visual regression: Card pixels unchanged (link decision is HTML-only).

---

### Task 7 — *(retired; folded into Task 4)*

The original Task 7 ("Bodies for 3 fixtures") was folded into Task 4 to keep CI green between commits. Task numbering preserved for spec/plan cross-referencing; subsequent task numbers (8–13) unchanged.

---

### Task 8 — Expressive Code fixture + e2e

**Goal:** Demonstrate code-fence rendering with title, copy button, dual-theme.

**Files:**
- `packages/site/src/content/works/code-1.mdx` — modify (was draft per Phase 1 fixtures; remove `draft: true` so it ships in prod and gets a detail page). Add MDX body with a JS code fence using EC's **meta-string** form (verified at `https://expressive-code.com/key-features/code-component/` 2026-04-26):
  ````md
  ```js title="example.js"
  // Why: demonstrate Expressive Code rendering
  console.log("hello");
  ```
  ````
  The `title="example.js"` directive on the fence (NOT a `// title:` comment — that's Twoslash, excluded per ADR 0020) drives EC's frame-title rendering.
- `packages/site/tests/e2e/detail.spec.ts` — add 3 EC cases:
  10. `<pre>` block has EC's class (e.g., `expressive-code` or `ec-line`); verify via `page.locator(".expressive-code")`.
  11. Copy-button `<button>` is present and visible.
  12. Theme switches via `page.emulateMedia({ colorScheme: "dark" })` — code-block background changes.

**TDD:** RED → GREEN.

**Acceptance:** 3 new cases green; per-page CSS+HTML budget on `/works/code-1/` ≤ 60 KB gzipped.

---

### Task 9 — Counter.svelte MDX island + state-isolation e2e

**Goal:** Demonstrate Svelte 5 island embedded inside MDX with state isolation across multiple instances.

**Files:**
- `packages/site/src/components/mdx/Counter.svelte` — new. ~30 LOC. `<script lang="ts">` uses `$state` for count; `<button>` increments. Props: optional `id?: string` (fallback to `$props.id()`). Reduced-motion safe (no animation). TSDoc + `Why:` line.
- `packages/site/src/content/works/writing-mdx-island.mdx` — new fixture. Frontmatter: `type: writing`, normal fields. Body imports `Counter` and renders TWO instances:
  ```mdx
  import Counter from "../../components/mdx/Counter.svelte";
  
  <Counter client:visible />
  <Counter client:visible />
  ```
- `packages/site/tests/e2e/detail.spec.ts` — add MDX-island cases (13–15):
  13. Two distinct counter instances render with unique DOM identifiers.
  14. Click counter A 3 times → A shows 3, B shows 0.
  15. Click counter B 2 times → B shows 2, A still 3 (no state leak).

**TDD:** RED → GREEN.

**Note:** If Svelte 5 `$props.id()` does NOT produce unique values in Astro 6 islands, fall back to explicit `id` prop in MDX:
```mdx
<Counter id="a" client:visible />
<Counter id="b" client:visible />
```
Document the fallback in the commit message and ADR 0020 supplementary note.

**Acceptance:** 3 new cases green; total e2e count ~80; per-page JS for the writing-mdx-island detail page ≤ 60 KB (Svelte runtime is shared with Phase 2 site js chunks).

---

### Task 10 — Sandbox.astro + SandboxIsland.tsx (React island)

**Goal:** `<Sandbox>` MDX component renders a Sandpack React playground.

**Files:**
- `packages/site/src/components/mdx/Sandbox.astro` — wraps `<SandboxIsland client:only="react" />`. Props: `template` (default `"react"`), `files` (record), `dependencies` (optional). Forwards to React island.
- `packages/site/src/components/SandboxIsland.tsx` — React island. Imports `<Sandpack>` from `@codesandbox/sandpack-react`. Theme tokens match EC's `prefers-color-scheme` via `theme="auto"` (or our custom theme matching `--color-bg` / `--color-fg` tokens). Handles props.
- `packages/site/src/content/works/code-sandbox.mdx` — new fixture (`type: code`). Body imports Sandbox and renders one playground.
- `packages/site/tests/e2e/sandbox.spec.ts` — new. Cases:
  1. Sandbox iframe (or root container) renders within 3 s.
  2. Editing the code triggers re-execution within 1 s (relaxed from general-plan's 500 ms).
  3. No console errors on a clean page load.
  4. **Pages without `<Sandbox>` ship 0 bytes of React:** verify by checking that `dist/works/<non-sandbox-fixture>/index.html` does NOT reference `react` chunks. Glob check.

**TDD:** RED → GREEN.

**Bundle measurement (resolves OQ#7):** after this task, run `gzip -c dist/_astro/*react*.js dist/_astro/*sandpack*.js | wc -c` and pin `.size-limit.cjs` `sandpack page js` budget at `(measured + 20%)`. Document the measured value in the commit message.

**Acceptance:** 4 sandbox cases green; sandpack page passes its budget; no-sandbox pages under 60 KB JS. **SandboxIsland.tsx is integration-tested only** (Stryker excluded per spec L191 "no logic — pure Sandpack wrapper"); the e2e is the oracle.

---

### Task 11 — `.size-limit.cjs` per-page budgets + LHCI extension

**Goal:** Lock in detail-page budgets. Extend LHCI to one representative detail-page URL.

**Files:**
- `packages/site/.size-limit.cjs` — add entries:
  - `{ name: "detail page css+html (no-island)", path: ["dist/works/code-2/index.html", "dist/_astro/*.css"], gzip: true, limit: "60 KB" }` (representative no-island fixture).
  - `{ name: "detail page css+html (EC code)", path: ["dist/works/code-1/index.html", "dist/_astro/*.css"], gzip: true, limit: "60 KB" }`.
  - `{ name: "sandpack page js", path: ["dist/_astro/*.js"], gzip: true, limit: "<MEASURED + 20%>" }` — only the Sandpack-page-specific chunks if Astro's bundler segregates them; if not, the same shared `dist/_astro/*.js` is measured against a higher ceiling that subsumes Phase 2's 60 KB.
  
  **Important:** Astro bundles shared chunks in `dist/_astro/`. The Sandpack chunks may not be cleanly separable. Plan-worker measures both: (a) total `dist/_astro/*.js` after Sandpack page is added (compare to pre-Sandpack 54.92 KB baseline), (b) just the React+Sandpack chunks if identifiable. Pick the budget shape that's enforceable.
- `packages/site/lighthouserc.cjs` — add `http://localhost:4321/works/code-2/` to `url:` array (representative no-island detail page; LHCI ≥ 0.85 per ADR 0017).

**Acceptance:**
- `bun x size-limit` green.
- LHCI runs all 4 routes (`/`, `/works`, `/search`, `/works/code-2/`) and meets ≥ 0.85 on each.

---

### Task 12 — ADRs 0018–0021

**Goal:** Write the 4 ADRs as separate commits (ADR convention from CLAUDE.md).

**Commits:**
- `packages/specs/adrs/0018-image-pipeline-via-astro-assets.md` — supersedes ADR 0010. `<Image />` + `image()` schema helper; Sharp default; AVIF/WebP responsive variants. Cost: build-time CPU.
- `packages/specs/adrs/0019-sandpack-react-island-budget.md` — accepts ~190 KB gzipped React+Sandpack as island-only. Pages without `<Sandbox>` ship 0 bytes of React. Pinned budget value (from Task 10 measurement).
- `packages/specs/adrs/0020-expressive-code-no-twoslash.md` — chose EC default + dual-theme + copy button over plain Shiki and over Twoslash. Cost: zero JS overhead beyond 1 KB inline copy-button script. Includes Task 1's empirical EC↔MDX ordering finding.
- `packages/specs/adrs/0021-detail-page-as-default-card-link.md` — amends ADR 0011. Cards link to `/works/[slug]/` when `hasBody`, else fall back to ADR 0011's external-URL chain.

**ADR skeleton (CLAUDE.md):** Context · Decision · Alternatives · Consequences · Sources (URLs).

Each ADR is one commit; lefthook runs but skips all checks (no .md staged in source paths trigger gauntlet).

---

### Task 13 — Final sweep + visual-regression rebaseline

**Goal:** Run full pre-PR sweep. Re-record visual-regression baselines for the new detail-page snapshots only.

**Steps:**
- `bun run dev` sanity check — visit `/`, `/works`, `/search`, `/works/code-1/`, `/works/code-2/`, `/works/cover-fixture/`, `/works/writing-mdx-island/`, `/works/code-sandbox/`. No console errors.
- `bun run build && bun run preview` — Pagefind index built (now includes detail pages); LHCI ≥ 0.85.
- All 7 lefthook steps green.
- `bun x vitest run` green.
- `bun x size-limit` all entries within budget.
- `bun x playwright test --update-snapshots` for new detail-page baselines (1 per representative variant: EC code, Sandpack, plain prose, cover-image).
- Commit baselines: `Phase 3 Task 13: visual-regression baselines for detail pages + final sweep`.

**Acceptance:** all gates green; PR ready to open.

---

## Dependency graph

```
1 (integrations + trailingSlash)
 ├─ 2 (schema migration)
 │    └─ 5 (cover image — needs image() helper)
 ├─ 3 (lib helpers)
 │    └─ 6 (Card flip — needs cardHref)
 └─ 4 (detail route + layout + 3 plain bodies, all in one commit)
      ├─ 5 (cover image — also needs _WorkLayout slot)
      ├─ 8 (EC fixture)
      ├─ 9 (Counter MDX island)
      └─ 10 (Sandbox)
            └─ 11 (size-limit + LHCI — needs Sandpack measurement from 10)
                  └─ 12 (ADRs 0018-0021, four commits)
                        └─ 13 (sweep + baselines)
```

**Total commits on the branch:** spec (committed) + plan (this file) + Task 1 + Task 2 + Task 3 + Task 4 + Task 5 + Task 6 + Task 8 + Task 9 + Task 10 + Task 11 + Task 12 (×4) + Task 13 = 17 commits. (Task 7 retired, no commit.)

## Per-task review protocol (CLAUDE.md)

- Implementer: Sonnet subagent.
- Reviewers: Opus subagent. Both spec-compliance review AND code-quality review run after each task. Review-round cap = 1.
- File issues immediately upon review return; in parallel with next-task dispatch.

## Branch / merge

After Task 13:
- `git push origin phase/03-content-pipeline`.
- `gh pr create -R utof/utofme --base main` summarizing 13 tasks + ADRs 0018-0021.
- CI green required.
- `gh pr merge <NN> -R utof/utofme --merge`.
- `git tag phase-3 <merge-sha> && git push --tags`.
- Delete remote + local branch.

## Risk log

- **Schema migration breaks Phase 1 Stryker on `content.config.ts`.** Likely; the function-form schema may surface new mutants. Plan: re-run Stryker locally after Task 2; update `tests/unit/content-schema.test.ts` arbitraries if needed.
- **Adding `trailingSlash: "always"` may force a Pagefind reindex.** Pagefind built its index in Phase 2 against the prior trailing-slash-ignore behavior. After Task 1, re-run Phase 2 e2e (`tests/e2e/search.spec.ts`) and verify search results still resolve. If Pagefind links to the un-slashed form, plan amends to use a per-link normalizer or accepts the redirect cost.
- **EC ↔ MDX ordering fragility.** Empirical resolution at Task 1; if both orderings work, prefer Starlight convention (EC first). Document in ADR 0020.
- **Sandpack budget undershoots / overshoots general-plan estimate.** Measured at Task 10; spec amended if >25 % divergence.
- **`$props.id()` non-unique in Astro 6 + `@astrojs/svelte@^7`.** Fallback: explicit `id` prop in MDX. Documented in Task 9 + ADR 0020 supplementary.
- **`transition:name` cross-page morph flake on CI.** Phase 2 already uses best-effort smoke test for the morph itself; Phase 3 inherits that fragility. Anchor assertion (one element per page) is robust.
- **`@types/react@19` + `astro/tsconfigs/strictest` interaction.** If type-coverage drops below 100% on the `.tsx` island, fall back to a small typed wrapper that hides Sandpack's looser types behind our strict surface.

## Memory / hygiene reminders

- No `Co-Authored-By: Claude` in commits.
- No mention of Claude / sessions / AI in PR / issue / commit text.
- Update `progress.md` only — no other auto-memory edits, no CLAUDE.md edits without explicit ask.
- New `*.md` content in `packages/site/src/content/works/` is whitelisted by Phase 1's `.gitignore` carve-out (`!/packages/site/src/content/works/**/*.md`).
