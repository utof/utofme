# Phase 6 — IndieWeb polish (RSS, sitemap, webmentions, microformats, theme)

## Goal

Make the site **discoverable, syndicatable, and conversational** in the indieweb sense, and let visitors persistently choose their colour scheme. Concretely: ship three RSS feeds (firehose + per-collection), an `@astrojs/sitemap`-driven sitemap, a `robots.txt`, microformats v2 markup (`h-entry`, `h-card`, `rel="me"`) on every detail page, build-time-fetched webmention reactions displayed under works/garden notes, and a persistent **light / dark / system** theme toggle that honours `prefers-color-scheme` on first paint and persists the user's choice across navigations and sessions.

## Context / invariants

- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**; **Svelte 5 (runes)** islands; **React 19** islands only on Sandbox-using pages (Phase 3). Phase 5 merge commit `09414b4` is the branch base. Branch `phase/06-indieweb` cut from there.
- Output remains `static`. **No SSR introduced in Phase 6.** No Astro Cloudflare adapter changes. RSS/sitemap/robots are static text routes; webmention data is fetched at build time and committed.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12**; TypeScript `strict` + `astro/tsconfigs/strictest`; `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (lefthook only) for `.astro` / `.svelte`.
- **Phase 0 + 1 + 2 + 3 + 4 + 5 invariants carry over and remain green:**
  - All seven lefthook steps pass (eight after Phase 5 added `freshness-garden`); all current Phase 5 vitest unit + Playwright e2e cases stay green (no count regression — exact totals re-measured at plan-write).
  - Per-route gzipped `size-limit` budgets from ADRs 0016, 0019, 0022, 0026 hold.
  - Site-js cap is **420 KB**, currently measured **406.54 KB** (13 KB headroom — issue utof/utofme#45). **Phase 6 must not grow site-js** beyond the current measure. Theme persistence is therefore implemented as **two** small inline `<script is:inline>` blocks (counts toward HTML size, not site-js), NOT as a Svelte island. Combined inline-JS budget for theme: **≤ 1.4 KB raw** = ≤ 800 B for the head-side first-paint script (`MetaHead.astro`) + ≤ 600 B for the toggle-button click handler (`ThemeToggle.astro`). Both budgets are absorbed inside each route's existing 60 KB css+html cap.
  - LHCI mobile Performance ≥ 0.85 on `/`, `/works`, `/search`, `/works/code-2/`, `/now/`, `/uses/`, `/colophon/`, `/stats/`, `/garden/`, `/garden/welcome/`. Phase 6 adds `/feed.xml` to the URL list as a non-HTML XML validity check (LHCI's HTML audits skip XML; the URL is asserted reachable + 200).
  - Axe-core zero violations on every shipped HTML route, including all routes that gain webmention rendering.
  - Visual-regression baselines re-record where layout legitimately changes (theme toggle adds a footer button; webmentions add an `<aside>` to detail pages); existing-route baselines recapture once for the dark-theme variant.
  - All Phase 1–5 features keep working — RSS / sitemap / theme don't touch the existing render pipeline; they augment it.
- **Library version policy** (CLAUDE.md): latest stable major is the default. New deps in this phase pin to current latest at plan-write. **Verified at spec-write 2026-04-30:** `@astrojs/rss` and `@astrojs/sitemap` are first-party Astro integrations with stable APIs documented at the official Astro docs (context7 `/withastro/docs` returned current usage examples for both). `microformats-parser` exports `mf2(html, { baseUrl })` (verified at spec-write against `github.com/microformats/microformats-parser` upstream README) returning `{ items, rels, "rel-urls" }`; `rels.me` is a flat URL array, e.g. `rels: { me: ["https://github.com/utof"] }`. Webmention.io's `/api/mentions.jf2` endpoint uses **offset-style pagination** (`page=N&per-page=N`, 0-indexed; default per-page=20) returning `{ type:"feed", children:[…] }` per query — verified at spec-write against `github.com/aaronpk/webmention.io` upstream docs. The `jf2` payload format is the canonical IndieWeb v2 representation. **API surface only verified via WebFetch at spec-write — if a 4xx surfaces at script-write, the implementer falls back to the legacy `/api/mentions.json` endpoint with field translation.**
- **Repo hygiene:** every new exported function/class added in this phase carries TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line; `bun run check:docs` enforces.
- **Privacy:** webmentions contain third-party author URLs/avatars/text. The build-time fetch script trusts only `webmention.io`'s authenticated reply payload (sender verification is webmention.io's job, not ours). Avatar URLs are NOT proxied through the site — they hotlink the indieweb sender's domain. Risk is minimal: webmention.io strips dangerous payloads server-side. The script does NOT execute or inline any HTML from the payload — only typed fields are read (author name, photo URL, content text, url, type, published).
- **Site URL:** `https://utof.me/` is the canonical production origin and becomes `astro.config.mjs#site`. The webmention.io username corresponds to the bare domain (`webmention.io/utof.me/webmention`).
- **`rel="me"` profiles in scope at spec time:** GitHub (`https://github.com/utof`). Mastodon / Bluesky / additional social profiles can be added in a follow-up PR — the spec defines the *list shape* (a typed array in `src/lib/profiles.ts`), not a fixed set. The list is unbounded; rendering iterates.
- **Branching:** all Phase 6 batches land on `phase/06-indieweb` → PR → CI green → merge commit (no squash, no rebase) into `main`. Tag `phase-6` on the merge SHA.

