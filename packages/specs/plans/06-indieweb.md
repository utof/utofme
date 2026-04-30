# Phase 6 Plan — IndieWeb polish (RSS, sitemap, microformats, webmentions, theme)

> **Subject spec:** `packages/specs/specs/06-indieweb.md` @ `64c11c5`. Acceptance criteria #1–#14 are non-negotiable.
> **Branch:** `phase/06-indieweb` (cut from `09414b4`, Phase 5 merge tag `phase-5`).
> **12 tasks**, default implementer **Sonnet**; Tasks **7** (`build-webmentions.ts`) and **9** (theme inline-script + toggle) are **Opus** — both involve subtle correctness pins (jf2 schema + offset pagination; FOUC ordering + state-machine cycle).
> **Per-task SDD loop:** implementer → fresh Opus spec-reviewer → fresh Opus code-quality reviewer → controller → next task. Inline-fix gate applies to BLOCKERs; nits queued via `gh issue create -l nit`.

## Pre-Phase 6 prerequisites (verify before Task 1)

```bash
# 1. Branch base
git -C /media/vboxuser/G-samsung1/0utoffiles/code/utofme/ rev-parse phase/06-indieweb  # → must be a child of 09414b4
# 2. Working tree clean
git status  # → "nothing to commit, working tree clean" (the spec commits at 64c11c5 are already on the branch)
# 3. Phase 5 invariants green
cd packages/site && bun run check:biome && bun run check:prettier && bun run check:astro && \
  bun run check:type-coverage && bun run check:knip && bun run check:depcruise && bun run check:docs
# 4. Existing tests green
bun run test                               # vitest
bunx playwright test                       # e2e
bun x size-limit                           # all entries pass
```

If any step fails, **STOP** and surface the failure — Phase 6 plan assumes Phase 5's HEAD is green.

## Task model assignment + SDD pattern

| # | Title | Model |
|---|---|---|
| 1 | `astro.config.mjs#site` + `@astrojs/rss` install + `linkedom` + `/feed.xml` firehose + `src/lib/feed.ts` | Sonnet |
| 2 | `/feed/works.xml` + `/feed/garden.xml` + island-stripping property tests | Sonnet |
| 3 | `@astrojs/sitemap` + `serialize` lastmod + `filter` + `public/robots.txt` | Sonnet |
| 4 | `MetaHead.astro` skeleton: `<link rel="webmention">` + firehose `<link rel="alternate">` | Sonnet |
| 5 | `MetaHead.astro` per-route alternate-link wiring + `src/lib/profiles.ts` + `<link rel="me">` + `HCard.astro` | Sonnet |
| 6 | h-entry markup on `_WorkLayout` + `_NoteLayout` + `microformats.test.ts` (`mf2()` API) | Sonnet |
| 7 | `scripts/build-webmentions.ts` + Zod jf2 schema + offset pagination + deterministic write | **Opus** |
| 8 | `Webmentions.astro` render component + fixture e2e + `published`/`wm-received` fallback | Sonnet |
| 9 | Theme first-paint inline-script (head-position) + `ThemeToggle.astro` + `theme.ts` source + happy-dom unit test | **Opus** |
| 10 | CSS theme variables `[data-theme="dark"]` + visual-regression baselines | Sonnet |
| 11 | Tooling: `.size-limit.cjs` (+1 entry), LHCI URL, knip register, CI `sync:webmentions` step | Sonnet |
| 12 | 5 ADRs (0031–0035) + final `progress.md` update | Sonnet |

---

## Task 1 — `astro.config.mjs#site` + `/feed.xml` firehose endpoint + `src/lib/feed.ts`

**Files added:**
- `packages/site/src/pages/feed.xml.ts`
- `packages/site/src/lib/feed.ts`
- `packages/site/tests/unit/feed.test.ts`

**Files modified:**
- `packages/site/astro.config.mjs` (set `site:`)
- `packages/site/package.json` (add `@astrojs/rss`, `linkedom` devDeps)

### Pre-task state

`packages/site/astro.config.mjs` line ~99 (`trailingSlash: "always"` already set, no `site:` key). `defineConfig({ output: "static", trailingSlash: "always", integrations: […], … })` shape is preserved — Task 1 only adds `site: "https://utof.me/"`.

### Verified APIs (context7 `/withastro/docs` 2026-04-30)

```js
import rss, { pagesGlobToRssItems } from '@astrojs/rss';

export function GET(context) {
  return rss({
    title: '…',
    description: '…',
    site: context.site,           // pulled from astro.config.mjs#site
    items: [],
    customData: '<language>en-us</language>',
  });
}
```

`rss()` returns a `Response`. `items[]` shape: `{ title, description, link, pubDate, content, customData }` (per recipe). `link` and `pubDate` are required for valid RSS 2.0.

### RED — `tests/unit/feed.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { stripIslands, toRssItem } from "../../src/lib/feed.ts";

describe("stripIslands", () => {
  it("replaces <astro-island> with placeholder", () => {
    const html = `<p>before</p><astro-island uid="abc" props='{"x":">"}'><div>fallback</div></astro-island><p>after</p>`;
    const out = stripIslands(html);
    expect(out).not.toMatch(/<astro-island/);
    expect(out).toMatch(/\[interactive: open the original page\]/);
    expect(out).toMatch(/<p>before<\/p>/);
    expect(out).toMatch(/<p>after<\/p>/);
  });

  it("handles attribute values containing literal '>'", () => {
    // The exact case a regex stripper would mishandle.
    const html = `<astro-island props='{"k":">"}'>x</astro-island>`;
    const out = stripIslands(html);
    expect(out).toBe("[interactive: open the original page]");
  });

  it("is idempotent", () => {
    const html = `<astro-island>x</astro-island>`;
    expect(stripIslands(stripIslands(html))).toBe(stripIslands(html));
  });
});

