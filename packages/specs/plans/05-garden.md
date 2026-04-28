# Phase 5 — Digital Garden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is an isolated TDD red→green→commit cycle. **Workers must read [`CLAUDE.md`](../../../CLAUDE.md) and [`packages/specs/specs/05-garden.md`](../specs/05-garden.md) before any tool call.**

**Goal:** Ship a curated `/garden/` from the user's Obsidian vault — index page + per-note detail pages with wikilinks/math/callouts/embeds resolved, build-time backlinks footer, hover link previews, and a `force-graph` canvas view at `/garden/graph/`.

**Architecture:** Static-first. Vault → `src/content/notes/` via local `bun run sync:vault` (no CI run). Content pipeline: `embedRemark` → `@portaljs/remark-wiki-link` (with build-time `permalinks` array from synchronous `fast-glob`) → `remarkMath` → `remarkCallout` → `rehypeKatex` → custom rehype `<a>`→`<span>` rewrite. Three deterministic data artefacts (`backlinks.json`, `note-previews.json`, `graph.json`) built by `scripts/build-garden-data.ts` and committed; CI freshness check via `git diff --exit-code`. Two Svelte 5 islands: `<LinkPreview client:idle>` (delegated `mouseover`/`focusin` on body) and `<GraphView client:visible>` (canvas + d3-force-3d, `manualChunks` for chunk isolation).

**Tech Stack:** Astro 6.x; Svelte 5 runes; Bun 1.2; TypeScript strict + astro/tsconfigs/strictest; Zod (`astro/zod`); Vitest + fast-check; Playwright + Axe-core; size-limit; LHCI. New deps: `@portaljs/remark-wiki-link@1.2.0`, `remark-math@6`, `rehype-katex@7`, `katex`, `remark-callout@1.1.1`, `force-graph@1.51.4`, `@floating-ui/dom@1`, `gray-matter@^4`, `unist-util-visit` (for the rehype rewrite plugin — already transitive via remark/rehype but listed for clarity), `fast-glob` (already transitive via Astro 6).

**Branch:** `phase/05-garden` (already cut from `11c48e9`). Spec at `packages/specs/specs/05-garden.md` v2 (`918dbf0`).

**Implementer model selection (per CLAUDE.md "subagent-driven-development" guidance + user steer):**
- **Sonnet** (default): Tasks 1, 2, 8, 9, 12.
- **Opus** (complex / cross-cutting): Tasks 3 (sync-vault destructive script), 4 (custom remark + rehype plugin), 5 (embed-remark MDX AST transform), 6 (config wiring + chunk strategy), 7 (deterministic build-garden-data — load-bearing for CI freshness check), 10 (LinkPreview delegated event + floating-ui), 11 (GraphView island + force-graph + manualChunks verification).

Spec-reviewer (Opus) and code-quality-reviewer (Opus) run for every task.

---

## File map (ground truth before tasks lock in)

### New files (created)

```
packages/site/src/content/notes/                   (directory; ≥ 6 fixture notes committed)
packages/site/src/content/notes/_assets/           (committed — copied images)
packages/site/src/data/backlinks.json
packages/site/src/data/note-previews.json
packages/site/src/data/graph.json
packages/site/src/lib/notes.ts
packages/site/src/lib/wikilinks.ts
packages/site/src/lib/wikilinks-remark.ts
packages/site/src/lib/embed-remark.ts
packages/site/src/layouts/_NoteLayout.astro
packages/site/src/components/Backlinks.astro
packages/site/src/components/LinkPreview.svelte
packages/site/src/components/GraphView.svelte
packages/site/src/pages/garden/index.astro
packages/site/src/pages/garden/[slug].astro
packages/site/src/pages/garden/graph.astro
packages/site/scripts/sync-vault.ts
packages/site/scripts/build-garden-data.ts
packages/site/tests/fixtures/vault/                (in-repo fixture vault for sync-vault tests)
packages/site/tests/unit/notes-helpers.test.ts
packages/site/tests/unit/wikilinks.test.ts
packages/site/tests/unit/wikilinks-remark.test.ts
packages/site/tests/unit/embed-remark.test.ts
packages/site/tests/unit/build-garden-data.test.ts  (consolidates spec's build-backlinks.test.ts + build-graph.test.ts — single producer, single test file)
packages/site/tests/unit/sync-vault.test.ts
packages/site/tests/e2e/garden-index.spec.ts
packages/site/tests/e2e/garden-detail.spec.ts
packages/site/tests/e2e/garden-graph.spec.ts
packages/site/tests/e2e/link-preview.spec.ts
packages/specs/adrs/0025-vault-sync-script.md
packages/specs/adrs/0026-force-graph-over-sigma.md
packages/specs/adrs/0027-wikilink-remark-plugin.md
packages/specs/adrs/0028-backlinks-build-time.md
packages/specs/adrs/0029-link-preview-island.md
packages/specs/adrs/0030-math-callouts-chain.md
```

### Modified files

```
packages/site/package.json                    (add deps + sync:vault, prebuild:garden scripts; chain prebuild:garden into build)
packages/site/src/content.config.ts           (add `notes` collection)
packages/site/astro.config.mjs                (extend remark/rehype + manualChunks)
packages/site/.size-limit.cjs                 (3 new entries; negated glob for site-js)
packages/site/lighthouserc.cjs                (2 new URLs)
packages/site/knip.jsonc                      (register new script entries)
packages/site/.dependency-cruiser.cjs         (allow scripts → src/lib/wikilinks)
packages/site/tsconfig.json                   (only if new path aliases land — likely not)
```

### File responsibility (one-line each — locks decomposition)

| File | Responsibility |
|---|---|
| `content.config.ts` | Collection registration + Zod schemas. Adds `notes` collection. |
| `lib/notes.ts` | Note-collection helpers: `getAllNotes()`, `getNote(slug)`, `noteHref(slug)`. Pure. |
| `lib/wikilinks.ts` | Single source of truth for slug rules. Exports `noteSlug(title)`, `noteHref(slug)`. Used by remark plugin AND scripts AND GraphView. |
| `lib/wikilinks-remark.ts` | Custom remark plugin (wraps `@portaljs/remark-wiki-link` with our config) + small rehype plugin for `<a>`→`<span>` rewrite when broken. |
| `lib/embed-remark.ts` | Custom mdast-walker that rewrites `![[image.png]]` token sequences into MDX `<Picture>` JSX (so `@portaljs/remark-wiki-link` never sees them). |
| `scripts/sync-vault.ts` | Vault → repo copy with `publish:true` filter. Idempotent. `--dry-run`. Deletes-not-visited. |
| `scripts/build-garden-data.ts` | Walks `src/content/notes/`; writes 3 deterministic JSON artefacts. Load-bearing for CI freshness check. |
| `_NoteLayout.astro` | Note detail shell — `<header>`, body slot, `<aside>` TOC, `<Backlinks>` footer. Wraps `_BaseLayout`. |
| `Backlinks.astro` | Server-rendered "Linked from" section. Imports `backlinks.json`. Empty-state copy. |
| `LinkPreview.svelte` | Global hover-preview island (`client:idle`). Delegated `mouseover`/`focusin` on body. `@floating-ui/dom` positioning. |
| `GraphView.svelte` | `/garden/graph/` canvas island (`client:visible`). Dynamic-imports `force-graph`. Reduced-motion → static. |
| `pages/garden/index.astro` | List of all notes, locale-locked sort, `<ul>` of links. |
| `pages/garden/[slug].astro` | `getStaticPaths`-driven detail page. Wraps `_NoteLayout`. |
| `pages/garden/graph.astro` | Static page hosting `<GraphView>` + `<details>` keyboard fallback list. |

---

## Task plan (TDD red→green→commit per task)

There are **12 tasks**. Each is an isolated commit. Worker subagents (Sonnet/Opus per the table above) get one task at a time per `superpowers:subagent-driven-development`. Spec-review subagent (Opus) approves task-spec before code; code-review subagent (Opus) approves diff after.

**Pre-task setup commands (run once before Task 1):**

```bash
cd packages/site
bun add -d @portaljs/remark-wiki-link@1.2.0 remark-math@6 rehype-katex@7 katex remark-callout@1.1.1 force-graph@1.51.4 @floating-ui/dom@1 gray-matter@^4
```

Verify `bun.lock` updates with these deps; commit alongside Task 1.

---

### Task 1: `notes` content collection — schema + 6 fixture notes + parse test

**Implementer model:** Sonnet.

**Files:**
- Modify: `packages/site/src/content.config.ts`
- Modify: `packages/site/package.json` (deps from pre-task setup)
- Create: `packages/site/src/content/notes/welcome.mdx`
- Create: `packages/site/src/content/notes/wikilink-demo.mdx`
- Create: `packages/site/src/content/notes/math-demo.mdx`
- Create: `packages/site/src/content/notes/callout-demo.mdx`
- Create: `packages/site/src/content/notes/embed-demo.mdx`
- Create: `packages/site/src/content/notes/orphan.mdx`
- Create: `packages/site/src/content/notes/_assets/.gitkeep`
- Create: `packages/site/tests/unit/notes-schema.test.ts`

- [ ] **Step 1: Read spec § Notes frontmatter schema + § Slug strategy + § Architecture (Notes collection wiring).**

- [ ] **Step 2: Write the failing schema parse test.**

```ts
// packages/site/tests/unit/notes-schema.test.ts
/**
 * Why: schema is authoritative for note frontmatter — drift would silently
 * mis-parse user vault content. Test runs before any fixture commits so a
 * shape regression surfaces as a parse failure.
 * @see packages/specs/specs/05-garden.md § Notes frontmatter schema
 */
import { describe, it, expect } from "vitest";
import { notesSchema } from "../../src/content.config";

describe("notesSchema", () => {
  it("accepts a fully-populated note", () => {
    const sample = {
      title: "Welcome",
      created: new Date("2026-04-27"),
      updated: new Date("2026-04-27"),
      tags: ["meta"],
      math: false,
      summary: "Site root note.",
    };
    expect(() => notesSchema.parse(sample)).not.toThrow();
  });

  it("requires title and created", () => {
    expect(() => notesSchema.parse({ created: new Date() })).toThrow();
    expect(() => notesSchema.parse({ title: "x" })).toThrow();
  });

  it("defaults tags to [] and math to false", () => {
    const parsed = notesSchema.parse({ title: "x", created: new Date() });
    expect(parsed.tags).toEqual([]);
    expect(parsed.math).toBe(false);
  });

  it("rejects summary > 240 chars", () => {
    expect(() =>
      notesSchema.parse({ title: "x", created: new Date(), summary: "x".repeat(241) }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/notes-schema.test.ts`
Expected: FAIL with `notesSchema is not exported from "../../src/content.config"`.

- [ ] **Step 4: Add `notesSchema` and `notes` collection to content.config.ts.**

Append to `packages/site/src/content.config.ts` (do not touch existing collections):

```ts
// Note: `glob` from "astro/loaders" is already imported by content.config.ts
// (used by Phase 4 slash + stats collections). Reuse the existing import name —
// do NOT re-import as `globLoader` (avoid alias drift across collections).

/**
 * Note frontmatter schema for the digital garden.
 * Why: `publish` deliberately absent — the sync script is the gate
 * (see ADR 0025). Title required for <h1>; created required for sort/preview.
 * @see packages/specs/specs/05-garden.md § Notes frontmatter schema
 */
export const notesSchema = z.object({
  title: z.string(),
  created: z.coerce.date(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  math: z.boolean().default(false),
  summary: z.string().max(240).optional(),
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
  schema: notesSchema,
});

export const collections = { works, slash, stats, notes };
```

