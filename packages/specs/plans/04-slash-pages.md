# Phase 4 — Slash Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is an isolated TDD red→green→commit cycle. **Workers must read [`CLAUDE.md`](../../../CLAUDE.md) and [`packages/specs/specs/04-slash-pages.md`](../specs/04-slash-pages.md) before any tool call.**

**Goal:** Ship `/now`, `/uses`, `/colophon`, `/tops`, `/stats` as fully-static routes (4 MDX-driven via a new `slash` collection; `/stats` driven by a build-time JSON snapshot via the `stats` collection); add a global site footer; extend the CommandPalette nav.

**Architecture:** Static-first. Content collections (`slash` MDX glob-loaded; `stats` JSON file-loaded with top-level `{ "snapshot": {...} }` shape per the Astro `file()` loader contract). Stateless per-build snapshot fetcher (no prior-snapshot reads/persistence; failed sources render `⚠ data temporarily unavailable`). One shared `_SlashLayout` reused across the 5 pages.

**Tech Stack:** Astro 6.x; Svelte 5 runes (CommandPalette extension only); Bun 1.2; TypeScript strict + astro/tsconfigs/strictest; Zod (`astro/zod`); Vitest + fast-check; Playwright + Axe-core; size-limit; LHCI.

**Branch:** `phase/04-slash-pages` (already cut from `cff8dc0`). Spec at `packages/specs/specs/04-slash-pages.md` v2 (`588fb82`).

---

## File map (ground truth before tasks lock in)

### New files (created)

```
packages/site/src/content/slash/now.mdx
packages/site/src/content/slash/uses.mdx
packages/site/src/content/slash/colophon.mdx
packages/site/src/content/slash/tops.mdx
packages/site/src/content/stats/snapshot.fixture.json
packages/site/src/lib/slash.ts
packages/site/src/lib/stats.ts
packages/site/src/layouts/_SlashLayout.astro
packages/site/src/components/SlashFooter.astro
packages/site/src/components/StatsSection.astro
packages/site/src/pages/now.astro
packages/site/src/pages/uses.astro
packages/site/src/pages/colophon.astro
packages/site/src/pages/tops.astro
packages/site/src/pages/stats.astro
packages/site/scripts/fetch-stats-snapshot.ts
packages/site/tests/unit/slash-helpers.test.ts
packages/site/tests/unit/stats-snapshot.test.ts
packages/site/tests/unit/snapshot-fetcher.test.ts
packages/site/tests/e2e/slash-pages.spec.ts
packages/site/tests/e2e/stats-page.spec.ts
packages/site/tests/e2e/footer.spec.ts
packages/specs/adrs/0022-slash-collection.md
packages/specs/adrs/0023-stats-build-time-snapshot.md
packages/specs/adrs/0024-stats-failure-ux.md
```

### Modified files

```
packages/site/src/content.config.ts          (add `slash` + `stats` collections)
packages/site/src/layouts/_BaseLayout.astro  (mount <SlashFooter />)
packages/site/src/components/CommandPalette.svelte   (extend nav array)
packages/site/tests/e2e/palette.spec.ts      (assert 5 slash routes)
packages/site/package.json                    (add prebuild:stats script)
packages/site/.gitignore                      (ignore snapshot.json)
packages/site/.size-limit.cjs                 (5 new entries)
packages/site/lighthouserc.cjs                (4 new URLs)
packages/site/knip.jsonc                      (register script entry)
packages/site/.dependency-cruiser.cjs         (allow scripts → src/lib)
```

### File responsibility (one-line each — locks decomposition)

