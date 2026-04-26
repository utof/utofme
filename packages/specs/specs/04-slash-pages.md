# Phase 4 — Slash Pages

## Goal

Add the personal-site convention pages — **`/now`**, **`/uses`**, **`/colophon`**, **`/tops`** — as fully-static MDX-driven routes; add **`/stats`** as a static page driven by a build-time JSON snapshot fetched from upstream APIs (GitHub, Strava, Last.fm, Literal, Wakatime). All five pages live behind a shared layout, are cross-linked by a new site-wide footer, and degrade gracefully when any upstream stats API is unavailable.

## Context / invariants

- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**; **Svelte 5 (runes)** islands; **React 19** islands only on Sandbox-using detail pages. Phase 3 merge commit `cff8dc0` is the branch base. Branch `phase/04-slash-pages` cut from there.
- Output remains `static`. **No SSR introduced in Phase 4.** No Astro Cloudflare adapter installed. `/stats` is a regular static route; its data layer is a build-time snapshot (see "Architecture: /stats" below). This intentionally departs from the general-plan §4.2 *"Build:"* paragraph (which describes Option 1, hybrid SSR with `prerender = false`) and follows the same section's *"Recommendation:"* paragraph (Option 2, scheduled snapshot) — the recommendation wins because it is consistent with CLAUDE.md's "Static-first; SSR only for `/stats`" wording (i.e. SSR is reserved *for if* `/stats` ever needs it; it is not mandated). ADR 0023 captures this decision.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12**; TypeScript `strict` + `astro/tsconfigs/strictest`; `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (lefthook only) for `.astro` / `.svelte`.
- **Phase 0 + 1 + 2 + 3 invariants carry over and remain green:**
  - All seven lefthook steps pass; all current Phase 3 vitest unit + Playwright e2e cases stay green (no count regression — exact totals re-measured at plan-write).
  - Per-route gzipped `size-limit` budgets from ADRs 0016 + 0019 hold (home/works/search/detail-page css+html ≤ 60 KB; site js ≤ 420 KB; pagefind-ui ≤ 100 KB). New slash-page CSS ceiling: **≤ 60 KB css+html per slash route** (same as detail pages — they share the layout family).
  - LHCI mobile Performance ≥ 0.85 on `/`, `/works`, `/search`, `/works/code-2/` plus the four new slash pages we add to the LHCI URL list (`/now/`, `/uses/`, `/colophon/`, `/stats/`). `/tops/` is omitted from LHCI because content is structurally similar to `/colophon/` and adding a fifth slash URL inflates LHCI time without information gain — the 60 KB css+html ceiling enforces parity.
  - Axe-core zero violations on every shipped route, including all five slash pages.
  - Visual-regression baselines re-record only where layout legitimately changes (footer adds; new slash routes new).
  - All Phase 1 / 2 / 3 features (FilterBar, Preview, CommandPalette, Pagefind UI, ClientRouter, staggered animation, detail pages, MDX islands, Sandpack, image pipeline, Expressive Code) keep working — slash pages reuse the same primitives.
- **Library version policy** (CLAUDE.md): latest stable major is the default. New deps in this phase pin to current latest at plan-write.
- **Repo hygiene:** every new exported function/class added in this phase carries TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line; `bun run check:docs` enforces.
- **Secrets policy:** no upstream-API secrets are committed to the repo. The five `/stats` upstreams require credentials supplied as Cloudflare Pages build-environment variables (or GitHub Actions secrets if a fallback fetcher path is used). The list of required env-var names is published in `packages/site/README.md` (or the project root README if cleaner) but the values are user-only-action queue items in `progress.md`. The site **must build green with all secrets absent** — the snapshot fetcher in that case is a no-op (does not write `snapshot.json`); Astro's `loadSnapshot` falls back to the committed fixture. ADR 0024 captures the per-source failure UX (no stale-data retention; visible ⚠ indicator).
- **Branching:** all Phase 4 batches land on `phase/04-slash-pages` → PR → CI green → merge commit (no squash, no rebase) into `main`. Tag `phase-4` on the merge SHA.

## Non-goals

- **No SSR routes, no Cloudflare adapter install.** `/stats` is statically rendered from a build-time snapshot. → Defer SSR introduction to a future phase only if sub-hour data freshness becomes a hard requirement.
- **No webmentions, RSS, sitemap.xml.** → Phase 6. Slash routes will be picked up by the Phase-6 sitemap generator automatically because they are static `getStaticPaths` outputs.
- **No theme toggle.** Still Phase 6.
- **No live data fetching at request time.** All `/stats` upstream calls happen in the build environment (Cloudflare Pages build, or GH Actions run that triggers a deploy hook). The user does not pay runtime CPU cost; Cloudflare Workers free-tier limits are not a constraint.
- **No new content type beyond `slash`.** `/tops` is *one* slash entry whose body is an MDX list — not a separate collection of "tops items". If `/tops` later wants per-item ranked lists with structured filtering, that is a Phase 5+ extension; in Phase 4 the page is prose lists.
- **No comments / interactions on slash pages.**
- **No multi-locale / i18n.** → out of plan.
- **No client-side island on slash pages.** Slash pages are zero-JS by default (the only JS that loads is the global CommandPalette mounted in `_BaseLayout`, identical to other static routes). `/stats` ships zero additional JS — the per-source ⚠ indicator and last-updated `<time>` are server-rendered HTML.

## Interfaces

> **Note on code/CSS snippets in this section:** snippets are *verified API surfaces* (import paths, function signatures, integration names) per context7 + Astro 6 docs fetched at spec-write 2026-04-27 — not implementation prescriptions. The plan refines exact form, names, and composition. **Upstream-API endpoints (GitHub, Strava, Last.fm, Literal, Wakatime) are listed at the abstract level in this spec** ("fetches the user's most-recent N activities"); exact paths + library client choices + request shapes are pinned at plan-write after a context7 + WebFetch verification round, per CLAUDE.md "verify every named API the spec references" rule.

### Top-level paths added (predicted; the plan refines)

- `packages/site/src/pages/now.astro` — static route, sources content from `slash/now` MDX entry; renders via `_SlashLayout`.
- `packages/site/src/pages/uses.astro` — same shape, `slash/uses`.
- `packages/site/src/pages/colophon.astro` — same shape, `slash/colophon`.
- `packages/site/src/pages/tops.astro` — same shape, `slash/tops`.
- `packages/site/src/pages/stats.astro` — static route; reads `src/content/stats/snapshot.json` (or fixture fallback); renders via `_SlashLayout` plus a stats-specific section template.
- `packages/site/src/layouts/_SlashLayout.astro` — shared shell for the five pages. Underscore-leading per Phase 3 convention. Wraps `_BaseLayout`. Renders: `<header>` with `<h1>`, `<time datetime>` last-updated, optional one-line description; `<article>` body slot; `<footer>` cross-link block listing the four sibling slash pages.
- `packages/site/src/components/SlashFooter.astro` — site-wide footer rendered inside `_BaseLayout`. Contains: copyright + permanent slash-page nav (`/now`, `/uses`, `/colophon`, `/tops`, `/stats`) + a single source-repo link. Used on **every** route, not just slash pages — that is the simplest place to advertise the slash-page directory site-wide and the place IndieWeb /now-page directories scrape.
- `packages/site/src/components/StatsSection.astro` — render block for one stats source. Accepts a strongly-typed source object `{ id, label, value, lastSuccessAt, error? }` and renders the value plus a `<time>` and an optional `⚠` indicator if `error` is set.
- `packages/site/src/content.config.ts` — **modified**: adds two new collections — `slash` (MDX entries: now, uses, colophon, tops) and `stats` (single JSON entry: `snapshot`). The `works` collection is unchanged.
- `packages/site/src/content/slash/now.mdx` — new fixture (≥ 1 paragraph + dated frontmatter).
- `packages/site/src/content/slash/uses.mdx` — new fixture.
- `packages/site/src/content/slash/colophon.mdx` — new fixture; lists the actual stack (Astro 6, Svelte 5, Bun, Cloudflare Workers Assets, Sharp, Expressive Code, Sandpack, fonts, license).
- `packages/site/src/content/slash/tops.mdx` — new fixture; ranked lists (books / films / albums / games — minimum 3 entries each at ship time, easily extended).
- `packages/site/src/content/stats/snapshot.fixture.json` — new fixture, committed; mirrors the production snapshot shape (top-level `{ "snapshot": {…} }` per the `file()` loader contract above) with realistic placeholder values. Used on every dev / CI build. **Required to exist** so the site builds green even when no live snapshot is fetched.
- `packages/site/src/content/stats/snapshot.json` — **gitignored**. Written by the build script `scripts/fetch-stats-snapshot.ts` in production builds when secrets are present; falls back to fixture when missing.
- `packages/site/scripts/fetch-stats-snapshot.ts` — new build-time script. Reads env vars; if any required secret is missing the script exits 0 (no-op). When all secrets present: calls the five upstream APIs in parallel via `Promise.allSettled`; for each fulfilled source, records `{ value, lastSuccessAt: now, error: false }`; for each rejected source, records `{ value: null, lastSuccessAt: null, error: true }`. Writes the merged record under top-level `{ "snapshot": {...} }` to `src/content/stats/snapshot.json`. **No prior-snapshot read or persistence**, ever — see ADR 0024.
- `packages/site/src/lib/stats.ts` — new helpers: `loadSnapshot()` (Astro 6 `getEntry("stats", "snapshot")` with fixture fallback), Zod schema for snapshot shape, `formatStatValue(source)` for human-readable rendering. All exports mutation-tested.
- `packages/site/src/lib/slash.ts` — new helpers: `getSlashEntry(id)` thin wrapper over `getEntry("slash", id)`; `slashSiblings(currentId)` returning the cross-link list excluding the current page. Mutation-tested.
- `packages/site/package.json` — **modified**: adds `prebuild:stats` script (`bun run scripts/fetch-stats-snapshot.ts`); the existing `build` script is renamed/composed so production builds chain `prebuild:stats && astro build`. Local `dev` does **not** chain the prebuild — fixture is the source of truth in dev.
- `packages/site/src/layouts/_BaseLayout.astro` — **modified**: imports + renders `<SlashFooter />` inside `<body>` after the `<slot />` and before `<CommandPalette />`. Footer is global — visible on every existing route too.
- `packages/site/.gitignore` — **modified**: ignores `src/content/stats/snapshot.json` (production-only artifact).
- `packages/site/.size-limit.cjs` — **modified**: adds 5 entries (4 slash pages + stats) at `≤ 60 KB css+html`. Site-js cap unchanged at 420 KB (slash pages contribute zero new JS chunks).
- `packages/site/lighthouserc.cjs` — **modified**: adds `/now/`, `/uses/`, `/colophon/`, `/stats/` (4 URLs) to the LHCI url list. `/tops/` omitted (justified above).
- `packages/site/knip.jsonc` — **modified**: register `scripts/fetch-stats-snapshot.ts` as an entry; ensure `@octokit/core` is not flagged as unused (only used inside `scripts/`); add `ignoreDependencies` for any other libs that are scripts-only.
- `packages/site/.dependency-cruiser.cjs` — **may need** widening to allow `scripts/**` to import from `src/lib/**` (Zod schemas) without violating the layered-import rule.
- `packages/site/tests/unit/slash-helpers.test.ts` — vitest for `getSlashEntry`, `slashSiblings`.
- `packages/site/tests/unit/stats-snapshot.test.ts` — vitest + fast-check property tests for `loadSnapshot`, `formatStatValue`, snapshot-shape Zod schema.
- `packages/site/tests/unit/snapshot-fetcher.test.ts` — vitest covering `scripts/fetch-stats-snapshot.ts` *with all upstreams mocked* — verifies the per-build merge rule (no prior reads): when source 3 of 5 throws, the written snapshot has source 3 with `value: null`, `lastSuccessAt: null`, `error: true` and the other four populated normally; when all five throw, all sources flag `error: true` and the file is still written (with `generatedAt: now`); when all secrets are absent, the script is a no-op (does not write or read the file).
- `packages/site/tests/e2e/slash-pages.spec.ts` — Playwright e2e for the four static slash routes (loads, header, content, cross-link footer present, returns 200, axe clean).
- `packages/site/tests/e2e/stats-page.spec.ts` — Playwright e2e for `/stats/` (renders fixture data, every source visible, ⚠ indicator renders when fixture flags one source as `error: true`, axe clean).
- `packages/site/tests/e2e/footer.spec.ts` — Playwright e2e: footer renders on every existing route (`/`, `/works`, `/search`, `/works/code-2/`) — regression guard for the global footer add.
- `packages/site/tests/e2e/palette.spec.ts` — **modified** (existing file from Phase 2): extend with assertion that the CommandPalette nav list includes the five slash routes (`/now/`, `/uses/`, `/colophon/`, `/tops/`, `/stats/`). Acceptance criterion 8.
- 3 new ADRs — listed below.

### Verified APIs (context7 / Astro 6 docs, fetched 2026-04-27)

- `defineCollection({ loader: glob({...}), schema })` — already verified Phase 3; same shape used for `slash` (MDX, glob loader) and `stats` (file loader, single JSON entry).
- `import { getEntry, getCollection } from "astro:content";` — Astro 6 collection accessors. `getEntry("slash", "now")` returns the entry or `undefined`; because `/now.astro` is a fixed static page (not a `getStaticPaths`-driven dynamic route), a missing fixture is a **build-time error** (`astro build` fails fast), not a runtime 404. The page guards undefined by throwing an `Error` so the build aborts.
- `import { glob, file } from "astro/loaders";` — loaders. `glob({ pattern: "*.mdx", base: "./src/content/slash" })` for slash; `file("./src/content/stats/snapshot.json")` for stats. **The `file()` loader contract requires the JSON to be either an array of objects each carrying a unique `id` field, or an object keyed by IDs (verified context7 `/withastro/docs` `content-loader-reference.mdx` 2026-04-27).** The Phase 4 stats JSON therefore wraps the snapshot under a single key: `{ "snapshot": { generatedAt: …, sources: {…} } }` so that `getEntry("stats", "snapshot")` returns the wrapped record. Fixture and production snapshot share this shape.
- `<time datetime={iso}>{human}</time>` — semantic time element (HTML standard); used on every slash page header for the `updated` field.

### Snapshot shape (proposed)

```ts
// src/lib/stats.ts — Zod
const snapshotSchema = z.object({
  generatedAt: z.string().datetime(),
  sources: z.object({
    github:   StatsSource,  // commits in last 30 d, top repos
    strava:   StatsSource,  // distance + activity count last 30 d
    lastfm:   StatsSource,  // top artists + recent tracks
    literal:  StatsSource,  // currently-reading + finished last 30 d
    wakatime: StatsSource,  // languages + total hours last 7 d
  }),
});

const StatsSource = z.object({
  id: z.string(),
  label: z.string(),
  /** Live payload when error=false; null when error=true (no stale-data
   *  retention — see ADR 0024). Shape narrowed per-source at render. */
  value: z.unknown().nullable(),
  /** ISO timestamp from this build's fetcher run (or null when error=true). */
  lastSuccessAt: z.string().datetime().nullable(),
  error: z.boolean().default(false),
});
```

The plan refines the per-source `value` shape into a discriminated union before merging the schema; spec stays at `unknown` because (a) it lets the plan flesh out source-specific render templates without churning the spec, and (b) the snapshot file's actual shape is owned by the fetcher script, which is the single writer.

The wrapping shape on disk is:

```jsonc
{
  "snapshot": {
    "generatedAt": "2026-04-27T15:00:00Z",
    "sources": {
      "github":   { "id": "github",   "label": "GitHub",   "value": …, "lastSuccessAt": "…", "error": false },
      "strava":   { "id": "strava",   "label": "Strava",   "value": null, "lastSuccessAt": null,    "error": true  },
      …
    }
  }
}
```

— top-level `snapshot` key is the entry id consumed by `getEntry("stats", "snapshot")`.

### New pinned dev deps (resolved at plan-write 2026-04-27 via npm registry probes)

- `@octokit/core` — for the GitHub fetcher in `scripts/fetch-stats-snapshot.ts`. Spec leaves the major version unpinned; plan locks it to whatever is current major at plan-write after a context7 verify pass. **No client library** for Strava / Last.fm / Literal / Wakatime — direct `fetch()` against their REST endpoints.
- No new runtime deps. (The site bundle gains zero JS from Phase 4.)

## Architecture

### Static slash pages (Batch 4.1)

Each of `/now`, `/uses`, `/colophon`, `/tops` is one MDX entry under `src/content/slash/`:

```
src/content/slash/
  now.mdx
  uses.mdx
  colophon.mdx
  tops.mdx