- [ ] **Step 5: Create the 6 fixture notes (real seed content per spec OQ — not Lorem).**

Each `.mdx` has frontmatter then ≥ 1 paragraph of body. Sample:

```mdx
---
title: Welcome
created: 2026-04-27
tags: ["meta"]
summary: Entry point for the digital garden.
---

This is the seed of the garden. Notes link to each other via [[Wikilink demo]].
```

Other fixtures:
- `wikilink-demo.mdx` — body contains `[[Welcome]]`, `[[Math demo]]`, and `[[Nonexistent target]]` (forces broken-link styling test in Task 4).
- `math-demo.mdx` — `math: true` frontmatter; body contains an inline `$E = mc^2$` and a display block `$$\int_0^1 x^2\,dx = \tfrac{1}{3}$$`.
- `callout-demo.mdx` — body contains `> [!note]\n> A callout body line.` and `> [!warning]\n> Warning body.`.
- `embed-demo.mdx` — body contains `![[diagram.png]]`. Add a tiny placeholder PNG (a 1×1 transparent pixel is fine) at `src/content/notes/_assets/diagram.png`. Keep it < 1 KB.
- `orphan.mdx` — no outgoing wikilinks; ensures the empty-backlinks branch renders.

- [ ] **Step 6: Run the test again to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/notes-schema.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 7: Run `bun x astro check` to verify the collection registers cleanly.**

Expected: 0 errors. (Astro's content scanner discovers the 6 mdx files; schema accepts each.)

- [ ] **Step 8: Commit.**

```bash
git add packages/site/package.json packages/site/bun.lock \
        packages/site/src/content.config.ts \
        packages/site/src/content/notes/ \
        packages/site/tests/unit/notes-schema.test.ts
git commit -m "Phase 5 Task 1: notes collection + 6 fixture notes + schema test"
```

---

### Task 2: `lib/wikilinks.ts` — slug helper + fast-check property test

**Implementer model:** Sonnet.

**Files:**
- Create: `packages/site/src/lib/wikilinks.ts`
- Create: `packages/site/tests/unit/wikilinks.test.ts`

- [ ] **Step 1: Read spec § Slug strategy.**

- [ ] **Step 2: Write the failing tests (cases + fast-check property).**

```ts
// packages/site/tests/unit/wikilinks.test.ts
/**
 * Why: slug rules are the single source of truth for wikilink resolution.
 * Drift between this and the remark plugin would break the entire garden.
 * Property test guards against regressions in unicode / punctuation handling.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
import { describe, it, expect } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import { noteSlug, noteHref } from "../../src/lib/wikilinks";

describe("noteSlug", () => {
  it("matches expected cases", () => {
    expect(noteSlug("Welcome")).toBe("welcome");
    expect(noteSlug("Math Demo")).toBe("math-demo");
    expect(noteSlug("Café au lait")).toBe("café-au-lait"); // github-slugger preserves unicode lowercase
    expect(noteSlug("  spaced  ")).toBe("spaced");
  });

  it("is idempotent on already-slug inputs", () => {
    expect(noteSlug(noteSlug("Math Demo"))).toBe("math-demo");
  });
});

describe("noteHref", () => {
  it("emits the canonical /garden/<slug>/ form", () => {
    expect(noteHref("welcome")).toBe("/garden/welcome/");
  });
});

fcTest.prop([fc.string({ minLength: 1, maxLength: 50 })])(
  "noteSlug round-trip stable for printable ASCII",
  (raw) => {
    // Skip empty-after-slugification inputs (control chars, pure whitespace).
    const first = noteSlug(raw);
    if (first.length === 0) return;
    expect(noteSlug(first)).toBe(first);
  },
);
```

- [ ] **Step 3: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/wikilinks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/wikilinks.ts`.**

```ts
// packages/site/src/lib/wikilinks.ts
/**
 * Slug + href rules for the digital garden. Single source of truth — used by
 * the remark plugin (Task 4), build-garden-data script (Task 7), and the
 * GraphView island (Task 11).
 * Why: github-slugger is already a transitive dep via Astro 6 +
 * @astrojs/markdown-remark@7 (verified bun.lock 2026-04-27).
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
import GithubSlugger from "github-slugger";

/** Convert a free-form note title to its canonical slug. */
export function noteSlug(title: string): string {
  // A new slugger per call is intentional — github-slugger's instance state
  // tracks dedup suffixes (foo, foo-1, foo-2). For our use case (independent
  // title→slug mapping, not collision-aware) we want a fresh instance every time.
  return new GithubSlugger().slug(title.trim());
}

/** Canonical href for a slug. Trailing slash matches the site-wide trailingSlash:"always" config. */
export function noteHref(slug: string): string {
  return `/garden/${slug}/`;
}
```

- [ ] **Step 5: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/wikilinks.test.ts`
Expected: PASS, all cases + property runs (default 100 fast-check shrinks).

- [ ] **Step 6: Commit.**

```bash
git add packages/site/src/lib/wikilinks.ts packages/site/tests/unit/wikilinks.test.ts
git commit -m "Phase 5 Task 2: lib/wikilinks slug + href helpers + fast-check property"
```

---

### Task 3: `scripts/sync-vault.ts` — vault → repo sync with publish filter, in-memory fixture vault, idempotency + dry-run

**Implementer model:** Opus (destructive script — branching logic for delete-not-visited + collision detection + dry-run).

**Files:**
- Create: `packages/site/scripts/sync-vault.ts`
- Create: `packages/site/tests/fixtures/vault/` (in-repo fixture vault — 4 notes + 1 image)
- Create: `packages/site/tests/unit/sync-vault.test.ts`
- Modify: `packages/site/package.json` (add `"sync:vault": "bun run scripts/sync-vault.ts"`)
- Modify: `packages/site/knip.jsonc` (register `scripts/sync-vault.ts` as entry)

- [ ] **Step 1: Read spec § Vault → repo sync (Batch 5.1).**

- [ ] **Step 2: Lay out the in-repo fixture vault.**

Create at `packages/site/tests/fixtures/vault/`:
- `published-1.md` — frontmatter `publish: true`, body `# Hello\n[[published-2]]`.
- `published-2.md` — frontmatter `publish: true`, body `text\n![[fig.png]]`.
- `private.md` — frontmatter `publish: false`, body anything.
- `untagged.md` — no `publish` key, body anything (must be skipped).
- `fig.png` — 1×1 placeholder (or copy from Task 1's diagram.png).
- `.obsidian/workspace.json` — exists; sync must skip the dir.

Commit these as ordinary fixture files.

- [ ] **Step 3: Write the failing tests.**

```ts
// packages/site/tests/unit/sync-vault.test.ts
/**
 * Why: the sync script is destructive (deletes-not-visited). Unit tests
 * exercise it against the in-repo fixture vault but write to a tempdir,
 * then assert the resulting tree by walking it. Idempotency + dry-run +
 * collision behaviour are all asserted.
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSync } from "../../scripts/sync-vault";

const VAULT = join(__dirname, "..", "fixtures", "vault");
let dest: string;

beforeEach(async () => {
  dest = await mkdtemp(join(tmpdir(), "sync-vault-"));
  await mkdir(join(dest, "_assets"), { recursive: true });
});

describe("runSync", () => {
  it("copies only publish:true notes", async () => {
    await runSync({ vaultPath: VAULT, dest, dryRun: false });
    const entries = await readdir(dest);
    expect(entries.sort()).toContain("published-1.mdx");
    expect(entries.sort()).toContain("published-2.mdx");
    expect(entries).not.toContain("private.mdx");
    expect(entries).not.toContain("untagged.mdx");
  });

  it("skips .obsidian/", async () => {
    await runSync({ vaultPath: VAULT, dest, dryRun: false });
    const entries = await readdir(dest);
    expect(entries).not.toContain("workspace.json");
    expect(entries).not.toContain(".obsidian");
  });

  it("mirrors referenced images into _assets/", async () => {
    await runSync({ vaultPath: VAULT, dest, dryRun: false });
    const assets = await readdir(join(dest, "_assets"));
    expect(assets).toContain("fig.png");
  });

  it("is idempotent (running twice leaves the same tree)", async () => {
    await runSync({ vaultPath: VAULT, dest, dryRun: false });
    const a = (await readdir(dest)).sort();
    await runSync({ vaultPath: VAULT, dest, dryRun: false });
    const b = (await readdir(dest)).sort();
    expect(b).toEqual(a);
  });

  it("deletes files in dest that are not visited this run", async () => {
    await writeFile(join(dest, "stale.mdx"), "---\ntitle: Stale\n---\n", "utf8");
    await runSync({ vaultPath: VAULT, dest, dryRun: false });
    const entries = await readdir(dest);
    expect(entries).not.toContain("stale.mdx");
  });

  it("dry-run leaves dest untouched", async () => {
    await writeFile(join(dest, "stale.mdx"), "---\ntitle: Stale\n---\n", "utf8");
    const summary = await runSync({ vaultPath: VAULT, dest, dryRun: true });
    const entries = await readdir(dest);
    expect(entries).toContain("stale.mdx"); // not deleted
    expect(entries).not.toContain("published-1.mdx"); // not written
    expect(summary.wouldWrite).toBeGreaterThan(0);
    expect(summary.wouldDelete).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/sync-vault.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `scripts/sync-vault.ts`.**

```ts
// packages/site/scripts/sync-vault.ts
/**
 * Vault → repo sync. Reads OBSIDIAN_VAULT_PATH (or first CLI arg or
 * options.vaultPath); copies publish:true notes into dest with normalised
 * frontmatter; mirrors referenced images; deletes-not-visited.
 * Why: astro-loader-obsidian@0.10.0 peer-deps astro@^5.12.5 — incompatible
 * with our Astro 6 lock (ADR 0025). Hand-rolled approach is path-c from
 * the general plan, promoted to primary.
 * @see packages/specs/specs/05-garden.md § Vault → repo sync
 */
import { readdir, readFile, writeFile, copyFile, unlink, stat, mkdir } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import matter from "gray-matter";
import { noteSlug } from "../src/lib/wikilinks";

export interface SyncOptions {
  /** Source vault path (defaults to env OBSIDIAN_VAULT_PATH). */
  vaultPath: string;
  /** Destination notes dir (production: packages/site/src/content/notes; tests: tempdir). */
  dest: string;
  /** When true: log actions but write/delete nothing. */
  dryRun: boolean;
}

export interface SyncSummary {
  written: number;
  deleted: number;
  assetsCopied: number;
  /** dry-run only: what WOULD have happened. */
  wouldWrite: number;
  wouldDelete: number;
}

const SCHEMA_KEYS = ["title", "created", "updated", "tags", "math", "summary"] as const;
const EMBED_RE = /!\[\[([^\]]+\.(png|jpe?g|gif|webp|avif|svg))\]\]/gi;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

export async function runSync(opts: SyncOptions): Promise<SyncSummary> {
  const summary: SyncSummary = {
    written: 0, deleted: 0, assetsCopied: 0, wouldWrite: 0, wouldDelete: 0,
  };
  const visited = new Set<string>();
  const visitedAssets = new Set<string>();
  await mkdir(opts.dest, { recursive: true });
  await mkdir(join(opts.dest, "_assets"), { recursive: true });

  // Pass 1: copy / dry-log every publish:true note.
  for await (const filePath of walk(opts.vaultPath)) {
    if (extname(filePath) !== ".md" && extname(filePath) !== ".mdx") continue;
    const raw = await readFile(filePath, "utf8");
    const parsed = matter(raw);
    if (parsed.data.publish !== true) continue;

    const title = typeof parsed.data.title === "string" && parsed.data.title.length > 0
      ? parsed.data.title
      : basename(filePath, extname(filePath));
    const slug = noteSlug(title);
    const outName = `${slug}.mdx`;
    const outPath = join(opts.dest, outName);
    visited.add(outName);

    // Strip frontmatter to schema-known keys only.
    const cleaned: Record<string, unknown> = {};
    for (const k of SCHEMA_KEYS) if (k in parsed.data) cleaned[k] = parsed.data[k];
    if (!cleaned.title) cleaned.title = title;
    if (!cleaned.created) cleaned.created = new Date().toISOString().slice(0, 10);
    const body = matter.stringify(parsed.content, cleaned);

    if (opts.dryRun) {
      summary.wouldWrite++;
      console.log(`[dry-run] WOULD WRITE ${outName}`);
    } else {
      await writeFile(outPath, body, "utf8");
      summary.written++;
    }

    // Mirror image embeds.
    const matches = parsed.content.matchAll(EMBED_RE);
    for (const m of matches) {
      const imgName = m[1].split("|")[0].trim();
      const srcImg = join(opts.vaultPath, imgName);
      const dstImg = join(opts.dest, "_assets", basename(imgName));
      visitedAssets.add(basename(imgName));
      try {
        await stat(srcImg); // throws if missing
        if (opts.dryRun) {
          console.log(`[dry-run] WOULD COPY asset ${imgName}`);
        } else {
          await copyFile(srcImg, dstImg);
          summary.assetsCopied++;
        }
      } catch {
        console.warn(`[warn] embed asset not found in vault: ${imgName}`);
      }
    }
  }

  // Pass 2: delete-not-visited.
  for (const f of await readdir(opts.dest)) {
    if (f === "_assets") continue;
    if (!visited.has(f)) {
      if (opts.dryRun) {
        summary.wouldDelete++;
        console.log(`D ${f}`);
      } else {
        await unlink(join(opts.dest, f));
        summary.deleted++;
      }
    }
  }
  for (const f of await readdir(join(opts.dest, "_assets"))) {
    if (!visitedAssets.has(f)) {
      if (opts.dryRun) {
        summary.wouldDelete++;
        console.log(`D _assets/${f}`);
      } else {
        await unlink(join(opts.dest, "_assets", f));
        summary.deleted++;
      }
    }
  }

  console.log(
    opts.dryRun
      ? `[dry-run] would write ${summary.wouldWrite}, would delete ${summary.wouldDelete}`
      : `synced ${summary.written}, deleted ${summary.deleted}, assets ${summary.assetsCopied}`,
  );
  return summary;
}

/** CLI entry — invoked by `bun run sync:vault`. */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cliPath = process.argv.find((a) => !a.startsWith("--") && !a.endsWith("sync-vault.ts"));
  const vaultPath = cliPath ?? process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.error("set OBSIDIAN_VAULT_PATH or pass vault path as first arg");
    process.exit(1);
  }
  await runSync({
    vaultPath,
    dest: join(process.cwd(), "src", "content", "notes"),
    dryRun,
  });
}