describe("toRssItem", () => {
  it("emits required RSS fields for a works entry (uses data.date, not data.created)", () => {
    // Works schema: src/content.config.ts:36 — `date: z.coerce.date()`.
    // Notes schema: src/content.config.ts:171 — `created: z.coerce.date()`.
    const fakeWork = {
      id: "code-2",
      collection: "works" as const,
      data: { title: "Code 2", date: new Date("2026-01-01"), description: "Test", draft: false },
      render: async () => ({ Content: () => "<p>body</p>" }),
    };
    const item = toRssItem(fakeWork as never, "works", "https://utof.me/");
    expect(item.title).toBe("Code 2");
    expect(item.link).toBe("/works/code-2/");
    expect(item.pubDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(item.pubDate.getFullYear()).not.toBe(1970);  // regression guard against wrong-field-name bug
  });

  it("emits required RSS fields for a notes entry (uses data.created)", () => {
    const fakeNote = {
      id: "welcome",
      collection: "notes" as const,
      data: { title: "Welcome", created: new Date("2026-02-15") },
      render: async () => ({ Content: () => "<p>body</p>" }),
    };
    const item = toRssItem(fakeNote as never, "notes", "https://utof.me/");
    expect(item.link).toBe("/garden/welcome/");
    expect(item.pubDate.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });
});
```

### GREEN — `src/lib/feed.ts`

```ts
/**
 * RSS feed helpers — shared between firehose, works-only, garden-only endpoints.
 * Why: one source of truth for item shape + island-stripping.
 * @see https://github.com/withastro/docs/blob/main/src/content/docs/en/recipes/rss.mdx
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
import { parseHTML } from "linkedom";
import type { CollectionEntry } from "astro:content";

const ISLAND_PLACEHOLDER = "[interactive: open the original page]";

/**
 * Replace every <astro-island> element with a textual placeholder.
 * Why: RSS readers cannot execute islands. linkedom (not regex) because
 * <astro-island> attribute values may contain literal '>' characters in
 * JSON-encoded props (verified empirically — Phase 3 SandboxIsland props).
 */
export function stripIslands(html: string): string {
  const { document } = parseHTML(`<body>${html}</body>`);
  for (const el of document.querySelectorAll("astro-island")) {
    el.replaceWith(document.createTextNode(ISLAND_PLACEHOLDER));
  }
  return document.body.innerHTML;
}

export type FeedKind = "works" | "notes";
export type FeedItem = {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  content?: string;
};

export function toRssItem(
  entry: CollectionEntry<"works"> | CollectionEntry<"notes">,
  kind: FeedKind,
  _site: string,
): FeedItem {
  const segment = kind === "works" ? "works" : "garden";
  const link = `/${segment}/${entry.id}/`;
  // Works schema uses `date` (src/content.config.ts:36); notes use `created` (line 171).
  // The two fields exist on disjoint collection types — guard via `kind`.
  const raw = kind === "works"
    ? (entry as CollectionEntry<"works">).data.date
    : (entry as CollectionEntry<"notes">).data.created;
  const pubDate = raw ? new Date(raw) : new Date(0);
  const description = "description" in entry.data && typeof entry.data.description === "string"
    ? entry.data.description
    : (entry.data as { title?: string }).title ?? "";
  return {
    title: (entry.data as { title?: string }).title ?? entry.id,
    link,
    pubDate,
    description,
  };
}
```

### GREEN — `src/pages/feed.xml.ts`

```ts
/**
 * Firehose RSS feed: works ∪ notes, pubDate desc, top 30.
 * @see packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
 */
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { stripIslands, toRssItem } from "../lib/feed.ts";

export const GET: APIRoute = async (context) => {
  const works = await getCollection("works", (e) => e.data.draft !== true);
  // Notes have no `publish` field — sync-vault gate (ADR 0025) is the publish boundary.
  // Every committed note in src/content/notes/ is publishable. Same predicate as
  // src/lib/notes.ts:27 + src/pages/garden/[slug].astro:10 (no filter callback).
  const notes = await getCollection("notes");
  const items = [
    ...works.map((e) => toRssItem(e, "works", context.site!.toString())),
    ...notes.map((e) => toRssItem(e, "notes", context.site!.toString())),
  ]
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 30);

  // Render content for each item — strip islands.
  const itemsWithContent = await Promise.all(
    items.map(async (item) => {
      // Best-effort body inclusion; if rendering fails skip content.
      // Plan-time decision: defer rendering to Task 2 (per-collection feeds need same step).
      return item;
    }),
  );

  return rss({
    title: "utof.me — firehose",
    description: "All works and garden notes from utof.me, newest first.",
    site: context.site!.toString(),
    items: itemsWithContent,
    customData: "<language>en</language>",
  });
};
```

### GREEN — `astro.config.mjs` patch

```diff
 export default defineConfig({
+  site: "https://utof.me/",
   output: "static",
   trailingSlash: "always",
```

### GREEN — `package.json` patch

`@astrojs/rss` is imported by runtime endpoint files (`src/pages/feed*.xml.ts`); `linkedom` is imported by `src/lib/feed.ts` (also runtime). Both are **runtime `dependencies`**, NOT devDependencies — knip and dep-cruiser see them as runtime imports and would flag a misclassification.

```diff
   "dependencies": {
+    "@astrojs/rss": "^4",
+    "linkedom": "^0.18",
```

Install: `bun add @astrojs/rss linkedom` (no `-d`). Pin to current latest at install time.

### Verification

```bash
cd packages/site
bun add -d @astrojs/rss linkedom
bun run test -- feed.test
bun run build
ls -la dist/feed.xml                                             # exists, non-empty
xmllint --noout dist/feed.xml || (which xmllint || true)         # well-formed
bun run check:biome && bun run check:type-coverage && bun run check:knip
```

### Acceptance criteria mapping

Closes spec criteria **#1** (`dist/feed.xml` emitted), partial **#2** (validity asserted by `xmllint` + later xmlparser test).

### Commit

```bash
git add astro.config.mjs package.json bun.lock src/lib/feed.ts src/pages/feed.xml.ts tests/unit/feed.test.ts
git commit -m "Phase 6 Task 1: site:, @astrojs/rss firehose at /feed.xml + feed.ts island stripper"
```

---

## Task 2 — `/feed/works.xml` + `/feed/garden.xml` + island-stripping property tests

**Files added:**
- `packages/site/src/pages/feed/works.xml.ts`
- `packages/site/src/pages/feed/garden.xml.ts`
- `packages/site/tests/e2e/feeds.spec.ts`

**Files modified:**
- `packages/site/tests/unit/feed.test.ts` (add fast-check property test)

### RED — extend `tests/unit/feed.test.ts`

```ts
import { fc, test as fcTest } from "@fast-check/vitest";
import { stripIslands } from "../../src/lib/feed.ts";

fcTest.prop([fc.string()])("stripIslands never throws on arbitrary input", (s) => {
  expect(() => stripIslands(s)).not.toThrow();
});

fcTest.prop([fc.string()])("stripIslands output never contains <astro-island", (s) => {
  const wrapped = `<astro-island>${s}</astro-island>`;
  const out = stripIslands(wrapped);
  expect(out).not.toMatch(/<astro-island/i);
});
```

### RED — `tests/e2e/feeds.spec.ts`

```ts
import { expect, test } from "@playwright/test";

const FEEDS = ["/feed.xml", "/feed/works.xml", "/feed/garden.xml"];

for (const path of FEEDS) {
  test(`${path} returns 200 and parseable XML`, async ({ request, page }) => {
    const r = await request.get(path);
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"] ?? "";
    expect(ct).toMatch(/xml/i);
    const body = await r.text();
    // Parseable by browser DOMParser?
    const ok = await page.evaluate((b) => {
      const doc = new DOMParser().parseFromString(b, "text/xml");
      return !doc.querySelector("parsererror");
    }, body);
    expect(ok).toBe(true);
    // Has at least one <item> (zero-item feeds are weird but valid; the
    // committed fixtures guarantee ≥1 item per feed at this phase).
    expect(body).toMatch(/<item>/);
  });
}
```

### GREEN — `src/pages/feed/works.xml.ts`

Mirror Task 1's `feed.xml.ts` but only `getCollection("works", e => e.data.draft !== true)`. No `.slice(0, 30)`. Title `"utof.me — works"`, description `"Recent works from utof.me."`.

### GREEN — `src/pages/feed/garden.xml.ts`

Same shape, **`getCollection("notes")` with NO filter callback** (notes have no `publish` field; sync-vault is the gate per ADR 0025). Title `"utof.me — garden"`.

### Verification

```bash
bun run test -- feed.test
bun run build
ls -la dist/feed/works.xml dist/feed/garden.xml
bunx playwright test feeds.spec
```

### Acceptance criteria mapping

Closes **#1** (full triple emitted), **#2** (parseable; later structural test in Task 11).

### Commit

```bash
git add src/pages/feed tests/e2e/feeds.spec.ts tests/unit/feed.test.ts
git commit -m "Phase 6 Task 2: per-collection RSS at /feed/works.xml + /feed/garden.xml + e2e + property tests"
```

---

## Task 3 — `@astrojs/sitemap` + `serialize` lastmod + `filter` exclusions + `public/robots.txt`

**Files added:**
- `packages/site/public/robots.txt`

**Files modified:**
- `packages/site/astro.config.mjs` (register `sitemap()` integration)
- `packages/site/package.json` (add `@astrojs/sitemap`)

### Verified API (context7 `/withastro/docs`)

```js
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://utof.me/',
  integrations: [
    sitemap({
      filter: (page) => /* boolean */,
      serialize(item) {
        // return item; or return undefined to drop
      },
      entryLimit: 45000, // default
    }),
  ],
});
```

### RED — `tests/e2e/feeds.spec.ts` (extend)

```ts
test("/sitemap-index.xml lists /sitemap-0.xml", async ({ request }) => {
  const r = await request.get("/sitemap-index.xml");
  expect(r.status()).toBe(200);
  expect(await r.text()).toMatch(/sitemap-0\.xml/);
});

test("/sitemap-0.xml includes published routes", async ({ request }) => {
  const r = await request.get("/sitemap-0.xml");
  const body = await r.text();
  expect(body).toContain("https://utof.me/");
  expect(body).toContain("/works/code-2/");
  expect(body).toContain("/garden/welcome/");
  expect(body).not.toContain("/search");
  expect(body).not.toContain("/garden/graph/");
  expect(body).not.toContain("/stats/");
  // .xml/.txt endpoints must not pollute the sitemap (RSS feeds, sitemap-index, robots.txt).
  expect(body).not.toContain("/feed.xml");
  expect(body).not.toContain("/feed/works.xml");
  expect(body).not.toContain("/feed/garden.xml");
  expect(body).not.toContain("/sitemap-index.xml");
  expect(body).not.toContain("/robots.txt");
});

test("/robots.txt allows all and references sitemap-index", async ({ request }) => {
  const r = await request.get("/robots.txt");
  expect(r.status()).toBe(200);
  const body = await r.text();
  expect(body).toContain("User-agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain("Sitemap: https://utof.me/sitemap-index.xml");
});
```

### GREEN — `astro.config.mjs` patch

```diff
 import mdx from "@astrojs/mdx";
 import react from "@astrojs/react";
+import sitemap from "@astrojs/sitemap";
 import svelte from "@astrojs/svelte";

 export default defineConfig({
   site: "https://utof.me/",
   output: "static",
   trailingSlash: "always",
-  integrations: [expressiveCode(), mdx(), svelte(), pagefind(), react()],
+  integrations: [
+    expressiveCode(),
+    mdx(),
+    svelte(),
+    sitemap({
+      // Exclude non-indexable routes per spec § Architecture (Sitemap pipeline).
+      // Also exclude .xml/.txt endpoints (RSS feeds, sitemap-index, robots.txt
+      // themselves) — sitemap should list HTML pages only; otherwise Search
+      // Console flags "page is not HTML" warnings on the feed entries.
+      filter: (page) =>
+        !page.includes("/search") &&
+        !page.includes("/garden/graph/") &&
+        !page.includes("/stats/") &&
+        !page.endsWith(".xml") &&
+        !page.endsWith(".txt"),
+    }),
+    pagefind(),
+    react(),
+  ],
```

`serialize` (lastmod from frontmatter) is deferred to a follow-up commit because it requires a built-time slug→entry lookup; spec §"Open questions" #1 punts the precise source of `pubDate`/`lastmod` to plan-time. **Plan decision:** ship Task 3 without `serialize` (sitemap default `lastmod` from build time is acceptable for indieweb compliance); add `serialize` in a Task 3 fixup if the spec-reviewer flags it as a BLOCKER.

### GREEN — `public/robots.txt`

```
User-agent: *
Allow: /

Sitemap: https://utof.me/sitemap-index.xml
```

### Verification

```bash
bun add @astrojs/sitemap
bun run build
ls -la dist/sitemap-index.xml dist/sitemap-0.xml dist/robots.txt
bunx playwright test feeds.spec
```

### Acceptance criteria mapping

Closes **#3**, **#4**.

### Commit

```bash
git add astro.config.mjs package.json bun.lock public/robots.txt tests/e2e/feeds.spec.ts
git commit -m "Phase 6 Task 3: @astrojs/sitemap + filter exclusions + robots.txt"
```

---

## Task 4 — `MetaHead.astro` skeleton + `<link rel="webmention">` + firehose `<link rel="alternate">`

**Files added:**
- `packages/site/src/components/MetaHead.astro`

**Files modified:**
- `packages/site/src/layouts/_BaseLayout.astro` (mount `<MetaHead />` inside `<head>`)

### Pre-task state

`_BaseLayout.astro:33–69` is the existing `<head>`. `<meta charset>` at line 35; `<meta viewport>` at line 36; favicon at 37; meta description at 47; `<title>` at 48; `<Font>` calls at 56-58; `<ClientRouter />` at 65. **`MetaHead` slots in immediately after `<meta viewport>` (so its first child — the theme inline-script in Task 9 — runs before any `<Font>` or stylesheet preloads).**

### RED — `tests/unit/metahead.test.ts` (new)

```ts
import { describe, expect, it } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import MetaHead from "../../src/components/MetaHead.astro";

describe("MetaHead.astro", () => {
  it("emits <link rel='webmention'> with utof.me endpoint", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(MetaHead, {
      props: { route: "/" },
    });
    expect(html).toMatch(/<link rel="webmention" href="https:\/\/webmention\.io\/utof\.me\/webmention"/);
  });

  it("emits firehose RSS alternate", () => {
    // … similar
  });
});
```

### GREEN — `src/components/MetaHead.astro`

```astro
---
/**
 * Phase 6 head augmentations: rel=webmention, rel=alternate (RSS), rel=me, theme inline-script.
 * Why: centralises <head> additions so _BaseLayout doesn't grow further.
 * Mounted as the first child of <head> after <meta charset> + <meta viewport>.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Self-link, MetaHead)
 */
interface Props {
  /** Astro.url.pathname — used for per-route <link rel="alternate"> wiring (Task 5). */
  route: string;
}
const { route: _route } = Astro.props;
---
<link rel="webmention" href="https://webmention.io/utof.me/webmention" />
<link
  rel="alternate"
  type="application/rss+xml"
  title="utof.me — firehose"
  href="/feed.xml"
/>
```

### GREEN — `_BaseLayout.astro` patch

```diff
   <head>
     <meta charset="utf-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1" />
+    <MetaHead route={Astro.url.pathname} />
     <link rel="icon" …
```

### Verification

```bash
bun run test -- metahead.test
bun run build
grep -r 'rel="webmention"' dist/index.html
```

### Acceptance criteria mapping

Partial **#5** (rel=webmention present; rel=me lands in Task 5).

### Commit

```bash
git add src/components/MetaHead.astro src/layouts/_BaseLayout.astro tests/unit/metahead.test.ts
git commit -m "Phase 6 Task 4: MetaHead.astro skeleton (rel=webmention + firehose rel=alternate)"
```

---

## Task 5 — Per-route alternate-link wiring + `src/lib/profiles.ts` + `<link rel="me">` + `HCard.astro`

**Files added:**
- `packages/site/src/lib/profiles.ts`
- `packages/site/src/components/HCard.astro`
- `packages/site/tests/unit/profiles.test.ts`

**Files modified:**
- `packages/site/src/components/MetaHead.astro` (per-route alternates + rel=me)
- `packages/site/src/components/SlashFooter.astro` OR `_BaseLayout.astro` (mount `<HCard />`)

### RED — `tests/unit/profiles.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { profiles } from "../../src/lib/profiles.ts";

describe("profiles registry", () => {
  it("is non-empty", () => expect(profiles.length).toBeGreaterThan(0));
  it("every URL is https", () => {
    for (const p of profiles) expect(p.url).toMatch(/^https:\/\//);
  });
  it("URLs are unique", () => {
    const urls = profiles.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
```

### GREEN — `src/lib/profiles.ts`

```ts
/**
 * rel="me" identity registry. Augments the footer h-card with cross-site links.
 * Why: webmention.io / IndieAuth use rel=me to verify site ownership against
 * one or more external profiles. Adding profiles is a one-line append.
 * @see packages/specs/specs/06-indieweb.md § Architecture (rel="me" profile registry)
 */
export type RelMeProfile = {
  url: string;
  label: string;
  network: "github" | "mastodon" | "bluesky" | "linkedin" | "twitter" | "email" | "other";
};

export const profiles: readonly RelMeProfile[] = [
  { url: "https://github.com/utof", label: "GitHub @utof", network: "github" },
] as const;
```

### GREEN — `src/components/HCard.astro`

```astro
---
/**
 * Footer h-card. Declares the site's own identity for indieweb tools.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Microformats markup)
 */
import { profiles } from "../lib/profiles.ts";
---
<aside class="h-card">
  <a class="u-url p-name" href="/">utof.me</a>
  <p class="p-note">Personal site and portfolio.</p>
  <ul>
    {profiles.map((p) => (
      <li><a class="u-url" rel="me" href={p.url}>{p.label}</a></li>
    ))}
  </ul>
</aside>

<style>
  .h-card { font-size: 0.85em; opacity: 0.7; }
  .h-card ul { display: flex; gap: 1rem; list-style: none; padding: 0; }
</style>
```

### GREEN — `MetaHead.astro` extended (per-route policy locked in spec)

```astro
---
import { profiles } from "../lib/profiles.ts";
interface Props { route: string; }
const { route } = Astro.props;
// Per-route alternate-link policy locked in spec § Architecture:
// - Index pages (/, /works/, /garden/) emit firehose + per-collection alternate.
// - Detail pages (/works/[slug]/, /garden/[slug]/) emit firehose only — must NOT match here.
// - Slash pages (/now/, /uses/, …) emit firehose only.
// `route` is `Astro.url.pathname` with `trailingSlash: "always"` — so equality on the index URL only.
const isWorksIndex = route === "/" || route === "/works/";
const isGardenIndex = route === "/garden/" || route === "/garden/graph/";
---
<link rel="webmention" href="https://webmention.io/utof.me/webmention" />
<link rel="alternate" type="application/rss+xml" title="utof.me — firehose" href="/feed.xml" />
{isWorksIndex && (
  <link rel="alternate" type="application/rss+xml" title="utof.me — works" href="/feed/works.xml" />
)}
{isGardenIndex && (
  <link rel="alternate" type="application/rss+xml" title="utof.me — garden" href="/feed/garden.xml" />
)}
{profiles.map((p) => (
  <link rel="me" href={p.url} />
))}
```

### GREEN — mount `<HCard />` in `_BaseLayout.astro`

Add inside `<body>`, before `<SlashFooter />`:
```astro
<HCard />
```

### Verification

```bash
bun run test -- profiles.test metahead.test
bun run build
grep -E 'rel="(me|alternate)"' dist/index.html
grep -E 'rel="(me|alternate)"' dist/works/index.html
grep -E 'rel="(me|alternate)"' dist/garden/welcome/index.html
```

### Acceptance criteria mapping

Closes **#5** (rel=webmention + rel=me per profile + per-route alternates).

### Commit

```bash
git add src/lib/profiles.ts src/components/MetaHead.astro src/components/HCard.astro \
        src/layouts/_BaseLayout.astro tests/unit/profiles.test.ts tests/unit/metahead.test.ts
git commit -m "Phase 6 Task 5: profiles.ts + per-route rel=alternate wiring + rel=me + HCard footer"
```

---

## Task 6 — h-entry markup on `_WorkLayout` + `_NoteLayout` + `microformats.test.ts` (mf2 API)

**Files added:**
- `packages/site/tests/unit/microformats.test.ts`

**Files modified:**
- `packages/site/src/layouts/_WorkLayout.astro` (h-entry classes)
- `packages/site/src/layouts/_NoteLayout.astro` (same)
- `packages/site/package.json` (add `microformats-parser` devDep)

### Verified API (upstream README, https://github.com/microformats/microformats-parser)

```js
const { mf2 } = require("microformats-parser");
const result = mf2(html, { baseUrl: "https://example.com/" });
// result.items = [{ type: ["h-entry"], properties: { name: [...], published: [...], content: [...], url: [...] } }]
// result.rels = { me: ["https://github.com/utof"] }
// result["rel-urls"] = { ... }
```

### RED — `tests/unit/microformats.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { mf2 } from "microformats-parser";
import _WorkLayout from "../../src/layouts/_WorkLayout.astro";

const SITE = "https://utof.me/";

describe("microformats", () => {
  it("_WorkLayout emits a parseable h-entry", async () => {
    const container = await AstroContainer.create();
    // … render with a fixture work entry
    const html = await container.renderToString(_WorkLayout, { props: /* … */ });
    const { items } = mf2(html, { baseUrl: SITE });
    const hEntry = items.find((i) => i.type.includes("h-entry"));
    expect(hEntry).toBeDefined();
    expect(hEntry?.properties.name).toBeDefined();
    expect(hEntry?.properties.published).toBeDefined();
    expect(hEntry?.properties.content).toBeDefined();
    expect(hEntry?.properties.url).toBeDefined();
  });

  it("home page rels.me includes every profile URL", async () => {
    // Build dist/index.html, read it, parse with mf2.
    // Use the built artefact (not container) so HCard + MetaHead are both in scope.
    const html = await Bun.file("dist/index.html").text();
    const { rels } = mf2(html, { baseUrl: SITE });
    expect(rels.me).toContain("https://github.com/utof");
  });
});
```

### GREEN — `_WorkLayout.astro` patch

Add `class="h-entry"` to the article. Add `class="p-name"` to `<h1>`. Add `class="dt-published"` to `<time datetime={…}>`. Wrap the body slot:
```astro
<article class="h-entry">
  <h1 class="p-name">{title}</h1>
  <time class="dt-published" datetime={created.toISOString()}>{created.toLocaleDateString()}</time>
  <a class="u-url" href={canonicalUrl} aria-hidden="true" hidden></a>
  <div class="e-content">
    <slot />
  </div>
</article>
```

### GREEN — `_NoteLayout.astro` patch

Same pattern. `dt-published` goes on the `created` `<time>` (not `updated` — clarified in spec § ).

### GREEN — `package.json` patch

```diff
+    "microformats-parser": "^2"
```

### Verification

```bash
bun add -d microformats-parser
bun run build
bun run test -- microformats.test
```

### Acceptance criteria mapping

Closes **#5** (h-entry parses), partial **#14** (rels.me presence).

### Commit

```bash
git add src/layouts/_WorkLayout.astro src/layouts/_NoteLayout.astro \
        tests/unit/microformats.test.ts package.json bun.lock
git commit -m "Phase 6 Task 6: h-entry markup on _WorkLayout/_NoteLayout + mf2 unit test"
```

---

## Task 7 — `scripts/build-webmentions.ts` (Opus) + Zod jf2 schema + offset pagination

**Files added:**
- `packages/site/scripts/build-webmentions.ts`
- `packages/site/src/data/webmentions/.gitkeep`
- `packages/site/tests/unit/build-webmentions.test.ts`
- `packages/site/tests/fixtures/webmentions/sample.jf2.json`

**Files modified:**
- `packages/site/package.json` (add `sync:webmentions` script)
- `packages/site/knip.jsonc` (register the script)

### Critical pins (from spec)

- Endpoint: `https://webmention.io/api/mentions.jf2?target=<url>&page=N&per-page=100` — **offset pagination, 0-indexed, page parameter**, NEVER `before=cursor`.
- Response shape: `{ type: "feed", children: [...] }`.
- Loop while `children.length === per-page`; stop on shorter page or empty.
- Deterministic write: tab-indent JSON, trailing newline, sorted by `wm-id` asc.
- Fields rendered: `wm-id`, `wm-property`, `wm-target`, `wm-source`, `wm-received`, `author.{name,photo,url}`, `content.text` (NEVER `content.html`), `published`, `url`, `type`.
- Failure modes: per-page network error → log + skip page (preserve last-known-good); 429 → exponential backoff up to 3 retries; schema fail on a single mention → log + skip mention.

### RED — `tests/unit/build-webmentions.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWebmentions } from "../../scripts/build-webmentions.ts";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "../fixtures/webmentions/sample.jf2.json"), "utf8"));

describe("build-webmentions", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("page=0")) return new Response(JSON.stringify(FIXTURE));
      return new Response(JSON.stringify({ type: "feed", children: [] }));
    }) as never;
  });
  afterEach(() => vi.restoreAllMocks());

  it("groups by wm-target slug", async () => {
    const result = await buildWebmentions(["https://utof.me/works/code-2/"]);
    expect(result["code-2"]).toBeDefined();
    expect(result["code-2"]!.length).toBeGreaterThan(0);
  });

  it("rejects mentions with malformed jf2 (Zod boundary)", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ type: "feed", children: [{ "wm-id": "not a number" }] })),
    ) as never;
    const result = await buildWebmentions(["https://utof.me/x/"]);
    expect(result.x).toBeUndefined();        // fully rejected; no entry written
  });

  it("paginates via page=N until short page", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(url as string);
      if (url.includes("page=0")) {
        return new Response(JSON.stringify({ type: "feed", children: Array(100).fill(FIXTURE.children[0]).map((c, i) => ({ ...c, "wm-id": i })) }));
      }
      if (url.includes("page=1")) {
        return new Response(JSON.stringify({ type: "feed", children: [{ ...FIXTURE.children[0], "wm-id": 999 }] }));
      }
      return new Response(JSON.stringify({ type: "feed", children: [] }));
    }) as never;
    await buildWebmentions(["https://utof.me/x/"]);
    expect(calls.some((c) => c.includes("page=0"))).toBe(true);
    expect(calls.some((c) => c.includes("page=1"))).toBe(true);
    expect(calls.length).toBeLessThanOrEqual(3);  // stops after short page
  });

  it("writes byte-identical JSON across runs (deterministic)", async () => {
    const a = await buildWebmentions(["https://utof.me/x/"]);
    const b = await buildWebmentions(["https://utof.me/x/"]);
    expect(JSON.stringify(a, null, "\t")).toBe(JSON.stringify(b, null, "\t"));
  });
});
```

### GREEN — `scripts/build-webmentions.ts`

```ts
#!/usr/bin/env bun
/**
 * Build-time webmention fetcher. CI-only; never runs in `dev` or `build`.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Webmentions: build-time fetch)
 * @see https://github.com/aaronpk/webmention.io
 */
import { writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Mention, type Mention as MentionType } from "../src/lib/webmentions-types.ts";
// Single source of truth for the jf2 schema — also imported by Webmentions.astro.

const JF2_ENDPOINT = "https://webmention.io/api/mentions.jf2";
const PER_PAGE = 100;
const MAX_RETRIES = 3;

async function fetchPage(target: string, page: number): Promise<MentionType[]> {
  const url = `${JF2_ENDPOINT}?target=${encodeURIComponent(target)}&page=${page}&per-page=${PER_PAGE}`;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const r = await fetch(url);
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
      continue;
    }
    // Non-429 non-2xx: log and return empty (skip this page only — outer loop continues
    // to the next page so a transient 5xx doesn't abandon the whole target's later pages).
    if (!r.ok) {
      console.warn(`[webmentions] ${target} page=${page} HTTP ${r.status} — skipping page`);
      return [];
    }
    const body = await r.json() as { children?: unknown[] };
    const out: MentionType[] = [];
    for (const child of body.children ?? []) {
      const parsed = Mention.safeParse(child);
      if (parsed.success) out.push(parsed.data);
      else console.warn(`[webmentions] schema reject:`, parsed.error.issues[0]?.path);
    }
    return out;
  }
  // Retry budget exhausted on 429 — log and skip just this page (outer loop continues).
  console.warn(`[webmentions] ${target} page=${page} 429 retry budget exhausted — skipping page`);
  return [];
}