```

Frontmatter schema:

```ts
const slashSchema = z.object({
  title: z.string(),
  description: z.string().max(240).optional(),
  updated: z.coerce.date(),
  tags: z.array(z.string()).default([]),
});
```

`updated` is **required** on slash entries — every IndieWeb /now-style directory expects a "last touched" timestamp; making it required prevents the user from forgetting and surfaces the field in `_SlashLayout`'s `<header>`.

The four corresponding `.astro` pages are nearly identical thin wrappers:

```astro
---
// Note: Astro JSX rejects underscore-leading tags. Convention from Phase 3
// (`_WorkLayout.astro`): import the underscore-prefixed file under an
// aliased non-underscore identifier.
import { getEntry, render } from "astro:content";
import SlashLayout from "../layouts/_SlashLayout.astro";
const entry = await getEntry("slash", "now"); // or "uses" / "colophon" / "tops"
if (!entry) throw new Error("missing /now slash entry");
const { Content } = await render(entry);
---
<SlashLayout entry={entry}>
  <Content />
</SlashLayout>
```

`_SlashLayout` renders:

```astro
<BaseLayout title={entry.data.title} description={entry.data.description}>
  <!-- import BaseLayout from "./_BaseLayout.astro"; (aliased per Phase 3 convention) -->
  <main>
    <article>
      <header>
        <h1 transition:name={`slash-${entry.id}`}>{entry.data.title}</h1>
        <p class="updated">
          updated <time datetime={entry.data.updated.toISOString()}>{format(entry.data.updated)}</time>
        </p>
        {entry.data.description && <p class="description">{entry.data.description}</p>}
      </header>
      <slot />
      <nav class="cross-link">
        <h2>more about me</h2>
        <ul>{slashSiblings(entry.id).map(s => <li><a href={`/${s.id}/`}>{s.title}</a></li>)}</ul>
      </nav>
    </article>
  </main>