## Non-goals

- **No SSR routes, no Cloudflare adapter changes.** Same static-first stance.
- **No sending webmentions.** Receive only. Sending requires a build-time URL crawler that POSTs to discovered webmention endpoints; deferred to Phase 7. Spec **does not** ship `scripts/send-webmentions.ts`.
- **No IndieAuth login flow.** The site does not authenticate visitors. `rel="me"` links exist solely so webmention.io (and other indieweb tools) can verify the site's identity. No auth UI, no token endpoint, no callback route.
- **No POSSE / cross-post automation.** Out of scope.
- **No comments form.** Webmentions are the only inbound conversation surface in Phase 6. A native comments form (and any associated CAPTCHA / spam filter) is deferred.
- **No full microformats v2.** Only `h-entry` + `h-card` + `rel="me"` + `u-url` + `dt-published` + `e-content` + `p-name` + `p-author`. No `h-event`, `h-review`, `h-product`, etc.
- **No Atom feed.** `@astrojs/rss` emits RSS 2.0; that is the published format. Atom can be added in Phase 7 if a subscriber asks.
- **No JSON Feed.** Same rationale.
- **No multi-language sitemap (hreflang).** Site is monolingual.
- **No prerendered Open-Graph image generator.** OG images are a Phase 7 polish target.
- **No service-worker / offline shell.** Out of scope.
- **No `view-source:` inline CSP digest hardening.** Theme toggle uses `is:inline` which Astro emits without a CSP nonce by default; the site has no CSP header today, and adding one is Phase 7+ work.
- **No dark-mode-aware images.** Existing `<Picture>` outputs apply to both themes. Phase 7 may add `<picture><source media="(prefers-color-scheme: dark)">` selectors per image; not now.
- **No theme transitions (animated colour-fade) on toggle click.** The site already pays the View-Transitions cost; layering a custom CSS transition on `:root` custom properties triggers paint storms on slower devices. Toggle is instant; `prefers-reduced-motion` is honoured by virtue of being a no-animation baseline.

## Interfaces

> **Note on code/CSS snippets in this section:** snippets are *verified API surfaces* (import paths, function signatures, integration names) per context7 + WebFetch probes performed at spec-write 2026-04-30 — not implementation prescriptions. The plan refines exact form, names, and composition.

### Top-level paths added (predicted; the plan refines)