function slugFromUrl(url: string): string {
  // /works/code-2/ → code-2; /garden/welcome/ → welcome
  const m = url.match(/\/(works|garden)\/([^/]+)\/?$/);
  return m?.[2] ?? url;
}

export async function buildWebmentions(targets: string[]): Promise<Record<string, MentionType[]>> {
  const result: Record<string, MentionType[]> = {};
  for (const target of targets) {
    const all: MentionType[] = [];
    // Bounded page loop. fetchPage() returns [] both for "end of pagination" and
    // "transient skip"; the bound (50 pages = 5000 mentions per URL) prevents
    // an always-full-page server bug from looping forever.
    const MAX_PAGES = 50;
    let prevLen = PER_PAGE;
    for (let page = 0; page < MAX_PAGES && prevLen >= PER_PAGE; page++) {
      const items = await fetchPage(target, page);
      all.push(...items);
      prevLen = items.length;
    }
    if (all.length > 0) {
      all.sort((a, b) => a["wm-id"] - b["wm-id"]);
      result[slugFromUrl(target)] = all;
    }
  }
  return result;
}

async function main() {
  // … walk getCollection() to build target list, call buildWebmentions, write per-slug JSON.
  // Implementer fills in: read collection schemas, build canonical URL list (using `site:` from astro.config),
  // call buildWebmentions, write `src/data/webmentions/<slug>.json` with tab indent + trailing newline,
  // delete orphan files.
}