</BaseLayout>
```

`transition:name` on the `<h1>` provides a free morph between slash pages when the user clicks footer links — consistent with Phase 3's detail-page transition family.

`/tops` is content-only — the MDX body contains H2-headed lists (`## Books`, `## Films`, `## Albums`, `## Games`) with one ranked `<ol>` each. No bespoke component needed.

### Site-wide footer

`<SlashFooter />` is rendered inside `_BaseLayout` after `<slot />`, before `<CommandPalette />`. Same position on every route. Contents:

- A short copyright line (year only — `© 2026 utof`).
- A `<nav aria-label="Slash pages">` containing five links (`/now`, `/uses`, `/colophon`, `/tops`, `/stats`).
- One link to the source repo (`https://github.com/utof/utofme`).

The footer is **always visible**; no hiding on certain routes. Visual-regression baselines for `/`, `/works`, `/search`, `/works/code-2/` re-record once during Phase 4 to absorb the footer add.

### `/stats` data layer (Batch 4.2)

The page is a normal static `.astro` route. At build time it does:

```astro
---
import { loadSnapshot } from "../lib/stats";
const snapshot = await loadSnapshot(); // returns snapshot.json if present, else fixture
---
```

`loadSnapshot()` resolves in this order:

1. Try `getEntry("stats", "snapshot")` — Astro's content collection wired with `file("./src/content/stats/snapshot.json")` loader. Returns the entry whose `id` is `"snapshot"` (the top-level key in the JSON file).
2. If the entry is undefined (no `snapshot.json` on disk — i.e. dev / CI build with no production fetch), `getEntry("stats", "snapshot-fixture")` is **not** consulted — instead `loadSnapshot` statically imports the fixture JSON file, extracts its `snapshot` key, and returns it. The fixture is **not** registered as a separate entry under the `file()` loader; it is a plain JSON resource.
3. Validate the result with `snapshotSchema.parse` (throws on shape drift).

