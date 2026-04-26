# Plan: Phase 1 — Card Grid MVP

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 0 typography specimen on `/` with a grid of heterogeneous work cards sourced from MDX in `src/content/works/`; add `/works` archive route; ship 0 KB JS first-load on both routes.

**Architecture:** Single Astro Content Collection (`works`) with a `z.discriminatedUnion("type", […])` schema across 5 type variants (`code`/`video`/`music`/`math`/`writing`); one `Card.astro` outer shell + 5 thumb components composing the Phase 0 layout primitives; `lib/works.ts` typed query helpers consumed by `index.astro` and `works/index.astro`; covers are schema-only (no `<img>`); fast-check property tests on schema + sort + draft filter; nightly Stryker mutation testing.

**Tech Stack:** Astro 6.1.9 + `@astrojs/mdx` ^5 + `astro/zod` (Zod 4) + `astro/loaders` `glob` + Vitest 4 + `@fast-check/vitest` ^0.4 + `fast-check` ^4 + `@stryker-mutator/core` ^9 + `@stryker-mutator/vitest-runner` ^9 + `@stryker-mutator/typescript-checker` ^9. Phase 0 toolchain unchanged.

---

## Branch
`phase/01-card-grid-mvp` cut from `78fae86` (Phase 0 merge commit on `main`); already pushed to `origin`. All tasks land as ordered commits on this branch. Phase merges via merge-commit (no squash, no rebase) and is tagged `phase-1` on the merge SHA.

## Open-question resolutions (pinned at plan-write 2026-04-25)

The spec's 14 OQs are resolved here; the implementer treats these as ground truth.

| OQ | Status | Resolution |
|----|--------|------------|
| #1 narrowing | resolved in spec | Native discriminated-union narrowing works (TS 6 + `astro/zod`); no helper needed. |
| #2 `z.discriminatedUnion` shape | **resolved at plan-write** | Live probe in `packages/site/`: `bun -e "import('astro/zod').then(m => console.log(typeof m.z.discriminatedUnion))"` → `function` (exit 0 2026-04-25). Same probe confirmed `z.url` and `z.coerce.date` callable. Schema uses `(discriminator, [array])` shape unchanged from Zod 3. |
| #3 `z.coerce.date` | resolved in spec | Zod 4 widens input to `unknown`; YAML strings parse to `Date`. |
| #4 slug derivation | **resolved at plan-write** | Astro `glob` loader's `generateId` defaults to slugified path-relative-to-base sans extension. The schema's optional `slug` field is **independent** of Astro's `id` (the loader's primary key) — `id` always exists, `slug` is opt-in metadata. Card hrefs in Phase 1 use **external URL fields** (`repo`/`youtube`/etc.) per ADR 0011, not `id` or `slug`. Phase 3 detail pages use `id`. The `slug` field is reserved for a future "preferred display URL" that may differ from the filesystem ID; for Phase 1 it is captured but **unused** by any rendering code. Source: `https://docs.astro.build/en/reference/content-loader-reference/#generateid` (fetched 2026-04-25). |
| #5 cover image | resolved in spec | Schema-only; no `<img>`. ADR 0010 MUST. |
| #6 `z.url()` | resolved in spec | Top-level in `astro/zod` (Zod 4); confirmed live. |
| #7 `glob` pattern syntax | **resolved at plan-write** | Brace form `"**/*.{md,mdx}"` (matches research-doc; valid micromatch via `picomatch`/`tinyglobby`; both forms documented as supported per `https://docs.astro.build/en/reference/content-loader-reference/`). Plan does NOT add a divergence-check unit test (was a low-value gate that would couple to micromatch internals). If both forms ever diverge in CI, that's an Astro bug worth filing — not a Phase 1 concern. |
| #8 Stryker + Bun | resolved in spec | `bunx stryker` works (9.6.1 probe). |
| #9 Stryker + happy-dom | **resolved at plan-write** | Use a **separate Stryker config** at `packages/site/stryker.conf.json` that points to a scoped `vitest.mutation.config.ts` with `environment: "node"` (the schema + query helpers are pure-logic, no DOM needed). Avoids the cost of booting happy-dom for every mutant. Source: `https://stryker-mutator.io/docs/stryker-js/vitest-runner/` (fetched 2026-04-25; vitest-runner respects `vitest.config.*` via `vitest.configFile`). |
| #10 MDX-with-JSX | **resolved at plan-write** | **Allow JSX in `.mdx` fixtures, never render the body** in Phase 1. Phase 1 components only read `entry.data` (frontmatter), never `<Content />` or `entry.body`. Implementer asserts in a vitest unit that no Phase 1 page imports the rendered body. No remark plugin. |
| #11 card href | resolved in spec | `<a href={externalUrl}>` priority repo→youtube→listen→arxiv→pdf, else `<article>` (ADR 0011). |
| #12 fixture location | **resolved at plan-write** | **Fixtures live under `src/content/works/` with `draft: true`** (or production-realistic frontmatter when the goal is to exercise the prod render path). Production filter (`import.meta.env.PROD ? data.draft !== true : true`) hides drafts in built output. Reason: keeps the production schema honest (no parallel test-only collection); visual-regression and dev preview render them naturally; e2e tests can run against `bun run dev` (drafts visible) AND `bun run build` (drafts hidden) by toggling `import.meta.env.PROD` semantics. Trade-off: 10 MDX files in `src/`. Acceptable — they're plain Markdown content, source-controllable, and the schema validates them on every build. |
| #13 `@fast-check/vitest` peer-dep | **resolved at plan-write** | `@fast-check/vitest@0.4.0` declares `peerDependencies.vitest: "^4.1.0"` — verified via `curl -sL https://registry.npmjs.org/@fast-check/vitest/0.4.0` (fetched 2026-04-25 in the plan-review session; `peerDependencies.vitest === "^4.1.0"`). Phase 0's `vitest@^4.1.5` satisfies `^4.1.0`. No vitest bump needed. The implementer re-runs `bunx jq '.peerDependencies' node_modules/@fast-check/vitest/package.json` after install in Task 1 as a belt-and-suspenders check. |
| #14 `@astrojs/mdx` under Bun | **resolved at plan-write** | `@astrojs/mdx@^5` is a build-time Vite plugin; runtime impact is zero (no `.mdx` is shipped to the browser — only HTML+CSS). Astro 6 + Bun's bundler use Vite under the hood (Astro is a Vite app); the plugin works because Astro is the host, not Bun directly. Verification: Task 2 ships a single `.mdx` fixture and runs `bun run build`; if the build emits HTML for that file's parent route, `@astrojs/mdx` works. Failure mode (empty body / build error) surfaces at Task 2's GREEN. |

## Phase 0 forward-warnings — folding decisions

From Phase 0 PR #1 body:
- **`scripts/check-docs.ts` walks `.ts` only.** Phase 1 introduces `.astro` components with **no JS exports** (Card / Thumbs / TypeGlyph / MetaPills frontmatter has no `export const`). Spec L66 confirms: ".astro components don't trigger `check:docs`". **Decision: do not extend.** If a Phase 2 `.astro` component starts exporting frontmatter `const` (e.g. `export const prerender = false`), file an issue then.
- **`vitest.config.ts` `exclude` list.** Phase 1 ships 4+ unit tests under `tests/unit/`. **Decision: no config change needed** — Phase 0's exclude already only filters `tests/e2e/**`, so `tests/unit/**` is in scope automatically.
- **LHCI may need re-verification on first CI run.** **Decision: rely on Task 12's CI run; fix if red.** Not a code change up front.
- **Visual-regression Linux-only baseline.** **Decision: defer CONTRIBUTING.md note** — file as `nit` issue post-merge, since it doesn't block phase work.
- **`wrangler-action@v3` SHA pin.** **Decision: defer** — file as `nit` issue post-merge. SHA-pinning third-party actions is a hygiene improvement, not a Phase 1 deliverable.