| File | Responsibility |
|---|---|
| `content.config.ts` | Collection registration + Zod schemas. Single source of truth for entry shapes. |
| `lib/slash.ts` | Slash-collection helpers: `getSlashEntry(id)`, `slashSiblings(currentId)`. Pure, mutation-tested. |
| `lib/stats.ts` | Stats helpers: `loadSnapshot()`, `formatStatValue(source)`, exported `snapshotSchema` and `StatsSourceSchema`. Pure (no I/O beyond Astro's `getEntry` + static fixture import). |
| `scripts/fetch-stats-snapshot.ts` | Build-time fetcher. Reads env, calls 5 upstreams, writes one JSON file. Stateless across builds. Run only in production builds. |
| `_SlashLayout.astro` | Shared shell — renders `<header>` (h1, time, optional description), `<slot/>`, cross-link `<nav>`. Wraps `_BaseLayout`. |
| `SlashFooter.astro` | Site-wide footer mounted in `_BaseLayout`. Copyright + slash-page nav + repo link. |
| `StatsSection.astro` | One stats source's render block. Shows label, value (or unavailable text), `<time>`, optional ⚠. |
| `pages/{now,uses,colophon,tops}.astro` | Thin wrappers — each fetches its slash entry and renders inside `_SlashLayout`. |
| `pages/stats.astro` | Static page — calls `loadSnapshot`, renders 5 `<StatsSection />` calls. |
| `tests/unit/slash-helpers.test.ts` | Vitest for `lib/slash.ts`. |
| `tests/unit/stats-snapshot.test.ts` | Vitest + fast-check for `lib/stats.ts`. |
| `tests/unit/snapshot-fetcher.test.ts` | Vitest integration over `scripts/fetch-stats-snapshot.ts` with mocked fetch. |
| `tests/e2e/slash-pages.spec.ts` | Playwright + Axe for the 4 static slash routes. |
| `tests/e2e/stats-page.spec.ts` | Playwright + Axe for `/stats/`. |
| `tests/e2e/footer.spec.ts` | Playwright regression — footer on every existing route. |

---

## Task plan (TDD red→green→commit per task)

There are **11 tasks**. Each is an isolated commit. Worker subagents (Sonnet) get one task at a time per `superpowers:subagent-driven-development`. Spec-review subagent (Opus) approves task-spec before code; code-review subagent (Opus) approves diff after.

---

### Task 1: `slash` content collection — schema + 4 MDX fixtures + unit parse test

**Files:**
- Modify: `packages/site/src/content.config.ts`
- Create: `packages/site/src/content/slash/now.mdx`
- Create: `packages/site/src/content/slash/uses.mdx`
- Create: `packages/site/src/content/slash/colophon.mdx`
- Create: `packages/site/src/content/slash/tops.mdx`
- Create: `packages/site/tests/unit/slash-schema.test.ts`

- [ ] **Step 1: Read spec § Architecture (slash collection) + § Snapshot shape + § Open questions for OQ#3 + #4 content.**

- [ ] **Step 2: Write the failing schema parse test.**

```ts
// packages/site/tests/unit/slash-schema.test.ts
/**
 * Why: schema is authoritative; tests run before any fixture is added so
 * regressions surface as parse failures rather than silent shape drift.
 */
import { describe, it, expect } from "vitest";
import { z } from "astro/zod";
import { slashSchema } from "../../src/content.config";

describe("slashSchema", () => {
  it("accepts a fixture frontmatter shape", () => {
    const sample = {
      title: "Now",
      description: "Currently focused on …",
      updated: new Date("2026-04-27"),
      tags: ["work"],
    };
    expect(() => slashSchema.parse(sample)).not.toThrow();
  });

  it("rejects missing updated", () => {
    const sample = { title: "Now", tags: [] };
    expect(() => slashSchema.parse(sample)).toThrow();
  });

  it("defaults tags to []", () => {
    const parsed = slashSchema.parse({ title: "x", updated: new Date() });
    expect(parsed.tags).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/slash-schema.test.ts`
Expected: FAIL with `slashSchema is not exported from "../../src/content.config"`.

- [ ] **Step 4: Implement the slash collection in content.config.ts.**

Append to `packages/site/src/content.config.ts` (do **not** modify the existing `worksSchema` factory or `works` collection):

```ts
/**
 * Slash-page collection schema (frontmatter shape for /now, /uses,
 * /colophon, /tops). `updated` is required so each page surfaces a
 * trustworthy "last touched" date — the IndieWeb /now-page convention.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (Static slash pages)
 * @see packages/specs/adrs/0022-slash-collection.md
 */
export const slashSchema = z.object({
	title: z.string(),
	description: z.string().max(240).optional(),
	updated: z.coerce.date(),
	tags: z.array(z.string()).default([]),
});

const slash = defineCollection({
	loader: glob({ pattern: "*.mdx", base: "./src/content/slash" }),
	schema: slashSchema,
});
```

Update the `collections` export at the bottom of the file:

```ts
export const collections = { works, slash };
```

- [ ] **Step 5: Re-run unit test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/slash-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Author 4 MDX fixtures with valid frontmatter.**

```mdx
{/* packages/site/src/content/slash/now.mdx */}
---
title: Now
description: What I'm focused on right now.
updated: 2026-04-27
tags: [now]
---

Currently rebuilding this site from the ground up. Phase 4 is shipping the
slash-page directory — `/now`, `/uses`, `/colophon`, `/tops`, `/stats`.

Outside of the site, I'm reading more, writing less; the balance feels
right at the moment.
```

```mdx
{/* packages/site/src/content/slash/uses.mdx */}
---
title: Uses
description: The hardware and software I rely on day to day.
updated: 2026-04-27
tags: [uses]
---

## Editor

- VS Code with the Astro extension.
- Bun for everything Node-shaped.

## Hardware

- A modest laptop. Replace when it breaks.

## Hosting

- Cloudflare Workers (Assets) for this site. Static-first.
```

```mdx
{/* packages/site/src/content/slash/colophon.mdx */}
---
title: Colophon
description: How this site is built.
updated: 2026-04-27
tags: [colophon, meta]
---

## Stack

- **Astro 6** (static output).
- **Svelte 5** (runes) for interactive islands.
- **Bun ≥ 1.2** as runtime + package manager.
- **Cloudflare Workers (Assets)** for hosting; no SSR adapter — every route is a static file.

## Build pipeline

- **Sharp** for AVIF + WebP responsive images via `astro:assets`.
- **Expressive Code** for syntax highlighting (dual `github-light` / `github-dark` themes via `prefers-color-scheme`).
- **Sandpack (React 19 island)** for in-page code execution where MDX articles need it.

## Fonts

- Variable serif + sans + mono. Mono is preloaded; serif/sans use
  `display: optional` to avoid Slow-4G layout thrash.

## License

- Source MIT — see <a href="https://github.com/utof/utofme">github.com/utof/utofme</a>.
- Architectural decisions live under `packages/specs/adrs/`.
```

```mdx
{/* packages/site/src/content/slash/tops.mdx */}
---
title: Tops
description: Things I keep returning to.
updated: 2026-04-27
tags: [tops, lists]
---

## Books

1. Gödel, Escher, Bach — Hofstadter
2. The Glass Bead Game — Hesse
3. The Pragmatic Programmer — Hunt & Thomas

## Films

1. Stalker (1979)
2. Synecdoche, New York (2008)
3. Spirited Away (2001)

## Albums

1. Radiohead — In Rainbows
2. Aphex Twin — Selected Ambient Works Vol. II
3. Boards of Canada — Music Has the Right to Children

## Games

1. Outer Wilds
2. Tetris Effect
3. Disco Elysium
```

- [ ] **Step 7: Run `bun x astro check` to ensure collection registration is valid.**

`cd packages/site && bun x astro check`
Expected: zero errors. Astro will report 0 issues; collection sync prints a line for `slash` with 4 entries.

- [ ] **Step 8: Run full unit test suite to confirm nothing regressed.**

`cd packages/site && bun x vitest run`
Expected: previous Phase 3 tests still pass; +3 new tests.

- [ ] **Step 9: Commit.**

```bash
git add packages/site/src/content.config.ts \
        packages/site/src/content/slash/ \
        packages/site/tests/unit/slash-schema.test.ts
git commit -m "Phase 4 Task 1: slash collection schema + 4 MDX fixtures"
```

---

### Task 2: `lib/slash.ts` — `getSlashEntry` + `slashSiblings` helpers (+ property test)

**Files:**
- Create: `packages/site/src/lib/slash.ts`
- Create: `packages/site/tests/unit/slash-helpers.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// packages/site/tests/unit/slash-helpers.test.ts
/**
 * Why: cross-link footer in _SlashLayout is the third-most-clicked surface
 * after the page title and the body. The helper that drives it must
 * round-trip cleanly: for any of the 5 slash IDs, output is exactly the
 * other 4. fast-check guards the round-trip.
 */
import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { slashSiblings, SLASH_PAGES } from "../../src/lib/slash";

const ids = ["now", "uses", "colophon", "tops"] as const;

describe("slashSiblings", () => {
  it("returns 4 entries when given a known slash id", () => {
    const out = slashSiblings("now");
    expect(out).toHaveLength(3); // 4 static pages, exclude self
  });

  it("returns SLASH_PAGES unchanged when given an unknown id", () => {
    const out = slashSiblings("nope" as never);
    expect(out).toEqual(SLASH_PAGES);
  });

  test.prop([fc.constantFrom(...ids)])(
    "round-trip — output never contains the input id",
    (id) => {
      const siblings = slashSiblings(id);
      return siblings.every((s) => s.id !== id);
    },
  );

  test.prop([fc.constantFrom(...ids)])(
    "round-trip — output length is exactly SLASH_PAGES.length - 1",
    (id) => slashSiblings(id).length === SLASH_PAGES.length - 1,
  );
});
```

- [ ] **Step 2: Run test → fail (module not found).**

`cd packages/site && bun x vitest run tests/unit/slash-helpers.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/slash'`.

- [ ] **Step 3: Implement `lib/slash.ts`.**

```ts
// packages/site/src/lib/slash.ts
/**
 * Slash-page navigation helpers.
 *
 * Why: `/stats/` lives next to `/now /uses /colophon /tops` in the cross-link
 * footer but its content origin is the `stats` collection (JSON), not the
 * `slash` collection (MDX). To keep the footer's one source of truth, we
 * hard-list the 5 routes here rather than calling `getCollection("slash")`
 * (which would miss /stats) at every render.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (Static slash pages)
 */

/** Stable, type-checked list of slash-page identifiers in display order. */
export const SLASH_PAGES = [
	{ id: "now", title: "Now", href: "/now/" },
	{ id: "uses", title: "Uses", href: "/uses/" },
	{ id: "colophon", title: "Colophon", href: "/colophon/" },
	{ id: "tops", title: "Tops", href: "/tops/" },
	{ id: "stats", title: "Stats", href: "/stats/" },
] as const;

export type SlashPageId = (typeof SLASH_PAGES)[number]["id"];

/**
 * Returns the cross-link list to render on a given slash page — i.e. all
 * `SLASH_PAGES` *except* the current one. If the caller passes an unknown
 * id, returns `SLASH_PAGES` unchanged (there is nothing to filter).
 *
 * Why: defensive on bad input — caller is the layout, which trusts the
 * page's `entry.id`. A typo at the page level shouldn't blank the footer.
 */
export function slashSiblings(currentId: string) {
	return SLASH_PAGES.filter((p) => p.id !== currentId);
}
```

- [ ] **Step 4: Run tests → pass.**

`cd packages/site && bun x vitest run tests/unit/slash-helpers.test.ts`
Expected: PASS — 4 tests (2 unit + 2 property).

- [ ] **Step 5: `bun x astro check` + `bun x type-coverage --at-least 100 --strict`.**

Expected: zero errors; coverage stays at 100%.

- [ ] **Step 6: Commit.**

```bash
git add packages/site/src/lib/slash.ts packages/site/tests/unit/slash-helpers.test.ts
git commit -m "Phase 4 Task 2: lib/slash helpers + property tests"
```

---

### Task 3: `_SlashLayout.astro` + 4 page wrappers + Playwright e2e + Axe

**Files:**
- Create: `packages/site/src/layouts/_SlashLayout.astro`
- Create: `packages/site/src/pages/now.astro`
- Create: `packages/site/src/pages/uses.astro`
- Create: `packages/site/src/pages/colophon.astro`
- Create: `packages/site/src/pages/tops.astro`
- Create: `packages/site/tests/e2e/slash-pages.spec.ts`

- [ ] **Step 1: Write the failing e2e spec.**

```ts
// packages/site/tests/e2e/slash-pages.spec.ts
/**
 * Why: covers acceptance criteria 1, 2 of phase-4 spec — every slash page
 * returns 200, renders the correct h1 and an updated timestamp, includes
 * the cross-link footer, and is axe-clean.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const STATIC_SLASH = [
	{ path: "/now/", title: "Now" },
	{ path: "/uses/", title: "Uses" },
	{ path: "/colophon/", title: "Colophon" },
	{ path: "/tops/", title: "Tops" },
];

for (const { path, title } of STATIC_SLASH) {
	test(`${path} renders title, updated time, and cross-link nav`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("h1")).toHaveText(title);
		await expect(page.locator("article header time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}/);
		const crosslinks = page.locator("article > nav.cross-link a");
		await expect(crosslinks).toHaveCount(4); // 5 - self
	});

	test(`${path} is axe-clean`, async ({ page }) => {
		await page.goto(path);
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});
}
```

- [ ] **Step 2: Run the e2e → fail.**

`cd packages/site && bun x playwright test tests/e2e/slash-pages.spec.ts`
Expected: FAIL — `404` on every URL (pages not yet built).

- [ ] **Step 3: Implement `_SlashLayout.astro`.**

```astro
---
// packages/site/src/layouts/_SlashLayout.astro
/**
 * Shared shell for /now, /uses, /colophon, /tops. /stats wraps this layout
 * via its own data path but renders the same header + cross-link.
 *
 * Why: one layout = one source of truth for the slash-page header
 * convention (h1 + updated time + optional description + cross-link footer).
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (Static slash pages)
 * @see packages/specs/adrs/0022-slash-collection.md
 */
import BaseLayout from "./_BaseLayout.astro";
import { slashSiblings, type SlashPageId } from "../lib/slash";

interface Props {
	id: SlashPageId;
	title: string;
	description?: string | undefined;
	updated: Date;
}

const { id, title, description, updated } = Astro.props;
const siblings = slashSiblings(id);
const updatedISO = updated.toISOString();
const updatedHuman = updated.toISOString().slice(0, 10);
---

<BaseLayout title={title} description={description}>
	<main>
		<article>
			<header>
				<h1 transition:name={`slash-${id}`}>{title}</h1>
				<p class="updated">
					updated <time datetime={updatedISO}>{updatedHuman}</time>
				</p>
				{description && <p class="description">{description}</p>}
			</header>
			<slot />
			<nav class="cross-link" aria-label="Other slash pages">
				<h2>more about me</h2>
				<ul>
					{siblings.map((s) => (
						<li><a href={s.href}>{s.title}</a></li>
					))}
				</ul>
			</nav>
		</article>
	</main>
</BaseLayout>

<style>
	main { max-width: 70ch; margin: 0 auto; padding: var(--space-4) var(--space-3); }
	article header h1 { margin-bottom: var(--space-1); }
	article header .updated { color: var(--color-muted); font-size: var(--font-size-2); margin: 0; }
	article header .description { margin-top: var(--space-2); }
	nav.cross-link { margin-top: var(--space-5); padding-top: var(--space-3); border-top: 1px solid var(--color-border, #ddd); }
	nav.cross-link h2 { font-size: var(--font-size-3); margin-bottom: var(--space-2); }
	nav.cross-link ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); }
</style>
```

- [ ] **Step 4: Implement the 4 page wrappers (identical except for slash id).**

```astro
---
// packages/site/src/pages/now.astro
/**
 * /now — IndieWeb /now-page convention. Sources content from the `slash`
 * MDX collection entry id `now`.
 *
 * @see packages/specs/specs/04-slash-pages.md § Acceptance criteria 1
 */
import { getEntry, render } from "astro:content";
import SlashLayout from "../layouts/_SlashLayout.astro";

const entry = await getEntry("slash", "now");
if (!entry) throw new Error("Missing slash/now MDX entry — required at build time.");
const { Content } = await render(entry);
---

<SlashLayout
	id="now"
	title={entry.data.title}
	description={entry.data.description}
	updated={entry.data.updated}
>
	<Content />
</SlashLayout>
```

Repeat for `uses.astro`, `colophon.astro`, `tops.astro` — only the four `"now"` literals change to `"uses"` / `"colophon"` / `"tops"`. **Do not abstract these into a shared helper** — Astro's `getEntry` ID must be a static string for the build to optimise; YAGNI on a 4-page generator.

- [ ] **Step 5: Build the site to surface any issues.**

`cd packages/site && bun run build`
Expected: 0 errors; `dist/` contains `now/index.html`, `uses/index.html`, `colophon/index.html`, `tops/index.html`.

- [ ] **Step 6: Re-run e2e → pass.**

`cd packages/site && bun x playwright test tests/e2e/slash-pages.spec.ts`
Expected: PASS (8 tests = 4 routes × 2 specs).

- [ ] **Step 7: Commit.**

```bash
git add packages/site/src/layouts/_SlashLayout.astro \
        packages/site/src/pages/now.astro \
        packages/site/src/pages/uses.astro \
        packages/site/src/pages/colophon.astro \
        packages/site/src/pages/tops.astro \
        packages/site/tests/e2e/slash-pages.spec.ts
git commit -m "Phase 4 Task 3: _SlashLayout + 4 static pages + e2e"
```

---

### Task 4: `SlashFooter.astro` + wire into `_BaseLayout.astro` + footer.spec.ts + visual-regression re-baseline

**Files:**
- Create: `packages/site/src/components/SlashFooter.astro`
- Modify: `packages/site/src/layouts/_BaseLayout.astro` (mount footer)
- Create: `packages/site/tests/e2e/footer.spec.ts`

- [ ] **Step 1: Write failing footer e2e.**

```ts
// packages/site/tests/e2e/footer.spec.ts
/**
 * Why: footer is added to _BaseLayout in this task — so it must appear on
 * every existing route too. Regression guard against any future route
 * that opts out of _BaseLayout.
 */
import { test, expect } from "@playwright/test";

const ROUTES = ["/", "/works", "/search", "/works/code-2/"];

for (const route of ROUTES) {
	test(`footer renders on ${route}`, async ({ page }) => {
		await page.goto(route);
		const footer = page.locator('footer[aria-label="Site footer"]');
		await expect(footer).toBeVisible();
		await expect(footer.locator('nav[aria-label="Slash pages"] a')).toHaveCount(5);
		await expect(footer.locator('a[href="https://github.com/utof/utofme"]')).toBeVisible();
	});
}
```

- [ ] **Step 2: Run e2e → fail.**

`cd packages/site && bun x playwright test tests/e2e/footer.spec.ts`
Expected: FAIL — no `footer[aria-label="Site footer"]` on any route.

- [ ] **Step 3: Implement `SlashFooter.astro`.**

```astro
---
// packages/site/src/components/SlashFooter.astro
/**
 * Site-wide footer. Mounted in _BaseLayout so every route renders it once.
 *
 * Why: surfaces the slash-page directory site-wide (not only on slash
 * pages) — the place IndieWeb /now-page directories crawl to discover
 * the user's slash pages.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (Site-wide footer)
 */
import { SLASH_PAGES } from "../lib/slash";

const year = new Date().getFullYear();
---

<footer aria-label="Site footer">
	<p class="copy">© {year} utof</p>
	<nav aria-label="Slash pages">
		<ul>
			{SLASH_PAGES.map((p) => (
				<li><a href={p.href}>{p.title}</a></li>
			))}
		</ul>
	</nav>
	<a class="repo" href="https://github.com/utof/utofme">source</a>
</footer>

<style>
	footer {
		margin-top: var(--space-6);
		padding: var(--space-4) var(--space-3);
		border-top: 1px solid var(--color-border, #ddd);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		justify-content: space-between;
		align-items: center;
		font-size: var(--font-size-2);
		color: var(--color-muted);
	}
	nav ul {
		display: flex;
		gap: var(--space-3);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.copy { margin: 0; }
</style>
```

- [ ] **Step 4: Mount in `_BaseLayout.astro`.**

Find the section in `_BaseLayout.astro`:

```astro
<body>
	<slot />
	<!-- existing comment about CommandPalette -->
	<CommandPalette client:idle transition:persist />
</body>
```

Insert `<SlashFooter />` between `<slot />` and the `<CommandPalette ...>`:

```astro
<body>
	<slot />
	<SlashFooter />
	<!-- existing comment about CommandPalette -->
	<CommandPalette client:idle transition:persist />
</body>
```

Add the import at the top of the frontmatter:

```astro
import SlashFooter from "../components/SlashFooter.astro";
```

- [ ] **Step 5: Run footer e2e → pass.**

`cd packages/site && bun x playwright test tests/e2e/footer.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Visual-regression — prefer clip-region screenshots over blanket re-baselining.**

Per plan review nit #12: subagent execution can't reliably eyeball pixel diffs in `playwright-report/`. Use a clip-region strategy instead — visual snapshots target `<main>` only (excluding the footer), so the existing routes' baselines remain valid after the footer add.

Read each existing visual-regression spec (e.g. anything under `tests/e2e/` that calls `toHaveScreenshot()`) and update the screenshot call from full-page to main-region:

```ts
// before
await expect(page).toHaveScreenshot("home.png");

// after
await expect(page.locator("main")).toHaveScreenshot("home.png");
```

If the existing baselines were captured full-page, this will reduce captured area on the next run — re-baselining is required ONCE for the existing routes (clip change is a baseline change, but only for `<main>`):

```bash
cd packages/site && bun x playwright test --update-snapshots
```

Run a second time to confirm clean:

```bash
cd packages/site && bun x playwright test
```

Expected: all pass.

If any existing visual spec already uses a clip-region or `<main>`-locator screenshot, leave it alone — the footer is outside its bounds and the baseline stays valid.

For the **new** slash-page baselines added in Task 3 / Task 7, the snapshots are fresh and capture `<main>`-only.

- [ ] **Step 7: Run Axe across all routes (footer must be axe-clean).**

The existing `slash-pages.spec.ts` already runs Axe on slash pages. Extend the existing route axe coverage if needed — confirm zero violations on `/`, `/works`, `/search`, `/works/code-2/` after the footer.

`cd packages/site && bun x playwright test tests/e2e/`
Expected: PASS, no axe violations.

- [ ] **Step 8: Commit.**

```bash
git add packages/site/src/components/SlashFooter.astro \
        packages/site/src/layouts/_BaseLayout.astro \
        packages/site/tests/e2e/footer.spec.ts \
        packages/site/tests/e2e/*-snapshots/
git commit -m "Phase 4 Task 4: SlashFooter mounted in _BaseLayout + e2e + visual-rebaseline"
```

---

### Task 5: CommandPalette extension + palette.spec.ts assertion

**Files:**
- Modify: `packages/site/src/components/CommandPalette.svelte`
- Modify: `packages/site/tests/e2e/palette.spec.ts`

- [ ] **Step 1: Read existing palette nav array first (do NOT skip).**

```bash
cd packages/site && grep -n "kind: \"navigate\"" src/components/CommandPalette.svelte | head -10
```

Verified at plan-write: the nav array uses shape `{ id, label, kind: "navigate", target }` — for example `{ id: "goto-works", label: "Go to /works/", kind: "navigate", target: "/works/" }`. Confirm the same shape in your read; if it has changed, update the entries below to match.

Also read the existing `palette.spec.ts` to confirm the trigger key combo and how palette items are queried (selector, role, or text-based locator).

- [ ] **Step 2: Write failing assertion in palette.spec.ts.**

Append to the existing `tests/e2e/palette.spec.ts`. Use the same trigger + selector style as the existing tests in that file (read them first — your assertion shape must match what the existing tests already use):

```ts
// packages/site/tests/e2e/palette.spec.ts (append a new test)
test("palette nav lists 5 slash routes", async ({ page }) => {
	await page.goto("/");
	// Trigger key combo: copy from existing tests in this file. Common: "Meta+K" / "Control+K".
	// Item selector: copy from existing tests. Common: page.getByRole("option") or page.locator("[data-cmdk-item]").
	// Replace TRIGGER_KEY and ITEM_LOCATOR with whatever the existing tests use.
	await page.keyboard.press(/* TRIGGER_KEY from existing tests */);
	const items = page.locator(/* ITEM_LOCATOR from existing tests */);
	for (const slug of ["Go to /now/", "Go to /uses/", "Go to /colophon/", "Go to /tops/", "Go to /stats/"]) {
		await expect(items.filter({ hasText: slug })).toBeVisible();
	}
});
```

The label format `"Go to /<slug>/"` mirrors the existing entries (`"Go to /works/"`).

- [ ] **Step 3: Run → fail.**

`cd packages/site && bun x playwright test tests/e2e/palette.spec.ts -g "5 slash routes"`
Expected: FAIL — items don't exist yet.

- [ ] **Step 4: Extend palette nav array — match the verified `{ id, label, kind, target }` shape.**

Inside `CommandPalette.svelte`, find the existing nav-routes array. Append:

```ts
{ id: "goto-now",      label: "Go to /now/",      kind: "navigate", target: "/now/" },
{ id: "goto-uses",     label: "Go to /uses/",     kind: "navigate", target: "/uses/" },
{ id: "goto-colophon", label: "Go to /colophon/", kind: "navigate", target: "/colophon/" },
{ id: "goto-tops",     label: "Go to /tops/",     kind: "navigate", target: "/tops/" },
{ id: "goto-stats",    label: "Go to /stats/",    kind: "navigate", target: "/stats/" },
```

If the existing shape differs (e.g. uses `href` not `target`, or omits `kind`), match what's there. The shape verified at plan-write is `{ id, label, kind: "navigate", target }`.

- [ ] **Step 5: Re-run → pass.**

`cd packages/site && bun x playwright test tests/e2e/palette.spec.ts`
Expected: PASS — existing palette tests still green + new test green.

- [ ] **Step 6: Commit.**

```bash
git add packages/site/src/components/CommandPalette.svelte \
        packages/site/tests/e2e/palette.spec.ts