The page renders one `<StatsSection>` per source. Each section displays:

- The source's `label` (e.g. "GitHub", "Strava").
- Its source-specific value (commits / km / top artists / books / hours).
- A small `<time datetime={lastSuccessAt}>` next to the label (omitted when `error: true && lastSuccessAt === null`).
- When `error: true`: the `value` block is replaced by the literal string "data temporarily unavailable" with a `⚠` glyph and `aria-label="data temporarily unavailable"`. **No stale value is ever shown.** ADR 0024 captures this decision (no last-good retention).

#### Build-time snapshot fetcher

`scripts/fetch-stats-snapshot.ts` runs as `prebuild:stats` in the **production build environment only** (Cloudflare Pages build with secrets). For each source:

```ts
const result = await Promise.allSettled([
  fetchGithub(env), fetchStrava(env), fetchLastfm(env),
  fetchLiteral(env), fetchWakatime(env)
]);
// no merge with prior — see ADR 0024 (no last-good retention)
```

Per-source merge rules (this build only — no prior-snapshot dependency):

| live result | merged record |
|---|---|
| fulfilled | `{ value: live, lastSuccessAt: now, error: false }` |
| rejected  | `{ value: null, lastSuccessAt: null, error: true }` |

That is, the fetcher is **stateless across builds**. Each Cloudflare Pages build is a clean checkout; `snapshot.json` is overwritten by the script (or never written if no secrets). No prior-snapshot file is ever read or persisted between builds. This intentional simplification (per ADR 0024) trades the "last-good retention" axis for two material wins: (a) eliminates dependency on Cloudflare Pages persistence (which CF Pages does not provide for working-tree files between deploys); (b) avoids ever showing stale data presented as fresh — when GitHub is briefly down, `/stats` shows "⚠ data temporarily unavailable" for that section rather than misleading the visitor.