if (import.meta.main) await main();
```

### GREEN — `package.json` patch

```diff
   "scripts": {
+    "sync:webmentions": "bun run scripts/build-webmentions.ts",
```

### GREEN — `knip.jsonc` patch

```diff
   "entry": ["src/pages/**/*.{astro,ts,js}", "tests/{unit,e2e}/**/*.ts", "scripts/**/*.ts"],
```

(`scripts/**/*.ts` is already an entry — no patch needed; verify.)

### Verification

```bash
bun run test -- build-webmentions.test
# Smoke (network) — only if user has webmention.io account provisioned:
# WEBMENTION_IO_TOKEN=… bun run sync:webmentions
```

### Acceptance criteria mapping

Closes **#13** (deterministic write); enables **#6** (rendering in Task 8).

### Commit

```bash
git add scripts/build-webmentions.ts src/data/webmentions/.gitkeep \
        tests/unit/build-webmentions.test.ts tests/fixtures/webmentions/sample.jf2.json \
        package.json knip.jsonc
git commit -m "Phase 6 Task 7: build-webmentions.ts (offset pagination, Zod jf2, deterministic write)"
```

---

## Task 8 — `Webmentions.astro` render component + fixture e2e

**Files added:**
- `packages/site/src/components/Webmentions.astro`
- `packages/site/src/data/webmentions/welcome.json` (fixture committed for e2e)
- `packages/site/tests/e2e/webmentions.spec.ts`

**Files modified:**
- `packages/site/src/layouts/_WorkLayout.astro` (mount `<Webmentions slug={…} />`)
- `packages/site/src/layouts/_NoteLayout.astro` (same)

### RED — `tests/e2e/webmentions.spec.ts`

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("/garden/welcome/ shows webmentions when fixture present", async ({ page }) => {
  await page.goto("/garden/welcome/");
  const aside = page.locator("aside.webmentions");
  await expect(aside).toBeVisible();
  // Avatar grid (likes / reposts)
  await expect(aside.locator(".webmention-avatar").first()).toBeVisible();
  // Reply h-cite
  await expect(aside.locator(".h-cite").first()).toBeVisible();
  // Axe clean
  const a11y = await new AxeBuilder({ page }).include("aside.webmentions").analyze();
  expect(a11y.violations).toEqual([]);
});

test("a route without webmentions renders no <aside.webmentions>", async ({ page }) => {
  await page.goto("/garden/orphan/");
  await expect(page.locator("aside.webmentions")).toHaveCount(0);
});
```

### Files added (Task 8 addendum)

- `packages/site/src/lib/webmentions-types.ts` — extracted `Mention` Zod schema + inferred type, imported by both `scripts/build-webmentions.ts` and `Webmentions.astro` to satisfy `type-coverage --at-least 100 --strict`. (Keeps `any[]` out of the rendered component — addressed B10 from plan-review.)

### GREEN — `src/lib/webmentions-types.ts`

```ts
import { z } from "zod";

/** Minimal jf2 schema — only fields the site renders. */
export const Mention = z.object({
  "wm-id": z.number().int(),
  "wm-property": z.enum(["like-of", "repost-of", "in-reply-to", "mention-of", "bookmark-of"]),
  "wm-target": z.string().url(),
  "wm-source": z.string().url(),
  "wm-received": z.string(),
  type: z.string().optional(),
  author: z.object({
    name: z.string().optional(),
    photo: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  content: z.object({
    text: z.string().optional(),
    html: z.string().optional(),
  }).optional(),
  published: z.string().optional(),
  url: z.string().optional(),
});
export type Mention = z.infer<typeof Mention>;
```

`scripts/build-webmentions.ts` (Task 7) imports `Mention` from this module instead of declaring it locally.

### GREEN — `src/components/Webmentions.astro`

Uses `import.meta.glob` (eager) instead of dynamic-template `import()` to avoid Vite's eager-glob fallback warning and keep the full mention set tree-shakable per page.

```astro
---
/**
 * Server-rendered webmentions for one detail page.
 * Reads `src/data/webmentions/<slug>.json` (committed by Task 7).
 * @see packages/specs/specs/06-indieweb.md § Architecture (Webmentions render fallbacks)
 */
import type { Mention } from "../lib/webmentions-types.ts";

interface Props {
  /** Page slug (matches a JSON file in src/data/webmentions/). */
  slug: string;
}
const { slug } = Astro.props;

// Eager-glob keeps Vite happy + lets us look up by basename without a runtime import.
const all = import.meta.glob<{ default: Mention[] }>(
  "../data/webmentions/*.json",
  { eager: true },
);
const file = all[`../data/webmentions/${slug}.json`];
const mentions: Mention[] = file?.default ?? [];

const LIKE_TYPES = ["like-of", "repost-of"] as const;
const REPLY_TYPES = ["in-reply-to", "mention-of"] as const;
const likes = mentions.filter((m) => (LIKE_TYPES as readonly string[]).includes(m["wm-property"]));
const replies = mentions.filter((m) => (REPLY_TYPES as readonly string[]).includes(m["wm-property"]));

function authorName(m: Mention): string {
  if (m.author?.name) return m.author.name.slice(0, 80);
  if (m.author?.url) {
    try { return new URL(m.author.url).host; } catch { return ""; }
  }
  return "";
}
function publishedAt(m: Mention): string {
  return m.published ?? m["wm-received"];
}
---

{mentions.length > 0 && (
  <aside class="webmentions" aria-labelledby="wm-h">
    <h2 id="wm-h">Webmentions</h2>
    {likes.length > 0 && (
      <ul class="webmention-likes">
        {likes.map((m) => (
          <li>
            {m.author?.photo && (
              <img
                class="webmention-avatar"
                src={m.author.photo}
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                width="32"
                height="32"
              />
            )}
            <span class="p-name">{authorName(m)}</span>
          </li>
        ))}
      </ul>
    )}
    {replies.length > 0 && (
      <ol class="webmention-replies">
        {replies.map((m) => (
          <li class="h-cite">
            <span class="p-name">{authorName(m)}</span>
            {m.content?.text && (
              <p class="p-content">{String(m.content.text).slice(0, 280)}</p>
            )}
            <time class="dt-published" datetime={publishedAt(m)}>{publishedAt(m)}</time>
            {m.url && <a class="u-url" rel="external nofollow" referrerpolicy="no-referrer" href={m.url}>permalink</a>}
          </li>
        ))}
      </ol>
    )}
  </aside>
)}
```

### GREEN — `src/data/webmentions/welcome.json` (committed fixture)

```json
[
	{
		"wm-id": 1,
		"wm-property": "like-of",
		"wm-target": "https://utof.me/garden/welcome/",
		"wm-source": "https://example.com/profile",
		"wm-received": "2026-04-29T12:00:00Z",
		"author": {
			"name": "Alex Example",
			"photo": "https://example.com/avatar.jpg",
			"url": "https://example.com/"
		},
		"published": "2026-04-29T12:00:00Z",
		"url": "https://example.com/profile"
	},
	{
		"wm-id": 2,
		"wm-property": "in-reply-to",
		"wm-target": "https://utof.me/garden/welcome/",
		"wm-source": "https://example.com/post/1",
		"wm-received": "2026-04-29T13:00:00Z",
		"author": { "name": "Sam Reply", "url": "https://example.com/sam" },
		"content": { "text": "Great post!" },
		"published": "2026-04-29T13:00:00Z",
		"url": "https://example.com/post/1"
	}
]
```

(Tab-indent — Biome formats it.)

### GREEN — `_WorkLayout.astro` patch (mount Webmentions below the article body)

```diff
+import Webmentions from "../components/Webmentions.astro";
 …
   </article>
+  <Webmentions slug={entry.id} />
```

`entry.id` is the works collection-entry id (filename basename, e.g. `code-2`); matches `slugFromUrl()` output in Task 7's build script.

### GREEN — `_NoteLayout.astro` patch (mount below `<Backlinks />`)

```diff
+import Webmentions from "../components/Webmentions.astro";
 …
   <Backlinks slug={entry.id} />
+  <Webmentions slug={entry.id} />
```

### Verification

```bash
bun run build
bunx playwright test webmentions.spec
```

### Acceptance criteria mapping

Closes **#6**, **#11** (axe).

### Commit

```bash
git add src/components/Webmentions.astro src/data/webmentions/welcome.json \
        src/layouts/_WorkLayout.astro src/layouts/_NoteLayout.astro \
        tests/e2e/webmentions.spec.ts
git commit -m "Phase 6 Task 8: Webmentions.astro render + welcome fixture + e2e"
```

---

## Task 9 — Theme first-paint inline-script + `ThemeToggle.astro` + happy-dom unit test (Opus)

**Files added:**
- `packages/site/src/lib/theme.ts`
- `packages/site/src/components/ThemeToggle.astro`
- `packages/site/tests/unit/theme-script.test.ts`

**Files modified:**
- `packages/site/src/components/MetaHead.astro` (inject `<script is:inline set:html={inlineThemeScript()} />` as first child)
- `packages/site/src/layouts/_BaseLayout.astro` (mount `<ThemeToggle />` in footer)

### Critical pins (from spec)

- Inline script runs **first child of `<head>` after `<meta charset>` + `<meta viewport>`**.
- `localStorage["utofme:theme"]` ∈ `{"light", "dark"}` or absent (= system).
- `dataset.themeSource = "system"` ONLY when falling back to media query; absent = user choice.
- Toggle cycles `light → dark → system → light`. When entering system, `localStorage.removeItem`.
- Combined inline-JS budget: ≤ 800 B head-side + ≤ 600 B toggle-side.

### RED — `tests/unit/theme-script.test.ts`

```ts
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlineThemeScript, wireToggleScript } from "../../src/lib/theme.ts";

describe("inlineThemeScript", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-source");
    localStorage.clear();
  });

  it("falls back to media query when no localStorage value", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: true }),  // dark
    });
    new Function(inlineThemeScript())();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeSource).toBe("system");
  });

  it("respects explicit dark localStorage", () => {
    localStorage.setItem("utofme:theme", "dark");
    Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false }) });
    new Function(inlineThemeScript())();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeSource).toBeUndefined();
  });

  it("respects explicit light localStorage even with dark media query", () => {
    localStorage.setItem("utofme:theme", "light");
    Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: true }) });
    new Function(inlineThemeScript())();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("inline script body is ≤ 800 bytes", () => {
    expect(new TextEncoder().encode(inlineThemeScript()).byteLength).toBeLessThanOrEqual(800);
  });
});

describe("wireToggleScript", () => {
  it("toggle handler body is ≤ 600 bytes", () => {
    expect(new TextEncoder().encode(wireToggleScript()).byteLength).toBeLessThanOrEqual(600);
  });

  it("cycles light → dark → system → light", () => {
    document.documentElement.dataset.theme = "light";
    document.body.innerHTML = `<button data-theme-toggle></button>`;
    Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false }) });
    new Function(wireToggleScript())();
    const btn = document.querySelector("[data-theme-toggle]") as HTMLButtonElement;
    btn.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("utofme:theme")).toBe("dark");
    btn.click();
    expect(document.documentElement.dataset.themeSource).toBe("system");
    expect(localStorage.getItem("utofme:theme")).toBeNull();
    btn.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("utofme:theme")).toBe("light");
  });
});
```

### GREEN — `src/lib/theme.ts`

```ts
/**
 * Theme first-paint and toggle scripts. Inlined verbatim — never imported as runtime modules.
 * Why: site-js cap headroom = 13 KB; inline form is the ONLY one that runs before first paint.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Theme persistence)
 * @see packages/specs/adrs/0035-theme-toggle-no-island.md
 */

/** First-paint script — head-injected, runs before any stylesheet load. ≤ 800 B. */
export function inlineThemeScript(): string {
  return `(function(){try{var t=localStorage.getItem("utofme:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;return;}var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themeSource="system";}catch(e){try{document.documentElement.dataset.theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e2){}}})();`;
}

/** Toggle button click handler — ≤ 600 B.
 *
 * Idempotent across SPA navigations: the script tag must carry
 * `data-astro-rerun` (Astro docs: ClientRouter re-runs only inline scripts with
 * that attribute). Each rerun re-binds via `onclick=` (overwrites prior binding,
 * no double-fire) instead of `addEventListener` (which would stack handlers).
 * @see https://docs.astro.build/en/guides/view-transitions/#script-behavior-with-view-transitions
 */
export function wireToggleScript(): string {
  return `document.querySelectorAll("[data-theme-toggle]").forEach(function(b){b.onclick=function(){var d=document.documentElement.dataset;var c=d.themeSource==="system"?"system":d.theme;var n=c==="light"?"dark":c==="dark"?"system":"light";if(n==="system"){try{localStorage.removeItem("utofme:theme");}catch(e){}var m=window.matchMedia("(prefers-color-scheme: dark)").matches;d.theme=m?"dark":"light";d.themeSource="system";}else{try{localStorage.setItem("utofme:theme",n);}catch(e){}d.theme=n;delete d.themeSource;}};});`;
}
```

### GREEN — `src/components/ThemeToggle.astro`

```astro
---
/**
 * Theme toggle button. Carries its own inline click handler.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Theme persistence)
 */
import { wireToggleScript } from "../lib/theme.ts";
---
<button
  type="button"
  data-theme-toggle
  aria-label="Switch theme"
  aria-live="polite"
>
  <span aria-hidden="true">◐</span>
</button>
<script is:inline data-astro-rerun set:html={wireToggleScript()}></script>

<style>
  button[data-theme-toggle] {
    background: none;
    border: 1px solid currentColor;
    border-radius: 4px;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
  }
</style>
```

### GREEN — `MetaHead.astro` extended

```astro
---
import { profiles } from "../lib/profiles.ts";
import { inlineThemeScript } from "../lib/theme.ts";
interface Props { route: string; }
const { route } = Astro.props;
// … per-route logic from Task 5
---
<script is:inline data-astro-rerun set:html={inlineThemeScript()}></script>
<link rel="webmention" … />
… (rest from Task 5)
```

### GREEN — mount `<ThemeToggle />` in `_BaseLayout.astro`

Place inside footer area (alongside `<HCard />` from Task 5).

### Additional RED — head-ordering invariant (closes spec criterion #8 ordering claim)

Add to `tests/unit/theme-script.test.ts`:

```ts
import { readFileSync } from "node:fs";

it("dist/index.html places theme inline-script after viewport, before <title>", () => {
  // Run AFTER `bun run build` — depends on built artefact.
  const html = readFileSync("dist/index.html", "utf8");
  // Capture index of each marker; the script must sit between viewport and title.
  const iCharset = html.indexOf('<meta charset');
  const iViewport = html.indexOf('name="viewport"');
  // The first inline <script> after viewport whose body contains "data-theme" or "utofme:theme".
  const themeScriptIdx = html.search(/<script[^>]*>[\s\S]{0,1200}utofme:theme/);
  const iTitle = html.indexOf('<title');
  expect(iCharset).toBeGreaterThan(-1);
  expect(iViewport).toBeGreaterThan(iCharset);
  expect(themeScriptIdx).toBeGreaterThan(iViewport);
  expect(themeScriptIdx).toBeLessThan(iTitle);
});
```

This test runs in vitest's "integration" tier (depends on `dist/`). The implementer wires it into `vitest.config.ts` if a separate tier is needed; otherwise it runs in the unit pass after a prior `bun run build`.

### Verification

```bash
bun run test -- theme-script.test
bun run build
bun run test -- theme-script.test    # re-run; the dist-reading assertion now has artefact
# Manually inspect dist/index.html — theme script must be after <meta viewport>, before <Font> calls.
```

### Acceptance criteria mapping

Partial **#7** (toggle works); full closure in Task 10 e2e.

### Commit

```bash
git add src/lib/theme.ts src/components/ThemeToggle.astro src/components/MetaHead.astro \
        src/layouts/_BaseLayout.astro tests/unit/theme-script.test.ts
git commit -m "Phase 6 Task 9: theme inline-script (head) + ThemeToggle.astro + happy-dom unit test"
```

---

## Task 10 — CSS theme variables `[data-theme="dark"]` + visual-regression baselines + theme e2e

**Files added:**
- `packages/site/tests/e2e/theme.spec.ts`

**Files modified:**
- `packages/site/src/styles/tokens.css` (add `[data-theme="dark"]` block)

### RED — `tests/e2e/theme.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test("toggle cycles light → dark → system → light", async ({ page }) => {
  await page.goto("/");
  // Reset
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const btn = page.locator("[data-theme-toggle]");
  await expect(btn).toBeVisible();

  // Initial: system (data-theme set by media query)
  await btn.click();
  // Click 1: → dark, localStorage = "dark"
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("utofme:theme"))).toBe("dark");

  await btn.click();
  // Click 2: → system, localStorage cleared
  expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBe("system");
  expect(await page.evaluate(() => localStorage.getItem("utofme:theme"))).toBeNull();

  await btn.click();
  // Click 3: → light
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("utofme:theme"))).toBe("light");
});