git commit -m "Phase 4 Task 5: extend CommandPalette nav with 5 slash routes"
```

---

### Task 6: `stats` content collection + `lib/stats.ts` + fixture + unit/property tests

**Files:**
- Modify: `packages/site/src/content.config.ts` (add `stats` collection)
- Create: `packages/site/src/content/stats/snapshot.fixture.json`
- Create: `packages/site/src/lib/stats.ts`
- Create: `packages/site/tests/unit/stats-snapshot.test.ts`

**Schema location decision (per plan review nit #3):** `snapshotSchema` and `StatsSourceSchema` are defined **inside `content.config.ts`** (where the collection is registered) and **re-exported from `lib/stats.ts`** for use by helpers/scripts. This inverts the dep direction (`lib/stats.ts` imports from `content.config.ts`, not the other way) — natural Astro pattern, no dep-cruise risk.

- [ ] **Step 1: Write failing tests for the snapshot schema + helpers.**

```ts
// packages/site/tests/unit/stats-snapshot.test.ts
/**
 * Why: snapshot Zod schema is the contract between the fetcher script
 * and the page renderer. Property tests guard against drift.
 */
import { describe, it, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import {
	snapshotSchema,
	StatsSourceSchema,
	loadSnapshot,
	formatStatValue,
} from "../../src/lib/stats";
import fixture from "../../src/content/stats/snapshot.fixture.json";

describe("snapshotSchema", () => {
	it("parses the committed fixture", () => {
		expect(() => snapshotSchema.parse(fixture.snapshot)).not.toThrow();
	});

	it("requires all 5 sources present", () => {
		const partial = { ...fixture.snapshot, sources: { github: fixture.snapshot.sources.github } };
		expect(() => snapshotSchema.parse(partial)).toThrow();
	});

	it("accepts error: true with value: null", () => {
		const errCase = { ...fixture.snapshot.sources.github, value: null, lastSuccessAt: null, error: true };
		expect(() => StatsSourceSchema.parse(errCase)).not.toThrow();
	});
});

describe("formatStatValue", () => {
	it("returns 'data temporarily unavailable' when error: true", () => {
		const errSrc = { id: "github", label: "GitHub", value: null, lastSuccessAt: null, error: true };
		expect(formatStatValue(errSrc)).toBe("data temporarily unavailable");
	});

	it("formats github commits as '<n> commits / 30 d'", () => {
		const src = { id: "github", label: "GitHub", value: { commits30d: 47 }, lastSuccessAt: "2026-04-27T10:00:00Z", error: false };
		expect(formatStatValue(src)).toMatch(/47 commits/);
	});
});

describe("loadSnapshot", () => {
	it("returns the parsed fixture when no live entry exists", async () => {
		const snap = await loadSnapshot();
		expect(snap.sources.github).toBeDefined();
		expect(snap.sources.strava).toBeDefined();
	});
});

test.prop([
	fc.record({
		id: fc.string({ minLength: 1 }),
		label: fc.string({ minLength: 1 }),
		value: fc.option(fc.anything(), { nil: null }),
		lastSuccessAt: fc.option(fc.constantFrom("2026-04-27T10:00:00Z"), { nil: null }),
		error: fc.boolean(),
	}),
])("StatsSourceSchema accepts well-shaped sources", (src) => {
	const result = StatsSourceSchema.safeParse(src);
	return result.success;
});
```

- [ ] **Step 2: Run → fail (module not found).**

`cd packages/site && bun x vitest run tests/unit/stats-snapshot.test.ts`
Expected: FAIL — module path missing.

- [ ] **Step 3: Author the fixture.**

```json
{
  "snapshot": {
    "generatedAt": "2026-04-27T15:00:00Z",
    "sources": {
      "github": {
        "id": "github",
        "label": "GitHub",
        "value": { "commits30d": 47, "topRepo": "utofme" },
        "lastSuccessAt": "2026-04-27T15:00:00Z",
        "error": false
      },
      "strava": {
        "id": "strava",
        "label": "Strava",
        "value": { "km30d": 38.4, "activities30d": 9 },
        "lastSuccessAt": "2026-04-27T15:00:00Z",
        "error": false
      },
      "lastfm": {
        "id": "lastfm",
        "label": "Last.fm",
        "value": { "topArtist": "Boards of Canada", "scrobbles7d": 312 },
        "lastSuccessAt": "2026-04-27T15:00:00Z",
        "error": false
      },
      "literal": {
        "id": "literal",
        "label": "Literal",
        "value": null,
        "lastSuccessAt": null,
        "error": true
      },
      "wakatime": {
        "id": "wakatime",
        "label": "Wakatime",
        "value": { "topLanguage": "TypeScript", "hours7d": 21.5 },
        "lastSuccessAt": "2026-04-27T15:00:00Z",
        "error": false
      }
    }
  }
}
```

The committed fixture deliberately has Literal as `error: true` so e2e tests for the ⚠ indicator have a stable target.

- [ ] **Step 4: Implement `lib/stats.ts`.**

```ts
// packages/site/src/lib/stats.ts
/**
 * Stats snapshot helpers — re-exports the schema (defined in
 * content.config.ts), implements loadSnapshot fallback, and the
 * per-source render formatter.
 *
 * Why: schema lives next to the collection registration (one source
 * of truth); helpers consume it from there.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 * @see packages/specs/adrs/0024-stats-failure-ux.md
 */
import { getEntry } from "astro:content";
import { snapshotSchema, StatsSourceSchema } from "../content.config";
import type { z } from "astro/zod";
import fixture from "../content/stats/snapshot.fixture.json";

export { snapshotSchema, StatsSourceSchema };
export type StatsSource = z.infer<typeof StatsSourceSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

/**
 * Returns the parsed snapshot — entry from the `stats` collection if a
 * live `snapshot.json` exists, otherwise the committed fixture.
 *
 * Why: production builds (with secrets) have a fresh snapshot.json on
 * disk; CI / dev does not. Both paths must surface the same shape.
 *
 * In dev/CI the absence of snapshot.json causes Astro's file() loader
 * to log a `File not found` line and skip the entry — the loader does
 * not throw (verified via the loader source 2026-04-27). This is
 * cosmetic; the build remains green.
 */
export async function loadSnapshot(): Promise<Snapshot> {
	const entry = await getEntry("stats", "snapshot");
	if (entry) return snapshotSchema.parse(entry.data);
	return snapshotSchema.parse(fixture.snapshot);
}

/**
 * Renders one source's value as a short human string.
 * `data temporarily unavailable` for errored sources — never stale data.
 */
export function formatStatValue(source: StatsSource): string {
	if (source.error || source.value === null) return "data temporarily unavailable";
	const v = source.value as Record<string, unknown>;
	switch (source.id) {
		case "github":
			return `${v["commits30d"]} commits / 30 d`;
		case "strava":
			return `${v["km30d"]} km / ${v["activities30d"]} activities (30 d)`;
		case "lastfm":
			return `${v["scrobbles7d"]} scrobbles / 7 d — top: ${v["topArtist"]}`;
		case "literal":
			return `currently reading: ${v["currentBook"]}`;
		case "wakatime":
			return `${v["hours7d"]} h coding / 7 d — top: ${v["topLanguage"]}`;
		default:
			return "—";
	}
}
```

- [ ] **Step 5: Register the `stats` collection + define schema inline in `content.config.ts`.**

Schema lives here (re-exported from `lib/stats.ts` for callers — see Step 4 above).

Update the existing `astro/loaders` import to add `file`:

```ts
import { glob, file } from "astro/loaders";
```

Append schema definitions and collection registration to the bottom of `content.config.ts`, just above the existing `collections` export:

```ts
/**
 * One stats source's record. `value` is `null` and `lastSuccessAt` is
 * `null` when `error: true` — see ADR 0024 (no last-good retention).
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 */
export const StatsSourceSchema = z.object({
	id: z.string(),
	label: z.string(),
	value: z.unknown().nullable(),
	lastSuccessAt: z.string().datetime().nullable(),
	error: z.boolean().default(false),
});

/**
 * Schema applied to the single `stats/snapshot` entry — the inner value
 * of the top-level wrapping object in `snapshot.json` / `snapshot.fixture.json`.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 */
export const snapshotSchema = z.object({
	generatedAt: z.string().datetime(),
	sources: z.object({
		github: StatsSourceSchema,
		strava: StatsSourceSchema,
		lastfm: StatsSourceSchema,
		literal: StatsSourceSchema,
		wakatime: StatsSourceSchema,
	}),
});

/**
 * Stats snapshot collection. Single-entry; the JSON file's top-level key
 * `snapshot` becomes the entry id consumed by getEntry("stats", "snapshot").
 *
 * In dev / CI, `snapshot.json` does not exist (gitignored). Astro's
 * file() loader logs `File not found:` and returns without throwing
 * (verified via withastro/astro source 2026-04-27 — packages/astro/src/content/loaders/file.ts).
 * The build stays green; `loadSnapshot` falls back to fixture.
 *
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 */
const stats = defineCollection({
	loader: file("./src/content/stats/snapshot.json"),
	schema: snapshotSchema,
});
```

Update the `collections` export:

```ts
export const collections = { works, slash, stats };
```

**No conditional registration, no commented-out fallback.** The plan-review's `file()`-missing-file investigation (2026-04-27) confirmed the loader does not throw; the dev/CI build will print one `File not found` log line per build — accepted as cosmetic noise.

- [ ] **Step 6: Run unit + property tests → pass.**

`cd packages/site && bun x vitest run tests/unit/stats-snapshot.test.ts`
Expected: PASS — at least 5 tests.

- [ ] **Step 7: `bun x astro check`.**

Expected: zero errors. Confirm `stats` collection is registered.

- [ ] **Step 8: Commit.**

```bash
git add packages/site/src/lib/stats.ts \
        packages/site/src/content/stats/snapshot.fixture.json \
        packages/site/src/content.config.ts \
        packages/site/tests/unit/stats-snapshot.test.ts
git commit -m "Phase 4 Task 6: stats collection schema + fixture + lib/stats helpers"
```

---

### Task 7: `StatsSection.astro` + `pages/stats.astro` + Playwright e2e

**Files:**
- Create: `packages/site/src/components/StatsSection.astro`
- Create: `packages/site/src/pages/stats.astro`
- Create: `packages/site/tests/e2e/stats-page.spec.ts`

- [ ] **Step 1: Write failing e2e.**

```ts
// packages/site/tests/e2e/stats-page.spec.ts
/**
 * Why: covers acceptance criteria 4, 7 of phase-4 spec — /stats renders
 * 5 source sections from the fixture; the source flagged error: true
 * (Literal in the fixture) shows the ⚠ indicator and unavailable copy.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("/stats renders all 5 sources from the fixture", async ({ page }) => {
	const r = await page.goto("/stats/");
	expect(r?.status()).toBe(200);
	await expect(page.locator("h1")).toHaveText("Stats");
	const sections = page.locator('[data-test="stats-section"]');
	await expect(sections).toHaveCount(5);
	await expect(page.getByText("GitHub")).toBeVisible();
	await expect(page.getByText("Strava")).toBeVisible();
	await expect(page.getByText("Last.fm")).toBeVisible();
	await expect(page.getByText("Literal")).toBeVisible();
	await expect(page.getByText("Wakatime")).toBeVisible();
});

test("/stats shows ⚠ indicator on errored sources (Literal in fixture)", async ({ page }) => {
	await page.goto("/stats/");
	const literal = page.locator('[data-test="stats-section"]').filter({ hasText: "Literal" });
	await expect(literal).toContainText("data temporarily unavailable");
	await expect(literal.locator('[aria-label="data temporarily unavailable"]')).toBeVisible();
});

test("/stats is axe-clean", async ({ page }) => {
	await page.goto("/stats/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
```

- [ ] **Step 2: Run → fail.**

`cd packages/site && bun x playwright test tests/e2e/stats-page.spec.ts`
Expected: FAIL — `/stats/` is 404.

- [ ] **Step 3: Implement `StatsSection.astro`.**

```astro
---
// packages/site/src/components/StatsSection.astro
/**
 * Renders one stats source. `formatStatValue` handles the unavailable
 * branch internally — section markup is identical regardless of error.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats data layer)
 */
import { formatStatValue, type StatsSource } from "../lib/stats";

interface Props {
	source: StatsSource;
}

const { source } = Astro.props;
const formatted = formatStatValue(source);
---

<section data-test="stats-section">
	<h3>{source.label}</h3>
	<p class="value">
		{source.error ? (
			<span aria-label="data temporarily unavailable">⚠ {formatted}</span>
		) : (
			<>{formatted}</>
		)}
	</p>
	{source.lastSuccessAt && (
		<p class="updated">
			as of <time datetime={source.lastSuccessAt}>{source.lastSuccessAt.slice(0, 10)}</time>
		</p>
	)}
</section>

<style>
	section { padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border, #ddd); }
	h3 { margin: 0 0 var(--space-1); }
	.value { margin: 0; }
	.updated { margin: var(--space-1) 0 0; color: var(--color-muted); font-size: var(--font-size-2); }
</style>
```

- [ ] **Step 4: Implement `pages/stats.astro`.**

```astro
---
// packages/site/src/pages/stats.astro
/**
 * /stats — renders the 5-source snapshot at build time.
 *
 * @see packages/specs/specs/04-slash-pages.md § Acceptance criteria 4
 */
import BaseLayout from "../layouts/_BaseLayout.astro";
import { loadSnapshot } from "../lib/stats";
import StatsSection from "../components/StatsSection.astro";
import { slashSiblings } from "../lib/slash";

const snapshot = await loadSnapshot();
const sources = Object.values(snapshot.sources);
const siblings = slashSiblings("stats");
---

<BaseLayout title="Stats" description="Public-data dashboard.">
	<main>
		<article>
			<header>
				<h1 transition:name="slash-stats">Stats</h1>
				<p class="updated">
					snapshot generated <time datetime={snapshot.generatedAt}>{snapshot.generatedAt.slice(0, 10)}</time>
				</p>
			</header>
			{sources.map((s) => <StatsSection source={s} />)}
			<nav class="cross-link" aria-label="Other slash pages">
				<h2>more about me</h2>
				<ul>
					{siblings.map((s) => (
						<li><a href={s.href}>{s.title}</a></li>
					))}
				</ul>
			</nav>
		</article>
	</main>
</BaseLayout>

<style>
	main { max-width: 70ch; margin: 0 auto; padding: var(--space-4) var(--space-3); }
	header h1 { margin-bottom: var(--space-1); }
	header .updated { color: var(--color-muted); font-size: var(--font-size-2); margin: 0 0 var(--space-3); }
	nav.cross-link { margin-top: var(--space-5); padding-top: var(--space-3); border-top: 1px solid var(--color-border, #ddd); }
</style>
```

(`/stats/` does **not** use `_SlashLayout` directly because its body is rendered from the snapshot, not an MDX `<Content />`. It re-implements the surrounding header + cross-link nav inline. Shared bits: title h1 with `transition:name`, time element, cross-link nav. Slight duplication accepted — abstracting to a shared layout that takes either MDX-content or stats-children adds optionality YAGNI-rejects.)

- [ ] **Step 5: Build + run e2e → pass.**

`cd packages/site && bun run build && bun x playwright test tests/e2e/stats-page.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add packages/site/src/components/StatsSection.astro \
        packages/site/src/pages/stats.astro \
        packages/site/tests/e2e/stats-page.spec.ts
git commit -m "Phase 4 Task 7: /stats page + StatsSection + e2e (fixture-driven)"
```

---

### Task 8: `scripts/fetch-stats-snapshot.ts` + integration tests + `prebuild:stats` + `.gitignore`

**Files:**
- Create: `packages/site/scripts/fetch-stats-snapshot.ts`
- Create: `packages/site/tests/unit/snapshot-fetcher.test.ts`
- Modify: `packages/site/package.json` (`prebuild:stats` script)
- Modify: `packages/site/.gitignore` (snapshot.json)

- [ ] **Step 1: Write failing integration tests with mocked fetch.**

```ts
// packages/site/tests/unit/snapshot-fetcher.test.ts
/**
 * Why: per-source failure handling is the trickiest behaviour in Phase 4.
 * Each branch of the merge rule needs an explicit test because the
 * fetcher is the single writer of snapshot.json.
 *
 * Mocks fetch by URL pattern (NOT by call-index) so the test survives
 * future changes in per-source fetch counts (e.g. Strava OAuth refresh
 * adding a second fetch). Per plan review nit #6 + blocker #2(b).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runFetcher } from "../../scripts/fetch-stats-snapshot";

const TMP = path.join(os.tmpdir(), `snapshot-fetcher-${process.pid}`);
const SNAPSHOT_PATH = path.join(TMP, "snapshot.json");

beforeEach(async () => {
	await fs.mkdir(TMP, { recursive: true });
});

afterEach(async () => {
	await fs.rm(TMP, { recursive: true, force: true });
	vi.unstubAllGlobals();
});

const SECRETS = {
	GITHUB_TOKEN: "x",
	STRAVA_REFRESH_TOKEN: "x",
	STRAVA_CLIENT_ID: "x",
	STRAVA_CLIENT_SECRET: "x",
	LASTFM_API_KEY: "x",
	LITERAL_TOKEN: "x",
	WAKATIME_API_KEY: "x",
};

/**
 * URL-pattern fetch mock. Per-source post-processed shapes returned
 * directly (each fetcher's downstream of the network call). When an
 * upstream URL matches `failingPatterns`, throw — emulating outage.
 */
function makeFetchMock(failingPatterns: RegExp[] = []) {
	return async (input: RequestInfo | URL): Promise<Response> => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
		for (const p of failingPatterns) if (p.test(url)) throw new Error(`mock fail: ${url}`);
		// Return a benign object — each fetcher's post-process step shapes it.
		return new Response(JSON.stringify({ stub: true, total_count: 5, items: [], recenttracks: { track: [{ name: "x", artist: { "#text": "x" } }] }, data: { me: { booksReading: [{ title: "x" }] } }, languages: [{ name: "TS" }], total_seconds: 60 * 60 * 5, distance: 1000 }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	};
}

describe("snapshot fetcher", () => {
	it("(a) all-succeed → all sources error: false, value populated", async () => {
		vi.stubGlobal("fetch", makeFetchMock([]));
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const written = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8"));
		const sources = Object.values(written.snapshot.sources) as Array<{ error: boolean; value: unknown }>;
		expect(sources.every((s) => s.error === false)).toBe(true);
		expect(sources.every((s) => s.value !== null)).toBe(true);
	});

	it("(b) Strava down → strava errored; the other 4 normal", async () => {
		vi.stubGlobal("fetch", makeFetchMock([/strava\.com/]));
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const sources = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")).snapshot.sources;
		expect(sources.strava.error).toBe(true);
		expect(sources.strava.value).toBeNull();
		for (const id of ["github", "lastfm", "literal", "wakatime"]) {
			expect(sources[id].error).toBe(false);
			expect(sources[id].value).not.toBeNull();
		}
	});

	it("(c) all upstreams down → all 5 errored; file still written", async () => {
		vi.stubGlobal("fetch", makeFetchMock([/.*/]));
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const sources = Object.values(JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")).snapshot.sources) as Array<{ error: boolean; value: unknown }>;
		expect(sources.every((s) => s.error === true)).toBe(true);
		expect(sources.every((s) => s.value === null)).toBe(true);
	});

	it("(d) one source returns malformed (non-object) → that source errored", async () => {
		// Override only github with a bad-shape response
		vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
			if (/api\.github\.com/.test(url)) {
				return new Response(JSON.stringify("not an object"), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			return makeFetchMock([])(input);
		});
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const sources = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")).snapshot.sources;
		expect(sources.github.error).toBe(true);
		expect(sources.strava.error).toBe(false);
	});

	it("(e) all secrets absent → no-op (file not created)", async () => {
		vi.stubGlobal("fetch", makeFetchMock([]));
		await runFetcher({ secrets: {}, outputPath: SNAPSHOT_PATH });
		await expect(fs.access(SNAPSHOT_PATH)).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run → fail.**

`cd packages/site && bun x vitest run tests/unit/snapshot-fetcher.test.ts`
Expected: FAIL — script not yet exported.

- [ ] **Step 3: Implement `scripts/fetch-stats-snapshot.ts`.**

```ts
// packages/site/scripts/fetch-stats-snapshot.ts
/**
 * Build-time stats fetcher. Stateless across builds: never reads a
 * previous snapshot.json. Per-source failure → value: null, error: true.
 *
 * Why: ADR 0024 — no last-good retention. CF Pages does not persist
 * working-tree files between deploys; honest UX trumps stale-as-fresh.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 * @see packages/specs/adrs/0024-stats-failure-ux.md
 */
import { promises as fs } from "node:fs";
import path from "node:path";

interface Secrets {
	GITHUB_TOKEN?: string;
	STRAVA_REFRESH_TOKEN?: string;
	STRAVA_CLIENT_ID?: string;
	STRAVA_CLIENT_SECRET?: string;
	LASTFM_API_KEY?: string;
	LITERAL_TOKEN?: string;
	WAKATIME_API_KEY?: string;
}

interface RunOpts {
	secrets: Secrets;
	outputPath: string;
}

interface SourceResult {
	id: string;
	label: string;
	value: unknown | null;
	lastSuccessAt: string | null;
	error: boolean;
}

const REQUIRED_SECRETS: Array<keyof Secrets> = [
	"GITHUB_TOKEN",
	"STRAVA_REFRESH_TOKEN",
	"STRAVA_CLIENT_ID",
	"STRAVA_CLIENT_SECRET",
	"LASTFM_API_KEY",
	"LITERAL_TOKEN",
	"WAKATIME_API_KEY",
];

/**
 * Public entry point used by the CLI invoker AND the integration test.
 * Returns void; writes JSON to outputPath if any secret was present.
 */
export async function runFetcher({ secrets, outputPath }: RunOpts): Promise<void> {
	const haveAnySecret = REQUIRED_SECRETS.some((k) => secrets[k] !== undefined && secrets[k] !== "");
	if (!haveAnySecret) {
		console.log("[fetch-stats-snapshot] No secrets present — skipping (Astro will use fixture).");
		return;
	}

	const now = new Date().toISOString();
	const settled = await Promise.allSettled([
		fetchGithub(secrets),
		fetchStrava(secrets),
		fetchLastfm(secrets),
		fetchLiteral(secrets),
		fetchWakatime(secrets),
	]);

	const ids = ["github", "strava", "lastfm", "literal", "wakatime"] as const;
	type SourceId = (typeof ids)[number];
	const labels: Record<SourceId, string> = {
		github: "GitHub",
		strava: "Strava",
		lastfm: "Last.fm",
		literal: "Literal",
		wakatime: "Wakatime",
	};

	const sources: Record<SourceId, SourceResult> = {} as Record<SourceId, SourceResult>;
	settled.forEach((r, i) => {
		const id = ids[i]!;
		if (r.status === "fulfilled" && r.value !== null) {
			sources[id] = { id, label: labels[id], value: r.value, lastSuccessAt: now, error: false };
		} else {
			sources[id] = { id, label: labels[id], value: null, lastSuccessAt: null, error: true };
		}
	});

	const wrapped = { snapshot: { generatedAt: now, sources } };

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(wrapped, null, 2), "utf8");
	console.log(`[fetch-stats-snapshot] Wrote ${outputPath}`);
}

/* ----- per-source fetchers ----- */

/**
 * Each fetcher hits its upstream then post-processes into the SHAPE
 * `formatStatValue` expects (e.g. `{ commits30d, topRepo }` for github).
 * The integration test mocks the upstream URL, lets the post-process
 * run, and asserts on the post-processed shape — so production drift
 * (e.g. GitHub Search API renaming `total_count`) surfaces as a
 * post-process failure rather than an undefined-render bug.
 *
 * Per-source URL/auth shapes are best-effort and may need adjustment
 * during implementation (WebFetch verify each at red→green). The shape
 * returned by the fetcher is the contract — that is locked.
 */

async function fetchGithub(s: Secrets): Promise<{ commits30d: number; topRepo: string }> {
	if (!s.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN missing");
	const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
	const r = await fetch(
		`https://api.github.com/search/commits?q=author:utof+committer-date:>${since}`,
		{
			headers: {
				Authorization: `Bearer ${s.GITHUB_TOKEN}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);
	if (!r.ok) throw new Error(`github ${r.status}`);
	const data = (await r.json()) as { total_count?: number };
	if (typeof data !== "object" || data === null || typeof data.total_count !== "number") {
		throw new Error("github: bad shape");
	}
	return { commits30d: data.total_count, topRepo: "utofme" };
}

async function fetchStrava(s: Secrets): Promise<{ km30d: number; activities30d: number }> {
	if (!s.STRAVA_REFRESH_TOKEN || !s.STRAVA_CLIENT_ID || !s.STRAVA_CLIENT_SECRET) throw new Error("strava secrets missing");
	// Implementer: refresh-token → access-token via POST https://www.strava.com/oauth/token
	// then GET /athlete/activities?after=<unix-30d-ago>. WebFetch verify shape at red→green.
	// For now, the structure below documents the contract; the post-process is what tests assert.
	const r = await fetch("https://www.strava.com/api/v3/athlete/activities");
	if (!r.ok) throw new Error(`strava ${r.status}`);
	const data = (await r.json()) as unknown;
	if (typeof data !== "object" || data === null) throw new Error("strava: bad shape");
	// stub: production fetcher sums distance, counts entries
	return { km30d: 1, activities30d: 1 };
}

async function fetchLastfm(s: Secrets): Promise<{ topArtist: string; scrobbles7d: number }> {
	if (!s.LASTFM_API_KEY) throw new Error("LASTFM_API_KEY missing");
	const r = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=utof&api_key=${s.LASTFM_API_KEY}&format=json&limit=200`);
	if (!r.ok) throw new Error(`lastfm ${r.status}`);
	const data = (await r.json()) as { recenttracks?: { track?: Array<{ artist?: { "#text"?: string } }> } };
	if (typeof data !== "object" || data === null) throw new Error("lastfm: bad shape");
	const tracks = data.recenttracks?.track ?? [];
	const top = tracks[0]?.artist?.["#text"] ?? "—";
	return { topArtist: top, scrobbles7d: tracks.length };
}

async function fetchLiteral(s: Secrets): Promise<{ currentBook: string }> {
	if (!s.LITERAL_TOKEN) throw new Error("LITERAL_TOKEN missing");
	const r = await fetch("https://literal.club/graphql", {
		method: "POST",
		headers: { Authorization: `Bearer ${s.LITERAL_TOKEN}`, "Content-Type": "application/json" },
		body: JSON.stringify({ query: "{ me { booksReading { title } } }" }),
	});
	if (!r.ok) throw new Error(`literal ${r.status}`);
	const data = (await r.json()) as { data?: { me?: { booksReading?: Array<{ title?: string }> } } };
	if (typeof data !== "object" || data === null) throw new Error("literal: bad shape");
	const book = data.data?.me?.booksReading?.[0]?.title ?? "—";
	return { currentBook: book };
}

async function fetchWakatime(s: Secrets): Promise<{ topLanguage: string; hours7d: number }> {
	if (!s.WAKATIME_API_KEY) throw new Error("WAKATIME_API_KEY missing");
	const r = await fetch(`https://wakatime.com/api/v1/users/current/stats/last_7_days?api_key=${s.WAKATIME_API_KEY}`);
	if (!r.ok) throw new Error(`wakatime ${r.status}`);
	const data = (await r.json()) as { languages?: Array<{ name?: string }>; total_seconds?: number };
	if (typeof data !== "object" || data === null) throw new Error("wakatime: bad shape");
	return {
		topLanguage: data.languages?.[0]?.name ?? "—",
		hours7d: Math.round(((data.total_seconds ?? 0) / 3600) * 10) / 10,
	};
}

/* ----- CLI invocation ----- */

if (import.meta.main) {
	const out = path.join(process.cwd(), "src/content/stats/snapshot.json");
	await runFetcher({
		secrets: {
			GITHUB_TOKEN: process.env["GITHUB_TOKEN"],
			STRAVA_REFRESH_TOKEN: process.env["STRAVA_REFRESH_TOKEN"],
			STRAVA_CLIENT_ID: process.env["STRAVA_CLIENT_ID"],
			STRAVA_CLIENT_SECRET: process.env["STRAVA_CLIENT_SECRET"],
			LASTFM_API_KEY: process.env["LASTFM_API_KEY"],
			LITERAL_TOKEN: process.env["LITERAL_TOKEN"],
			WAKATIME_API_KEY: process.env["WAKATIME_API_KEY"],
		},
		outputPath: out,
	});
}
```

**Implementation note on per-source endpoints:** the per-source URL/auth shapes above are best-effort plan-time guesses. The implementer is expected to verify each endpoint at TDD time via WebFetch (Strava OAuth refresh flow especially). Per-source fetcher bodies are flagged with `TODO at implementation` — fix them inline at red→green. The acceptance test (e) (all-secrets-absent no-op) does not require live endpoints to be correct; the others use mocked fetch. **The implementer must NOT silently leave a broken endpoint** — flag any that cannot be verified to the code-reviewer.

- [ ] **Step 4: Add `prebuild:stats` script + Bun JSON-import shim if needed.**

In `packages/site/package.json`, add to `scripts`:

```json
"prebuild:stats": "bun run scripts/fetch-stats-snapshot.ts"
```

Do **not** chain it into the existing `build` script for CI. The Cloudflare Pages build command (configured outside the repo) becomes `bun run prebuild:stats && bun run build`. Local dev never calls `prebuild:stats`. CI builds explicitly call `bun run build` only — fixture path covers it.

- [ ] **Step 5: Add `snapshot.json` to `.gitignore`.**

Append to `packages/site/.gitignore`:

```
# Production-only build artifact — fetched at prebuild time. Fixture is committed.
src/content/stats/snapshot.json
```

- [ ] **Step 6: Run integration tests → pass.**

`cd packages/site && bun x vitest run tests/unit/snapshot-fetcher.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit.**

```bash
git add packages/site/scripts/fetch-stats-snapshot.ts \
        packages/site/tests/unit/snapshot-fetcher.test.ts \
        packages/site/package.json \
        packages/site/.gitignore
git commit -m "Phase 4 Task 8: snapshot fetcher script + integration tests + prebuild wire"
```

---

### Task 9: Tooling — `.size-limit.cjs` + `lighthouserc.cjs` + `knip.jsonc` + `.dependency-cruiser.cjs`

**Files:**
- Modify: `packages/site/.size-limit.cjs`
- Modify: `packages/site/lighthouserc.cjs`
- Modify: `packages/site/knip.jsonc`
- Modify: `packages/site/.dependency-cruiser.cjs`

- [ ] **Step 1: Read each existing file to understand its current shape.**

```bash
cd packages/site && cat .size-limit.cjs lighthouserc.cjs knip.jsonc .dependency-cruiser.cjs | head -200
```

- [ ] **Step 2: Append 5 new size-limit entries — match existing-entry shape verified at plan-write.**

Existing entries use `path: ["dist/<route>/index.html", "dist/_astro/*.css"]` (array form so CSS is included in the gzip measurement) and carry `disablePlugins: ["@size-limit/time"]` (the time plugin is not installed). Per plan review nits #8 + #9, copy that exact shape:

```js
{
  name: "now page css+html",
  path: ["dist/now/index.html", "dist/_astro/*.css"],
  limit: "60 KB",
  gzip: true,
  disablePlugins: ["@size-limit/time"],
},
{
  name: "uses page css+html",
  path: ["dist/uses/index.html", "dist/_astro/*.css"],
  limit: "60 KB",
  gzip: true,
  disablePlugins: ["@size-limit/time"],
},
{
  name: "colophon page css+html",
  path: ["dist/colophon/index.html", "dist/_astro/*.css"],
  limit: "60 KB",
  gzip: true,
  disablePlugins: ["@size-limit/time"],
},
{
  name: "tops page css+html",
  path: ["dist/tops/index.html", "dist/_astro/*.css"],
  limit: "60 KB",
  gzip: true,
  disablePlugins: ["@size-limit/time"],
},
{
  name: "stats page css+html",
  path: ["dist/stats/index.html", "dist/_astro/*.css"],
  limit: "60 KB",
  gzip: true,
  disablePlugins: ["@size-limit/time"],
},
```

- [ ] **Step 3: Add 4 LHCI URLs.**

In `lighthouserc.cjs`, add to the `url` array:

```js
"http://localhost:4321/now/",
"http://localhost:4321/uses/",
"http://localhost:4321/colophon/",
"http://localhost:4321/stats/",
```

(`/tops/` is omitted — see spec line 17.)

- [ ] **Step 4: Update `knip.jsonc`.**

Add `scripts/fetch-stats-snapshot.ts` to entry points:

```jsonc
"entry": [
  // ... existing entries ...
  "scripts/fetch-stats-snapshot.ts"
],
```

If knip flags any false-positive unused dep originating from the script, append to `ignoreDependencies`. (Plan does not predict which — implementer fixes red→green.)

- [ ] **Step 5: Update `.dependency-cruiser.cjs` if dep-cruise complains about `content.config.ts → lib/stats`.**

If `bun x depcruise --config .dependency-cruiser.cjs packages/site/src` fails with `content.config.ts importing src/lib/stats.ts violates layered-import rule`, add an exception. Otherwise leave alone.

- [ ] **Step 6: Run all tooling.**

```bash
cd packages/site && bun run build && bun x size-limit && bun x knip && bun x depcruise --config .dependency-cruiser.cjs packages/site/src
```

Expected: all pass; 5 new size-limit entries report measured KB ≤ 60 each.

LHCI is not run inline (CI handles it). Spot-check that the URL list is well-formed.

- [ ] **Step 7: Commit.**

```bash
git add packages/site/.size-limit.cjs \
        packages/site/lighthouserc.cjs \
        packages/site/knip.jsonc \
        packages/site/.dependency-cruiser.cjs
git commit -m "Phase 4 Task 9: tooling — size-limit / LHCI / knip / dep-cruise"
```

---

### Task 10: ADRs 0022, 0023, 0024

**Files:**
- Create: `packages/specs/adrs/0022-slash-collection.md`
- Create: `packages/specs/adrs/0023-stats-build-time-snapshot.md`
- Create: `packages/specs/adrs/0024-stats-failure-ux.md`

- [ ] **Step 1: Read existing ADR for skeleton (e.g. 0021).**

```bash
cd packages/specs/adrs && cat 0021-detail-page-as-default-card-link.md
```

Note the section structure: Context · Decision · Alternatives · Consequences · Sources.

- [ ] **Step 2: Author 0022.**

```markdown
# ADR 0022 — Slash-page MDX collection + shared `_SlashLayout`

## Context

Phase 4 ships /now, /uses, /colophon, /tops as content-driven pages. Two
options:

(a) Inline content in each `.astro` page.
(b) Per-page `.md` / `.mdx` content with no schema.
(c) MDX collection at `src/content/slash/` with Zod schema and shared layout.

Each page needs an `updated` timestamp by IndieWeb convention. Phase 1
already has the `works` collection precedent (ADR 0007).

## Decision

Adopt option (c) — `slash` MDX collection with required `updated: Date`,
optional `description`, optional `tags`. Pages render through a shared
`_SlashLayout` that surfaces title + updated + cross-link to the other 4
slash pages.

## Alternatives

- (a) — drift, no `updated` enforcement, no shared chrome.
- (b) — loses MDX (no embedded components if `/uses` later wants a list
  of links rendered from a Svelte island).

## Consequences

- One MDX collection; one Zod schema; one layout — single source of truth.
- `_SlashLayout` is shared between /now, /uses, /colophon, /tops. /stats
  uses a parallel layout because its body is rendered from the snapshot,
  not MDX `<Content />`.

## Sources

- [phase-4 spec § Architecture](../specs/04-slash-pages.md)
- [ADR 0007 — works collection precedent](./0007-single-collection-discriminated-union.md)
- IndieWeb /now-page directory: <https://nownownow.com/about>
```

- [ ] **Step 3: Author 0023.**

```markdown
# ADR 0023 — `/stats`: build-time snapshot, not runtime SSR

## Context

The general-plan has two architectural options for `/stats`:
1. Runtime SSR (Astro Cloudflare adapter, `prerender = false`, KV-cached).
2. Build-time snapshot (scheduled deploy hook, fully static).

CLAUDE.md says "Static-first; SSR only for `/stats`". Phase 4 spec
chooses path 2.

## Decision

Ship `/stats` as a static page driven by a build-time JSON snapshot
(`src/content/stats/snapshot.json`, fetched by
`scripts/fetch-stats-snapshot.ts` in production builds, falls back to
fixture in dev/CI). No Cloudflare adapter installed in Phase 4.

## Alternatives

- Path 1 (runtime SSR) — adds CF adapter dep + secrets-blocker + runtime
  CPU; freshness floor drops to whatever cache TTL is set (15 min in
  general-plan). Punted to a future phase if sub-hour freshness is
  required.

## Consequences

- Zero runtime CPU; survives upstream outages.
- Freshness floor = build cadence (manual + scheduled deploy hook ≥ 6 h).
- /stats acceptance criteria still met: static HTML, all 5 sources
  visible, ⚠ on failure (per ADR 0024).

## Sources

- [phase-4 spec § Architecture (/stats)](../specs/04-slash-pages.md)
- [General plan § Phase 4.2 recommendation](../../../2026-04-25-general-plan)
- [CLAUDE.md § Stack — "Static-first"](../../../CLAUDE.md)
```

- [ ] **Step 4: Author 0024.**

```markdown
# ADR 0024 — `/stats` failure UX: stateless per-build, no stale-data retention

## Context

When an upstream API (GitHub, Strava, Last.fm, Literal, Wakatime) is
down at build time, the snapshot fetcher gets one of:

- network rejection
- non-2xx status
- malformed JSON (non-object)

Two possible responses:

1. **Retain last good** — read prior `snapshot.json` from disk, keep its
   per-source value, flag `error: true`.
2. **Stateless per-build** — no prior read, no persistence; failed
   sources render `value: null` + `error: true` and the page shows
   "⚠ data temporarily unavailable" for that section.

## Decision

Adopt option 2.

## Alternatives

- Option 1 needs cross-build persistence. Cloudflare Pages does not
  persist working-tree files between deploys; a viable persistence layer
  is Cloudflare KV / R2 / a GitHub Releases artifact. Adding any of
  those is a deploy-infra change beyond Phase 4 scope.
- Even with persistence, presenting last-known-good as if it were
  current is a credibility hazard (visitors don't see the timestamp the
  same moment they read the value).

## Consequences

- Zero persistence dependency; build script is fully stateless.
- A short upstream outage between scheduled deploys shows ⚠ for that
  source instead of last-known value. Trade-off accepted.
- `StatsSource.value` is nullable; `StatsSource.lastSuccessAt` is
  nullable. Type system encodes the failure case.

## Sources

- [phase-4 spec § Failure UX](../specs/04-slash-pages.md)
- [Cloudflare Pages — Build configuration: working directory not persisted](https://developers.cloudflare.com/pages/configuration/build-configuration/)
```

- [ ] **Step 5: Verify ADR doc-check passes (no missing TSDoc — these are markdown so the check skips).**

`cd packages/site && bun run check:docs` (if applicable; ADRs don't trigger TSDoc).

- [ ] **Step 6: Commit.**

```bash
git add packages/specs/adrs/0022-slash-collection.md \
        packages/specs/adrs/0023-stats-build-time-snapshot.md \
        packages/specs/adrs/0024-stats-failure-ux.md
git commit -m "Phase 4 Task 10: ADRs 0022 / 0023 / 0024"
```

---

### Task 11: Pre-PR sweep + PR open

**Files:** none new; verifies all checks; updates `progress.md`; opens PR.

- [ ] **Step 1: Run the full lefthook pre-commit chain.**

```bash
cd packages/site && \
  bun x biome check --write . && \
  bun x prettier --write '**/*.{astro,svelte}' && \
  bun x astro check && \
  bun x type-coverage --at-least 100 --strict && \
  bun x knip && \
  bun x depcruise --config .dependency-cruiser.cjs packages/site/src && \
  bun run check:docs
```

Expected: all pass.

- [ ] **Step 2: Run the full vitest + Playwright suites.**

```bash
cd packages/site && bun x vitest run && bun x playwright test
```

Expected: all pass.

- [ ] **Step 3: Run size-limit.**

```bash
cd packages/site && bun run build && bun x size-limit
```

Expected: all entries pass.

- [ ] **Step 4: Update `memory/progress.md`.**

Mark Phase 4 ready-to-merge:

```diff
- [ ] Phase 4 Slash pages …
+ [x] Phase 4 Slash pages — PR open at <number>; ADRs 0022/0023/0024.
```

(Implementer fills in the PR number after step 5.)

- [ ] **Step 5: Open PR.**

```bash
git push -u origin phase/04-slash-pages
gh pr create --title "Phase 4: slash pages" --body "$(cat <<'EOF'
## Summary
- /now, /uses, /colophon, /tops static MDX pages via new `slash` collection
- /stats static page driven by build-time JSON snapshot (fixture in CI)
- Site-wide footer mounted in `_BaseLayout`
- CommandPalette nav extended with the 5 slash routes
- ADRs 0022 (slash collection), 0023 (build-time snapshot vs SSR), 0024 (failure UX)

## User-only follow-up after merge
- Add 5 upstream-API secrets to Cloudflare Pages env (GITHUB_TOKEN, STRAVA_REFRESH_TOKEN/CLIENT_ID/CLIENT_SECRET, LASTFM_API_KEY, LITERAL_TOKEN, WAKATIME_API_KEY).
- Optionally wire a 6-hour GH Actions cron that hits the Cloudflare Pages deploy-hook URL.

## Test plan
- [x] vitest unit + property tests
- [x] vitest integration (5 snapshot-fetcher cases)
- [x] Playwright e2e (5 slash routes, footer regression, palette extension)
- [x] Axe-core zero violations on all routes
- [x] size-limit 5 new entries (≤ 60 KB each), site-js cap (420 KB) holds
- [x] LHCI ≥ 0.85 mobile on /, /works, /search, /works/code-2/, /now/, /uses/, /colophon/, /stats/
EOF
)"
```

- [ ] **Step 6: Wait for CI; on green, merge with merge-commit (no squash, no rebase) per CLAUDE.md branching rule.**

```bash
gh pr merge --merge   # the user runs this after CI green
git fetch origin main && git tag phase-4 origin/main && git push origin phase-4
```

- [ ] **Step 7: Update `progress.md` with merge SHA + tag.**

```bash
# In memory/progress.md (the MEMORY-only tracker, not in repo):
# - [x] Phase 4 — merged at <SHA>, tag phase-4. ADRs 0022–0024 landed.
```

---

## Self-review

**Spec coverage:** every numbered acceptance criterion in
`packages/specs/specs/04-slash-pages.md § Acceptance criteria` maps to a task:
- AC 1, 2 → Task 3 (slash pages spec) + Task 7 (stats spec)
- AC 3 → Task 4 (footer.spec)
- AC 4, 7 → Task 7 (stats-page spec)
- AC 5 → Task 11 (full sweep)
- AC 6 → Task 6 (loadSnapshot fallback test)
- AC 8 → Task 5 (palette extension)
- AC 9 → Task 10 (ADRs)
- AC 10 → Task 11 (PR / merge / tag)

**Placeholder scan:** the per-source fetchers in Task 8 (Step 3) carry
`TODO at implementation` markers for endpoint/auth specifics. Per spec
§ OQ#1, exact endpoints are pinned at plan-time/implementation-time via
WebFetch — the plan says the implementer must verify and remove the
TODO during their red→green cycle. **Acceptable:** the failure
contract (per-source rejection → error: true) is testable without the
endpoints being correct; the integration tests use mocked fetch.

**Type consistency:** `slashSchema`, `snapshotSchema`, `StatsSourceSchema`,
`SLASH_PAGES`, `slashSiblings`, `loadSnapshot`, `formatStatValue`,
`runFetcher` are introduced once each and referenced consistently.

**Risks the implementer should flag mid-task:**
1. Astro 6's `file()` loader behaviour with a missing file (Task 6
   Step 5). If it errors instead of returning an empty collection,
   conditionally-register `stats` only when `snapshot.json` exists —
   alternative described in the task.
2. dep-cruiser rule violation in Task 6 Step 5 if `content.config.ts`
   importing from `src/lib/` is layer-prohibited. Task 9 Step 5 covers
   the fix.
3. Per-source upstream endpoints (Task 8) — the fetcher bodies are
   plan-time best-effort; verify-or-update at implementation time.