## File structure (predicted, lock at plan-write)

**New files (production code):**
- `packages/site/src/content.config.ts` — content-collection config + schema + named exports.
- `packages/site/src/lib/works.ts` — `listWorks`, `sortByDateDesc`, `WorkEntry` re-export.
- `packages/site/src/components/Card.astro` — outer shell + click-target logic.
- `packages/site/src/components/TypeGlyph.astro` — per-type SVG indicator.
- `packages/site/src/components/MetaPills.astro` — date + tag-count pills.
- `packages/site/src/components/thumbs/CodeThumb.astro`
- `packages/site/src/components/thumbs/VideoThumb.astro`
- `packages/site/src/components/thumbs/MusicThumb.astro`
- `packages/site/src/components/thumbs/MathThumb.astro`
- `packages/site/src/components/thumbs/WritingThumb.astro`
- `packages/site/src/pages/works/index.astro` — `/works` archive.

**Modified files:**
- `packages/site/src/pages/index.astro` — replace typography specimen with grid.
- `packages/site/astro.config.mjs` — register `mdx()` integration.
- `packages/site/package.json` — add deps + `test:mutation` script.
- `packages/site/.size-limit.cjs` — extend budget to `/works`; bump 30→60 KB ceiling on `/`.
- `packages/site/lighthouserc.cjs` — add `/works` URL to LHCI assertions.
- `packages/site/tests/e2e/landing.spec.ts` — adjust visual-regression mask for new home content.
- `packages/site/playwright.config.ts` — no changes expected; verify mobile preset still applies.
- `packages/site/knip.jsonc` — add `tests/unit/**/*.ts` if knip flags new test files (verify; spec entry already covers tests).
- `packages/site/vitest.config.ts` — verify `tests/unit/**` is in `include`.

**New files (content fixtures, ship to prod schema-validation but hidden by `draft: true`):**
- `packages/site/src/content/works/code-1.mdx` (`draft: true`)
- `packages/site/src/content/works/code-2.md` (production-realistic, `draft: false`)
- `packages/site/src/content/works/video-1.mdx` (`draft: true`)
- `packages/site/src/content/works/video-2.md` (`draft: false`)
- `packages/site/src/content/works/music-1.mdx` (`draft: true`)
- `packages/site/src/content/works/music-2.md` (`draft: false`)
- `packages/site/src/content/works/math-1.mdx` (`draft: true`)
- `packages/site/src/content/works/math-2.md` (`draft: false`)
- `packages/site/src/content/works/writing-1.mdx` (`draft: true`)
- `packages/site/src/content/works/writing-2.md` (`draft: false`)
- (Mix of 5 `.mdx` + 5 `.md` exercises ADR 0009. 5 prod-visible + 5 drafts exercises the production filter.)
- `packages/site/tests/fixtures/invalid-frontmatter/missing-duration.mdx` — used by schema-violations test (NOT under `src/content/works/`).

**New files (tests):**
- `packages/site/tests/unit/content-schema.test.ts` — fast-check property tests on schema parse/safeParse.
- `packages/site/tests/unit/works-query.test.ts` — fast-check property tests on `sortByDateDesc` + `listWorks` draft filter.
- `packages/site/tests/unit/schema-violations.test.ts` — invokes `astro check` with the invalid fixture, asserts non-zero exit + Zod error.
- `packages/site/tests/unit/works-types.test-d.ts` — `expectTypeOf` from vitest, asserts narrowing types.
- `packages/site/tests/e2e/cards.spec.ts` — Playwright e2e: `/` + `/works` cards render, Axe clean, focus-order, visual-regression baselines.

**New files (Stryker):**
- `packages/site/stryker.conf.json` — Stryker config.
- `packages/site/vitest.mutation.config.ts` — scoped vitest config (Node env).
- `.github/workflows/mutation.yml` — nightly Stryker workflow (or extend existing `ci.yml` with a `schedule:` trigger — plan picks the **separate workflow** for clarity).

**New files (ADRs):**
- `packages/specs/adrs/0007-single-collection-discriminated-union.md`
- `packages/specs/adrs/0008-stryker-and-fast-check-targets.md`
- `packages/specs/adrs/0009-mdx-vs-md-policy.md`
- `packages/specs/adrs/0010-cards-no-image-pipeline-yet.md`
- `packages/specs/adrs/0011-card-click-target-strategy.md`

## Task list

Each task is one commit, RED→GREEN within the same commit. Hard cap: 30 min focused work per task. The 14-task split mirrors Phase 0's granularity.

---

### Task 1 — Install Phase 1 deps + extend `<Grid>` (polymorphic) + register `@astrojs/mdx`

