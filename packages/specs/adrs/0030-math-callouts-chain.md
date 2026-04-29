# ADR 0030 — Math + callouts plugin chain (`remark-math` + `rehype-katex` + `@r4ai/remark-callout`)

**Status:** accepted
**Date:** 2026-04-28 (Phase 5, updated from 2026-04-27 spec-write)

## Context

Garden notes may contain:
- **Math:** `$inline$` and `$$block$$` LaTeX expressions (Obsidian-style).
- **Callouts:** `> [!note]` / `> [!warning]` / etc. (Obsidian-style admonitions).

Both require remark/rehype plugins that are compatible with:
- `remark-parse@11` (our unified pipeline root).
- `mdast-util-from-markdown@2.x` (transitive via `remark-parse@11`).
- `micromark@4.0.2` (transitive via `remark-parse@11`).

**KaTeX CSS load:** the KaTeX CSS (~24 KB) must not ship on math-free notes.
The spec gates the `<link rel="stylesheet" href="katex.min.css">` on a `math: true`
frontmatter field in `src/layouts/_NoteLayout.astro`.

**Plugin swap during implementation:**

At spec-write (2026-04-27), the callout plugin was identified as either
`remark-callout@1.1.1` (rk-terence) or `@r4ai/remark-callout@0.6.2`. During Phase 5
Task 6 implementation (2026-04-28), `remark-callout@1.1.1` was tested and threw:

```
TypeError: chunks[startIndex].slice is not a function
```

This originates inside the package's `insideTitle` micromark tokenizer. Root cause:
`micromark@4.0.2` changed the internal chunk representation; `remark-callout@1.1.1`
was authored against micromark@3. The same incompatibility class caused the
`@portaljs/remark-wiki-link` → `@flowershow` swap (ADR 0027).

`@r4ai/remark-callout@0.6.2` was already listed as a documented alternative in the
spec (spec line 94). It is compatible with micromark@4. Swap was confirmed in
commits `4590656` and `7717fcb` (Phase 5 Task 6 fixup).

## Decision

Use `remark-math@6` + `rehype-katex@7` + `@r4ai/remark-callout@0.6.2`.
Wired in `astro.config.mjs` (commit `2f3c89a`, Phase 5 Task 6).

**Plugin pipeline order** (per spec Architecture § Wikilink + embed pipeline):
```
remarkPlugins: [embedRemark, remarkWikiLink, remarkMath, remarkCallout]
rehypePlugins: [rehypeKatex]
```

Why this order:
1. `embedRemark` first: `![[image]]` must be resolved before the wikilink plugin
   sees the inner `[[image]]` token.
2. `remarkMath` after wikilinks: a math block containing `[[` is not
   double-transformed.
3. `remarkCallout` after math: callouts may contain math expressions.
4. `rehypeKatex` in rehype phase: converts math MDAST nodes emitted by
   `remarkMath` to KaTeX HTML.

**Conditional CSS load:** `_NoteLayout.astro` imports `katex/dist/katex.min.css?url`
via Astro's asset pipeline and emits the `<link>` only when `entry.data.math === true`
(spec line 93; see `src/layouts/_NoteLayout.astro` line 17, 27). Notes without `math:
true` pay zero KaTeX CSS cost.

## Alternatives considered

- **MathJax** — heavier bundle (~300 KB vs KaTeX ~90 KB); server-side rendering
  requires a Node.js subprocess. KaTeX's client-only path is simpler and faster for
  read-only display. Rejected.
- **MDX `<Math>` component** — would require escaping all `$` in raw Obsidian
  notes at sync time; breaks Obsidian compatibility. Rejected.
- **`remark-callout@1.1.1` (rk-terence)** — crashes at runtime against
  `micromark@4.0.2`: `TypeError: chunks[startIndex].slice is not a function`.
  Incompatible with `remark-parse@11` (our unified root). Rejected.
- **Hand-rolled callout plugin** — viable, but `@r4ai/remark-callout@0.6.2` already
  implements the full Obsidian callout surface with micromark@4 compatibility.
  No benefit to reimplementing.

## Consequences

- `+` `remark-math@6` + `rehype-katex@7` are at current latest (verified npm probe
  2026-04-27); micromark@4 compatible.
- `+` `@r4ai/remark-callout@0.6.2` is micromark@4 compatible; emits `data-callout`
  attributes on callout blocks (used by e2e test selector in
  `tests/e2e/garden-detail.spec.ts`).
- `+` Conditional KaTeX CSS keeps math-free note pages at the base 60 KB budget.
- `−` `math: true` frontmatter must be set manually in Obsidian notes (the sync
  script does not auto-detect math usage). Missing `math: true` means no KaTeX
  rendering on that note.
- `−` `@r4ai/remark-callout@0.6.2` is a less-known package than the spec originally
  cited (rk-terence); the swap is documented here and in plan v3 (2026-04-28).

## Sources

- [Phase 5 spec § Math + callouts (Verified APIs)](../specs/05-garden.md#verified-apis-context7--npm-registry--github-fetch-probes-performed-2026-04-27)
- [remark-math@6 on npm](https://www.npmjs.com/package/remark-math/v/6.0.0)
- [rehype-katex@7 on npm](https://www.npmjs.com/package/rehype-katex/v/7.0.1)
- [@r4ai/remark-callout@0.6.2 on npm](https://www.npmjs.com/package/@r4ai/remark-callout/v/0.6.2)
- [KaTeX — client-side rendering](https://katex.org/)