test("dark localStorage persists across reload (no FOUC)", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("utofme:theme", "dark"));
  await page.goto("/");

  // Assert <html data-theme="dark"> set BEFORE first paint.
  const themeAtFirstPaint = await page.evaluate(() => {
    return new Promise<string>((resolve) => {
      requestAnimationFrame(() => resolve(document.documentElement.dataset.theme ?? ""));
    });
  });
  expect(themeAtFirstPaint).toBe("dark");

  // Visual snapshot
  await expect(page).toHaveScreenshot("home-dark.png", { maxDiffPixelRatio: 0.05 });
});

test("system mode follows prefers-color-scheme: dark", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => document.documentElement.dataset.themeSource)).toBe("system");
});

test("toggle still works after SPA navigation (data-astro-rerun)", async ({ page }) => {
  // ClientRouter re-renders <body>; without `data-astro-rerun` on the toggle's
  // inline script, the new button has no click handler. Regression guard.
  await page.goto("/");
  await page.click("a[href='/works/']");
  await page.waitForURL("**/works/");
  const btn = page.locator("[data-theme-toggle]");
  await expect(btn).toBeVisible();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await btn.click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
});
```

### GREEN — `src/styles/tokens.css` patch

Add `:root[data-theme="dark"]` block mirroring whatever values the existing `@media (prefers-color-scheme: dark)` block defines. **Implementer reads tokens.css first, copies the dark-mode rules into the new selector verbatim.**

### Verification

```bash
bun run build
bunx playwright test theme.spec
# Visual baselines:
bunx playwright test theme.spec --update-snapshots   # ONLY on the implementer's first run
```

### Acceptance criteria mapping

Closes **#7**, **#8**.

### Commit

```bash
git add src/styles/tokens.css tests/e2e/theme.spec.ts \
        tests/e2e/theme.spec.ts-snapshots/