**Files:**
- Modify: `packages/site/package.json`
- Modify: `packages/site/astro.config.mjs` (add `import mdx from "@astrojs/mdx"; integrations: [mdx()]`)
- Modify: `packages/site/src/components/Grid.astro` (add polymorphic `as` prop + `class` passthrough — fixes plan-review B1)
- Modify: `packages/site/knip.jsonc` (only if a new dep is flagged unused before it's consumed in a later task; cite `// Wired in Task N` reason)

> **Why this task is combined:** plan-review B1 requires extending `<Grid>` to accept `as="ul"` + `class` so that Tasks 8/9 can render `<Grid as="ul" class="works-grid">`. The Grid extension is a one-file change with no test footprint of its own — the visual-regression baseline in Task 10 locks the rendered HTML. Folding it into Task 1 means Task 8/9 can simply consume the new API. Plan-review C5 deletion: the `phase-1-deps.test.ts` vacuous RED is dropped — `bunx astro check` against the `import mdx from "@astrojs/mdx"` line is the real RED→GREEN.

- [ ] **Step 1: Write the failing RED**

The RED is the build/typecheck failing because `astro.config.mjs` imports `@astrojs/mdx` before it's installed. Run BEFORE installing:

```bash
cd packages/site
# Pre-edit the config to import mdx, then immediately:
bunx astro check
```
Expected: non-zero exit, `Cannot find module '@astrojs/mdx'` (or similar resolution error).

(If pre-editing the config is awkward, the RED may instead be the `worksSchema` import in Task 2 — but the cleanest RED is the missing-module check above.)

- [ ] **Step 2: Install deps**

```bash
cd packages/site
bun add @astrojs/mdx@^5
bun add -D @stryker-mutator/core@^9 @stryker-mutator/vitest-runner@^9 @stryker-mutator/typescript-checker@^9
bun add -D fast-check@^4 @fast-check/vitest@^0.4
```

- [ ] **Step 3: Verify peer-dep range (OQ#13 belt-and-suspenders)**

Run: `bunx jq '.peerDependencies' node_modules/@fast-check/vitest/package.json`
Expected: `vitest: "^4.1.0"` (matches plan-write citation 2026-04-25). Phase 0's `vitest@^4.1.5` satisfies `^4.1.0`. If not, abort and bump vitest before continuing.

- [ ] **Step 4: Register `mdx()` integration in `astro.config.mjs`**

Add at top:
```js
import mdx from "@astrojs/mdx";
```
Add to defineConfig (preserve existing fonts + output config):
```js
  integrations: [mdx()],
```

- [ ] **Step 5: Extend `<Grid>` to accept `as` + `class` (B1 fix)**

Read `packages/site/src/components/Grid.astro` first to confirm current shape (Phase 0 Grid takes only `min` + `gap`; renders hard-coded `<div data-component="grid">`). Modify to accept polymorphic tag + classlist passthrough while preserving the `data-component="grid"` marker (Phase 0 e2e `primitives.spec.ts:8-30` asserts on it):

```astro
---
/**
 * Grid layout primitive — auto-fill responsive columns.
 *
 * Why: Phase 1 needs `<Grid as="ul">` for the works grid (semantic list);
 * polymorphic prop preserves the data-component marker for Phase 0 e2e.
 *
 * @see packages/specs/plans/01-card-grid-mvp.md § Task 1 Step 5
 */
import type { HTMLTag } from "astro/types";
import { resolveSpace, type SpaceToken } from "../lib/tokens";
type Props = {
  min?: string;
  gap?: SpaceToken;
  as?: HTMLTag;
  class?: string;
};
const { min = "16ch", gap = "4", as: Tag = "div", class: className } = Astro.props;
const style = `display: grid; grid-template-columns: repeat(auto-fill, minmax(min(${min}, 100%), 1fr)); gap: ${resolveSpace(gap)};`;
---
<Tag data-component="grid" class={className} style={style}><slot /></Tag>
```

(If `lib/tokens.ts` / `resolveSpace` doesn't exist in Phase 0, instead inline the existing Grid's gap-resolution logic — read the current file first and preserve its style-gen approach.)

- [ ] **Step 6: Verify Phase 0 e2e still pass against the new Grid**

```bash
bunx astro check
bun run build
bunx playwright test tests/e2e/primitives.spec.ts
```
Expected: `astro check` exits 0; build emits HTML; primitives.spec asserts `data-component="grid"` count > 0 still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/site/package.json packages/site/bun.lock packages/site/astro.config.mjs packages/site/src/components/Grid.astro packages/site/knip.jsonc
git commit -m "Phase 1 Task 1: install @astrojs/mdx + Stryker + fast-check; extend <Grid> polymorphic; register mdx()"
```

---

### Task 2 — Content collection schema (discriminated union) + named exports

**Files:**
- Create: `packages/site/src/content.config.ts`

- [ ] **Step 1: Write the failing test**

`packages/site/tests/unit/content-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { worksSchema, type WorkEntry } from "../../src/content.config";

describe("worksSchema discriminated union", () => {
  it("parses a valid code entry", () => {
    const result = worksSchema.safeParse({
      type: "code",
      title: "demo",
      date: "2026-04-25",
      stack: ["ts"],
    });
    expect(result.success).toBe(true);
  });
  it("rejects a video entry without duration", () => {
    const result = worksSchema.safeParse({
      type: "video",
      title: "demo",
      date: "2026-04-25",
    });
    expect(result.success).toBe(false);
  });
  it("rejects an unknown type literal", () => {
    const result = worksSchema.safeParse({
      type: "podcast",
      title: "demo",
      date: "2026-04-25",
    });
    expect(result.success).toBe(false);
  });
  it("coerces date string to Date", () => {
    const result = worksSchema.safeParse({
      type: "writing",
      title: "demo",
      date: "2026-04-25",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBeInstanceOf(Date);
  });
  it("defaults tags to []", () => {
    const result = worksSchema.safeParse({
      type: "code",
      title: "demo",
      date: "2026-04-25",
      stack: [],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual([]);
  });
  it("clamps summary to ≤240 chars", () => {
    const long = "x".repeat(241);
    const result = worksSchema.safeParse({
      type: "code",
      title: "demo",
      date: "2026-04-25",
      stack: [],
      summary: long,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/content-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema**

`packages/site/src/content.config.ts`:
```ts
/**
 * Content-collection config for the `works` collection.
 *
 * Why: Phase 1 ships a heterogeneous home grid; one collection with a
 * discriminated-union schema lets `getCollection("works")` return one sortable,
 * narrow-able list. See ADR 0007.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md
 * @see packages/specs/adrs/0007-single-collection-discriminated-union.md
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const baseFields = {
  title: z.string(),
  slug: z.string().optional(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  summary: z.string().max(240).optional(),
  cover: z.object({ src: z.string(), alt: z.string() }).optional(),
};

/**
 * Discriminated-union schema over the five Phase 1 work types.
 *
 * Why: TS narrows correctly on `entry.data.type === "code"` etc.; verified at
 * spec polish 2026-04-25 (positive probe exit 0; negative probe TS2339).
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Schema
 */
export const worksSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("code"),
    repo: z.url().optional(),
    stack: z.array(z.string()),
    ...baseFields,
  }),
  z.object({
    type: z.literal("video"),
    duration: z.number(),
    youtube: z.string().optional(),
    ...baseFields,
  }),
  z.object({
    type: z.literal("music"),
    bpm: z.number().optional(),
    listen: z.url().optional(),
    ...baseFields,
  }),
  z.object({
    type: z.literal("math"),
    pdf: z.string().optional(),
    arxiv: z.string().optional(),
    ...baseFields,
  }),
  z.object({
    type: z.literal("writing"),
    wordCount: z.number().optional(),
    readingTime: z.number().optional(),
    ...baseFields,
  }),
]);

/**
 * TypeScript type for a parsed work entry's frontmatter.
 *
 * Why: re-exported so `lib/works.ts` and tests can type entries without
 * re-deriving via `z.infer` everywhere.
 *
 * @see packages/site/src/content.config.ts § worksSchema
 */
export type WorkEntry = z.infer<typeof worksSchema>;

const works = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/works" }),
  schema: worksSchema,
});

/**
 * Astro Content Collections registry.
 *
 * Why: Astro 6 requires this exact named export at `src/content.config.ts`
 * to wire the `works` collection.
 *
 * @see https://docs.astro.build/en/guides/content-collections/
 */
export const collections = { works };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/content-schema.test.ts`
Expected: 6× PASS.

- [ ] **Step 5: Write ADR 0007 (single-collection-discriminated-union)**

Create `packages/specs/adrs/0007-single-collection-discriminated-union.md` following Phase 0 ADR skeleton (Context · Decision · Alternatives · Consequences · Sources). Decision: one `works` collection with `z.discriminatedUnion("type", […])`. Alternative considered: 5 collections. Reason: heterogeneous home grid needs `getCollection("works")` returning one sortable list with TS-narrowed per-type fields.

- [ ] **Step 6: Commit**

```bash
git add packages/site/src/content.config.ts packages/site/tests/unit/content-schema.test.ts packages/specs/adrs/0007-single-collection-discriminated-union.md
git commit -m "Phase 1 Task 2: content schema (discriminated union) + ADR 0007"
```

---

### Task 3 — Ten MDX/MD fixtures + draft filter + invalid fixture

**Files:**
- Create: `packages/site/src/content/works/code-1.mdx`, `code-2.md`, `video-1.mdx`, `video-2.md`, `music-1.mdx`, `music-2.md`, `math-1.mdx`, `math-2.md`, `writing-1.mdx`, `writing-2.md`
- Create: `packages/site/tests/fixtures/invalid-frontmatter/missing-duration.mdx`
- Create: `packages/site/tests/unit/schema-violations.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/site/tests/unit/schema-violations.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

describe("astro check fails on schema violation", () => {
  it("emits a Zod error pointing at the offending file when an invalid fixture is staged", () => {
    const src = resolve(__dirname, "../fixtures/invalid-frontmatter/missing-duration.mdx");
    const dst = resolve(__dirname, "../../src/content/works/_invalid-test.mdx");
    copyFileSync(src, dst);
    try {
      let exitCode = 0;
      let stderr = "";
      try {
        execSync("bunx astro check", { cwd: resolve(__dirname, "../.."), stdio: "pipe" });
      } catch (e) {
        const err = e as { status?: number; stderr?: Buffer; stdout?: Buffer };
        exitCode = err.status ?? 1;
        stderr = (err.stderr?.toString() ?? "") + (err.stdout?.toString() ?? "");
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/_invalid-test\.mdx/);
      expect(stderr.toLowerCase()).toMatch(/duration|invalid|expected/);
    } finally {
      unlinkSync(dst);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/schema-violations.test.ts`
Expected: FAIL (fixture file does not exist yet).

- [ ] **Step 3: Write the 10 valid fixtures (5 prod-visible, 5 drafts)**

Each file has YAML frontmatter delimited by `---` and a short prose body. Examples:

`packages/site/src/content/works/code-1.mdx` (draft):
```mdx
---
type: code
title: "Demo project alpha"
date: 2026-04-01
draft: true
tags: ["demo", "draft"]
stack: ["typescript", "astro"]
repo: "https://github.com/utof/demo-alpha"
summary: "A demo code work used for fixture coverage."
---

Demo body. _Drafts are visible in dev._
```

`packages/site/src/content/works/code-2.md` (prod):
```md
---
type: code
title: "Hello world utility"
date: 2026-03-15
tags: ["utility"]
stack: ["bun"]
repo: "https://github.com/utof/hello-world"
summary: "Production-visible code fixture."
---

Hello world body.
```

(Repeat the pattern for video/music/math/writing — each pair has 1 draft `.mdx` and 1 production `.md`. The video fixtures need `duration: 600`; the music fixtures may include `bpm: 128` and `listen: "https://example.com/track"`; math fixtures have `arxiv: "2401.00001"`; writing fixtures have `wordCount: 1200` and `readingTime: 6`.)

- [ ] **Step 4: Write the invalid fixture**

`packages/site/tests/fixtures/invalid-frontmatter/missing-duration.mdx`:
```mdx
---
type: video
title: "Missing duration"
date: 2026-04-25
---

Body.
```

- [ ] **Step 5: Run test + astro check on valid set**

```bash
bunx astro check
bunx vitest run tests/unit/schema-violations.test.ts
```
Expected: `astro check` exits 0 with 10 valid fixtures present; vitest test PASS (the test temporarily stages the invalid fixture, asserts non-zero exit, then unstages).

- [ ] **Step 6: Commit**

```bash
git add packages/site/src/content/works/ packages/site/tests/fixtures/invalid-frontmatter/ packages/site/tests/unit/schema-violations.test.ts
git commit -m "Phase 1 Task 3: 10 fixtures (5 prod + 5 drafts) + invalid-frontmatter probe"
```

---

### Task 4 — `lib/works.ts` query helpers + property tests + enable vitest typecheck

**Files:**
- Create: `packages/site/src/lib/works.ts`
- Create: `packages/site/tests/unit/works-query.test.ts`
- Create: `packages/site/tests/unit/works-types.test-d.ts`
- Modify: `packages/site/vitest.config.ts` — add `typecheck: { enabled: true, include: ["**/*.test-d.ts"] }` (plan-review B2 fix; without this, `*.test-d.ts` is silently skipped per `https://vitest.dev/guide/testing-types`).

- [ ] **Step 1: Write the failing test (property + unit + type)**

`packages/site/tests/unit/works-query.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fc, test } from "@fast-check/vitest";
import { sortByDateDesc, listWorks } from "../../src/lib/works";
import type { WorkEntry } from "../../src/content.config";

const entryArb = fc.record({
  id: fc.string({ minLength: 1 }),
  data: fc.record({
    type: fc.constantFrom("code", "video", "music", "math", "writing") as fc.Arbitrary<WorkEntry["type"]>,
    title: fc.string({ minLength: 1 }),
    date: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
    tags: fc.array(fc.string(), { maxLength: 5 }),
    draft: fc.boolean(),
  }),
});

describe("sortByDateDesc", () => {
  test.prop([fc.array(entryArb)])("is idempotent", (xs) => {
    const once = sortByDateDesc(xs as never);
    const twice = sortByDateDesc(once);
    expect(twice).toEqual(once);
  });
  test.prop([fc.array(entryArb, { minLength: 2 })])("monotone non-increasing", (xs) => {
    const sorted = sortByDateDesc(xs as never);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]!.data.date.getTime()).toBeGreaterThanOrEqual(sorted[i]!.data.date.getTime());
    }
  });
  test.prop([fc.array(entryArb)])("permutation: same multiset", (xs) => {
    const sorted = sortByDateDesc(xs as never);
    expect(sorted.length).toBe(xs.length);
    const ids = (arr: typeof xs) => arr.map(e => e.id).sort();
    expect(ids(sorted)).toEqual(ids(xs));
  });
});

describe("listWorks draft filter", () => {
  test.prop([fc.array(entryArb)])("PROD excludes drafts", (xs) => {
    const result = listWorks(xs as never, { isProd: true });
    expect(result.every(e => e.data.draft !== true)).toBe(true);
  });
  test.prop([fc.array(entryArb)])("dev includes drafts", (xs) => {
    const result = listWorks(xs as never, { isProd: false });
    expect(result.length).toBe(xs.length);
  });
  test.prop([fc.array(entryArb)])("count(prod) ≤ count(dev)", (xs) => {
    expect(listWorks(xs as never, { isProd: true }).length)
      .toBeLessThanOrEqual(listWorks(xs as never, { isProd: false }).length);
  });
});
```

`packages/site/tests/unit/works-types.test-d.ts`:
```ts
import { expectTypeOf } from "vitest";
import type { WorkEntry } from "../../src/content.config";

declare const e: WorkEntry;
if (e.type === "code") {
  expectTypeOf(e.repo).toEqualTypeOf<string | undefined>();
  expectTypeOf(e.stack).toEqualTypeOf<string[]>();
}
if (e.type === "video") {
  expectTypeOf(e.duration).toEqualTypeOf<number>();
}
// @ts-expect-error — duration not on the union without narrowing
e.duration;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/works-query.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helpers**

`packages/site/src/lib/works.ts`:
```ts
/**
 * Typed query helpers for the `works` content collection.
 *
 * Why: `index.astro` and `works/index.astro` both consume sorted, draft-filtered
 * lists; centralizing the logic here keeps the schema's discriminated-union
 * narrowing intact and makes the helpers Stryker-targetable.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § lib/works.ts
 */
import type { WorkEntry } from "../content.config";

/** Minimal shape of a content-collection entry consumed by these helpers. */
export type EntryLike<D extends { date: Date; draft?: boolean } = WorkEntry> = {
  readonly id: string;
  readonly data: D;
};

/**
 * Returns a new array sorted by `data.date` descending. Stable for equal dates.
 *
 * Why: Phase 1 home grid lists work newest-first; centralized so Stryker can
 * mutation-test the comparator direction.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Property tests
 */
export function sortByDateDesc<E extends EntryLike>(entries: readonly E[]): E[] {
  return [...entries].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Options for {@link listWorks}. */
export interface ListWorksOptions {
  /** When true, entries with `draft: true` are excluded. Defaults to `import.meta.env.PROD`. */
  isProd?: boolean;
}

/**
 * Returns sorted, draft-filtered entries.
 *
 * Why: production-only draft hiding is a hard invariant (spec L18); the helper
 * shape lets tests mock `isProd` without touching `import.meta.env`.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Schema/draft filter
 */
export function listWorks<E extends EntryLike>(
  entries: readonly E[],
  opts: ListWorksOptions = {},
): E[] {
  const isProd = opts.isProd ?? import.meta.env.PROD;
  const filtered = isProd ? entries.filter(e => e.data.draft !== true) : entries;
  return sortByDateDesc(filtered);
}
```

- [ ] **Step 4: Enable vitest typecheck mode (B2 fix)**

Modify `packages/site/vitest.config.ts` `test` block to add:
```ts
typecheck: {
  enabled: true,
  include: ["**/*.test-d.ts"],
},
```

- [ ] **Step 5: Run all unit tests including typecheck**

```bash
bunx vitest run tests/unit/
bunx vitest --typecheck.only run
```
Expected: all PASS (schema + query + types). The typecheck pass exercises `works-types.test-d.ts` and validates the `@ts-expect-error` directive.

- [ ] **Step 6: Commit**

```bash
git add packages/site/src/lib/works.ts packages/site/tests/unit/works-query.test.ts packages/site/tests/unit/works-types.test-d.ts packages/site/vitest.config.ts
git commit -m "Phase 1 Task 4: lib/works.ts + fast-check property tests + enable vitest typecheck"
```

---

### Task 5 — `Card.astro` outer shell + click-target strategy (ADR 0011)

**Files:**
- Create: `packages/site/src/components/Card.astro`
- Modify: `packages/site/src/styles/tokens.css` (add `--radius-2` if missing)

- [ ] **Step 1: Confirm token availability**

Phase 0 ships `--radius-sm` / `--radius-md` / `--radius-lg` (verified at plan-write 2026-04-25 by reading `packages/site/src/styles/tokens.css:58-60`). Cards use `--radius-md` (8px). No new token needed.

- [ ] **Step 2: Write the component**

`packages/site/src/components/Card.astro`:
```astro
---
/**
 * Card.astro — uniform outer shell for a work card.
 *
 * Why: ADR 0011 — `<a href={externalUrl}>` when an external URL is present
 * (priority repo→youtube→listen→arxiv→pdf), else `<article>` (no link).
 * Avoids `href="#"` Axe violations and keeps Phase 1 0-KB-JS.
 *
 * @see packages/specs/adrs/0011-card-click-target-strategy.md
 */
import type { WorkEntry } from "../content.config";

interface Props {
  data: WorkEntry;
}
const { data } = Astro.props;

function externalUrlFor(d: WorkEntry): string | undefined {
  if (d.type === "code" && d.repo) return d.repo;
  if (d.type === "video" && d.youtube) return d.youtube;
  if (d.type === "music" && d.listen) return d.listen;
  if (d.type === "math") return d.arxiv ?? d.pdf;
  return undefined;
}

const href = externalUrlFor(data);
const Tag = href ? "a" : "article";
const dataDraft = data.draft ? { "data-draft": "true" } : {};
---

<Tag class="card" href={href} {...dataDraft}>
  <slot name="header" />
  <slot name="thumb" />
  <slot name="meta" />
</Tag>

<style>
  .card {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
    border-radius: var(--radius-md);
    background: transparent;
    text-decoration: none;
    color: inherit;
  }
  a.card:hover,
  a.card:focus-visible {
    outline: 1px solid currentColor;
  }
  @media (prefers-reduced-motion: no-preference) {
    .card { transition: outline 100ms ease; }
  }
</style>
```

- [ ] **Step 3: Verify `bunx astro check` exits 0**

Run: `bunx astro check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/components/Card.astro packages/site/src/styles/tokens.css
git commit -m "Phase 1 Task 5: Card.astro outer shell with ADR-0011 click-target strategy"
```

---

### Task 6 — `TypeGlyph.astro` + `MetaPills.astro`

**Files:**
- Create: `packages/site/src/components/TypeGlyph.astro`
- Create: `packages/site/src/components/MetaPills.astro`

- [ ] **Step 1: Write `TypeGlyph.astro`**

```astro
---
/**
 * TypeGlyph.astro — small (≤24×24) SVG indicator for the work type.
 *
 * Why: visual rhythm across the heterogeneous grid; one glyph per type.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Card visual contract
 */
import type { WorkEntry } from "../content.config";
interface Props { type: WorkEntry["type"]; }
const { type } = Astro.props;
---
<span class="glyph" aria-hidden="true" data-type={type}>
  {type === "code" && (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 6 L2 12 L8 18 M16 6 L22 12 L16 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>)}
  {type === "video" && (<svg viewBox="0 0 24 24" width="20" height="20"><polygon points="6,4 6,20 20,12" fill="currentColor"/></svg>)}
  {type === "music" && (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 18 V5 L20 3 V16" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="17" cy="16" r="3" fill="currentColor"/></svg>)}
  {type === "math" && (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 6 H20 M4 12 H14 M4 18 H20" fill="none" stroke="currentColor" stroke-width="2"/></svg>)}
  {type === "writing" && (<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 4 H20 V20 H4 Z M7 8 H17 M7 12 H17 M7 16 H13" fill="none" stroke="currentColor" stroke-width="2"/></svg>)}
</span>
```

- [ ] **Step 2: Write `MetaPills.astro`**

```astro
---
/**
 * MetaPills.astro — date + tag-count pill cluster.
 *
 * Why: locale-stable date format (YYYY-MM-DD via toISOString slice) prevents
 * CI snapshot drift across locale-default-changed runners.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § Card visual contract
 */
interface Props { date: Date; tagCount: number; }
const { date, tagCount } = Astro.props;
const ymd = date.toISOString().slice(0, 10);
---
<div class="pills">
  <span class="pill" data-test="meta-date">{ymd}</span>
  <span class="pill" data-test="meta-tags">{tagCount} {tagCount === 1 ? "tag" : "tags"}</span>
</div>

<style>
  .pills { display: flex; gap: var(--space-1); font-size: var(--font-size-1); }
  .pill {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
</style>
```

- [ ] **Step 3: Verify `bunx astro check` exits 0 + commit**

```bash
bunx astro check
git add packages/site/src/components/TypeGlyph.astro packages/site/src/components/MetaPills.astro
git commit -m "Phase 1 Task 6: TypeGlyph + MetaPills components"
```

---

### Task 7 — Five thumb components (CSS-only, no `<img>`)

**Files:**
- Create: `packages/site/src/components/thumbs/CodeThumb.astro`
- Create: `packages/site/src/components/thumbs/VideoThumb.astro`
- Create: `packages/site/src/components/thumbs/MusicThumb.astro`
- Create: `packages/site/src/components/thumbs/MathThumb.astro`
- Create: `packages/site/src/components/thumbs/WritingThumb.astro`

- [ ] **Step 1: Write each thumb (CSS-only abstract shape)**

Each thumb file follows this skeleton:

```astro
---
/**
 * CodeThumb.astro — CSS-only thumbnail abstract for code-type works.
 *
 * Why: Phase 1 ships no per-item imagery (ADR 0010); thumbs are uniform-aspect
 * CSS abstractions to maintain visual rhythm without LCP risk.
 *
 * @see packages/specs/adrs/0010-cards-no-image-pipeline-yet.md
 */
---
<div class="thumb code" aria-hidden="true">
  <div class="bracket left">{"{"}</div>
  <div class="bracket right">{"}"}</div>
</div>

<style>
  .thumb {
    aspect-ratio: 16 / 10;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, currentColor 5%, transparent);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 3rem;
    color: color-mix(in srgb, currentColor 60%, transparent);
  }
  .bracket.left { grid-column: 1; }
  .bracket.right { grid-column: 1; }
</style>
```

For VideoThumb: a centered triangular play glyph (CSS clip-path or SVG).
For MusicThumb: 3 vertical bars of varying heights.
For MathThumb: a centered Σ or ∫ glyph in `var(--font-serif)`.
For WritingThumb: 3 horizontal lines of varying lengths.

(All thumbs use `aspect-ratio: 16 / 10` and `var(--radius-1)`. Plan does not prescribe pixel-exact glyphs — the implementer picks shapes that are visually distinct, monochrome, and currentColor-aware. The visual-regression baseline locks the chosen shapes in Task 10.)

- [ ] **Step 2: Verify `bunx astro check` exits 0 + commit**

```bash
bunx astro check
git add packages/site/src/components/thumbs/
git commit -m "Phase 1 Task 7: 5 thumb components (CSS-only, no <img> per ADR 0010)"
```

---

### Task 8 — Replace `index.astro` typography specimen with card grid

**Files:**
- Modify: `packages/site/src/pages/index.astro`

- [ ] **Step 1: Read the current `index.astro` AND Phase 0 e2e**

```bash
cat packages/site/src/pages/index.astro
cat packages/site/tests/e2e/primitives.spec.ts
cat packages/site/tests/e2e/typography.spec.ts
```

**B4 — Phase 0 e2e dependencies on `/`:**
- `primitives.spec.ts:8-30` asserts `data-component="stack"`/`"cluster"`/`"frame"` count > 0 on `/`.
- `primitives.spec.ts:32-35` asserts `[data-test="typography-specimen"]` is visible on `/`.
- `typography.spec.ts:39-47` asserts `<h1>` font-family contains "Fraunces" on `/`.
- `typography.spec.ts:49-60` asserts `<code>` font-family contains "Commit Mono" on `/`.

**Decision (B4):** preserve typography sentinels in the new `index.astro`. The grid is the page's primary content; typography sentinels remain as a small `<header>` block at the top of the page (`<h1>utofme</h1>` for the H1 typography assertion + a hidden mono `<code>` sentinel + `<Stack>`/`<Cluster>`/`<Frame>` wrappers around the grid for `data-component` markers + the `[data-test="typography-specimen"]` wrapper). This keeps Phase 0 invariants verbatim and simplifies the visual-regression delta.

- [ ] **Step 2: Write the new `index.astro`**

```astro
---
/**
 * Home — card grid sourced from the `works` collection.
 *
 * Why: Phase 1 replaces the typography specimen body with a heterogeneous grid;
 * a small typography sentinel block remains so Phase 0 e2e assertions on
 * <h1>/<code>/data-component markers continue to pass without modification.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § URL routes added or changed
 * @see packages/site/tests/e2e/typography.spec.ts (Phase 0 sentinel dependencies)
 */
import { getCollection } from "astro:content";
import BaseLayout from "../layouts/_BaseLayout.astro";
import Stack from "../components/Stack.astro";
import Cluster from "../components/Cluster.astro";
import Frame from "../components/Frame.astro";
import Grid from "../components/Grid.astro";
import Card from "../components/Card.astro";
import TypeGlyph from "../components/TypeGlyph.astro";
import MetaPills from "../components/MetaPills.astro";
import CodeThumb from "../components/thumbs/CodeThumb.astro";
import VideoThumb from "../components/thumbs/VideoThumb.astro";
import MusicThumb from "../components/thumbs/MusicThumb.astro";
import MathThumb from "../components/thumbs/MathThumb.astro";
import WritingThumb from "../components/thumbs/WritingThumb.astro";
import { listWorks } from "../lib/works";

const all = await getCollection("works", ({ data }) =>
  import.meta.env.PROD ? data.draft !== true : true,
);
const works = listWorks(all);

const ThumbFor = {
  code: CodeThumb,
  video: VideoThumb,
  music: MusicThumb,
  math: MathThumb,
  writing: WritingThumb,
} as const;
---

<BaseLayout title="utofme">
  <main>
    <Stack gap="6">
      <!-- Typography sentinels: kept so Phase 0 e2e (typography.spec.ts, primitives.spec.ts) continues to pass without modification. -->
      <Frame data-test="typography-specimen">
        <Cluster gap="3">
          <h1>utofme</h1>
          <code>v1</code>
        </Cluster>
      </Frame>

      <Grid as="ul" class="works-grid" data-test="works-grid">
        {works.map(entry => {
          const Thumb = ThumbFor[entry.data.type];
          return (
            <li>
              <Card data={entry.data}>
                <header slot="header">
                  <TypeGlyph type={entry.data.type} />
                  <h2>{entry.data.title}</h2>
                </header>
                <Thumb slot="thumb" />
                <MetaPills slot="meta" date={entry.data.date} tagCount={entry.data.tags.length} />
              </Card>
            </li>
          );
        })}
      </Grid>
    </Stack>
  </main>
</BaseLayout>

<style>
  .works-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
    max-width: min(1280px, 100%);
  }
  @media (max-width: 480px) {
    .works-grid { grid-template-columns: 1fr; }
  }
</style>
```

- [ ] **Step 3: Verify `bunx astro check` + `bun run build`**

```bash
bunx astro check
bun run build
ls packages/site/dist/_astro/*.js 2>&1 | head -1
```
Expected: astro-check 0 errors; build success; **no `.js` chunks under `dist/_astro/`**. If JS chunks appear, abort — something added an island.

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/pages/index.astro
git commit -m "Phase 1 Task 8: replace typography specimen with works grid on /"
```

---

### Task 9 — `/works` archive route

**Files:**
- Create: `packages/site/src/pages/works/index.astro`

- [ ] **Step 1: Write the route**

`packages/site/src/pages/works/index.astro` — same structure as `/`'s grid, but full archive (no top-N truncation). Phase 1 has 10 entries total, so `/` and `/works` show identical content; the structural distinction is preserved for Phase 2 (where `/` may show "latest 6" and `/works` shows everything).

```astro
---
/**
 * /works — archive of all work entries.
 *
 * Why: Phase 1 mirrors `/` content (no truncation yet); Phase 2 introduces
 * "latest 6 on /, full list on /works" filtering.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md § URL routes added or changed
 */
import { getCollection } from "astro:content";
import BaseLayout from "../../layouts/_BaseLayout.astro";
import Grid from "../../components/Grid.astro";
import Card from "../../components/Card.astro";
import TypeGlyph from "../../components/TypeGlyph.astro";
import MetaPills from "../../components/MetaPills.astro";
import CodeThumb from "../../components/thumbs/CodeThumb.astro";
import VideoThumb from "../../components/thumbs/VideoThumb.astro";
import MusicThumb from "../../components/thumbs/MusicThumb.astro";
import MathThumb from "../../components/thumbs/MathThumb.astro";
import WritingThumb from "../../components/thumbs/WritingThumb.astro";
import { listWorks } from "../../lib/works";

const all = await getCollection("works", ({ data }) =>
  import.meta.env.PROD ? data.draft !== true : true,
);
const works = listWorks(all);

const ThumbFor = {
  code: CodeThumb, video: VideoThumb, music: MusicThumb, math: MathThumb, writing: WritingThumb,
} as const;
---

<BaseLayout title="works · utofme">
  <h1>Works</h1>
  <Grid as="ul" class="works-grid" data-test="works-grid">
    {works.map(entry => {
      const Thumb = ThumbFor[entry.data.type];
      return (
        <li>
          <Card data={entry.data}>
            <header slot="header">
              <TypeGlyph type={entry.data.type} />
              <h2>{entry.data.title}</h2>
            </header>
            <Thumb slot="thumb" />
            <MetaPills slot="meta" date={entry.data.date} tagCount={entry.data.tags.length} />
          </Card>
        </li>
      );
    })}
  </Grid>
</BaseLayout>

<style>
  .works-grid {
    list-style: none; padding: 0; margin: 0;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
    max-width: min(1280px, 100%);
  }
  @media (max-width: 480px) { .works-grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: Verify build emits `/works/index.html`**

```bash
bun run build
test -f packages/site/dist/works/index.html && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/pages/works/index.astro
git commit -m "Phase 1 Task 9: /works archive route"
```

---

### Task 10 — e2e + visual-regression for `/` and `/works`

**Files:**
- Create: `packages/site/tests/e2e/cards.spec.ts`
- Modify: `packages/site/tests/e2e/landing.spec.ts` (drop typography-specimen mask; add new mask if needed)

- [ ] **Step 1: Write the e2e spec**

`packages/site/tests/e2e/cards.spec.ts`:
```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["/", "/works"] as const;

for (const route of ROUTES) {
  test.describe(`route ${route}`, () => {
    test("renders the works grid with at least 5 production cards", async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const cards = page.locator('[data-test="works-grid"] > li');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(5);
    });

    test("axe clean", async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });

    test("first linked card is tab-focusable", async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      // First focusable element is either the page's skip link (if added in Phase 0) or the first <a> card.
      expect(["A", "BUTTON"]).toContain(focused);
    });

    test("visual regression", async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveScreenshot(`${route === "/" ? "home" : "works"}.png`, {
        maxDiffPixelRatio: 0.001,
        mask: [page.locator('[data-test="works-grid"] h2')],
      });
    });

    test("prefers-reduced-motion disables card outline transition", async ({ page, context }) => {
      await context.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route);
      const transition = await page.locator(".card").first().evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(["0s", "0s, 0s", ""]).toContain(transition);
    });
  });
}
```

- [ ] **Step 2: Update `landing.spec.ts` mask**

Replace `[data-test="typography-specimen"]` with `[data-test="works-grid"] h2` (variable-typography H2 absorbs subpixel drift in card titles).

- [ ] **Step 3: Generate baselines + run**

```bash
bunx playwright test --update-snapshots
bunx playwright test
```
Expected: green; new baselines committed under `tests/e2e/cards.spec.ts-snapshots/`.

- [ ] **Step 4: Commit**

```bash
git add packages/site/tests/e2e/
git commit -m "Phase 1 Task 10: e2e + visual-regression for / and /works"
```

---

### Task 11 — `size-limit` budget extension + LHCI second URL

**Files:**
- Modify: `packages/site/.size-limit.cjs`
- Modify: `packages/site/lighthouserc.cjs`

- [ ] **Step 1: Extend `.size-limit.cjs` (CSS+HTML only — B3 fix)**

Phase 0 documented that `size-limit` v12 treats "glob matches no files" as `missed=true` and exits 1; that's why the 0-KB-JS gate lives exclusively in `scripts/no-js-check.ts`. Do NOT add `*.js` size-limit entries — they would inversely fail. The existing `no-js-check.ts` globs `dist/_astro/*.js` route-agnostically, so coverage of `/works` is automatic.

```js
module.exports = [
  { name: "home css+html", path: "dist/index.html", limit: "60 KB", gzip: true },
  { name: "works css+html", path: "dist/works/index.html", limit: "60 KB", gzip: true },
];
```

- [ ] **Step 2: Extend `lighthouserc.cjs` to assert both URLs**

```js
module.exports = {
  ci: {
    collect: {
      staticDistDir: "packages/site/dist",
      url: ["http://localhost:4321/", "http://localhost:4321/works/"],
      numberOfRuns: 5,
      settings: { preset: "mobile", throttlingMethod: "simulate", throttling: { /* mobileSlow4G as Phase 0 */ } },
    },
    assert: {
      aggregationMethod: "optimistic",
      assertions: { "categories:performance": ["error", { minScore: 0.95 }] },
    },
  },
};
```

(Plan reuses Phase 0's mobileSlow4G throttling values; copy them verbatim.)

- [ ] **Step 3: Run gates**

```bash
bun run build
bunx size-limit
bun run scripts/no-js-check.ts
bunx lhci autorun
```
Expected: all green. **If `/works` `size-limit` exceeds 60 KB**, the implementer measures the actual size, reports it, and proposes either tightening fixture content OR raising the ceiling with a written rationale (this is a plan deviation requiring a spec amendment + an issue file).

- [ ] **Step 4: Commit**

```bash
git add packages/site/.size-limit.cjs packages/site/lighthouserc.cjs
git commit -m "Phase 1 Task 11: extend size-limit + LHCI to /works; bump CSS+HTML ceiling 30→60 KB"
```

---

### Task 12 — Stryker config + nightly CI workflow

**Files:**
- Create: `packages/site/stryker.conf.json`
- Create: `packages/site/vitest.mutation.config.ts`
- Create: `.github/workflows/mutation.yml`
- Modify: `packages/site/package.json` (add `test:mutation` script)

- [ ] **Step 1: Write `vitest.mutation.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/content-schema.test.ts", "tests/unit/works-query.test.ts"],
  },
});
```

- [ ] **Step 2: Write `stryker.conf.json`**

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "_comment": "Why: ADR 0008 — Stryker scoped to schema + query helpers (logic only).",
  "packageManager": "npm",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.mutation.config.ts" },
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": [
    "src/content.config.ts",
    "src/lib/works.ts"
  ],
  "thresholds": { "high": 90, "low": 80, "break": 80 },
  "reporters": ["clear-text", "html", "progress"],
  "concurrency": 2,
  "disableTypeChecks": "{src,tests}/**/*.{ts,tsx,js,jsx,mjs,cjs}"
}
```

- [ ] **Step 3: Add `test:mutation` script**

In `packages/site/package.json` `scripts`:
```json
"test:mutation": "stryker run"
```

- [ ] **Step 4: Write `.github/workflows/mutation.yml`**

```yaml
name: mutation
on:
  schedule:
    - cron: "0 5 * * *"
  workflow_dispatch:
jobs:
  stryker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: "1.3" }
      - run: bun install --frozen-lockfile
      - run: cd packages/site && bunx stryker run
```

- [ ] **Step 5: Run locally**

```bash
cd packages/site && bunx stryker run
```
Expected: mutation score ≥ 80% on the two mutated files. If under 80%, the implementer adds tests until threshold is met (do NOT lower the threshold — that's a spec deviation).

- [ ] **Step 6: Commit**

```bash
git add packages/site/stryker.conf.json packages/site/vitest.mutation.config.ts packages/site/package.json .github/workflows/mutation.yml
git commit -m "Phase 1 Task 12: Stryker config + nightly mutation workflow (≥80% on schema + lib/works)"
```

---

### Task 13 — Update Phase 0 `landing.spec.ts` & ensure all gates green pre-PR

**Files:**
- Verify-only sweep (no new code unless gates fail).

- [ ] **Step 1: Run the full local CI mirror**

```bash
cd packages/site
bunx biome check .
bunx prettier --check '**/*.{astro,svelte}'
bunx astro check
bunx type-coverage --at-least 100 --strict
bunx knip
bunx depcruise --validate .dependency-cruiser.cjs src
bun run check:docs
bunx vitest run
bun run build
bunx size-limit
bun run scripts/no-js-check.ts
bunx playwright install --with-deps chromium
bunx playwright test
bunx lhci autorun
```

- [ ] **Step 2: Fix any gate failure inline**

Common failures expected:
- `knip` may flag the new ADR files or fixtures — add to `ignoreDependencies` / `entry` as needed; cite the reason in `knip.jsonc`.
- `check:docs` will surface missing Why/@see/@issue on any new export — add it.
- `depcruise` may flag `lib/works.ts` → `content.config.ts` if the rule disallows certain edges; verify rules first.
- `astro check` should be 0; if not, narrow types in the page templates.

- [ ] **Step 3: Commit polish (if any)**

```bash
git add -p
git commit -m "Phase 1 Task 13: pre-PR gate sweep (knip / docs / depcruise polish)"
```

---

### Task 14 — Write 5 ADRs + open PR

**Files:**
- Create: `packages/specs/adrs/0007-single-collection-discriminated-union.md`
- Create: `packages/specs/adrs/0008-stryker-and-fast-check-targets.md`
- Create: `packages/specs/adrs/0009-mdx-vs-md-policy.md`
- Create: `packages/specs/adrs/0010-cards-no-image-pipeline-yet.md`
- Create: `packages/specs/adrs/0011-card-click-target-strategy.md`

Each ADR follows the Phase 0 ADR skeleton: Context · Decision · Alternatives · Consequences · Sources (URLs + access dates).

- [ ] **Step 1: Write the 5 ADRs**

(Content scoped per spec § "ADRs to write".)

- [ ] **Step 2: Final commit + push**

```bash
git add packages/specs/adrs/0007-* packages/specs/adrs/0008-* packages/specs/adrs/0009-* packages/specs/adrs/0010-* packages/specs/adrs/0011-*
git commit -m "Phase 1 Task 14: ADRs 0007–0011"
git push origin phase/01-card-grid-mvp
```

- [ ] **Step 3: Open PR**

```bash
gh pr create -B main -H phase/01-card-grid-mvp -t "Phase 1: Card Grid MVP" -F packages/specs/plans/01-card-grid-mvp-pr-body.md
```

(PR body draft is written separately at `docs/2026-04-25-phase-1-pr-draft.md` — not a plan task; the implementer drafts after gate green.)

- [ ] **Step 4: Halt**

Per CLAUDE.md branching rule + user's instruction: do **NOT** merge. Report PR URL to user; user reviews + merges.

---

## ADRs to write (delivered with this phase)

Already enumerated in spec § "ADRs to write"; reproduced here for the implementer's convenience:

1. `0007-single-collection-discriminated-union` — one `works` collection over five.
2. `0008-stryker-and-fast-check-targets` — schema + query helpers; ≥80% mutation floor.
3. `0009-mdx-vs-md-policy` — prefer `.md`; use `.mdx` only when JSX is needed.
4. `0010-cards-no-image-pipeline-yet` — `cover` schema-only; `<img>` lands in Phase 3.4.
5. `0011-card-click-target-strategy` — `<a href={externalUrl}>` priority chain or `<article>`.

## Self-review checklist (run by Claude after writing this plan, before dispatching reviewer)

1. **Spec coverage:** every spec § (Schema, Card visual contract, Grid contract, Lefthook & CI, size-limit, success criteria, property tests, critical modules, ADRs) maps to a task. ✅ verified inline.
2. **Placeholder scan:** searched for "TBD" / "TODO" / "implement later" / "fill in" — none found. Some "implementer picks" remain (thumb glyph shapes; final knip ignore reasons) — these are intentional latitude bounded by the visual-regression baseline + code review, not placeholders.
3. **Type consistency:** `WorkEntry`, `EntryLike`, `listWorks`, `sortByDateDesc`, `worksSchema` all named consistently across Tasks 2/4/5/8/9.
4. **OQ resolutions:** all 14 resolved; 6 in spec body, 8 here at plan-write.

## Sources

- Spec: `packages/specs/specs/01-card-grid-mvp.md`.
- Phase 0 plan (pattern reference): `packages/specs/plans/00-foundations.md`.
- `https://docs.astro.build/en/guides/content-collections/` (fetched 2026-04-25).
- `https://docs.astro.build/en/reference/content-loader-reference/` (fetched 2026-04-25).
- `https://zod.dev/v4/changelog` (fetched 2026-04-25).
- `https://stryker-mutator.io/docs/stryker-js/vitest-runner/` (fetched 2026-04-25).
- `https://www.npmjs.com/package/@fast-check/vitest` (fetched 2026-04-25).
- Live probe: `bun -e "import('astro/zod').then(m => …)"` exit 0 in `packages/site/` 2026-04-25.

## Reviewer briefing (paste verbatim into the plan-review Task prompt)

> This is the plan for Phase 1 of the utofme project. **Read `CLAUDE.md` first** ("Verify-or-not", "Disagreement protocol", "Inline-fix gate", review-round cap = 1, "Library version policy"). Use `mcp__codebase-memory-mcp__*` before Grep/Glob; **deepwiki is NOT installed** — use WebFetch / WebSearch / `gh` for ALL library / API verification. Plan doc `2026-04-25-general-plan` uses `pnpm` — substitute `bun`. Output must be falsifiable: cite file:line + URL with access date. Tag findings as **blocker** vs **nit**. Apply the inline-fix gate from `CLAUDE.md`. **Subagent output verbosity:** be thorough; Claude (controller) is the sole reader; do not compress. **Specifically scrutinize:**
> 1. Whether each task's RED actually fails before the Impl block — a vacuously-passing RED is a plan blocker.
> 2. Whether the OQ resolutions at plan-write are sound. OQ#9 (Stryker config split) and OQ#13 (vitest peer-dep range) are the ones most likely to need a re-cite.
> 3. Whether `Layout.astro` exists in Phase 0 (Tasks 8 + 9 import it) — verify by reading `packages/site/src/layouts/`. If absent, add a Task 7.5 to scaffold it OR adjust Tasks 8/9 to inline the head/body.
> 4. Whether `--font-size-1` and `--space-1` tokens exist in Phase 0's `tokens.css` — Tasks 5/6 use them. If absent, plan must add them with a stated naming convention.
> 5. Whether the visual-regression baseline mask in Task 10 covers the right region (variable-typography H2 vs. the whole card) — too-small a mask risks subpixel-drift flakes; too-large a mask misses regression.
> 6. Whether the e2e in Task 10 actually fails the "first card tab-focusable" assertion when no card has an external URL (i.e., all `<article>`, no `<a>`) — should the test guard against the no-link case?
> 7. Whether Stryker's `concurrency: 2` is appropriate for GitHub-hosted runners (2 vCPU); over-subscription causes timeouts.
> 8. Whether the 60 KB CSS+HTML ceiling on `/` and `/works` is plausibly achievable with 10 fixtures' worth of inline data + the new card CSS — flag if measurement is needed before committing the ceiling.
> 9. Whether any spec success-criterion is missing a corresponding task line.
> 10. Whether the plan's task list could be cut in half by combining adjacent tasks without violating the 30-min cap (a leaner plan is better — but only if no task crosses the cap).