The fetcher is **idempotent** — running it locally with all secrets writes a fresh snapshot; running it without secrets is a no-op (script exits 0; whether `snapshot.json` exists or not, the script does not write or read it — Astro then falls back to fixture).

#### CI behaviour

CI does **not** run `prebuild:stats`. The CI build flow is `astro build` over the fixture (no secrets, no live network calls). All vitest / Playwright assertions hit fixture data.

#### Production deploy flow

Cloudflare Pages build command becomes:

```
bun run prebuild:stats && bun run build
```

Secrets are configured as Cloudflare Pages build-environment variables. If a deploy hook is wired to a scheduled GH Action (every 6 hours), the action triggers the build hook URL — Cloudflare Pages re-runs the same build command with fresh upstream data. The GH Action itself is **out of Phase 4 scope** (it lives in `.github/workflows/` and is a user-only-action queue item) — Phase 4 ships the build script and fixture path; the user wires the cron schedule when secrets land.

### Failure UX

ADR 0024 captures two axes (last-good retention is **rejected** — see ADR 0024 for rationale and the alternative considered):

- **Per-source granularity** (not page-wide): one source failing does not poison the others.
- **Visible warning, no stale data** (not silent, not stale-as-fresh): `⚠` glyph + `aria-label="data temporarily unavailable"`; the `value` block is replaced by the unavailable-string. No `<time>` is shown for failed sources because there is no meaningful timestamp.

