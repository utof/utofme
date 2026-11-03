# 0043 — Upgrade to Astro 7

Status: accepted (phase 09)

## Context

- The repo's library policy (`CLAUDE.md` § Library version policy) is "latest stable major is the default"; fall back only for a verified, cited incompatibility.
- The site uses `<ClientRouter />` with `transition:persist` and is about to embed `<video>` in cards/previews. Several ClientRouter media bugs are fixed only in Astro 7.x patch releases:
  - 7.2.1 — #17603: `<video>`/`<audio>` non-functional after navigating via `<ClientRouter />`.
  - 7.2.5 — #17750: regression where `transition:persist` stopped working for `<audio>`/`<video>`.
  - 7.3.6 — #18163: `<video muted>` lost its muted state after a ClientRouter navigation in Chrome.
- Astro 6 is not receiving these fixes (all landed on the 7.x line), so staying on 6 is not an option for video work.

## Decision

Upgrade `packages/site` to Astro 7.4.5 with `@astrojs/mdx` 8.1, `@astrojs/react` 7.1, `@astrojs/svelte` 9.1, `astro-expressive-code` 0.44, `@astrojs/check` 0.9.12, `@astrojs/rss` 4.0.19, `@astrojs/sitemap` 3.7.4, `prettier-plugin-astro` 1.1.2. Compatibility choices:

1. **Markdown pipeline:** Astro 7 defaults to the Sätteri processor, which does not run remark/rehype plugins. The wikilink / embed / math / callout / KaTeX chain is remark/rehype, so add `@astrojs/markdown-remark` and set `markdown.processor: unified({ remarkPlugins, rehypePlugins })` (plugin options on top-level `markdown` are deprecated). Rendered content HTML is byte-identical modulo attribute order.
2. **`compressHTML: true`** pinned explicitly: v7's new default `'jsx'` strips inter-element whitespace and would change visible text spacing.
3. **`astro-pagefind` stays on 1.8.6.** 2.x declares Astro 7 peers but replaces the UI with `@pagefind/component-ui` (`<pagefind-searchbox>`; `id`/`uiOptions` props gone; `Search` import needs `.astro`), which changes the DOM, CSS and breaks `tests/e2e/search.spec.ts` selectors (`.pagefind-ui__*`). 1.8.6 builds and indexes correctly on Astro 7 (peer range lists ≤6 only; bun does not enforce it). This is a verified, bounded exception to the latest-major policy; migrating to 2.x is a follow-up.
4. Container API tests import `getContainerRenderer` from `@astrojs/svelte/container-renderer` (root export deprecated).
5. Content-schema test mock gains the `apng` literal that Astro 7's `ImageFunction` type added.

## Alternatives

- **Stay on Astro 6.** Rejected: media/ClientRouter fixes only exist on 7.x; violates "latest is coolest".
- **Adopt Sätteri and port the plugins.** Rejected for this phase: large rewrite of five plugins for no user-visible gain; `unified()` is the documented opt-out.
- **astro-pagefind 2.x now.** Deferred (see Decision 3).
- **Let `compressHTML` default to `'jsx'`.** Rejected: silent visual regressions; can be adopted deliberately later.

## Consequences

- Vite 8 / Rolldown, Rust compiler (stricter HTML), queued rendering are now the build engine; build output size dropped (site JS 408 kB → 399 kB gzip) and all size-limit budgets pass.
- `astro preview` now daemonizes. Playwright's `webServer.command: "bun run preview"` exits early unless a preview is already running (`reuseExistingServer`); CI/e2e config needs follow-up.
- `prettier-plugin-astro` 1.x reformats 22 `.astro` files (mechanical).
- Two sources of drift to watch: `markdown-remark` is now an explicit dependency; astro-pagefind 1.x peer range excludes 7.

## Sources

- https://docs.astro.build/en/guides/upgrade-to/v7/ (source: https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/upgrade-to/v7.mdx)
- https://github.com/withastro/astro/blob/main/packages/astro/CHANGELOG.md — `## 7.2.1` (PR https://github.com/withastro/astro/pull/17603), `## 7.2.5` (https://github.com/withastro/astro/pull/17750), `## 7.3.6` (https://github.com/withastro/astro/pull/18163)
- https://github.com/shishkin/astro-pagefind
- https://vite.dev/guide/migration