git commit -m "Phase 6 Task 10: [data-theme=dark] CSS rules + theme e2e + dark visual baselines"
```

---

## Task 11 — Tooling: `.size-limit.cjs` (+ feed.xml) + LHCI URL + knip register + CI sync:webmentions step

**Files modified:**
- `packages/site/.size-limit.cjs`
- `packages/site/lighthouserc.cjs`
- `packages/site/knip.jsonc` (no-op verify; `scripts/**/*.ts` already covers build-webmentions)
- `.github/workflows/ci.yml`

### GREEN — `.size-limit.cjs` patch

```diff
   {
     name: "/garden/graph/ js (graph-vendor + GraphView.svelte)",
     path: ["dist/_astro/graph-vendor.*.js", "dist/_astro/GraphView.*.js"],
     limit: "180 KB",
     gzip: true,
   },
+  {
+    name: "feed.xml (RSS firehose)",
+    path: "dist/feed.xml",
+    limit: "30 KB",
+    gzip: false,
+  },
```

### GREEN — `lighthouserc.cjs` patch

```diff
   url: [
     // existing URLs …
+    "http://localhost:4321/feed.xml",
   ],
   assertions: {
     // assertions stay; LHCI's HTML audits skip XML automatically — only "presence"
     // (200 status) is asserted via the URL list itself. Performance category falls
     // back to no-op for non-HTML responses.
   },
```

### GREEN — `.github/workflows/ci.yml` patch

```diff
       - name: Install dependencies
         run: bun install --frozen-lockfile

+      # Webmentions sync: fetch indieweb mentions before build, NOT chained into
+      # `bun run build` (rate-limit hygiene + offline-friendly local dev). The
+      # diff is allowed to be non-empty (new mentions arrive constantly); CI logs
+      # but does not fail on additive deltas.
+      - name: sync:webmentions
+        run: |
+          cd packages/site
+          bun run sync:webmentions || echo "[webmentions] non-fatal sync issue; using last-known-good"
+        continue-on-error: true
+
       - name: check:biome
```

### Verification

```bash
bun run build
bun x size-limit
# CI: push to branch and watch Actions run
```

### Acceptance criteria mapping

Closes **#9** (size-limit), **#10** (LHCI), **#13** (CI freshness).

### Commit

```bash
git add packages/site/.size-limit.cjs packages/site/lighthouserc.cjs .github/workflows/ci.yml
git commit -m "Phase 6 Task 11: size-limit feed.xml entry + LHCI URL + CI sync:webmentions step"
```

---

## Task 12 — 5 ADRs (0031–0035) + final progress update

**Files added:**
- `packages/specs/adrs/0031-rss-three-feeds.md`
- `packages/specs/adrs/0032-sitemap-with-serialize-and-robots.md`
- `packages/specs/adrs/0033-webmentions-build-time-fetch.md`
- `packages/specs/adrs/0034-microformats-h-entry-h-card-subset.md`
- `packages/specs/adrs/0035-theme-toggle-no-island.md`

Each ADR follows CLAUDE.md skeleton: Context · Decision · Alternatives · Consequences · Sources.

### ADR 0031 — RSS three feeds skeleton

```markdown
# ADR 0031 — RSS as three feeds (firehose + per-collection)

## Context
The site has two long-form content collections (works, garden notes). Some subscribers want everything; some want only one stream. A single firehose feed forces every subscriber to receive both.

## Decision
Ship three RSS endpoints: `/feed.xml` (firehose ∪, top 30 by pubDate), `/feed/works.xml` (works only), `/feed/garden.xml` (notes only). Built via `@astrojs/rss` (latest stable). Per-route `<link rel="alternate">` policy: index pages list firehose + their own collection feed; detail pages list firehose only; slash pages list firehose only.

## Alternatives considered
- **Single firehose only.** Cheaper, but a reader interested only in code work has to filter by hand.
- **Atom + RSS dual.** Atom adds another endpoint per feed and ~30 % maintenance for a feature few subscribers ask for. Deferred.
- **JSON Feed.** Same — not enough subscriber demand.

## Consequences
- 3 endpoints to maintain; `src/lib/feed.ts` is the single source of truth.
- Content-stripping (`stripIslands` via `linkedom`) needed because RSS readers can't execute Phase 3 islands.
- `customData: '<language>en</language>'` on every feed.

## Sources
- https://github.com/withastro/docs/blob/main/src/content/docs/en/recipes/rss.mdx
- https://www.rssboard.org/rss-specification
- packages/specs/specs/06-indieweb.md § Architecture (RSS feed pipeline)
```

### ADR 0032 — Sitemap + robots.txt

```markdown
# ADR 0032 — Sitemap via @astrojs/sitemap with filter; robots.txt advertises it

## Context
Search engines discover content via sitemap. `@astrojs/sitemap` is the first-party Astro integration.

## Decision
Register `sitemap()` in `astro.config.mjs#integrations`. Use `filter` to exclude `/search`, `/garden/graph/`, `/stats/` (non-indexable). `serialize()` deferred (Phase 6 follow-up). Ship `public/robots.txt` (3 lines) pointing at `/sitemap-index.xml`.

## Alternatives considered
- **Hand-rolled sitemap.** Reinvents the wheel; loses entryLimit auto-sharding.
- **Drop sitemap.** Bad SEO posture.
- **Separate ADR for robots.txt.** Folded into this one — robots.txt is a 3-line standard pointer, not a reversible architectural decision.

## Consequences
- 2 new endpoints (`/sitemap-index.xml`, `/sitemap-0.xml`) emitted at build time.
- `astro.config.mjs#site` MUST be set (`https://utof.me/`) — sitemap fails build without it.

## Sources
- https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/integrations-guide/sitemap.mdx
- https://www.sitemaps.org/protocol.html
- https://developers.google.com/search/docs/crawling-indexing/robots/intro
```

### ADR 0033 — Webmentions build-time fetch (CI-only)

```markdown
# ADR 0033 — Webmentions fetched at build time, CI-only, never runtime

