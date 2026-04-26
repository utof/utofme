# ADR 0020 — Expressive Code without Twoslash

## Status

Accepted — Phase 3.

## Date

2026-04-26

## Context

Phase 3 ships MDX-body detail pages. Code blocks in those pages need syntax highlighting, copy buttons, and visual framing (filename tabs, terminal frames). The site already uses Astro's `@astrojs/mdx` integration (since Phase 0).

Three strategies were evaluated for code-block rendering:

1. **Plain Shiki** — Astro 6 bundles Shiki; code fences are highlighted out of the box with the configured theme. No extra integration.
2. **`astro-expressive-code` (EC)** — a higher-level integration that wraps Shiki with plugins for copy buttons, filename frames, terminal frames, line highlighting, word-wrap, and dual-theme support. Used by Astro Docs itself.
3. **EC + Twoslash plugin** — adds inline TypeScript hover types to code blocks (via `expressive-code-twoslash`, a community-maintained plugin). Requires a Twoslash language server pass at build time.

The general-plan (line 354–360) explicitly recommended EC as the default and noted Twoslash as optional and niche.

### `astro-expressive-code` + `@astrojs/mdx` integration ordering

Neither the EC docs nor the MDX docs canonically state an ordering rule. General ecosystem practice (Starlight's source, community usage) suggests EC should precede MDX so that EC's remark/rehype plugins are registered before MDX processes code fences. This was treated as an open question (OQ#1) to be resolved empirically.

**Task 1 empirical resolution (commit `3895a9b`, 2026-04-26):**  
Ordering `[expressiveCode(), mdx(), svelte(), pagefind(), react()]` was tested against a fixture MDX file containing a JS code fence. The built `dist/_astro/` contained `ec.c0nwk.css` and `ec.0vx5m.js` assets; the built HTML contained `.expressive-code` and `.ec-line` class names, confirming EC theming applied correctly. The reverse ordering was not needed once this ordering verified. This ordering is now **pinned in `packages/site/astro.config.mjs` line 50**.

## Decision

**Use `astro-expressive-code` with dual-theme and copy button. No Twoslash.**

Configuration (`packages/site/ec.config.mjs`):

```js
export default {
  themes: ["github-light", "github-dark"],
  frames: { showCopyToClipboardButton: true },
  useDarkModeMediaQuery: true,
  defaultProps: { wrap: false },
};
```

- `themes: ["github-light", "github-dark"]` — EC automatically emits a `prefers-color-scheme` media query; no JavaScript is needed for theme switching.
- `showCopyToClipboardButton: true` — a copy button is inlined per page as a small `<script>` (≤ 1 KB). It is NOT a `dist/_astro/*.js` chunk (resolved OQ#8 at spec polish): it counts against the per-page CSS+HTML budget (≤ 60 KB), not the site JS budget.
- `useDarkModeMediaQuery: true` — dark theme switches via CSS `@media (prefers-color-scheme: dark)`; no runtime JS for theme detection.
- `wrap: false` — horizontal scroll on long lines; wrap is opt-in per code fence.

Integration ordering is `[expressiveCode(), mdx(), svelte(), pagefind(), react()]` — EC before MDX, empirically verified (Task 1, commit `3895a9b`).

**Twoslash is explicitly rejected for Phase 3.** If a future article needs inline TS hovers, open an issue and ship the `expressive-code-twoslash` community plugin in a later phase.

## Alternatives

### Plain Shiki (no EC)

Rejected. Plain Shiki covers syntax highlighting but does not ship:
- Copy button (requires a custom plugin or hand-rolled script).
- Filename / terminal frame (requires hand-rolled remark plugin).
- Dual-theme via `prefers-color-scheme` without additional wiring.

EC provides all three at zero runtime-JS cost (beyond the copy-button inline script). Astro Docs itself adopted EC for the same reasons. Implementation cost of rolling the missing features in plain Shiki equals or exceeds EC adoption.

### EC + `expressive-code-twoslash` (inline TS hovers)

Rejected for Phase 3. Reasons:

1. **Niche use case.** The site's current and near-term MDX content is general-purpose technical writing. Inline type hovers are valuable for API-reference articles but add no value to the existing 4 body-bearing fixtures.
2. **Community-maintained.** `expressive-code-twoslash` is not a first-party EC plugin. It requires a TypeScript language server pass at build time; a bug or API drift would block `astro build` on the main branch.
3. **Build-time cost.** Twoslash type-checks each code fence against a real TS project. For a small corpus this is seconds; for a large one it is tens of seconds. Not worth the overhead for a feature not yet needed.
4. **Deferral path is clear.** Adding Twoslash later is a one-file change (`ec.config.mjs` + one new dep). Rejecting it now does not foreclose the option.

## Consequences

- EC is installed as a dev dependency (`astro-expressive-code ^0.41`; lockfile pinned at `0.41.7`). The `0.x` semver caveat applies: minor bumps are breaking; lockfile ensures reproducibility.
- Code fences in all MDX detail pages render with: syntax highlighting (Shiki-backed), filename frame when `// title:` first-line directive is present, copy button, dual-theme.
- **Zero runtime JS overhead** from EC for non-copy features. The copy-button inline script (~1 KB) is included in the per-page HTML; it does not appear as a `dist/_astro/*.js` chunk and does not affect the site JS budget (ADR 0016 / ADR 0019).
- The integration ordering `[expressiveCode(), mdx(), …]` must be preserved. Reordering breaks EC theming. This constraint is documented in `astro.config.mjs` inline `Why:` comment (line 10–14).
- Twoslash is deferred. Future inclusion requires: install `expressive-code-twoslash`, add to `ec.config.mjs` plugins array, write an ADR amending this one.

## Sources

- `packages/site/ec.config.mjs` (configuration)
- `packages/site/astro.config.mjs` lines 9–14 (ordering constraint and empirical verification note)
- Phase 3 Task 1 commit `3895a9b` (empirical ordering verification: `[expressiveCode(), mdx(), svelte(), pagefind(), react()]`)
- https://expressive-code.com/reference/configuration/ (verified 2026-04-26)
- https://expressive-code.com/key-features/code-component/ (OQ#8 resolution: copy-button is inlined, not a chunk; verified 2026-04-26)
- General-plan line 354–360 (EC recommendation; Twoslash skip rationale)
- https://docs.astro.build/en/guides/syntax-highlighting/ (Astro 6 Shiki default; verified 2026-04-26)