This satisfies the general-plan exit criterion *"killing one API still renders the page with the other sources"*.

### Cross-route concerns

- **`trailingSlash: "always"`** (set Phase 3) — the four static slash pages compile to `/now/index.html`, etc. Internal links use `/now/`, `/uses/`, etc. consistently. No regression risk.
- **Pagefind index** (Phase 2) — the slash pages are static HTML and will be indexed by `pagefind` at the existing `astro:build:done` hook with no config change. The user can find slash pages via the search palette.
- **CommandPalette** (Phase 2) — slash pages should appear in the palette's nav list. The palette currently lists `/`, `/works`, `/search` — Phase 4 extends it to include the five slash pages. Single-line change in `CommandPalette.svelte`'s nav array; covered by an extension to the existing `tests/e2e/palette.spec.ts` (acceptance criterion 8).
- **MetaPills** — not used on slash pages (no `type` discriminator). Slash pages do not list `tags` visibly in the layout — tags are search-only metadata.
- **CoverImage** — not used on slash pages; slash MDX entries do not have a `cover` field.

## Open questions (to resolve at plan-write or earlier; spec proceeds with current best-guess)

1. **OQ#1 — exact upstream-API endpoints + auth shapes.** Strava OAuth uses refresh-token rotation; Last.fm uses an API key (no OAuth); Literal uses a Bearer token; Wakatime uses an API key; GitHub uses a Personal Access Token via octokit. The plan verifies each endpoint via context7 + WebFetch and pins request shapes. No spec amendment needed unless a source is dropped (e.g. if Literal Club's public API was retired by 2026-04-27).
2. **OQ#2 — first-build / partial-failure behaviour.** Spec resolution above (no prior-snapshot reads, ever; failed sources render `value: null` + `error: true`; ⚠ indicator with "data temporarily unavailable" copy). Plan implements + tests the simplified per-source rule. Resolves the original "stale-while-error" question by dropping the "stale" axis (ADR 0024).
3. **OQ#3 — `/colophon` body content.** Plan-time decision: include the canonical Phase 4 stack (Astro 6.x, Svelte 5, Bun ≥ 1.2, Cloudflare Workers Assets, Sharp, Expressive Code, Sandpack, font choices from Phase 0, MIT license, source-repo URL, ADR registry pointer). Spec does not pin the prose — just confirms the page exists with these as headings.
4. **OQ#4 — `/tops` content scope.** Spec resolution: ship four ranked lists (Books, Films, Albums, Games) with three entries each minimum. Future entries are content-only edits, not Phase 4 work.
5. **OQ#5 — site-wide footer rollout regressions.** The footer is added to every existing route via `_BaseLayout`. The visual-regression Playwright snapshots for `/`, `/works`, `/search`, every `/works/<slug>/` will all diff in one go. Plan re-baselines them inside the same task that introduces the footer. **Implementer-safety requirement:** before running `playwright test --update-snapshots`, the implementer must inspect the diff for each existing route in `playwright-report/` and confirm the only changed pixels live in the footer region (bottom of viewport, height ~ footer's measured CSS box). Any pixel difference outside the footer band is a real regression and must be diagnosed before re-baselining. The plan task that introduces the footer encodes this as a manual checklist step inside its TDD red→green sequence.