if (import.meta.main) await main();
```

- [ ] **Step 6: Add the npm script + register with Knip.**

In `packages/site/package.json`, add to `"scripts"`:

```json
"sync:vault": "bun run scripts/sync-vault.ts"
```

In `packages/site/knip.jsonc`, ensure `scripts/sync-vault.ts` is covered by the existing `"scripts/**/*.ts"` entry pattern (it already is from Phase 4 — verify by reading the file).

- [ ] **Step 7: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/sync-vault.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 8: Commit.**

```bash
git add packages/site/scripts/sync-vault.ts \
        packages/site/tests/fixtures/vault/ \
        packages/site/tests/unit/sync-vault.test.ts \
        packages/site/package.json packages/site/knip.jsonc
git commit -m "Phase 5 Task 3: scripts/sync-vault — publish filter, dry-run, idempotent"
```

---

### Task 4: `lib/wikilinks-remark.ts` — wikilink plugin wrapper + rehype `<a>`→`<span>` rewrite

**Implementer model:** Opus (custom unified plugin + rehype tree walk).

**Files:**
- Create: `packages/site/src/lib/wikilinks-remark.ts`
- Create: `packages/site/tests/unit/wikilinks-remark.test.ts`

- [ ] **Step 1: Read spec § Verified APIs (`@portaljs/remark-wiki-link` paragraph) + § Architecture (Wikilink + embed pipeline).**

- [ ] **Step 2: Verify the portaljs API by reading its README in node_modules after install.**

`cat packages/site/node_modules/@portaljs/remark-wiki-link/README.md | head -80`

Confirm option names: `permalinks`, `wikiLinkResolver`, `hrefTemplate`, `wikiLinkClassName`, `newClassName`, `aliasDivider`. The implementer halts and asks the controller if any of these names differ from the spec.

- [ ] **Step 3: Write the failing tests.**

```ts
// packages/site/tests/unit/wikilinks-remark.test.ts
/**
 * Why: tests the unified pipeline end-to-end (remark → rehype → html) so
 * resolved/broken/aliased links are validated by their final HTML shape,
 * not intermediate AST shape (which would be brittle to upstream changes).
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { wikiLinks, brokenLinkRehype } from "../../src/lib/wikilinks-remark";

const KNOWN = ["/garden/welcome/", "/garden/math-demo/"];

function compile(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(wikiLinks, { permalinks: KNOWN })
      .use(remarkRehype)
      .use(brokenLinkRehype)
      .use(rehypeStringify)
      .processSync(md),
  );
}

describe("wikiLinks remark + brokenLinkRehype", () => {
  it("resolves a known target to <a class=\"wikilink\" href=...>", () => {
    const html = compile("[[Welcome]]");
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('href="/garden/welcome/"');
    expect(html).not.toContain("wikilink-broken");
  });

  it("renders an unknown target as <span class=\"wikilink-broken\">", () => {
    const html = compile("[[Nonexistent target]]");
    expect(html).toContain('class="wikilink-broken"');
    expect(html).toContain("<span");
    expect(html).not.toMatch(/<a[^>]*wikilink-broken/);
    expect(html).not.toContain("href=");
  });

  it("respects alias divider", () => {
    const html = compile("[[Welcome|hi friend]]");
    expect(html).toContain('href="/garden/welcome/"');
    expect(html).toContain(">hi friend<");
  });

  it("emits data-target-slug on resolved anchors", () => {
    const html = compile("[[Welcome]]");
    expect(html).toContain('data-target-slug="welcome"');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/wikilinks-remark.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `lib/wikilinks-remark.ts`.**

```ts
// packages/site/src/lib/wikilinks-remark.ts
/**
 * Wikilink resolution pipeline.
 * - `wikiLinks`: thin wrapper around @portaljs/remark-wiki-link with our
 *   resolver + class names + data-attribute hooks.
 * - `brokenLinkRehype`: post-remark rehype plugin that rewrites <a> elements
 *   carrying our broken-link class to <span> (drops href).
 * Why: portaljs emits <a> for both resolved and broken targets; we need
 * <span> for broken so screen readers don't announce them as navigable
 * (and so users don't click into a 404).
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import remarkWikiLink from "@portaljs/remark-wiki-link";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import { noteHref, noteSlug } from "./wikilinks";

interface WikiOptions {
  /** Array of known permalinks (e.g. ["/garden/welcome/", ...]) — see ADR 0027. */
  permalinks: string[];
}

/**
 * remark plugin: resolves [[Title]] / [[Title|alias]] / [[Title#anchor]] using
 * `permalinks` for the resolved/broken split. Resolved links carry
 * class="wikilink" + data-target-slug; broken carry class="wikilink-broken".
 */
export function wikiLinks(opts: WikiOptions) {
  // @portaljs/remark-wiki-link is exported as the default function; call with
  // the standard plugin signature so unified attaches it correctly.
  return remarkWikiLink({
    permalinks: opts.permalinks,
    aliasDivider: "|",
    wikiLinkClassName: "wikilink",
    newClassName: "wikilink-broken",
    wikiLinkResolver: (name: string) => [noteHref(noteSlug(name))],
    hrefTemplate: (permalink: string) => permalink, // identity — resolver already returns full href
  });
}

/**
 * rehype plugin: rewrites `<a class="wikilink">` to also carry
 * `data-target-slug` (extracted from href), and rewrites
 * `<a class="wikilink-broken">` to `<span class="wikilink-broken">` (drops href).
 */
export function brokenLinkRehype() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const cn = node.properties?.className;
      const classes = Array.isArray(cn) ? (cn as string[]) : typeof cn === "string" ? [cn] : [];
      if (node.tagName === "a" && classes.includes("wikilink")) {
        const href = node.properties?.href as string | undefined;
        if (href) {
          // /garden/<slug>/ → "<slug>"
          const m = href.match(/^\/garden\/([^/]+)\/?$/);
          if (m && node.properties) node.properties["data-target-slug"] = m[1];
        }
      }
      if (node.tagName === "a" && classes.includes("wikilink-broken")) {
        node.tagName = "span";
        if (node.properties) {
          delete node.properties.href;
        }
      }
    });
  };
}
```

- [ ] **Step 6: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/wikilinks-remark.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 7: Commit.**

```bash
git add packages/site/src/lib/wikilinks-remark.ts packages/site/tests/unit/wikilinks-remark.test.ts
git commit -m "Phase 5 Task 4: wikilink remark + rehype <a>→<span> rewrite"
```

---

### Task 5: `lib/embed-remark.ts` — `![[image.png]]` → MDX `<Picture>` JSX

**Implementer model:** Opus (mdast-walker that synthesises MDX JSX nodes).

**Files:**
- Create: `packages/site/src/lib/embed-remark.ts`
- Create: `packages/site/tests/unit/embed-remark.test.ts`

- [ ] **Step 1: Read spec § Architecture (Image embeds paragraph).**

- [ ] **Step 2: Write the failing test.**

```ts
// packages/site/tests/unit/embed-remark.test.ts
/**
 * Why: ![[image]] tokens must be consumed BEFORE @portaljs/remark-wiki-link
 * sees them, otherwise it tries to handle them as built-in image embeds
 * (which bypasses Astro's <Picture> pipeline). Test asserts the AST node
 * is rewritten to MDX JSX referencing the asset path.
 * @see packages/specs/specs/05-garden.md § Architecture (Image embeds)
 */
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkStringify from "remark-stringify";
import { embedRemark } from "../../src/lib/embed-remark";

function compile(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(embedRemark)
      .use(remarkStringify)
      .processSync(md),
  );
}

