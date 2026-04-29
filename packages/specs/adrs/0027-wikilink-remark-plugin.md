# ADR 0027 — Wikilinks via `@flowershow/remark-wiki-link` + custom rehype rewrite

**Status:** accepted
**Date:** 2026-04-28 (Phase 5, updated from 2026-04-27 spec-write)

## Context

Obsidian `[[Title]]` wikilinks need to become resolved `<a class="wikilink">` or
broken `<span class="wikilink-broken">` in the rendered HTML. Resolution must be
build-time only (no client JS), and the slug rules must be a single source of truth
shared between the remark plugin and the `build-garden-data.ts` backlink builder.

The spec (2026-04-27) initially selected `@portaljs/remark-wiki-link@1.2.0` (MIT,
flowershow/datopian). During Phase 5 Task 4 implementation (2026-04-28), the package
crashed at runtime with:

```
Error: Cannot read properties of undefined (reading 'test')
```

The crash originates inside `mdast-util-from-markdown@2.x` when the plugin registers
its tokenizer extensions. The upstream maintainer (rufuspollock) closed
`datopian/portaljs#1059` stating the package was rebranded to
`@flowershow/remark-wiki-link` with the `mdast-util-from-markdown@2` fix applied.
The fix is in the same author's new package; `@portaljs/remark-wiki-link` has had
no release since the incompatibility was discovered.

## Decision

Use `@flowershow/remark-wiki-link@3.4.0` (same author, MIT, published 2026-02-18).

Implemented in `src/lib/wikilinks-remark.ts` (commit `5281d1b`, Phase 5 Task 4).

**Option-surface differences from `@portaljs` v1.2.0:**
- `wikiLinkClassName` → `className`.
- `wikiLinkResolver(name): string[]` → `urlResolver({filePath, heading, isEmbed}): string`
  (returns a single href; we fold the full `/garden/<slug>/` href directly).
- `permalinks: string[]` (resolved markers) → resolution driven via `files: string[]`
  of known slug bases + `format: "shortestPossible"` + `caseInsensitive: true`.
- Broken-link anchors still carry `class="wikilink-broken"` and a (resolvable)
  `href`; a downstream custom rehype plugin (`unist-util-visit` over hast `element`
  nodes) rewrites `<a class="wikilink-broken">` → `<span class="wikilink-broken">`
  (dropping `href`) so no broken anchor leaks into the DOM.

**Slug source of truth:** `src/lib/wikilinks.ts` exports `noteSlug(title)` (via
`github-slugger`, which is already a transitive dep of Astro 6 + `@astrojs/
markdown-remark`). Both the remark plugin's `urlResolver` and `build-garden-data.ts`
call `noteSlug` — a single resolution path for all wikilink slug lookups.

## Alternatives considered

- **`@portaljs/remark-wiki-link@1.2.0`** — rejected: crashes at runtime against
  `mdast-util-from-markdown@2.x` (our transitive via `remark-parse@11`).
  Upstream maintainer confirmed the rebranding (datopian/portaljs#1059, closed).
- **Hand-rolled remark plugin** — viable but would duplicate logic the flowershow
  package already handles correctly (tokenizer, alias `|` divider, heading `#`
  fragments). No benefit over adopting the maintained package.
- **Build-time preprocess (replace `[[...]]` in MDX before Astro's pipeline)** —
  fragile: any text inside code fences that contains `[[...]]` would be corrupted.
  A proper unified plugin is the only safe approach.

## Consequences

- `+` `@flowershow/remark-wiki-link@3.4.0` is compatible with
  `mdast-util-from-markdown@2.x` and `remark-parse@11`.
- `+` Single slug source of truth: remark plugin and data builder use the same
  `noteSlug` function — no silent backlink-drop for titles with punctuation.
- `−` The rehype `<a>`→`<span>` rewrite adds a small pipeline step; tested by
  `tests/unit/wikilinks-remark.test.ts` (commit `5281d1b`).
- `−` Future maintainers must use `@flowershow/remark-wiki-link`, not
  `@portaljs/remark-wiki-link` — the distinction is in the package name only.

## Sources

- [Phase 5 spec § Wikilink pipeline](../specs/05-garden.md#wikilink--embed-pipeline-batch-52)
- [datopian/portaljs#1059 — rebranding note](https://github.com/datopian/portaljs/issues/1059)
- [@flowershow/remark-wiki-link on npm](https://www.npmjs.com/package/@flowershow/remark-wiki-link)
- [github-slugger (Astro 6 transitive)](https://github.com/Flet/github-slugger)