All five OQs are non-blocking — spec can advance to plan-review.

## ADRs to write (in this phase)

- **ADR 0022 — Slash-page collection (MDX) and shared layout.** Decision: introduce a `slash` MDX collection rather than per-page hardcoded `.astro` content. Rationale: schema validation, consistent updated-date convention, plan-shareable layout via `_SlashLayout`. Alternatives: (a) inline content per `.astro` page (rejected: drifts; no `updated` enforcement), (b) Markdown (rejected: loses MDX option for embeds).
- **ADR 0023 — `/stats`: build-time snapshot, not runtime SSR.** Decision: ship `/stats` as static page driven by build-time fetched JSON, not as a hybrid SSR route. Rationale: zero runtime CPU; survives upstream outages; preserves "Static-first" CLAUDE.md invariant; defers Cloudflare-adapter install. Trade-off: data freshness floor = build cadence (manual + scheduled-deploy-hook = 6 h floor). Supersedes the general-plan §4.2 *"Build:"* paragraph.
- **ADR 0024 — `/stats` failure UX: stateless per-build, no stale-data retention.** Decision: per-source granularity + **no** last-good retention + visible `⚠ data temporarily unavailable` block. Alternative considered: cross-build last-good retention via Cloudflare KV / R2 / GitHub Releases artifact (rejected — adds infra dependency, presents stale data as fresh, only meaningful upside is hiding short upstream outages from the visitor which the ⚠ indicator already does). Rationale: zero persistence dependency (CF Pages does not persist working-tree files between builds); honest UX (visitors see "down" not stale-presented-as-current); smaller surface area to maintain. Trade-off: a short outage (< 6h between scheduled deploy hooks) shows ⚠ instead of last value — accepted.

## Testing plan