describe("embedRemark", () => {
  it("rewrites ![[diagram.png]] to a <Picture> JSX node", () => {
    const out = compile("text\n\n![[diagram.png]]\n\ntail");
    expect(out).toContain("<Picture");
    expect(out).toContain("diagram.png");
  });

  it("preserves caption from ![[file.png|caption]]", () => {
    const out = compile("![[diagram.png|the diagram]]");
    expect(out).toContain('alt="the diagram"');
  });

  it("leaves non-embed wikilinks untouched", () => {
    const out = compile("[[Welcome]]");
    expect(out).not.toContain("<Picture");
    expect(out).toContain("[[Welcome]]");
  });

  it("injects `import { Picture } from \"astro:assets\"` when an embed is rewritten", () => {
    // Why: <Picture> is not auto-imported by Astro's MDX integration. Without
    // an mdxjsEsm import node the build errors with "Picture is not defined".
    const out = compile("![[diagram.png]]");
    expect(out).toContain('import { Picture } from "astro:assets"');
  });

  it("does not duplicate the import when one is already present", () => {
    const out = compile('import { Picture } from "astro:assets";\n\n![[diagram.png]]');
    const matches = out.match(/import \{ Picture \} from "astro:assets"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("does not inject the import when no embed is rewritten", () => {
    const out = compile("[[Welcome]]");
    expect(out).not.toContain('astro:assets');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/embed-remark.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/embed-remark.ts`.**

```ts
// packages/site/src/lib/embed-remark.ts
/**
 * remark plugin: rewrites Obsidian-style ![[image.png]] / ![[image.png|caption]]
 * tokens into MDX JSX <Picture> elements that consume Astro's astro:assets
 * pipeline. Runs BEFORE @portaljs/remark-wiki-link so the wiki-link plugin
 * never sees the embed token.
 * Why: keeps image embeds on the same Sharp-driven AVIF/WebP variant pipeline
 * we use for /works/ covers (Phase 3).
 * @see packages/specs/specs/05-garden.md § Architecture (Image embeds)
 */
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

const EMBED = /^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const PICTURE_IMPORT_VALUE = 'import { Picture } from "astro:assets";';

interface TextNode { type: "text"; value: string; }
interface ParaNode { type: "paragraph"; children: TextNode[]; }

/**
 * Predicate: does the AST already carry an `import { Picture } from "astro:assets"`
 * (e.g. user's note already imported it manually)? We avoid duplicate imports.
 */
function hasPictureImport(root: Root): boolean {
  return (root.children as Array<{ type: string; value?: string }>).some(
    (n) => n.type === "mdxjsEsm" && typeof n.value === "string" && n.value.includes('from "astro:assets"') && n.value.includes("Picture"),
  );
}

export function embedRemark() {
  return (tree: unknown) => {
    let touchedAny = false;
    const root = tree as Root;
    visit(root, "paragraph", (node: ParaNode, index: number | undefined, parent: { children: unknown[] } | undefined) => {
      if (parent === undefined || index === undefined) return;
      if (node.children.length !== 1) return;
      const child = node.children[0];
      if (child.type !== "text") return;
      const m = child.value.trim().match(EMBED);
      if (!m) return;
      const file = m[1].trim();
      if (!IMG_EXT.test(file)) return;
      const caption = (m[2] ?? "").trim();
      touchedAny = true;
      // Replace this paragraph with an MDX JSX <Picture> node.
      // mdxJsxFlowElement is the mdast-util-mdx-jsx node shape; for a
      // computed JSX prop we wrap the value in mdxJsxAttributeValueExpression
      // (raw source string — Astro's MDX integration parses it via acorn).
      parent.children[index] = {
        type: "mdxJsxFlowElement",
        name: "Picture",
        attributes: [
          { type: "mdxJsxAttribute", name: "src", value: `./_assets/${file}` },
          { type: "mdxJsxAttribute", name: "alt", value: caption },
          { type: "mdxJsxAttribute", name: "formats", value: { type: "mdxJsxAttributeValueExpression", value: "['avif','webp']" } },
        ],
        children: [],
      };
    });
    // If we synthesised any <Picture>, ensure the import is present at the
    // top of the document. Why: <Picture> is not auto-imported by Astro's
    // MDX integration; without this `mdxjsEsm` node the build errors with
    // "Picture is not defined" at evaluation time.
    if (touchedAny && !hasPictureImport(root)) {
      (root.children as unknown[]).unshift({
        type: "mdxjsEsm",
        value: PICTURE_IMPORT_VALUE,
        // NB: the `data.estree` field is normally added by recma but Astro's
        // MDX integration parses `value` itself. We omit `data.estree`; Astro
        // re-parses on load. If the build complains about missing estree,
        // implementer adds `data: { estree: <parsed> }` via `acorn.parseExpressionAt`.
      });
    }
  };
}
```

- [ ] **Step 5: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/embed-remark.test.ts`
Expected: PASS, 3/3. **If tests fail because `remarkStringify` doesn't serialise `mdxJsxFlowElement` nodes back to source the implementer expects:** re-shape the test to inspect the AST directly (use `processor.run(tree)` or read the JSON parse tree), rather than asserting on the stringified form. The mechanism for transforming the node is what matters, not the stringification surface.

- [ ] **Step 6: Commit.**

```bash
git add packages/site/src/lib/embed-remark.ts packages/site/tests/unit/embed-remark.test.ts
git commit -m "Phase 5 Task 5: embed-remark transforms ![[image]] to MDX <Picture>"
```

---

### Task 6: Wire the unified pipeline + manualChunks into `astro.config.mjs`

**Implementer model:** Opus (cross-cutting config + chunk strategy + permalinks computation).

**Files:**
- Modify: `packages/site/astro.config.mjs`
- Create: `packages/site/tests/unit/astro-config-permalinks.test.ts`

- [ ] **Step 1: Read spec § Architecture (Wikilink + embed pipeline) + § Per-route size budgets summary (manualChunks).**

- [ ] **Step 2: Read the existing `astro.config.mjs` to identify the integration array + markdown config block.**

`bun x rg --no-heading -n "markdown:" packages/site/astro.config.mjs`

The implementer locates the existing `markdown:` block (it's there from Phase 3 for Expressive Code) and the existing `vite:` block (Phase 1) before editing.

- [ ] **Step 3: Write a failing test for the permalinks computation.**

```ts
// packages/site/tests/unit/astro-config-permalinks.test.ts
/**
 * Why: the permalinks array passed to @portaljs/remark-wiki-link must be
 * deterministically derived from src/content/notes/. A drift between filesystem
 * scan and the array breaks every wikilink. This test pins the helper that
 * astro.config.mjs uses, so the helper is testable in isolation.
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
import { describe, it, expect } from "vitest";
import { computePermalinks } from "../../astro.config.mjs";

describe("computePermalinks", () => {
  it("returns a sorted array of /garden/<slug>/ entries matching src/content/notes/", () => {
    const links = computePermalinks();
    expect(Array.isArray(links)).toBe(true);
    expect(links.every((l) => l.startsWith("/garden/") && l.endsWith("/"))).toBe(true);
    expect(links).toEqual([...links].sort());
  });
});
```

- [ ] **Step 4: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/astro-config-permalinks.test.ts`
Expected: FAIL — `computePermalinks` not exported.

- [ ] **Step 5: Modify `astro.config.mjs`.**

Add at top-level (export so the test can import):

```js
import fastGlob from "fast-glob";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Compute permalinks synchronously at config load.
 * Why: @portaljs/remark-wiki-link needs the full known-targets array up front
 * to discriminate resolved-vs-broken at parse time. We derive it from the
 * filesystem on every config load (no committed `known-slugs.json` artefact).
 * @see packages/specs/specs/05-garden.md § Architecture (Wikilink + embed pipeline)
 */
export function computePermalinks() {
  const files = fastGlob.sync("**/*.{md,mdx}", {
    cwd: path.join(__dirname, "src", "content", "notes"),
  });
  return files
    .map((f) => `/garden/${path.basename(f, path.extname(f))}/`)
    .sort();
}
```

In the existing `markdown:` block append the new remark + rehype plugins (preserving the existing ones):

```js
import { wikiLinks, brokenLinkRehype } from "./src/lib/wikilinks-remark.ts";
import { embedRemark } from "./src/lib/embed-remark.ts";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkCallout from "remark-callout";

// ... existing config ...
markdown: {
  remarkPlugins: [
    embedRemark,
    [wikiLinks, { permalinks: computePermalinks() }],
    remarkMath,
    remarkCallout,
  ],
  rehypePlugins: [
    rehypeKatex,
    brokenLinkRehype,
    // (existing Expressive Code plugins from Phase 3 stay where they are; the
    // Phase 3 integration owns its own remark/rehype block — verify nothing
    // overlaps).
  ],
},
```

In the existing `vite:` block extend `build.rollupOptions.output`:

```js
vite: {
  // ... existing entries ...
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("force-graph") || id.includes("d3-force-3d")) return "graph-vendor";
          return undefined;
        },
      },
    },
  },
},
```

- [ ] **Step 6: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/astro-config-permalinks.test.ts`
Expected: PASS, 1/1.

- [ ] **Step 7: Run `bun x astro check` to verify config still validates.**

Expected: 0 errors. (If a new dep is missing, install it. If `remark-math` ESM-vs-CJS interop trips Bun, switch to `import remarkMath from "remark-math"` form — verified ESM-default in v6.)

- [ ] **Step 8: Commit.**

```bash
git add packages/site/astro.config.mjs packages/site/tests/unit/astro-config-permalinks.test.ts
git commit -m "Phase 5 Task 6: wire wikilinks/embed/math/callout + manualChunks for graph-vendor"
```

---

### Task 7: `scripts/build-garden-data.ts` — backlinks/previews/graph with deterministic writes

**Implementer model:** Opus (load-bearing for CI freshness check; deterministic-write contract).

**Files:**
- Create: `packages/site/scripts/build-garden-data.ts`
- Create: `packages/site/tests/unit/build-garden-data.test.ts`
- Create: `packages/site/src/data/backlinks.json` (initially empty `{}`; written by script)
- Create: `packages/site/src/data/note-previews.json`
- Create: `packages/site/src/data/graph.json`
- Modify: `packages/site/package.json` (add `prebuild:garden`; chain into `build`)

- [ ] **Step 1: Read spec § Backlinks at build time (Batch 5.3) + § Deterministic-write contract.**

- [ ] **Step 2: Write the failing tests (mutual-inversion + determinism).**

```ts
// packages/site/tests/unit/build-garden-data.test.ts
/**
 * Why: build-garden-data is the single producer of three artefacts the rest
 * of the garden consumes. Two fast-check properties pin the inverter's
 * mutual inversion (P1 + P2). A third deterministic-write test asserts
 * byte-identical re-runs (load-bearing for CI freshness check).
 * @see packages/specs/specs/05-garden.md § Backlinks at build time + § Deterministic-write contract
 */
import { describe, it, expect } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import { buildArtefacts, type Note } from "../../scripts/build-garden-data";

const arbNote: fc.Arbitrary<Note> = fc.record({
  slug: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
  title: fc.string({ minLength: 1, maxLength: 30 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 }),
  outgoing: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/), { maxLength: 6 }),
  summary: fc.string({ maxLength: 100 }),
  firstParagraph: fc.string({ maxLength: 200 }),
});

fcTest.prop([fc.uniqueArray(arbNote, { selector: (n) => n.slug, maxLength: 20 })])(
  "P1: ∀ (A,B) ∈ forwardEdges, A ∈ backlinks(B)",
  (notes) => {
    const { backlinks } = buildArtefacts(notes);
    for (const a of notes) {
      for (const target of a.outgoing) {
        if (notes.some((n) => n.slug === target)) {
          expect(backlinks[target] ?? []).toEqual(
            expect.arrayContaining([expect.objectContaining({ slug: a.slug })]),
          );
        }
      }
    }
  },
);

fcTest.prop([fc.uniqueArray(arbNote, { selector: (n) => n.slug, maxLength: 20 })])(
  "P2: ∀ X ∈ backlinks(B), (X,B) ∈ forwardEdges",
  (notes) => {
    const { backlinks } = buildArtefacts(notes);
    for (const [target, sources] of Object.entries(backlinks)) {
      for (const src of sources) {
        const a = notes.find((n) => n.slug === src.slug);
        expect(a).toBeDefined();
        expect(a!.outgoing).toContain(target);
      }
    }
  },
);

describe("buildArtefacts deterministic writes", () => {
  it("emits byte-identical strings on two consecutive runs given identical inputs", () => {
    const notes: Note[] = [
      { slug: "a", title: "A", tags: ["x"], outgoing: ["b"], summary: "", firstParagraph: "" },
      { slug: "b", title: "B", tags: [], outgoing: ["a"], summary: "", firstParagraph: "" },
    ];
    const a = buildArtefacts(notes);
    const b = buildArtefacts(notes);
    expect(a.backlinksJson).toBe(b.backlinksJson);
    expect(a.previewsJson).toBe(b.previewsJson);
    expect(a.graphJson).toBe(b.graphJson);
  });

  it("emits objects with sorted keys + trailing newline", () => {
    const notes: Note[] = [
      { slug: "z", title: "Z", tags: [], outgoing: [], summary: "", firstParagraph: "" },
      { slug: "a", title: "A", tags: [], outgoing: [], summary: "", firstParagraph: "" },
    ];
    const { backlinksJson, graphJson } = buildArtefacts(notes);
    expect(backlinksJson.endsWith("\n")).toBe(true);
    expect(graphJson.endsWith("\n")).toBe(true);
    const parsedGraph = JSON.parse(graphJson);
    expect(parsedGraph.nodes[0].id).toBe("a"); // sorted by id ascending
  });
});

describe("readNotes wikilink-extraction slug parity", () => {
  // Why: the script's wikilink extractor and the rendering remark plugin must
  // resolve [[Title]] to the SAME slug — otherwise a backlink edge points to
  // a slug that doesn't match any rendered href, and the backlinks footer
  // silently disappears. This is the single source of truth assertion.
  // @see packages/specs/specs/05-garden.md § Slug strategy
  it.each([
    ["Welcome", "welcome"],
    ["Hello, World!", "hello-world"],
    ["Café au lait", "café-au-lait"],
    ["Title#section", "title"], // anchor-stripped before slug
  ])("readNotes uses noteSlug for '%s' → '%s'", async (raw, expected) => {
    const { extractWikilinkSlug } = await import("../../scripts/build-garden-data");
    expect(extractWikilinkSlug(raw)).toBe(expected);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/build-garden-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `scripts/build-garden-data.ts`.**

```ts
// packages/site/scripts/build-garden-data.ts
/**
 * Build-time producer of three garden artefacts:
 *   - src/data/backlinks.json   { [target]: [{slug,title}] }
 *   - src/data/note-previews.json   { [slug]: {title,summary,firstParagraph} }
 *   - src/data/graph.json   { nodes:[{id,label,tags}], edges:[{source,target}] }
 *
 * Determinism contract (load-bearing for CI freshness check):
 *   - Recursive object-key sort (alphabetical, ASCII).
 *   - Array sorts via Intl.Collator("en", {sensitivity:"base"}).
 *   - Trailing newline on every output.
 *   - 2-space indent.
 *   - Two consecutive runs against identical inputs → byte-identical output.
 *
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import matter from "gray-matter";
import { noteSlug } from "../src/lib/wikilinks";

/**
 * Structured note record consumed by `buildArtefacts`. `outgoing` holds
 * resolved wikilink slugs (after anchor-strip + `noteSlug`), so the inverter
 * sees the same slug shape that the rendering remark plugin will emit.
 * Why: spec § Slug strategy mandates ONE source of truth for slug rules.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export interface Note {
  slug: string;
  title: string;
  tags: string[];
  outgoing: string[];
  summary: string;
  firstParagraph: string;
}

const WIKILINK_RE = /\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g;
const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

/**
 * Pure helper: take the raw inner of a `[[...]]` token (or just a raw string),
 * strip a `#section` anchor, and run it through `noteSlug` — the same rule
 * the rendering remark plugin uses. Exported so the parity-test suite can
 * exercise it directly without booting the unified pipeline.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export function extractWikilinkSlug(raw: string): string {
  return noteSlug(raw.split("#")[0]);
}

function sortObject<T>(obj: Record<string, T>): Record<string, T> {
  const keys = Object.keys(obj).sort();
  const out: Record<string, T> = {};
  for (const k of keys) {
    const v = obj[k];
    out[k] = (v && typeof v === "object" && !Array.isArray(v))
      ? (sortObject(v as Record<string, unknown>) as unknown as T)
      : v;
  }
  return out;
}

function emit(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export interface Artefacts {
  backlinks: Record<string, Array<{ slug: string; title: string }>>;
  previews: Record<string, { title: string; summary: string; firstParagraph: string }>;
  graph: { nodes: Array<{ id: string; label: string; tags: string[] }>; edges: Array<{ source: string; target: string }> };
  backlinksJson: string;
  previewsJson: string;
  graphJson: string;
}

/**
 * Pure builder: take a list of `Note` records and produce all three garden
 * artefacts plus their canonical-form JSON strings (deterministic write contract).
 * Why: keeping this pure (no fs I/O) lets fast-check property tests run
 * against random Note arrays without touching disk.
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
export function buildArtefacts(notes: Note[]): Artefacts {
  const slugSet = new Set(notes.map((n) => n.slug));

  // Backlinks (only for known targets).
  const backlinks: Record<string, Array<{ slug: string; title: string }>> = {};
  for (const n of notes) {
    for (const target of n.outgoing) {
      if (!slugSet.has(target)) continue;
      backlinks[target] = backlinks[target] ?? [];
      backlinks[target].push({ slug: n.slug, title: n.title });
    }
  }
  for (const k of Object.keys(backlinks)) {
    backlinks[k].sort((a, b) => COLLATOR.compare(a.title, b.title));
  }

  // Previews.
  const previews: Record<string, { title: string; summary: string; firstParagraph: string }> = {};
  for (const n of notes) {
    previews[n.slug] = { title: n.title, summary: n.summary, firstParagraph: n.firstParagraph };
  }

  // Graph.
  const nodes = notes
    .map((n) => ({ id: n.slug, label: n.title, tags: [...n.tags].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = notes
    .flatMap((n) => n.outgoing.filter((t) => slugSet.has(t)).map((target) => ({ source: n.slug, target })))
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return {
    backlinks,
    previews,
    graph: { nodes, edges },
    backlinksJson: emit(sortObject(backlinks)),
    previewsJson: emit(sortObject(previews)),
    graphJson: emit({ nodes, edges }),
  };
}

/**
 * Walk `src/content/notes/`, parse each note's frontmatter + body, and
 * return one structured `Note` per file. Wikilink targets are normalised
 * via `extractWikilinkSlug` (single source of truth — see ADR 0027).
 * Why: keeping the slug rule shared between this script and the remark
 * plugin prevents backlinks from silently dropping for any title with
 * punctuation or a heading anchor.
 * @see packages/specs/specs/05-garden.md § Backlinks at build time
 */
export async function readNotes(notesDir: string): Promise<Note[]> {
  const out: Note[] = [];
  for (const f of await readdir(notesDir)) {
    if (extname(f) !== ".md" && extname(f) !== ".mdx") continue;
    const raw = await readFile(join(notesDir, f), "utf8");
    const parsed = matter(raw);
    const slug = basename(f, extname(f));
    const title = (parsed.data.title as string | undefined) ?? slug;
    const tags = (parsed.data.tags as string[] | undefined) ?? [];
    const summary = (parsed.data.summary as string | undefined) ?? "";
    const firstParagraph = parsed.content.split(/\n\s*\n/)[0]?.slice(0, 240).trim() ?? "";
    const outgoing = [...parsed.content.matchAll(WIKILINK_RE)].map((m) =>
      extractWikilinkSlug(m[1].trim()),
    );
    out.push({ slug, title, tags, outgoing, summary, firstParagraph });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function main() {
  const notesDir = join(process.cwd(), "src", "content", "notes");
  const dataDir = join(process.cwd(), "src", "data");
  await mkdir(dataDir, { recursive: true });
  const notes = await readNotes(notesDir);
  const a = buildArtefacts(notes);
  await writeFile(join(dataDir, "backlinks.json"), a.backlinksJson, "utf8");
  await writeFile(join(dataDir, "note-previews.json"), a.previewsJson, "utf8");
  await writeFile(join(dataDir, "graph.json"), a.graphJson, "utf8");
  console.log(`built ${notes.length} notes, ${Object.keys(a.backlinks).length} backlink targets, ${a.graph.edges.length} edges`);
}

if (import.meta.main) await main();
```

- [ ] **Step 5: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/build-garden-data.test.ts`
Expected: PASS, all properties + 2 deterministic-write cases.

- [ ] **Step 6: Add the npm script + chain into build.**

In `packages/site/package.json`:

```json
"scripts": {
  ...
  "prebuild:garden": "bun run scripts/build-garden-data.ts",
  "build": "bun run prebuild:stats && bun run prebuild:garden && astro build",
  ...
}
```

- [ ] **Step 7: Run the script once to populate the artefacts; commit them.**

`cd packages/site && bun run prebuild:garden`

Expected: writes 3 files into `src/data/`. `git status` shows all 3 staged for commit.

- [ ] **Step 8: Commit.**

```bash
git add packages/site/scripts/build-garden-data.ts \
        packages/site/tests/unit/build-garden-data.test.ts \
        packages/site/src/data/ \
        packages/site/package.json
git commit -m "Phase 5 Task 7: build-garden-data with deterministic writes + freshness gate"
```

---

### Task 8: `lib/notes.ts` + `_NoteLayout.astro` + `Backlinks.astro` (no pages yet)

**Implementer model:** Sonnet.

**Files:**
- Create: `packages/site/src/lib/notes.ts`
- Create: `packages/site/src/layouts/_NoteLayout.astro`
- Create: `packages/site/src/components/Backlinks.astro`
- Create: `packages/site/tests/unit/notes-helpers.test.ts`

- [ ] **Step 1: Read spec § Architecture (Hover link previews) for `_NoteLayout` shape; § Backlinks at build time for component shape.**

- [ ] **Step 2: Write the failing test for `lib/notes.ts`.**

```ts
// packages/site/tests/unit/notes-helpers.test.ts
/**
 * Why: notes helpers are wrappers over astro:content. Tests use vitest
 * aliases that map "astro:content" → "astro/content/config" (per Phase 4
 * vitest.config). Helpers stay thin and pure.
 * @see packages/specs/specs/05-garden.md § _NoteLayout
 */
import { describe, it, expect } from "vitest";
import { sortNotes } from "../../src/lib/notes";

import type { Note } from "../../src/lib/notes";

describe("sortNotes", () => {
  it("sorts by title locale-locked, secondary updated desc", () => {
    // Synthetic test fixtures — `as unknown as Note` instead of `as never`
    // to keep the cast scoped + type-coverage friendly.
    const a = { id: "a", data: { title: "Banana", created: new Date("2026-01-01") } } as unknown as Note;
    const b = { id: "b", data: { title: "Apple", created: new Date("2026-01-02") } } as unknown as Note;
    const c = { id: "c", data: { title: "Apple", created: new Date("2026-02-01"), updated: new Date("2026-03-01") } } as unknown as Note;
    const sorted = sortNotes([a, b, c]);
    expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

`cd packages/site && bun x vitest run tests/unit/notes-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/notes.ts`.**

```ts
// packages/site/src/lib/notes.ts
/**
 * Note collection helpers.
 * Why: thin wrappers over astro:content keep page code declarative. The
 * sort uses a locale-locked Intl.Collator so the ordering is stable across
 * build environments (CF Pages vs local).
 * @see packages/specs/specs/05-garden.md § Slug strategy + § Open questions
 */
import { getCollection, type CollectionEntry } from "astro:content";

const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

export type Note = CollectionEntry<"notes">;

/** Returns every note. Filtering by `publish` is the sync script's job. */
export async function getAllNotes(): Promise<Note[]> {
  return sortNotes(await getCollection("notes"));
}

/** Stable sort: title asc (locale-locked), then updated/created desc. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const tCmp = COLLATOR.compare(a.data.title, b.data.title);
    if (tCmp !== 0) return tCmp;
    const ua = (a.data.updated ?? a.data.created).getTime();
    const ub = (b.data.updated ?? b.data.created).getTime();
    return ub - ua; // newer first
  });
}
```

- [ ] **Step 5: Run the test to verify it passes.**

`cd packages/site && bun x vitest run tests/unit/notes-helpers.test.ts`
Expected: PASS, 1/1.

- [ ] **Step 6: Implement `_NoteLayout.astro`.**

```astro
---
// packages/site/src/layouts/_NoteLayout.astro
/**
 * Note detail shell. Wraps _BaseLayout (aliased per Phase 3 convention).
 * Renders <header>, body slot, <Backlinks/> footer. KaTeX CSS conditionally
 * loaded gated on entry.data.math.
 * Why: shared shell keeps per-page Astro thin; _BaseLayout already mounts
 * <SlashFooter/> + <CommandPalette/>.
 * @see packages/specs/specs/05-garden.md § _NoteLayout
 */
import BaseLayout from "./_BaseLayout.astro";
import Backlinks from "../components/Backlinks.astro";
import type { CollectionEntry } from "astro:content";
// Self-host KaTeX CSS — Astro's Vite pipeline hashes + cache-busts it,
// avoids third-party CDN exposure (privacy + reproducibility), and keeps
// the build hermetic. The `?url` suffix makes Vite emit the asset URL string
// at build-time so we can render it conditionally inside the template.
import katexCssUrl from "katex/dist/katex.min.css?url";

interface Props { entry: CollectionEntry<"notes">; }
const { entry } = Astro.props;
const updated = entry.data.updated ?? entry.data.created;
---
<BaseLayout title={entry.data.title} description={entry.data.summary ?? "Garden note"}>
  {entry.data.math && <link rel="stylesheet" href={katexCssUrl} />}
  <main>
    <article class="note">
      <header>
        <h1 transition:name={`note-${entry.id}`}>{entry.data.title}</h1>
        <p class="dates">
          <time datetime={entry.data.created.toISOString()}>{entry.data.created.toISOString().slice(0, 10)}</time>
          {entry.data.updated && (
            <> · updated <time datetime={updated.toISOString()}>{updated.toISOString().slice(0, 10)}</time></>
          )}
        </p>
        {entry.data.tags.length > 0 && (
          <ul class="tags" aria-label="Tags">
            {entry.data.tags.map((t) => <li>{t}</li>)}
          </ul>
        )}
      </header>
      <slot />
      <Backlinks slug={entry.id} />
    </article>
  </main>
</BaseLayout>

<style>
  /* tokens reused — only layout-specific overrides here. */
  .note header { margin-block-end: var(--space-3); }
  .note .dates { color: var(--color-text-muted); font-size: var(--font-size-2); }
  .tags { display: flex; gap: var(--space-2); padding: 0; list-style: none; }
  .tags li { background: var(--color-surface); padding: 0 var(--space-2); border-radius: 4px; }
</style>
```

- [ ] **Step 7: Implement `Backlinks.astro`.**

```astro
---
// packages/site/src/components/Backlinks.astro
/**
 * Build-time backlinks footer. Reads src/data/backlinks.json statically.
 * No client JS.
 * @see packages/specs/specs/05-garden.md § Backlinks at build time
 */
import backlinks from "../data/backlinks.json";

interface Props { slug: string; }
const { slug } = Astro.props;
const items = (backlinks as Record<string, Array<{ slug: string; title: string }>>)[slug] ?? [];
---
<footer class="backlinks">
  {items.length === 0 ? (
    <p class="empty">No backlinks yet.</p>
  ) : (
    <section aria-label="Backlinks">
      <h2>Linked from</h2>
      <ul>
        {items.map((b) => <li><a href={`/garden/${b.slug}/`}>{b.title}</a></li>)}
      </ul>
    </section>
  )}
</footer>

<style>
  .backlinks { margin-block-start: var(--space-5); border-block-start: 1px solid var(--color-surface); padding-block-start: var(--space-3); }
  .empty { color: var(--color-text-muted); font-style: italic; }
</style>
```

- [ ] **Step 8: Run `bun x astro check` to verify both Astro files compile.**

Expected: 0 errors.

- [ ] **Step 9: Commit.**

```bash
git add packages/site/src/lib/notes.ts \
        packages/site/src/layouts/_NoteLayout.astro \
        packages/site/src/components/Backlinks.astro \
        packages/site/tests/unit/notes-helpers.test.ts
git commit -m "Phase 5 Task 8: lib/notes + _NoteLayout + Backlinks"
```

---

### Task 9: Garden pages — index + `[slug]` detail; e2e tests

**Implementer model:** Sonnet.

**Note on TDD ordering:** This task is integration-shaped — the e2e tests are exercised against a built + previewed site, so writing the failing test FIRST without an implementation produces a navigation-error fail rather than a meaningful red. We deviate from strict test-first ordering here: implement pages first (Steps 2-3), then write + run e2e (Steps 4-5). This is the same pattern Phase 4 used for slash-pages e2e (`tests/e2e/slash-pages.spec.ts`).

**Files:**
- Create: `packages/site/src/pages/garden/index.astro`
- Create: `packages/site/src/pages/garden/[slug].astro`
- Create: `packages/site/tests/e2e/garden-index.spec.ts`
- Create: `packages/site/tests/e2e/garden-detail.spec.ts`

- [ ] **Step 1: Read spec § Acceptance criteria #3 / #4 for the page contracts.**

- [ ] **Step 2: Implement `pages/garden/index.astro`.**

```astro
---
// packages/site/src/pages/garden/index.astro
/**
 * Garden index — alphabetical list of all notes (locale-locked).
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #3
 */
import BaseLayout from "../../layouts/_BaseLayout.astro";
import { getAllNotes } from "../../lib/notes";
const notes = await getAllNotes();
---
<BaseLayout title="Garden — utofme" description="Index of digital garden notes.">
  <main>
    <header>
      <h1>Garden</h1>
      <p>{notes.length} notes. <a href="/garden/graph/">graph view →</a></p>
    </header>
    <ul class="note-list">
      {notes.map((n) => (
        <li>
          <a href={`/garden/${n.id}/`}>{n.data.title}</a>
          {n.data.summary && <p>{n.data.summary}</p>}
        </li>
      ))}
    </ul>
  </main>
</BaseLayout>

<style>
  .note-list { padding: 0; list-style: none; }
  .note-list li { margin-block-end: var(--space-3); }
  .note-list p { color: var(--color-text-muted); margin: 0; }
</style>
```

- [ ] **Step 3: Implement `pages/garden/[slug].astro`.**

```astro
---
// packages/site/src/pages/garden/[slug].astro
/**
 * Per-note detail page. Static getStaticPaths over all notes.
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #4
 */
import { getCollection, render } from "astro:content";
import NoteLayout from "../../layouts/_NoteLayout.astro";

export async function getStaticPaths() {
  const notes = await getCollection("notes");
  return notes.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
<NoteLayout entry={entry}>
  <Content />
</NoteLayout>
```

- [ ] **Step 4: Write the failing e2e tests.**

```ts
// packages/site/tests/e2e/garden-index.spec.ts
/**
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #3 + #8
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("garden index lists all fixture notes", async ({ page }) => {
  await page.goto("/garden/");
  const links = page.locator(".note-list a");
  await expect(links).toHaveCount(6); // ≥ 6 fixtures from Task 1
});

test("garden index axe clean", async ({ page }) => {
  await page.goto("/garden/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

```ts
// packages/site/tests/e2e/garden-detail.spec.ts
/**
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #4 + #8
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("wikilink-demo page renders resolved + broken wikilinks", async ({ page }) => {
  await page.goto("/garden/wikilink-demo/");
  await expect(page.locator("a.wikilink").first()).toBeVisible();
  await expect(page.locator("span.wikilink-broken").first()).toBeVisible();
  // Broken span must NOT be wrapped in an anchor.
  const brokenAncestor = await page.locator("span.wikilink-broken").first().evaluate(
    (el) => el.closest("a") !== null,
  );
  expect(brokenAncestor).toBe(false);
});

test("math-demo renders KaTeX", async ({ page }) => {
  await page.goto("/garden/math-demo/");
  await expect(page.locator(".katex").first()).toBeVisible();
});

test("callout-demo renders styled callouts", async ({ page }) => {
  await page.goto("/garden/callout-demo/");
  await expect(page.locator(".callout").first()).toBeVisible();
});

test("orphan note shows empty backlinks copy", async ({ page }) => {
  await page.goto("/garden/orphan/");
  await expect(page.locator(".backlinks .empty")).toBeVisible();
});

test("garden detail axe clean", async ({ page }) => {
  await page.goto("/garden/welcome/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 5: Run the e2e tests.**

`cd packages/site && bun x playwright test tests/e2e/garden-index.spec.ts tests/e2e/garden-detail.spec.ts`
Expected: PASS for all cases. (Playwright's `webServer` config in `playwright.config.ts` runs `bun run preview` against `http://127.0.0.1:4321`; `preview` requires a prior `astro build`. If the test fails with "ECONNREFUSED" or 404s, run `bun run build` once before `playwright test`.)

- [ ] **Step 6: Commit.**

```bash
git add packages/site/src/pages/garden/ \
        packages/site/tests/e2e/garden-index.spec.ts \
        packages/site/tests/e2e/garden-detail.spec.ts
git commit -m "Phase 5 Task 9: /garden/ index + /garden/[slug]/ detail + e2e"
```

---

### Task 10: `LinkPreview.svelte` island — delegated `mouseover`/`focusin` + floating-ui

**Implementer model:** Opus (delegated event subtleties + floating-ui middleware order + reduced-motion).

**Files:**
- Create: `packages/site/src/components/LinkPreview.svelte`
- Modify: `packages/site/src/layouts/_BaseLayout.astro` (mount island + inline previews JSON)
- Create: `packages/site/tests/e2e/link-preview.spec.ts`

- [ ] **Step 1: Read spec § Hover link previews (Batch 5.4).** Also skim https://svelte.dev/docs/svelte/bind#bind:this and https://svelte.dev/docs/svelte/$state — the LinkPreview island uses Svelte 5 runes with `bind:this` writing into a `$state`-backed variable; that combination is the documented Svelte 5 pattern for capturing element refs from rune mode.

- [ ] **Step 2: Implement `LinkPreview.svelte`.**

```svelte
<!--
  packages/site/src/components/LinkPreview.svelte

  Why: Obsidian-style hover preview. Delegated mouseover/focusin on body
  filters for a.wikilink[data-target-slug]. Reads inlined previews JSON
  from a server-rendered <script type="application/json"> block, so the
  island doesn't refetch.
  @see packages/specs/specs/05-garden.md § Hover link previews
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { computePosition, offset, shift, flip } from "@floating-ui/dom";

  type Preview = { title: string; summary: string; firstParagraph: string };
  let card: HTMLDivElement | undefined = $state();
  let visible = $state(false);
  let title = $state("");
  let body = $state("");
  let previews: Record<string, Preview> = $state({});
  let reduced = $state(false);

  onMount(() => {
    const node = document.getElementById("note-previews");
    if (node?.textContent) {
      try {
        previews = JSON.parse(node.textContent);
      } catch {
        previews = {};
      }
    }
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function targetFromEvent(e: Event): HTMLAnchorElement | null {
      const t = e.target as Element | null;
      if (!t) return null;
      const a = t.closest("a.wikilink") as HTMLAnchorElement | null;
      return a && a.dataset.targetSlug ? a : null;
    }

    async function show(e: Event) {
      const a = targetFromEvent(e);
      if (!a || !card) return;
      const slug = a.dataset.targetSlug!;
      const p = previews[slug];
      if (!p) return;
      title = p.title;
      body = p.summary || p.firstParagraph;
      visible = true;
      await Promise.resolve();
      const pos = await computePosition(a, card, {
        placement: "top",
        middleware: [offset(8), shift({ padding: 8 }), flip()],
      });
      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
    }

    function hide() { visible = false; }

    document.body.addEventListener("mouseover", show);
    document.body.addEventListener("mouseout", hide);
    document.body.addEventListener("focusin", show);
    document.body.addEventListener("focusout", hide);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });

    return () => {
      document.body.removeEventListener("mouseover", show);
      document.body.removeEventListener("mouseout", hide);
      document.body.removeEventListener("focusin", show);
      document.body.removeEventListener("focusout", hide);
    };
  });
</script>

<div
  bind:this={card}
  class="link-preview"
  class:visible
  class:reduced
  role="tooltip"
  aria-hidden={!visible}
>
  <strong>{title}</strong>
  <p>{body}</p>
</div>

<style>
  .link-preview {
    position: absolute;
    left: 0; top: 0;
    max-width: 320px;
    background: var(--color-bg);
    border: 1px solid var(--color-surface);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease-out;
  }
  .link-preview.visible { opacity: 1; }
  .link-preview.reduced { transition: none; }
  .link-preview p { margin: var(--space-1) 0 0; font-size: var(--font-size-2); color: var(--color-text-muted); }
</style>
```

- [ ] **Step 3: Mount the island + inline previews JSON in `_BaseLayout.astro`.**

In `_BaseLayout.astro`, after the existing `<CommandPalette client:idle transition:persist />` line and inside `<body>`, add:

```astro
---
import previews from "../data/note-previews.json";
import LinkPreview from "../components/LinkPreview.svelte";
---
<!-- ... existing body ... -->
<script type="application/json" id="note-previews" set:html={JSON.stringify(previews).replace(/<\/script/g, "<\\/script")}></script>
<LinkPreview client:idle />
```

- [ ] **Step 4: Write the failing e2e test.**

```ts
// packages/site/tests/e2e/link-preview.spec.ts
/**
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #6
 */
import { test, expect } from "@playwright/test";

test("hover over a wikilink reveals preview within 200 ms", async ({ page }) => {
  await page.goto("/garden/wikilink-demo/");
  const link = page.locator("a.wikilink").first();
  await link.hover();
  const tooltip = page.locator('[role="tooltip"].visible');
  await expect(tooltip).toBeVisible({ timeout: 200 });
});

test("Escape dismisses the preview", async ({ page }) => {
  await page.goto("/garden/wikilink-demo/");
  await page.locator("a.wikilink").first().hover();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="tooltip"].visible')).toHaveCount(0);
});

test("focus reveals preview (keyboard accessibility)", async ({ page }) => {
  await page.goto("/garden/wikilink-demo/");
  await page.locator("a.wikilink").first().focus();
  await expect(page.locator('[role="tooltip"].visible')).toBeVisible({ timeout: 200 });
});
```

- [ ] **Step 5: Run the test.**

`cd packages/site && bun x playwright test tests/e2e/link-preview.spec.ts`
Expected: PASS, 3/3.

- [ ] **Step 6: Run size-limit to confirm the global site-js cap still holds.**

`cd packages/site && bun x size-limit`
Expected: site-js (`dist/_astro/*.js`) still ≤ 420 KB. If LinkPreview chunk pushes us over, raise the cap by the measured delta and document in ADR 0029.

- [ ] **Step 7: Commit.**

```bash
git add packages/site/src/components/LinkPreview.svelte \
        packages/site/src/layouts/_BaseLayout.astro \
        packages/site/tests/e2e/link-preview.spec.ts
git commit -m "Phase 5 Task 10: LinkPreview Svelte island + delegated mouseover/focusin"
```

---

### Task 11: `GraphView.svelte` + `/garden/graph/` page + `manualChunks` budget verification

**Implementer model:** Opus (force-graph integration + SSR/island lifecycle + chunk strategy verification).

**Note on TDD ordering:** Same as Task 9 — integration-shaped against a built + previewed site. Implement island + page first, then write + run e2e. Phase 4 precedent: stats-page e2e in Phase 4 followed the same shape.

**Files:**
- Create: `packages/site/src/components/GraphView.svelte`
- Create: `packages/site/src/pages/garden/graph.astro`
- Create: `packages/site/tests/e2e/garden-graph.spec.ts`

- [ ] **Step 1: Read spec § Graph view (Batch 5.5) + § Per-route size budgets.**

- [ ] **Step 2: Implement `GraphView.svelte`.**

```svelte
<!--
  packages/site/src/components/GraphView.svelte

  Why: Obsidian-feel canvas graph via force-graph (vasturiano).
  Vanilla canvas + d3-force-3d under the hood. We dynamic-import so
  the chunk only loads when this island activates.
  @see packages/specs/specs/05-garden.md § Graph view
-->
<script lang="ts">
  import { onMount } from "svelte";

  type Node = { id: string; label: string; tags: string[] };
  type Edge = { source: string; target: string };
  type Graph = { nodes: Node[]; edges: Edge[] };

  let container: HTMLDivElement | undefined = $state();

  const PALETTE = ["#7a9", "#a87", "#79a", "#a97", "#9a7", "#897", "#79b", "#aa7"];
  function tagColour(tag: string | undefined): string {
    if (!tag) return "#888";
    let h = 0;
    for (const c of tag) h = (h * 31 + c.charCodeAt(0)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }

  onMount(async () => {
    if (!container) return;
    const graph: Graph = JSON.parse(document.getElementById("garden-graph")?.textContent ?? '{"nodes":[],"edges":[]}');
    const ForceGraphMod = await import("force-graph");
    const ForceGraph = ForceGraphMod.default;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fg = new ForceGraph(container)
      .graphData({ nodes: graph.nodes, links: graph.edges })
      .nodeId("id")
      .nodeLabel((n: Node) => n.label)
      .nodeColor((n: Node) => tagColour(n.tags[0]))
      .linkSource("source")
      .linkTarget("target")
      .cooldownTicks(reduced ? 1 : 120)
      .onNodeClick((node: Node) => {
        window.location.assign(`/garden/${node.id}/`);
      });
    if (reduced) fg.pauseAnimation();
  });
</script>

<div bind:this={container} class="graph" role="img" aria-label="Graph view of garden notes; full list available below"></div>

<style>
  .graph { width: 100%; height: 60vh; min-height: 400px; background: var(--color-surface); border-radius: 6px; }
</style>
```

- [ ] **Step 3: Implement `pages/garden/graph.astro`.**

```astro
---
// packages/site/src/pages/garden/graph.astro
/**
 * Force-graph view + a11y floor (<details> list).
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #7
 */
import BaseLayout from "../../layouts/_BaseLayout.astro";
import GraphView from "../../components/GraphView.svelte";
import graph from "../../data/graph.json";
import { getAllNotes } from "../../lib/notes";
const notes = await getAllNotes();
---
<BaseLayout title="Garden — graph view" description="Force-directed graph of garden notes.">
  <main>
    <header><h1>Graph</h1><p><a href="/garden/">← back to index</a></p></header>
    {/* Why escape `</script>`: a node label like "Foo</script>bar" would otherwise terminate the JSON
        block early and break parse. Internal data, low real risk, but cheap to defend. */}
    <script type="application/json" id="garden-graph" set:html={JSON.stringify(graph).replace(/<\/script/g, "<\\/script")}></script>
    <GraphView client:visible />
    <details class="list-fallback">
      <summary>List view ({notes.length} notes)</summary>
      <ul>
        {notes.map((n) => <li><a href={`/garden/${n.id}/`}>{n.data.title}</a></li>)}
      </ul>
    </details>
  </main>
</BaseLayout>

<style>
  .list-fallback { margin-block-start: var(--space-3); }
</style>
```

- [ ] **Step 4: Write the failing e2e test.**

```ts
// packages/site/tests/e2e/garden-graph.spec.ts
/**
 * @see packages/specs/specs/05-garden.md § Acceptance criterion #7 + § Performance acceptance
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("graph view mounts canvas + a11y fallback list", async ({ page }) => {
  await page.goto("/garden/graph/");
  await expect(page.locator(".graph canvas")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".list-fallback")).toBeVisible();
});

test("clicking a fallback list item navigates", async ({ page }) => {
  await page.goto("/garden/graph/");
  await page.locator("details.list-fallback").click(); // open
  const first = page.locator(".list-fallback ul a").first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(new RegExp(href!));
});

test("graph view axe clean", async ({ page }) => {
  await page.goto("/garden/graph/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 5: Build the site + verify chunk emits.**

```bash
cd packages/site && bun run build
ls dist/_astro/ | grep graph-vendor
```

Expected: at least one `graph-vendor-*.js` file. If the chunk does not emit (manualChunks didn't match), the implementer escalates: either tweak the matcher or fall back per spec ("raise the global cap to 600 KB and drop the negation"). Document the fallback in ADR 0026.

- [ ] **Step 6: Run the e2e test.**

`bun x playwright test tests/e2e/garden-graph.spec.ts`
Expected: PASS, 3/3.

- [ ] **Step 7: Commit.**

```bash
git add packages/site/src/components/GraphView.svelte \
        packages/site/src/pages/garden/graph.astro \
        packages/site/tests/e2e/garden-graph.spec.ts
git commit -m "Phase 5 Task 11: GraphView island + /garden/graph/ + chunk verification"
```

---

### Task 12: Tooling — size-limit + LHCI + Knip + dep-cruise + 6 ADRs + freshness CI step

**Implementer model:** Sonnet.

**Files:**
- Modify: `packages/site/.size-limit.cjs`
- Modify: `packages/site/lighthouserc.cjs`
- Modify: `packages/site/knip.jsonc`
- Modify: `packages/site/.dependency-cruiser.cjs`
- Modify: `lefthook.yml` (add `prebuild:garden` + `git diff --exit-code src/data/` step)
- Create: `packages/specs/adrs/0025-vault-sync-script.md`
- Create: `packages/specs/adrs/0026-force-graph-over-sigma.md`
- Create: `packages/specs/adrs/0027-wikilink-remark-plugin.md`
- Create: `packages/specs/adrs/0028-backlinks-build-time.md`
- Create: `packages/specs/adrs/0029-link-preview-island.md`
- Create: `packages/specs/adrs/0030-math-callouts-chain.md`

- [ ] **Step 1: Read spec § ADRs to write + § Per-route size budgets summary.**

- [ ] **Step 2: Update `.size-limit.cjs`.**

Add three new entries; modify the existing site-js entry to use a negated glob.

**Negation-glob support (verified via size-limit's `@size-limit/file` README, fetched 2026-04-27):** size-limit's `path` array supports `!`-prefixed entries to exclude matched files. If the implementer's local size-limit version does NOT honour negation (e.g. a fork or downgrade), **fall back per spec § Per-route size budgets summary**: drop the negation entry, raise the global site-js cap from 420 KB to 600 KB, and document the fallback decision in ADR 0026 ("force-graph-over-sigma"). The 600 KB number absorbs the worst-case force-graph + d3-force-3d chunk (~150-180 KB gzipped) on top of the existing 420 KB site-js budget.

```cjs
// In .size-limit.cjs
module.exports = [
  // ... existing entries ...

  // Garden index page
  { name: "/garden/ css+html", path: ["dist/garden/index.html", "dist/_astro/*.css"], limit: "60 KB", gzip: true, disablePlugins: ["@size-limit/time"] },

  // Garden detail (sample slug)
  { name: "/garden/welcome/ css+html", path: ["dist/garden/welcome/index.html", "dist/_astro/*.css"], limit: "60 KB", gzip: true, disablePlugins: ["@size-limit/time"] },

  // Garden graph route — CSS+HTML
  { name: "/garden/graph/ css+html", path: ["dist/garden/graph/index.html", "dist/_astro/*.css"], limit: "60 KB", gzip: true, disablePlugins: ["@size-limit/time"] },

  // Garden graph route — JS budget (graph-vendor + GraphView island chunks)
  { name: "/garden/graph/ js", path: ["dist/_astro/graph-vendor-*.js", "dist/_astro/GraphView*.js"], limit: "180 KB", gzip: true, disablePlugins: ["@size-limit/time"] },

  // Existing site-js cap with negated glob to exclude graph-vendor.
  // (replace the existing entry in-place; verify the previous path was
  //  `dist/_astro/*.js`)
  { name: "site js (all routes, ex graph-vendor)", path: ["dist/_astro/*.js", "!dist/_astro/graph-vendor-*.js"], limit: "420 KB", gzip: true, disablePlugins: ["@size-limit/time"] },
];
```

- [ ] **Step 3: Update `lighthouserc.cjs`.**

Add 2 URLs to `collect.url`:

```js
"http://localhost:4321/garden/",
"http://localhost:4321/garden/welcome/",
```

(`/garden/graph/` deliberately omitted per spec.)

- [ ] **Step 4: Update `knip.jsonc`.**

If Knip's `Unlisted dependencies` heuristic flags `gray-matter`, add it to `ignoreDependencies` with a `Why:` comment. If `katex` is flagged (it is consumed via CSS only), pin it likewise.

- [ ] **Step 5: Update `.dependency-cruiser.cjs`.**

Allow `scripts/**` to import from `src/lib/wikilinks.ts` (the slug source-of-truth). The existing rule from Phase 4 may already allow this — verify before editing.

- [ ] **Step 6: Update `lefthook.yml` to enforce CI freshness check.**

In the existing pre-commit chain (after `astro-check`, before `knip`):

```yaml
freshness-garden:
  glob: "packages/site/src/content/notes/**/*"
  run: cd packages/site && bun run prebuild:garden && git diff --exit-code src/data/
  fail_text: "src/data/*.json is stale — `bun run prebuild:garden` and amend the commit"
```

- [ ] **Step 7: Write the 6 ADRs.**

Each ADR follows the standard skeleton (Context · Decision · Alternatives · Consequences · Sources). Content per ADR draws from the spec's "ADRs to write" section and the corresponding architecture/spec text. ADRs are short — 50-150 lines each. Sample skeleton (use for all 6, customising body):

```markdown
# ADR 00NN — <title>

**Status:** accepted
**Date:** 2026-04-27 (Phase 5)

## Context
<2-4 sentences setting up the choice point.>

## Decision
<The choice made + 1 sentence rationale.>

## Alternatives considered
- **<Option B>** — <why rejected, with cite>.
- **<Option C>** — <why rejected, with cite>.

## Consequences
- <positive/negative consequences, ≤ 3 bullets each>.

## Sources
- [Spec § …](../specs/05-garden.md#…)
- <external URL or registry probe>
```

ADR mappings (each implementer subagent uses the spec's "ADRs to write" paragraph as the per-ADR brief):
- 0025 vault-sync-script — driver: astro-loader-obsidian Astro 5 peer-dep break (cite npm registry probe).
- 0026 force-graph-over-sigma — driver: user preference (Obsidian aesthetic) + canvas + lighter JS budget.
- 0027 wikilink-remark-plugin — `@portaljs/remark-wiki-link@1.2.0` + custom rehype rewrite mechanism (cite verified API).
- 0028 backlinks-build-time — server-rendered, deterministic-write contract, CI freshness gate.
- 0029 link-preview-island — `client:idle`, delegated `mouseover` (not `mouseenter`) on body, inlined JSON payload.
- 0030 math-callouts-chain — `remark-math` + `rehype-katex` + `remark-callout`; conditional KaTeX CSS load gated on `math: true`; rejected MathJax + MDX-component alternatives.

- [ ] **Step 8: Pre-PR full sweep (run all gates locally before final commit).**

```bash
cd packages/site
bun x biome check
bun x prettier --check '**/*.{astro,svelte}'
bun x astro check
bun x type-coverage --at-least 100 --strict
bun x knip
bun x depcruise --config .dependency-cruiser.cjs src
bun run check:docs
bun x vitest run
bun run build
bun x size-limit
bun x playwright test
```

Expected: every gate green. Any failure → fix on the branch (not as a follow-up issue) per CLAUDE.md inline-fix gate (blockers: failing tests / spec violations / hard-gate breaches always fix on branch).

- [ ] **Step 9: Commit + open PR.**

```bash
git add packages/site/.size-limit.cjs packages/site/lighthouserc.cjs \
        packages/site/knip.jsonc packages/site/.dependency-cruiser.cjs \
        lefthook.yml \
        packages/specs/adrs/0025-vault-sync-script.md \
        packages/specs/adrs/0026-force-graph-over-sigma.md \
        packages/specs/adrs/0027-wikilink-remark-plugin.md \
        packages/specs/adrs/0028-backlinks-build-time.md \
        packages/specs/adrs/0029-link-preview-island.md \
        packages/specs/adrs/0030-math-callouts-chain.md
git commit -m "Phase 5 Task 12: tooling (size-limit, LHCI, freshness gate) + 6 ADRs"
git push -u origin phase/05-garden
gh pr create --base main --head phase/05-garden --title "Phase 5: Digital Garden" --body "$(cat <<'EOF'
## Summary
- Obsidian-vault-driven `/garden/` with index + per-note detail pages
- Build-time backlinks, wikilink resolution, math (KaTeX), callouts, image embeds
- Hover link previews (Svelte island)
- Force-graph view at `/garden/graph/` + keyboard fallback list
- 6 new ADRs (0025–0030)

## Test plan
- [x] vitest unit (notes-schema, wikilinks, wikilinks-remark, embed-remark, sync-vault, build-garden-data)
- [x] Playwright e2e (garden-index, garden-detail, garden-graph, link-preview)
- [x] Axe-core green on all 3 garden routes
- [x] size-limit budgets all green (incl. graph-vendor chunk isolation)
- [x] LHCI green on /garden/, /garden/welcome/
EOF
)"
```

After CI green: merge with **merge commit** (no squash, no rebase) per CLAUDE.md. Tag `phase-5` on the merge SHA. Update `~/.claude/projects/-media-vboxuser-G-samsung1-0utoffiles-code-utofme/memory/progress.md` to mark Phase 5 done. Delete the branch local + remote.

---

## Final self-review (controller, after Task 12 merges)

- [ ] Verify all 11 spec acceptance criteria pass against the deployed `/garden/` routes.
- [ ] Confirm 6 ADRs (0025–0030) are committed under `packages/specs/adrs/`.
- [ ] Confirm `progress.md` updated with Phase 5 merge SHA + tag.
- [ ] Open follow-up `gh issue` entries for any Phase 5 nits caught during review (per CLAUDE.md inline-fix gate).

## Changelog

- **v1, 2026-04-27** — initial plan, 12 tasks, Sonnet/Opus implementer mix.
- **v2, 2026-04-27** — applied Opus plan-review fixes:
  - **RED:** T7 `readNotes` slug now uses `noteSlug` (single source of truth) via new exported `extractWikilinkSlug` helper; strips `#section` anchors before slug; new parity test covers "Hello, World!", "Café au lait", "Title#section". This fixes the silent backlink-drop bug for any title with punctuation or anchor.
  - **RED:** T5 `embedRemark` now injects `import { Picture } from "astro:assets"` as an `mdxjsEsm` node at the AST root when any embed is rewritten (Astro's MDX integration does not auto-import `<Picture>`); duplicate-import guard via `hasPictureImport`; three new test cases cover injection / no-duplicate / no-injection-without-embed.
  - **RED:** T9 + T11 add explicit "integration-shaped — implement first, e2e after" notes (Phase 4 precedent). Strict test-first ordering deferred for these tasks.
  - **NITs:** T1 drops `globLoader` alias (reuses existing `glob` import); T4 replaces `(tree as never)` with hast `Root`/`Element` typing; T7 adds per-export TSDoc to `Note`, `buildArtefacts`, `readNotes`; T8 swaps KaTeX CDN `<link>` for self-hosted `import "katex/dist/katex.min.css?url"`; T8 sortNotes test uses `as unknown as Note` (with explicit `Note` import) instead of `as never`; T9 webServer note clarified (preview not build); T10 + T11 escape `</script>` in inlined JSON; T10 Step 1 cites Svelte 5 `bind:this` + `$state` doc URLs; T12 states size-limit negation fallback (raise to 600 KB) inline; file-map annotates `build-garden-data.test.ts` consolidation of spec's two files.
- **v3, 2026-04-28 (Task 4 implementation)** — package swap: `@portaljs/remark-wiki-link@1.2.0` → `@flowershow/remark-wiki-link@3.4.0`. Reason: portaljs crashes at runtime against `mdast-util-from-markdown@2.x` (transitive via `remark-parse@11`); upstream maintainer (rufuspollock) closed datopian/portaljs#1059 noting the package was rebranded to `@flowershow/remark-wiki-link` with the v2 mdast fix. Same author. Option-surface deltas in T4 wrapper: `wikiLinkClassName` → `className`; `wikiLinkResolver(name): string[]` → `urlResolver({filePath, heading, isEmbed}): string` (we drop `hrefTemplate`, fold the href directly into `urlResolver`); `permalinks: string[]` → `files: string[]` of slug bases + `format: "shortestPossible"` + `caseInsensitive: true` (flowershow's `permalinks` is a `Record<filePath,url>` map, semantically distinct — we don't use it). Rest of the pipeline (rehype rewrite for broken-`<a>`→`<span>`, `data-target-slug` stamping) unchanged. Added 6 transitive deps to direct devDeps (`unified@11.0.5`, `remark-parse@11.0.0`, `remark-rehype@11.1.2`, `rehype-stringify@10.0.1`, `unist-util-visit@5.1.0`, `@types/hast@3.0.4`) — consumed in `tests/unit/wikilinks-remark.test.ts`'s `compile()` helper which exercises the full unified pipeline (knip auto-classifies them as direct deps via the test import chain).