- `packages/site/src/pages/feed.xml.ts` — RSS firehose endpoint. Returns `rss({ … })` from `@astrojs/rss`, items merged from `getCollection("works")` (production-published only) ∪ `getCollection("notes")` (publish:true), sorted by `pubDate` desc. Static export.
- `packages/site/src/pages/feed/works.xml.ts` — works-only RSS feed, same shape.
- `packages/site/src/pages/feed/garden.xml.ts` — garden-only RSS feed, same shape.
- `packages/site/src/lib/feed.ts` — typed helpers for both RSS endpoints: `toRssItem(entry, kind)`, `pubDateOf(entry)`, `feedDescription(kind)`. One source of truth for item-shape generation.
- `packages/site/astro.config.mjs` — **modified**: add `site: "https://utof.me/"`, register `@astrojs/sitemap` integration with `serialize` callback (sets `lastmod` from frontmatter `updated` || `created`) and `filter` (excludes `/search`, `/garden/graph/`, `/stats/`).
- `packages/site/public/robots.txt` — **new, committed**. Static file. Two lines:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://utof.me/sitemap-index.xml
  ```
- `packages/site/src/components/MetaHead.astro` — **new**. Centralises `<head>` augmentations that Phase 6 adds: `<link rel="webmention" href="https://webmention.io/utof.me/webmention" />`, `<link rel="alternate" type="application/rss+xml" title="…" href="/feed.xml" />` (and per-collection `alternate` links on collection routes), and the `<link rel="me" href="https://github.com/utof" />` set. Renders inside `_BaseLayout`'s `<head>` slot. Also injects the **theme inline-script** (see below).
- `packages/site/src/lib/profiles.ts` — **new**. Exports `RelMeProfile[]` (`{ url, label, network }`) consumed by both `MetaHead.astro` (renders `<link rel="me">`) and the footer h-card (renders visible profile links).
- `packages/site/src/lib/theme.ts` — **new**. Exports the inline-script source as a string (TSDoc'd, with line-by-line comments preserved through Biome formatting). Two functions: `inlineThemeScript()` returns the IIFE string for `<head>`; `wireToggleScript()` returns the click-handler string for the toggle button. Both are tiny (≤1 KB combined raw), inlined verbatim — never imported as a runtime module.
- `packages/site/src/components/ThemeToggle.astro` — **new**. Renders `<button data-theme-toggle aria-label="Switch theme">…</button>` plus an inline `<script is:inline>` that wires the click handler. The button cycles `light → dark → system → light`. Visual indicator (sun/moon/circle SVG) updates via the same script. `aria-live="polite"` announces.
- `packages/site/src/components/Webmentions.astro` — **new**. Server-rendered. Reads `src/data/webmentions/<slug>.json` for the current page. Groups by `wm-property`: `like-of` / `repost-of` → avatar grid; `in-reply-to` / `mention-of` → threaded `<ol class="webmentions">` with h-cite microformat. Empty state: nothing rendered (no "no mentions yet" — visual noise without value).
- `packages/site/src/components/HCard.astro` — **new**. Footer h-card. Renders `<div class="h-card">` with `p-name` (name), `p-note` (one-line bio), and the `rel="me"` profile list mapped from `profiles.ts`. Mounted inside `_BaseLayout` footer.
- `packages/site/src/layouts/_BaseLayout.astro` — **modified**. Slots `MetaHead` into `<head>` (which itself emits the theme inline-script as the **first child of `<head>` after `<meta charset>` + `<meta viewport>`** — i.e., before `<title>`, `<meta name="description">`, font preloads, and any `<link rel="stylesheet">`; this is the only ordering that runs before first paint). Mounts `ThemeToggle` (which carries its own separate `<script is:inline>` for the click handler) and `HCard` in the footer. The existing inline `note-previews` JSON `<script>` block (currently in `<body>` — `_BaseLayout.astro:91`) is **unrelated to theme ordering** and is left in place unchanged.
- `packages/site/src/layouts/_WorkLayout.astro` — **modified**. Adds `class="h-entry"` on the `<article>`. Adds `class="p-name"` on `<h1>`. `<time>` gains `class="dt-published"`. Body slot wrapped with `class="e-content"`. Self-link `class="u-url"` injected (hidden, per indieweb pattern). Webmentions component mounted at the bottom of the article.
- `packages/site/src/layouts/_NoteLayout.astro` — **modified**. Same h-entry treatment as `_WorkLayout`. Webmentions mount below backlinks.
- `packages/site/src/data/webmentions/<slug>.json` — **new directory, committed**. One JSON file per detail-page URL that has received at least one mention. File names mirror the slug-as-URL-segment used by the route. Empty-mention files are NOT written (no file = no mentions = component renders nothing). Same deterministic-write contract as Phase 5 ADR 0028.
- `packages/site/scripts/build-webmentions.ts` — **new build-time script**. Reads `astro.config.mjs#site` + the published-page URL list (built by walking `getCollection("works")` and `getCollection("notes")` with the same publish filters used by their routes). For each canonical URL, fetches `https://webmention.io/api/mentions.jf2?target=<encoded>` (paginated; `per-page=100`; loops while `children` returned ≥ page-size). Validates each child against a Zod schema typed against jf2 fields the site renders (subset). Writes per-slug JSON to `src/data/webmentions/`. Deterministic write: sorted by `wm-id` ascending, tab-indent JSON, trailing newline. Optional `WEBMENTION_IO_TOKEN` env var bumps rate limits but is not required for public reads.
- `packages/site/package.json` — **modified**: adds `@astrojs/rss` (latest stable), `@astrojs/sitemap` (latest stable), `microformats-parser` (devDep, for unit tests), `linkedom` (devDep, for RSS island-stripping in `src/lib/feed.ts`) to deps. Adds a **standalone** `sync:webmentions` script that invokes `bun run scripts/build-webmentions.ts`. **The `build` script is NOT modified to chain `sync:webmentions`**: CI runs `bun run sync:webmentions` as a discrete step **before** `bun run build`, then commits the resulting `src/data/webmentions/*.json` deltas if any (or fails the run if the diff is malformed; see acceptance #13). Local `dev` and local `build` skip the network entirely and consume the last-committed `src/data/webmentions/*.json` — running `bun run build` locally NEVER hits webmention.io. This separates network-dependent work from the deterministic local build chain established in Phase 5.
- `packages/site/.size-limit.cjs` — **modified**: adds 1 entry — `feed.xml` size ≤ **30 KB** raw (RSS XML with full article descriptions for ~30 items). The existing site-js entry's negated-glob list adds **no new exclusions** — Phase 6 introduces no new bundled JS chunks. The home/works/garden/etc. css+html budgets gain 0 KB headroom from theme-toggle injection (≤ 1 KB inline script HTML cost; absorbed within existing 60 KB cap).
- `packages/site/lighthouserc.cjs` — **modified**: adds `/feed.xml` to URL list with `.assertions.matrix` set to `categories.performance: 0` (don't audit non-HTML); presence is the assertion (200 status).
- `packages/site/knip.jsonc` — **modified**: register `scripts/build-webmentions.ts` as an entry. New deps `@astrojs/rss`, `@astrojs/sitemap` are imported from `astro.config.mjs` and feed endpoints; knip will trace.
- `packages/site/.dependency-cruiser.cjs` — **may need** widening to allow `scripts/build-webmentions.ts` to import from `src/lib/feed.ts` and `src/content.config.ts` (collection schemas). Plan-time decides.
- `packages/site/lefthook.yml` — **modified**: NO new freshness gate for webmentions (rate-limit hygiene). The freshness contract for `src/data/webmentions/` is enforced **only in CI** as a follow-up post-build step. Plan formalises.
- `packages/site/tests/unit/feed.test.ts` — vitest. Property-based with fast-check: every `Entry` shape produced by `toRssItem` must round-trip through the `rssSchema` validator from `@astrojs/rss` without throwing.
- `packages/site/tests/unit/profiles.test.ts` — vitest. Asserts the profiles list is non-empty, every URL is `https`-only, every URL is unique.
- `packages/site/tests/unit/build-webmentions.test.ts` — vitest with mocked fetch. Asserts: (a) deterministic write byte-equality across runs given the same fixture payload, (b) Zod schema rejects malformed jf2, (c) per-slug grouping works for the same target URL hit by multiple mentions, (d) URL canonicalisation matches the route's URL exactly (trailing slash, scheme).
- `packages/site/tests/unit/theme-script.test.ts` — vitest in **happy-dom**. Loads `inlineThemeScript()` source, evals it, asserts: localStorage reads precede DOM reads; missing localStorage value falls back to `prefers-color-scheme`; explicit `light`/`dark` overrides the media query; `system` re-evaluates the media query. Also asserts the script body is ≤ 1 KB minified-or-not (it isn't minified — comments stay in for trust).
- `packages/site/tests/unit/microformats.test.ts` — vitest using `microformats-parser`'s `mf2(html, { baseUrl })` export. Renders the `_WorkLayout` HTML output and asserts the parsed `items[]` contains at least one `h-entry` with `properties.name`, `properties.published`, `properties.content`, `properties.url`. Same for `_NoteLayout`. `HCard.astro` produces an `items[]` entry of `type: ["h-card"]`. Parses the home page HTML and asserts the GitHub URL appears in `result.rels.me` (a flat URL array per the parser's documented shape).
- `packages/site/tests/e2e/feeds.spec.ts` — Playwright e2e: `/feed.xml`, `/feed/works.xml`, `/feed/garden.xml` all return 200 with `content-type: application/xml` (or `application/rss+xml`); each is parseable by `DOMParser`; `/sitemap-index.xml` references `/sitemap-0.xml`; `/sitemap-0.xml` includes `/works/code-2/` and `/garden/welcome/`; `/robots.txt` references the sitemap-index.
- `packages/site/tests/e2e/theme.spec.ts` — Playwright e2e. Cycle through three states via the toggle, assert `<html data-theme>` updates per click, assert localStorage persists across reload, assert `prefers-color-scheme` emulated dark mode is honoured when `data-theme="system"`. Run also under `colorScheme: "dark"` browser context for first-paint regression. Visual snapshot per state.
- `packages/site/tests/e2e/webmentions.spec.ts` — Playwright e2e. Loads a fixture detail page that has a checked-in webmentions JSON file (small fixture committed under `tests/fixtures/webmentions/`). Asserts the avatar grid renders, the reply h-cite renders, and axe is clean. Uses a local fixture (not network) — the test does NOT hit webmention.io.

### Top-level routes added

- `/feed.xml` — firehose RSS, ~30 latest items.
- `/feed/works.xml` — works only.
- `/feed/garden.xml` — garden only.
- `/sitemap-index.xml` + `/sitemap-0.xml` — emitted by `@astrojs/sitemap`.
- `/robots.txt` — points at sitemap-index.

No new HTML pages.

### Top-level files modified

- `packages/site/src/layouts/_BaseLayout.astro` (slot `MetaHead` + footer additions).
- `packages/site/src/layouts/_WorkLayout.astro` (h-entry).
- `packages/site/src/layouts/_NoteLayout.astro` (h-entry).
- `packages/site/astro.config.mjs` (`site:` + sitemap integration).
- `packages/site/.size-limit.cjs` (+1 entry).
- `packages/site/lighthouserc.cjs` (+1 URL).
- `packages/site/knip.jsonc` (+1 entry).
- `packages/site/package.json` (deps + scripts).
- `packages/site/tests/fixtures/webmentions/<slug>.json` — new fixture.

## Architecture

### RSS feed pipeline

Three endpoint files (`feed.xml.ts`, `feed/works.xml.ts`, `feed/garden.xml.ts`) each export an async `GET(context)` that:

1. Calls `getCollection("works", filterFn)` + `getCollection("notes", filterFn)` per the feed kind.
2. Maps each entry through `toRssItem(entry, kind)` from `src/lib/feed.ts`. The helper builds `{ title, pubDate, description, link, content, customData }`. `pubDate` derives from `entry.data.created` (works) or `entry.data.created` (notes); falls back to file `mtime` only as a hard last resort. `link` derives from collection-aware URL builder (`/works/<slug>/` or `/garden/<slug>/`). `content` is the rendered HTML (built via `entry.render()` then stripped of unsafe MDX-island markers — only the static HTML body — see "Content stripping" below).
3. Returns `rss({ title, description, site: context.site, items, customData: '<language>en</language>' })`.

The firehose feed sorts merged items by `pubDate desc` and slices to 30. Per-collection feeds skip the slice (full collection).

**Content stripping.** Phase 3's MDX content includes Svelte/React island markers (`client:visible`, `<Counter>`, `<SandboxIsland>`). RSS readers cannot execute islands. The stripping policy: replace any `<astro-island>` element with a textual placeholder `[interactive: open the original page]`. **Implemented via `linkedom`** (a Bun-friendly DOM parser; ~30 KB devDep, build-only) — NOT a regex, because `<astro-island>` markup contains attributes whose values are JSON-encoded prop blobs that may include literal `>` characters, which would break a naive `<astro-island[^>]*>...</astro-island>` regex. The plan defines the exact transformer function in `src/lib/feed.ts`.

**Self-link.** Every HTML page emits `<link rel="alternate" type="application/rss+xml" title="utof.me — firehose" href="/feed.xml">` via `MetaHead.astro`. **Per-route policy** (locked at spec-write):
- `/` and `/works/` index page additionally emit `<link rel="alternate" … href="/feed/works.xml">`.
- `/garden/` and `/garden/graph/` additionally emit `<link rel="alternate" … href="/feed/garden.xml">`.
- Detail pages (`/works/[slug]/`, `/garden/[slug]/`) emit only the firehose alternate. Per-collection feeds are not advertised from individual posts — a reader subscribing from a single post wants the firehose, and the per-collection feed is one click away on the index page.
- Slash pages (`/now/`, `/uses/`, `/colophon/`, `/tops/`, `/stats/`) emit only the firehose alternate.

### Sitemap pipeline

`@astrojs/sitemap` is registered in `astro.config.mjs#integrations`. Two callbacks:

```js
sitemap({
  filter: (page) => !page.includes("/search") && !page.includes("/garden/graph/") && !page.includes("/stats/"),
  serialize(item) {
    // Apply lastmod from frontmatter when slug is known.
    // Plan defines the slug→entry lookup; default: read from a built-time
    // map produced by build-garden-data + a new build-works-meta companion.
    return item;
  },
});
```

Output: `dist/sitemap-index.xml` + `dist/sitemap-0.xml`. Astro emits these as part of the build; no extra script needed.

### Webmentions: build-time fetch

`scripts/build-webmentions.ts` runs as `prebuild:webmentions` before `astro build` (CI only; not local dev or precommit). Algorithm:

1. Read `astro.config.mjs#site` constant exported from a config helper.
2. Walk `getCollection("works", productionFilter)` and `getCollection("notes", publishFilter)` to build a list of canonical URLs.
3. For each URL, fetch `https://webmention.io/api/mentions.jf2?target=<encoded>&per-page=100&page=0`. Paginate via the **`page` parameter (offset-style, 0-indexed)**, incrementing `page` while `children.length === per-page`. There is no cursor parameter; the API is offset-paged. Stop when a page returns fewer than `per-page` items or when the API returns an empty `children` array.
4. For each child, validate against a Zod schema (subset of jf2): `wm-id` (number), `wm-property` (enum), `wm-target` (string), `wm-source` (string), `wm-received` (datetime), `author` (`{ name, photo, url }` — all strings, all optional except where the renderer needs them), `content` (`{ text, html }` — text only is rendered; html is ignored), `published` (datetime, optional), `url` (string), `type` (enum).
5. Group by `wm-target`. For each target whose group is non-empty, write `src/data/webmentions/<slug>.json` with the deterministic-write contract: tab indent, trailing newline, sorted by `wm-id` ascending.
6. Delete any orphan files in `src/data/webmentions/` whose target slug is no longer in the collection (mirror Phase 5 sync-vault's idempotent-delete behaviour, but webmention-side).

Failure modes:
- Network failure on a page: log a warning, skip that page (do NOT write an empty file; preserve last-known-good committed state). Hard-fail only if every page fails (suggests credentials issue).
- 429 rate-limit: exponential backoff up to 3 retries, then warn and skip.
- Schema validation failure on a single mention: log and skip that mention; continue.

### Microformats markup

Three components carry mf2 attributes:

- `_WorkLayout` and `_NoteLayout`: outer `<article class="h-entry">`; `<h1 class="p-name">`; `<time class="dt-published" datetime={isoString}>`; body wrapper `class="e-content"`; hidden self-link `<a class="u-url" href={canonicalUrl} aria-hidden="true" />`. The site author appears as `<a class="p-author h-card" href={hcardUrl}>{name}</a>` once per article (sourced from `profiles.ts` plus a `siteAuthor` constant).
- `HCard.astro` (footer): `<div class="h-card">` with `<a class="u-url p-name" href="/">{name}</a>`, `<p class="p-note">{bio}</p>`, then a `<ul>` of `rel="me"` profile links.

### `rel="me"` profile registry

`src/lib/profiles.ts`:

```ts
export type RelMeProfile = {
  url: string;
  label: string;
  network: "github" | "mastodon" | "bluesky" | "linkedin" | "twitter" | "email" | "other";
};
export const profiles: readonly RelMeProfile[] = [
  { url: "https://github.com/utof", label: "GitHub @utof", network: "github" },
];
```

**h-card vs profile registry:** the footer h-card declares the site itself as `u-url p-name` pointing at `/` (the canonical site URL). The `rel="me"` profile entries are *additional* identity links — they augment, not replace, the h-card's `u-url`. The site's own canonical URL is NEVER listed inside `profiles.ts` (no self-references; webmention.io's verifier ignores them). Adding profiles is a one-line append. The plan keeps the list small at phase ship — Mastodon / Bluesky URLs are added in a follow-up issue once the user provides them.

### Theme persistence — inline-script architecture

Three pieces:

1. **Inline-script in `<head>` (runs before first paint).** ~600 bytes raw including comments.
   ```js
   (function () {
     try {
       var t = localStorage.getItem("utofme:theme");
       if (t === "light" || t === "dark") {
         document.documentElement.dataset.theme = t;
         return;
       }
       // "system" or unset → follow the media query
       var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
       document.documentElement.dataset.theme = dark ? "dark" : "light";
       document.documentElement.dataset.themeSource = "system";
     } catch (e) {
       // localStorage blocked → fall through to media query
       try {
         document.documentElement.dataset.theme =
           window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
       } catch (e2) {}
     }
   })();
   ```

2. **Toggle button (`ThemeToggle.astro`) wired by an inline click handler script.** Cycles `light → dark → system → light`. Writes localStorage on each click; if value is `"system"`, removes the key (so the inline-script falls back to media query on next load). Updates `dataset.theme` and `dataset.themeSource` immediately to give visual feedback. Pseudo:

   ```js
   document.querySelector("[data-theme-toggle]").addEventListener("click", function () {
     var d = document.documentElement.dataset;
     var current = d.themeSource === "system" ? "system" : d.theme;
     var next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
     if (next === "system") {
       try { localStorage.removeItem("utofme:theme"); } catch (e) {}
       var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
       d.theme = dark ? "dark" : "light";
       d.themeSource = "system";
     } else {
       try { localStorage.setItem("utofme:theme", next); } catch (e) {}
       d.theme = next;
       d.themeSource = "user";
     }
   });
   ```

3. **CSS theme variables.** Existing CSS already uses `prefers-color-scheme: dark` blocks for theme overrides. Phase 6 adds `[data-theme="dark"]` selectors with the same custom-property values. The two declarations live side-by-side; `data-theme` wins because it's more specific. Visual-regression baselines re-record once for the dark variant.

**`dataset.themeSource` invariant** (locked at spec-write to forestall plan-time confusion). The inline first-paint script sets `dataset.themeSource = "system"` only when it falls back to `prefers-color-scheme`; when it reads an explicit `"light"` or `"dark"` from localStorage it does NOT set `themeSource` (absent attribute = user choice). The toggle handler reads `dataset.themeSource === "system" ? "system" : dataset.theme` to derive the current state — this means an absent `themeSource` is treated as a user choice (correct), and "system" is the only string ever written to that dataset key. Removing the localStorage key (the path used when cycling INTO `system`) writes `themeSource = "system"` and re-reads the media query.

**No island.** Full justification is in ADR 0035 — but the cap math: site-js measured 406.54 KB / 420 KB, headroom 13 KB; a Svelte-runes island plus a media-query subscription would alone add 4–8 KB; this absorbs most headroom for a feature that requires < 1 KB of vanilla DOM API. The inline-script form is simultaneously the smallest and the only one that runs **before first paint** (an island would race the LinkPreview hydration and flash the wrong theme).

**Caveat about FOUC.** The inline-script must execute before any CSS that depends on `[data-theme]` paints. Astro emits inline `<script is:inline>` synchronously in the `<head>` order it appears. `MetaHead.astro` places the theme script as the **first** child of `<head>` after the meta tags, so paint order is: meta → theme script → preload CSS → first paint with correct theme. The plan asserts this ordering with a unit test on the rendered HTML.

### Webmention render fallbacks

If `published` is absent from the jf2 payload, the renderer falls back to `wm-received` (always present per webmention.io's contract) and the `<time datetime>` attribute carries that value. If `author.name` is absent, the renderer uses the host part of `author.url` (e.g. `example.com`). If both `author.name` and `author.url` are absent, the mention is skipped entirely (logged at build time).

### Trust / typing of jf2 payloads

webmention.io's payloads are third-party. The Zod schema in `build-webmentions.ts` is the type boundary. Components only render typed fields:

- `author.name`: rendered as `<span class="p-name">`. Maximum 80 chars; truncated.
- `author.photo`: rendered as `<img src loading="lazy" decoding="async" alt="">` with `referrerpolicy="no-referrer"`. NO `crossorigin`.
- `author.url`: rendered as `<a href rel="external nofollow" referrerpolicy="no-referrer">`.
- `content.text`: rendered as plain text (no `<>` interpretation), max 280 chars, ellipsised.
- `content.html` is **never rendered** by the site (XSS surface). Sanitisation responsibility is webmention.io's; we don't inherit the risk.
- `wm-property`, `published`, `url`, `wm-source`, `wm-id` are typed primitives.

### Pipeline order (locked at spec time)

`prebuild:stats → prebuild:garden → prebuild:webmentions → astro build`.

Webmentions runs last among prebuilds because it depends on the published-URL list, which depends on the garden artefact slugs. Sitemap and RSS both run inside `astro build` — they are not prebuilds.

## Acceptance criteria

1. `bun run build` runs prebuild:stats + prebuild:garden + Astro build green and emits the literal paths `dist/feed.xml`, `dist/feed/works.xml`, `dist/feed/garden.xml`, `dist/sitemap-index.xml`, `dist/sitemap-0.xml`, `dist/robots.txt`. The endpoint extensions are preserved (Astro's `trailingSlash: "always"` applies to HTML pages, not endpoints with explicit extensions — verified at spec-write against Astro 6 docs). `bun run sync:webmentions` runs separately as a CI-only step that may write deltas to `dist/`-feeding `src/data/webmentions/<slug>.json`.
2. Each RSS feed validates against `https://validator.w3.org/feed/`-style structural rules (title + description + link + at least one item; each item has title + pubDate + link). Asserted by an offline parser test (`fast-xml-parser` or equivalent — verified at plan-write).
3. `dist/sitemap-0.xml` lists every published `/works/<slug>/`, `/garden/<slug>/`, `/now/`, `/uses/`, `/colophon/`, `/tops/`. Excludes `/search`, `/stats/`, `/garden/graph/`. Each entry has `<lastmod>` derived from frontmatter when present.
4. `dist/robots.txt` allows all and references `https://utof.me/sitemap-index.xml`.
5. Every detail page's HTML, when parsed by `mf2(html, { baseUrl: site })`, returns at least one item of `type: ["h-entry"]` with non-empty `properties.name`, `properties.published`, `properties.content`, `properties.url`. Footer returns one item of `type: ["h-card"]`. `<head>` contains exactly one `<link rel="webmention">` and one `<link rel="me">` per profile entry in `src/lib/profiles.ts`.
6. **Webmentions render correctly from a fixture file**: avatar grid for like/repost; threaded reply list for replies; empty-mentions URLs render no `<aside>`. `Webmentions.astro` never executes third-party HTML.
7. **Theme toggle**: cycle `light → dark → system → light`. `<html data-theme>` updates per click. localStorage persists. First paint after reload uses the persisted value (no FOUC). `prefers-color-scheme: dark` honoured when state is `system`.
8. **No FOUC for theme**: in a Playwright test that pre-seeds `localStorage["utofme:theme"] = "dark"` via `page.addInitScript()` (runs before any document scripts), navigate to `/`, then read `await page.evaluate(() => performance.getEntriesByType('paint'))` — the `first-contentful-paint` entry must occur **after** `<html data-theme="dark">` is set (assert by snapshotting `document.documentElement.dataset.theme` inside a `requestAnimationFrame` callback scheduled at `domcontentloaded` and confirming it equals `"dark"`). A visual-regression screenshot at the same moment confirms dark colours rendered. The combination of dataset assertion + pixel snapshot is the FOUC gate.
9. **No site-js growth**: post-Phase-6 `bun x size-limit` shows site-js ≤ 406.54 KB (current measure). The new `feed.xml` entry passes its 30 KB cap.
10. **LHCI mobile Performance ≥ 0.85** holds on every previously-tracked URL plus `/feed.xml`'s 200-status assertion.
11. **Axe-core zero violations** on every HTML route. Toggle button has accessible name + state announcement. Webmentions are inside an `<aside aria-labelledby>` with a heading.
12. `bun x type-coverage --at-least 100 --strict` passes.
13. **Determinism**: `bun run prebuild:webmentions` against a stub fetcher writes byte-identical `src/data/webmentions/*.json` across runs (asserted by unit test). Same `--write` Biome step from Phase 5 freshness gate ensures `git diff --exit-code` works in CI.
14. **`rel="me"` local presence**: a unit test loads the home page HTML, parses with `mf2(html, { baseUrl: site })`, and asserts that **every URL in `src/lib/profiles.ts`** appears in `result.rels.me`. The test does NOT make network calls. **Reciprocal verification** (does GitHub's bio link back to `https://utof.me/`?) is a one-time **manual user-only step** added to `progress.md#user-only-action-queue` — it is NOT enforced by CI because it would (a) require unauthenticated GitHub HTML scraping, (b) flake on rate limits, and (c) GitHub bio is the user's domain, not the site's.

## Per-route size budgets summary

| Route(s) | Limit | Notes |
|---|---|---|
| `/feed.xml` | 30 KB raw | XML; ~30 items full-content |
| `/feed/works.xml`, `/feed/garden.xml` | n/a | Same shape; informally tracked |
| `/sitemap-*.xml` | n/a | Capped only by `entryLimit: 45000` (Astro default) |
| `/robots.txt` | n/a | Static text ~100 bytes |
| Site-js (all routes, ex graph-vendor) | **420 KB**, target ≤ 406.54 KB | No regression from Phase 5 |
| All HTML routes | unchanged from Phase 5 | Theme inline-script ≤ 1 KB absorbed inline |

## Open questions (resolve at plan-write)

1. **`pubDate` source for works.** Schema currently has `created` + `updated`. RSS `pubDate` should be `created` (publication moment) — but if `updated` exists, an Atom-style `<updated>` should be emitted via `customData` per item. Plan decides whether to inject both.
2. **Webmention.io account creation.** This is a user-only action (sign in with IndieAuth via GitHub). Spec assumes the account is provisioned at webmention.io with username `utof.me` before Phase 6 ships. Add to `progress.md#user-only-action-queue`.
3. ~~**`rel="me"` reciprocal CI check.**~~ **Resolved at spec-write:** reciprocal verification is a one-time **manual user-only step** (added to `progress.md#user-only-action-queue`). CI does NOT fetch GitHub; the unit test in `microformats.test.ts` only asserts local presence of the rel-me link. Rationale: GitHub bio scraping flakes on rate limits and is outside the site's failure domain.
4. **Sitemap `priority`.** Spec doesn't set per-page priority. Plan-time decides whether `/`, `/works/`, `/garden/` get explicit `priority: 0.9` and individual posts get `0.5`, or whether to omit `priority` entirely (sitemap spec considers it advisory; Google ignores it). Recommendation: omit. Confirm at plan-time.
5. ~~**Theme storage key namespace.** `utofme:theme` is the chosen key.~~ **Resolved at spec-write:** `rg "utofme:" packages/site/src` returns zero matches. Namespace is unique, no migration needed.
6. **CI freshness gate for webmentions.** Spec says "no precommit gate; CI-only". Plan defines the exact CI step (fetch → write → `git diff --exit-code` would force a re-commit on every run since mentions arrive constantly; the actual gate is "no orphan files written" — i.e., the diff is allowed to be non-empty in this one directory but each diff must be a valid additive change, not a corruption). The plan resolves this.

## ADRs to write at phase close

- **0031** RSS three feeds (firehose + per-collection)
- **0032** Sitemap with `serialize()` + `filter` + advertising via `robots.txt` (folded — `robots.txt` is a 3-line static file pointing at the sitemap-index; not a reversible decision worth its own ADR)
- **0033** Webmentions build-time fetch (no runtime calls; CI-only, NOT chained into local `build`)
- **0034** Microformats h-entry / h-card subset (which mf2 properties are emitted, which are deferred)
- **0035** Theme toggle as inline-script (not Svelte island) — site-js-cap headroom argument

Five ADRs total (0031–0035). The original draft listed a sixth `robots.txt` ADR; folded into 0032 per CLAUDE.md's "decision that future-you might reverse" gate — a robots.txt → sitemap-index pointer is a one-line standard pattern, not a reversible architectural choice.

## Phase 6 task list (12 batches max)

1. `astro.config.mjs#site` + install `@astrojs/rss` + install `linkedom` (devDep) + `/feed.xml` firehose endpoint + `src/lib/feed.ts` (`toRssItem`, `stripIslands` via linkedom)
2. `/feed/works.xml` + `/feed/garden.xml` + property-test island-stripping + `feed.test.ts`
3. `@astrojs/sitemap` integration + `serialize` lastmod + `filter` exclusions + `public/robots.txt`
4. `MetaHead.astro` **skeleton only** (`<link rel="webmention">` + firehose `<link rel="alternate">`) — no per-collection alternates yet (depend on Tasks 1-2 having shipped feed URLs)
5. `MetaHead.astro` per-route alternate-link wiring (per the policy locked in §Architecture) + `src/lib/profiles.ts` + `<link rel="me">` rendering + `HCard.astro` footer + `profiles.test.ts`
6. h-entry markup on `_WorkLayout` + `_NoteLayout` + `microformats.test.ts` (uses `mf2` API)
7. `scripts/build-webmentions.ts` + Zod schema + deterministic write + offset pagination + `build-webmentions.test.ts` (mocked fetch)
8. `Webmentions.astro` render component + fixture e2e + `published`/`wm-received` fallback
9. Theme first-paint inline-script (in `MetaHead.astro` head-position) + `ThemeToggle.astro` (with its own click-handler `is:inline` script) + `theme.ts` source + unit test (happy-dom) + `dataset.themeSource` invariant test
10. CSS theme variables for `[data-theme="dark"]` + visual-regression baselines re-record (one screenshot per layout per theme)
11. Tooling: `.size-limit.cjs` (+1 `feed.xml` entry), LHCI URL (+`/feed.xml` 200-status), knip register `scripts/build-webmentions.ts`, **NO** lefthook precommit gate for webmentions; **add a `sync:webmentions` GitHub Actions step** before `bun run build` in `.github/workflows/ci.yml` that does fetch → write → `git diff --exit-code src/data/webmentions/` (allowed to be non-zero if a new mention arrived; if non-zero, log and continue — do not fail CI)
12. 5 ADRs (0031–0035) + final progress update + queue spec-residual nits as `gh issue create -l nit`

## Risks & mitigations

- **Webmention.io rate limits.** Mitigation: optional auth token + exponential backoff + skip-on-error per page. CI run frequency is roughly per-merge, not per-commit, so volume is small.
- **Theme FOUC on slow networks.** Mitigation: theme script is synchronous + first child of `<head>`. Asserted by Playwright first-paint test.
- **Microformats parser version drift.** Mitigation: pin `microformats-parser` at install; lockfile-controlled.
- **Sitemap explosion if collections grow > 45000 entries.** Mitigation: not a real risk in Phase 6 timeframe (current entries < 50); Astro auto-shards above that.
- **Spam webmentions.** Mitigation: webmention.io applies its own moderation; the build script trusts only what reaches it. If spam slips through, the user can manually delete the relevant `src/data/webmentions/<slug>.json` file before commit; the file format is plain JSON.