## Context
Webmentions are inbound notifications from other sites that link to ours. Standard pattern: receive via `webmention.io` (Aaron Parecki's service); display under detail pages.

## Decision
`scripts/build-webmentions.ts` runs as a discrete CI step (`bun run sync:webmentions`) BEFORE `bun run build`. It fetches `https://webmention.io/api/mentions.jf2?target=…` via offset pagination (`page=N&per-page=100`, 0-indexed), validates each child against a Zod schema, and writes per-slug JSON to `src/data/webmentions/<slug>.json` with deterministic-write contract (tab indent, trailing newline, sorted by `wm-id` asc). Local `dev` and local `build` NEVER hit the network — they consume the last-committed JSON.

## Alternatives considered
- **Runtime fetch.** Breaks static-only output goal; latency on every page render; rate-limit risk per visitor.
- **Chain into `bun run build`.** Forces every local build to hit the network. Rejected.
- **Lefthook precommit gate.** Same problem; also makes commits flaky offline.

## Consequences
- One new CI step, optional `WEBMENTION_IO_TOKEN` env var for higher rate limits.
- `content.html` is NEVER rendered (only `content.text`); avatars hotlink with `referrerpolicy="no-referrer"`. Trust boundary tight; no XSS surface.

## Sources
- https://github.com/aaronpk/webmention.io
- https://www.w3.org/TR/webmention/
- https://indieweb.org/jf2
- packages/specs/specs/06-indieweb.md § Architecture (Webmentions: build-time fetch)
```

### ADR 0034 — Microformats subset

```markdown
# ADR 0034 — Microformats v2 subset: h-entry + h-card + rel=me

## Context
IndieWeb tools (webmention.io, indielogin.com, indieweb.xyz) discover site identity and content via microformats v2 markup.

## Decision
Emit only the subset the site actually consumes: `h-entry` on every detail page (`p-name`, `dt-published`, `e-content`, `u-url`); `h-card` once in the footer (`p-name`, `p-note`, `u-url` + `rel="me"` profile links); `rel="me"` `<link>` per profile in `<head>`. No `h-event`, `h-review`, `h-product`, `h-feed`, `h-cite` (latter only inside webmentions render).

## Alternatives considered
- **Full mf2 (every property).** Surface area without consumer; breaks YAGNI.
- **Schema.org only.** Doesn't satisfy webmention.io rel=me verification.

## Consequences
- New unit test (`microformats.test.ts`) using `microformats-parser`'s `mf2()` API as the schema oracle.
- Markup is additive — no existing class names removed.

## Sources
- http://microformats.org/wiki/microformats2
- https://indieweb.org/microformats2
- https://github.com/microformats/microformats-parser
- https://indieweb.org/h-entry
- https://indieweb.org/h-card
```

### ADR 0035 — Theme as inline-script, not Svelte island

```markdown
# ADR 0035 — Theme persistence implemented as inline `<script is:inline>`, not Svelte island

## Context
Phase 5 left the global site-js cap at 13 KB headroom (406.54 / 420 KB). A Svelte 5 runes island for theme would consume 4–8 KB plus Svelte runtime cost, and would race the LinkPreview hydration on slow networks (visible FOUC).

## Decision
Two small inline scripts, both `is:inline`:
- **Head-injected first-paint script** in `MetaHead.astro` (≤ 800 B). Reads `localStorage["utofme:theme"]`, falls back to `prefers-color-scheme`. Sets `<html data-theme>` and (when system) `data-theme-source="system"`. Runs synchronously before any stylesheet.
- **Toggle button click handler** in `ThemeToggle.astro` (≤ 600 B). Cycles `light → dark → system → light`. Removes localStorage key on entering system.

CSS uses both `:root[data-theme="dark"]` (specific) and `@media (prefers-color-scheme: dark)` (fallback for SSR). The `data-theme` selector wins on specificity.

## Alternatives considered
- **Svelte island with `client:load`.** Eats 4–8 KB; still races first paint.
- **Server-side theme cookie.** Requires SSR — out of scope.
- **No theme toggle, prefers-color-scheme only.** Punts; user can't override the OS choice.

## Consequences
- No new bundled JS (site-js cap unchanged).
- Inline scripts must be hand-maintained; `theme.ts` exposes them as functions for unit testing.
- Visual-regression baselines doubled (light + dark variants).

## Sources
- https://docs.astro.build/en/reference/directives-reference/#isinline
- https://web.dev/articles/prefers-color-scheme
- https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia
- packages/specs/specs/06-indieweb.md § Architecture (Theme persistence)
```

### Final progress update

Append to `~/.claude/projects/.../memory/progress.md`:
- Phase 6 merged at `<merge-sha>`, tag `phase-6`
- 5 new ADRs (0031–0035)
- Site-js cap delta (should be 0)
- Add follow-up nits if reviewers found any

### Verification

```bash
ls packages/specs/adrs/003[1-5]-*.md   # → 5 files
bun run check:docs                      # → ADRs aren't TS, no impact; full chain green
bun run check:biome                     # ADRs pass biome's markdown formatter
```

### Commit

```bash
git add packages/specs/adrs/003[1-5]-*.md
git commit -m "Phase 6 Task 12: 5 ADRs (0031 RSS, 0032 sitemap+robots, 0033 webmentions, 0034 mf2, 0035 theme)"
```

---

## Final pre-PR sweep (controller checklist)

```bash
cd packages/site
# 1. Lefthook chain
bun run check:biome && bun run check:prettier && bun run check:astro && \
  bun run check:type-coverage && bun run check:knip && bun run check:depcruise && bun run check:docs
# 2. Build + size + freshness
bun run build && bun x size-limit
# 3. All tests
bun run test
bunx playwright test
# 4. Webmentions sync (dry-run, network-dependent)
bun run sync:webmentions || true   # non-fatal
# 5. Microformats parse spot-check
bun -e 'import { mf2 } from "microformats-parser"; const html = await Bun.file("dist/index.html").text(); console.log(JSON.stringify(mf2(html, { baseUrl: "https://utof.me/" }).rels, null, 2));'
```

If any failure: fix on branch (inline-fix gate per CLAUDE.md) or queue as `gh issue create -l nit` (capability-gate breach).

## Manual user-only steps before merge

1. **Webmention.io account.** Sign in with `https://utof.me/` (IndieAuth via GitHub `rel="me"`). Confirm endpoint at `https://webmention.io/utof.me/webmention`.
2. **`rel="me"` reciprocal.** Add `https://utof.me/` to your GitHub bio so indieweb verifiers can complete the round-trip.
3. **`WEBMENTION_IO_TOKEN`** repo secret (optional — bumps API rate limits in CI).

Add these to `progress.md#user-only-action-queue`.

## Merge commit message template

```
Phase 6: IndieWeb polish (RSS, sitemap, microformats, webmentions, theme)

12 tasks landed across N commits. Per CLAUDE.md merge convention this PR
uses a merge commit (NOT squash, NOT rebase) to preserve per-task TDD
history.

Tasks:
- T1-T2: RSS feeds (firehose, works, garden) via @astrojs/rss + linkedom stripping
- T3: @astrojs/sitemap + robots.txt
- T4-T5: MetaHead.astro (rel=webmention, rel=alternate, rel=me) + HCard footer
- T6: h-entry markup on _WorkLayout / _NoteLayout
- T7: scripts/build-webmentions.ts (offset pagination, Zod jf2)
- T8: Webmentions.astro render component
- T9: Theme inline-script + ThemeToggle.astro
- T10: [data-theme=dark] CSS rules + visual baselines
- T11: Tooling (size-limit feed.xml entry, LHCI, CI sync:webmentions step)
- T12: 5 ADRs (0031-0035)

ADRs: 0031 RSS three feeds · 0032 Sitemap+robots · 0033 Webmentions
build-time fetch · 0034 Microformats subset · 0035 Theme inline-script.

Site-js cap: unchanged (target 406.54 KB / 420 KB; verify post-merge).
```

## Open spec questions — resolved at plan-write

1. **`pubDate` source for works** — `entry.data.created` only. `updated` is NOT injected as a custom Atom-style `<updated>` (RSS 2.0 has no native equivalent; subscribers don't expect it). If a work has a meaningful `updated`, the user can bump `created` to force re-promotion.
2. **Webmention.io account** — manual user-only step (added to progress.md queue per Final pre-PR sweep above).
3. **`rel="me"` reciprocal** — manual user-only step (CI does NOT scrape GitHub).
4. **Sitemap `priority`** — omitted. Google ignores it; explicit values would just be noise.
5. **Theme storage key** — `utofme:theme`. `rg "utofme:" packages/site/src` returned zero matches at spec-write; namespace is unique.
6. **CI freshness gate for webmentions** — `continue-on-error: true` on the `sync:webmentions` step. Diff non-empty is allowed (new mentions are normal); CI failures only on Zod validation collapse or network exhaustion.

## Rollback plan per ADR

- **0031 RSS:** revert the three endpoints (`/feed*`); subscribers see 404 until restored. Low blast radius.
- **0032 Sitemap+robots:** remove `sitemap()` from integrations; `dist/sitemap-*.xml` no longer emitted. SEO regression but reversible.
- **0033 Webmentions:** delete `scripts/build-webmentions.ts` and `src/data/webmentions/`. Detail pages render no `<aside>` (component conditional). No build break.
- **0034 Microformats:** remove the `class="…"` additions from layouts. No build break.
- **0035 Theme:** remove the two inline scripts + `[data-theme="dark"]` block. CSS reverts to pure `prefers-color-scheme`. No build break.

## Per-task review bar (controller's reviewer brief template)

Each task gets two parallel Opus reviewers:
- **spec-reviewer:** maps diff against this plan + spec acceptance criteria. PASS or NEEDS_FIXUP.
- **code-quality reviewer:** correctness lenses (type safety, async lifecycle, a11y, performance, doc-trust). PASS or NEEDS_FIXUP.

BLOCKER decisions: inline-fix per CLAUDE.md gates if hard + capability gates pass; otherwise `gh issue create -l nit`.