- **Vitest unit:** Zod parses for both new collections; `slashSiblings(id)` returns 4 entries for any of the 5 ids; `loadSnapshot` falls back to fixture when entry missing; `formatStatValue` per-source rendering.
- **fast-check property:** `slashSiblings` round-trip — for any input id from the 5, the output array has length 4 and never contains the input id; `loadSnapshot` schema-parse — random JSON shape rejections behave like the Zod schema (i.e. test the Zod schema, not the loader, against arbitrary inputs).
- **Stryker mutation (critical only, nightly CI):** `lib/slash.ts`, `lib/stats.ts`, `scripts/fetch-stats-snapshot.ts`'s merge logic.
- **Vitest integration (snapshot fetcher):** mock all five upstream `fetch` calls. Cases: (a) all-succeed → all sources `error: false`, `value` populated, `lastSuccessAt` set; (b) one rejects → that source has `value: null`, `lastSuccessAt: null`, `error: true`; the other four populated normally; (c) all reject → all sources `value: null`, `lastSuccessAt: null`, `error: true`; the JSON file is still written (with `generatedAt: now`); (d) malformed live JSON for one source → treated as rejection (Zod parse fails → caught → that source flagged `error: true`); (e) script invoked with all secrets absent → script exits 0 without writing or reading `snapshot.json`.
- **Playwright e2e:** four slash routes load; header renders title + updated time; cross-link footer lists 4 siblings; `/stats/` renders all 5 sources with fixture data; `⚠` indicator visible when fixture has `error: true`; site-wide footer present on every route.
- **Axe-core:** zero violations on `/now/`, `/uses/`, `/colophon/`, `/tops/`, `/stats/` and on every existing route after the footer add.
- **Visual regression:** new baselines for the 5 slash pages; re-baselines for the existing pages absorbing the footer.
- **size-limit:** 5 new entries (≤ 60 KB css+html each); site-js cap (420 KB) holds.
- **LHCI:** ≥ 0.85 mobile Performance on `/now/`, `/uses/`, `/colophon/`, `/stats/`; existing routes still ≥ 0.85.
- **Documentation guard:** `bun run check:docs` — every new exported function/class has TSDoc with `@see` / `@issue` / `Why:`.
- **Knip:** zero false-positive unused entries after the build script + ignoreDependencies update.
- **`bun x astro check`:** zero TS errors; type-coverage 100%.

## Acceptance criteria

1. Visiting each of `/now/`, `/uses/`, `/colophon/`, `/tops/`, `/stats/` returns 200 with content-type `text/html` and a server-rendered title `<h1>` matching the entry frontmatter (or "Stats" for `/stats/`).
2. Each slash page displays its `updated` date as a `<time datetime>` element in the page header.
3. The site-wide footer renders on every route (`/`, `/works`, `/search`, all `/works/<slug>/`, all five slash routes) with five working slash-page links + one source-repo link.
4. `/stats/` renders 5 sources from `snapshot.fixture.json` in CI; if `snapshot.json` is later present in a production build, the page re-renders with live values.
5. CI's `bun x astro check` + lefthook + size-limit + LHCI + Axe + Playwright + vitest + property tests + integration tests + dep-cruiser + knip all pass.
6. The build is green even if `snapshot.json` is absent — fixture is the source of truth in CI and dev.
7. Per-source failure simulated in the snapshot-fetcher integration test renders correctly: page builds, that source has the `⚠` indicator, the other four sources render normally.
8. CommandPalette's nav list includes the five new slash routes.
9. Three new ADRs (0022, 0023, 0024) are committed.
10. PR opened against `main`; CI green; merge commit (no squash, no rebase) lands on `main`; tag `phase-4` pushed on the merge SHA.

## Branch & deliverables checklist

- [ ] `phase/04-slash-pages` cut from `main` at `cff8dc0`. ✓ (already cut)
- [ ] Two new content collections (`slash`, `stats`) registered.
- [ ] Five new pages, two new layouts/components (`_SlashLayout`, `SlashFooter`, `StatsSection`), two new lib modules, one build script, two new fixtures.
- [ ] Three ADRs (0022, 0023, 0024).
- [ ] Test budget: ~25 new test cases across unit / property / integration / e2e / axe / visual.
- [ ] Budgets unchanged (60 KB css+html per route; 420 KB site js ceiling); 5 new size-limit entries.
- [ ] LHCI URL list extended by 4 slash routes (`/tops/` excluded).
- [ ] User-only action queue items (publish in PR description): wire the 5 upstream API secrets into Cloudflare Pages env; optionally wire a 6-hour GH Actions cron that hits the Cloudflare Pages deploy-hook URL.
