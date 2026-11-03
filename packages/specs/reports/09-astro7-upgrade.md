# 09 — Astro 6 → 7 upgrade report

## Summary
`packages/site` now builds and runs on Astro 7.4.5. Zero new failures: unit failures (70) and e2e failures (35) are identical sets before and after (the pre-existing home-redesign breakage); every gate passes (see below) except the pre-existing Biome errors in `scripts/`. Three decisions: keep the remark/rehype chain via `unified()` (Astro 7 defaults to Sätteri), pin `compressHTML: true`, and keep `astro-pagefind` on 1.8.6 (2.x swaps the whole search UI). Branch `phase/09-astro7`; ADR `adrs/0043-astro-7-upgrade.md`.

## Versions (before → after)
| package | before | after |
|---|---|---|
| astro | ^6 | ^7 (7.4.5) |
| @astrojs/mdx | ^5 | ^8 (8.1.2) |
| @astrojs/react | ^5 | ^7 (7.1.2) |
| @astrojs/svelte | ^7 | ^9 (9.1.2) |
| @astrojs/check | ^0.9.8 | ^0.9.12 |
| @astrojs/rss | ^4.0.18 | ^4.0.19 |
| @astrojs/sitemap | ^3.7.2 | ^3.7.4 |
| astro-expressive-code | ^0.41 | ^0.44 (0.44.3) |
| astro-pagefind | ^1.8.6 | ^1.8.6 (unchanged — see below) |
| prettier-plugin-astro | ^0.14.1 | ^1.1.2 |
| @astrojs/markdown-remark | — | ^7.3.0 (new, required for unified()) |
No adapter is used (static output). Upgraded by hand (versions/peers from `npm view`); `@astrojs/upgrade` not used.

## Breaking changes found (guide fetched from the withastro/docs repo on GitHub; docs.astro.build is blocked in this VM)
- **Sätteri default Markdown** — `astro.config.mjs` (`markdown.processor: unified({remarkPlugins, rehypePlugins})`, ~line 127; also import at top). Plugin options on `markdown.*` directly are deprecated (warning seen) so moved inside `unified()`.
- **compressHTML default → 'jsx'** — pinned `compressHTML: true` in `astro.config.mjs` (~line 106) to keep spacing.
- **getContainerRenderer root export deprecated** — `tests/unit/microformats.test.ts:8`, `tests/unit/sound-toggle.test.ts:30` now import from `@astrojs/svelte/container-renderer`.
- **astro-pagefind 2.x** (not in the guide): new export map requires `Search.astro` and switches to `@pagefind/component-ui`; rejected, stayed on 1.8.6.
- **ImageFunction type gained `apng`** — `tests/unit/content-schema.test.ts` mock adds `z.literal("apng")` (fixed an `astro check` error).
- **prettier-plugin-astro 1.x** reformats 22 `.astro` files (adds `{" "}` etc.).
- Not affecting repo (grepped, no hits): `astro:transitions` removed constants/`createAnimationScope`, `@astrojs/db`, `src/fetch.ts`, `experimental.*` flags removed (none set). Vite 8: `vite.build.rollupOptions.manualChunks` still works (graph-vendor chunk intact; /garden/graph js 58.6 kB).

## Gates
- biome check: fails with `lint/complexity/useLiteralKeys` etc. in `scripts/*.ts` — **identical on base** (pre-existing; lefthook's `--write` hook passes on staged files).
- prettier --check: pass after `--write` (22 files).
- astro check: 0 errors, 0 warnings, 1 hint (base: 0/0/3).
- type-coverage: 100.00% (20646/20646), strict.
- knip: no issues; 1 config hint (`lefthook` in ignoreDependencies), same as before.
- depcruise: no violations (44 modules). `check:docs`: pass.
- build: passes (29 pages, pagefind indexed 29). Google Fonts fetch fails in this VM (proxy 403) → fonts warning, same on base.
- size-limit (gzip, base → after; all within budget): site js 408.45 → 398.71 kB (limit 408.5); home css+html 29.44 → 29.75; works 30.17 → 30.45; search 25.08 → 25.21; pagefind ui js 30.06; graph js 58.58 (180); hover fx 13.39 (16); datamosh 3.21 (5); RSS 5.5; cursor 512 B; audio 4.66. .size-limit.cjs untouched.
- Unit (vitest): base with a built `dist` = 70 failed / 342 passed / 1 skipped; after = 70 / 342 / 1; failing sets identical (`card-pagefind-attrs` 69, `theme-script` 1). Note: with no `dist` at all the baseline instead shows "1 file failed" plus 10 unhandled typecheck errors (implicit any in `src/pages/feed/*.xml.ts`) — same before/after process state, not an upgrade effect. `schema-violations` did not fail in my runs.
- e2e (Playwright 1.59.1, Chromium): base 35 failed / 3 skipped / 138 passed; after 35 / 3 / 138; failing lists identical (35 titles). Needed workaround: repo's expected chromium-1217 isn't installed and downloads are blocked, so I used a throwaway config pointing at `/opt/pw-browsers/chromium-1243` (not committed).
- Built HTML compared base vs after (scripts/styles stripped): markdown/math/callout/wikilink content identical; differences only attribute order (`class`/`data-on-scope`), `&#34;`→`&quot;`, CSS ordering/minification, timestamps.

## Not verified
- Visual/pixel output (snapshot specs already fail on the base).
- Dev server (`astro dev`) behaviour; Lighthouse; Cloudflare deploy (`wrangler`).
- Fonts (network blocked).

## Risks / next steps
- **`astro preview` now daemonizes**: Playwright `webServer.command` exits early with "Process exited early" unless a preview is already running. CI/e2e need `astro preview` replaced by something foreground (e.g. `vite preview`-style/`bunx serve dist`) or a start script.
- **View transitions + `<video>`**: the fixes (7.2.1 #17603, 7.2.5 #17750, 7.3.6 #18163) are included in 7.4.5, but I did not test video playback/muted state/`transition:persist` in a browser; test with muted autoplay videos across ClientRouter navigations in Chrome and Safari.
- `compressHTML: true` pin hides the new jsx default; decide deliberately later.
- astro-pagefind 1.8.6 peer range excludes Astro 7; migrate to 2.x (new component UI, rewrite `search.spec.ts` selectors, remove dev-fallback selector) as a separate step.
- `@astrojs/mdx` 8 peers on `@astrojs/markdown-satteri`; not installed, build unaffected.
