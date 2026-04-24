# Spec: Phase 0 — Foundations

## Goal
A deployable, typed, tested Astro 6 skeleton with the design-system tokens and layout primitives wired up, on Cloudflare Workers (with Assets). One styled landing page rendering all three typefaces. CI green, Lighthouse mobile ≥ 95, free-tier-friendly. Every later phase branches from the merge commit of this phase.

## Context / invariants
- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**, **Svelte 5 (runes)** islands.
- Output is `static`. SSR is not introduced in Phase 0. **No Astro Cloudflare adapter is needed** for fully-static output (verified: docs.astro.build/en/guides/integrations-guide/cloudflare/ — *"If you're using Astro as a static site builder, you don't need an adapter"*). Adapter ships in Phase 4 alongside SSR `/stats`.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12** (Astro 6 requirement; some tools shell out to Node, including `@lhci/cli`).
- Lockfile: `bun.lock` (text, Bun ≥ 1.2 default), **not** binary `bun.lockb`. Committed.
- TypeScript `strict` + `astro/tsconfigs/strictest`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (via lefthook only) for `.astro` / `.svelte`.
- Zero third-party network calls at runtime; build-time downloads (fonts) allowed.
- **Foot-gun invariant: Berkeley Mono `.woff2` MUST NOT be committed.** Phase 0 ships an OFL fallback only (Commit Mono / Ioskeley Mono). Berkeley Mono v2 web licence is a separate, deferred decision.
- **Free-tier budget (Cloudflare Workers):** 100k requests/day, 10 ms CPU per request, unlimited static-asset egress. Static-only Phase 0 trivially fits; later phases re-validate.

## Non-goals
- **No content pipeline** — `src/content/`, MDX, schemas. → Phase 1.
- **No hydrated islands.** Svelte integration installed; no `client:*` directive ships. → Phase 2.
- **No SSR routes.** No `/stats`, no API endpoints, no Cloudflare adapter. → Phase 4.
- **No webmentions, RSS, sitemap.** → Phase 6.
- **No grain overlay, no view transitions.** → Phase 4 / 7. Grain-overlay PNG-vs-`feTurbulence` ADR moves with grain itself to Phase 4.
- **Layout primitives are IN Phase 0** (decided here): `<Stack>`, `<Cluster>`, `<Grid>`, `<Frame>` ship as `.astro` components. Phase 1 needs them.

## Interfaces

### Top-level paths added
- `packages/site/` — Astro app (config, public assets, src, tests, scripts).
- `packages/specs/adrs/` — ADRs for this phase (see "ADRs to write").
- `.github/workflows/` — `ci.yml` and `deploy.yml`.

> Plan-write resolves the exact tree. Spec only fixes *must-exist* surface.

### Must-exist files (because later phases or success criteria reference them)
- `packages/site/astro.config.mjs`
- `packages/site/tsconfig.json` (`extends: "astro/tsconfigs/strictest"`)
- `packages/site/biome.json`
- `packages/site/wrangler.jsonc`
- `packages/site/lefthook.yml`
- `packages/site/package.json`
- `packages/site/scripts/check-docs.ts` (ts-morph TSDoc enforcement)
- `packages/site/src/styles/tokens.css`
- `packages/site/src/components/{Stack,Cluster,Grid,Frame}.astro`
- `packages/site/src/pages/index.astro`
- `packages/site/tests/e2e/landing.spec.ts`

### Lefthook ordering requirement
The `pre-commit` hook must use a **piped job group** (`group: { piped: true, jobs: [...] }`) — verified syntax in lefthook docs (context7 `/evilmartians/lefthook`). The seven steps in CLAUDE.md § "Precommit" are order-dependent (Biome auto-fixes that Prettier later reformats; both run before astro-check). Plan must enforce this; flat `commands:` map is rejected.

### `size-limit` budget for Phase 0 (definitive)
Phase 0 hydrates **zero** islands. Budget:
- **JS first-load on `/`: 0 KB hard fail** — implemented as a custom `size-limit` config entry plus a `bun -e` post-build glob check that asserts `dist/_astro/*.js` is empty (preset-app alone cannot gate "absence of files").
- **CSS + HTML transfer-size on `/`: ≤ 30 KB** gzipped (covers tokens, layout primitives, font CSS, font preload links).

### Public exports introduced
None. Layout primitives are `.astro` components consumed inside `packages/site/src/`. Every file added still obeys the docs-for-trust rule on creation.

## External services / runtime deps

### Pinned production deps (versions resolved at plan-write)
- `astro` ^6
- `@astrojs/svelte` ^7 (installed; not used in Phase 0)
- `svelte` ^5 (transitive; not used in Phase 0)

> **No `@astrojs/cloudflare` in Phase 0.** Static output ships directly to Workers Assets via `wrangler deploy`. Adapter re-added in Phase 4.

### Pinned dev deps
- `wrangler` (latest stable)
- `@biomejs/biome`
- `prettier`, `prettier-plugin-astro`, `prettier-plugin-svelte`
- `lefthook`
- `vitest`, `@vitest/coverage-v8`, `happy-dom`
- `@playwright/test` (browser version pinned in `playwright.config.ts` and in CI)
- `@axe-core/playwright`
- `size-limit`, `@size-limit/preset-app`
- `type-coverage`
- `knip`
- `dependency-cruiser`
- `ts-morph`
- `@lhci/cli` (Lighthouse CI; spawns Node)
- `typescript` ^5

### Cloudflare bindings
- None in Phase 0. Workers serves static assets via the Assets feature.
- User must `wrangler login` (queued in `progress.md`).

### Build-time external fetches
- Astro Fonts API downloads Fraunces + Geist via `fontsource` provider during `bun run build`. Cached after first build.

## Success criteria (falsifiable)
- [ ] `bun install` resolves cleanly with `bun.lock` (text) committed.
- [ ] `bun run dev` serves `/` on `localhost:4321` with no console errors.
- [ ] `bun run build` produces `packages/site/dist/` containing `index.html` and **no `.js` chunks under `dist/_astro/`**.
- [ ] `bun run preview` (`wrangler dev` against built `dist/`) returns HTTP 200 for `/` with `Content-Type: text/html`.
- [ ] `bun run deploy` (or merge-to-main GH Action) makes a `*.workers.dev` URL return HTTP 200 within 2 min.
- [ ] `bun x biome check .` exits 0.
- [ ] `bun x prettier --check '**/*.{astro,svelte}'` exits 0.
- [ ] `bun x astro check` exits 0.
- [ ] `bun x type-coverage --at-least 100 --strict` exits 0.
- [ ] `bun x knip` reports zero unused.
- [ ] `bun x depcruise --validate .dependency-cruiser.cjs packages/site/src` exits 0.
- [ ] `bun run check:docs` exits 0 (no exported symbols in Phase 0; trivially passes).
- [ ] `bun x size-limit` reports **0 KB JS** for `/` (custom config + post-build glob), **CSS+HTML ≤ 30 KB** gzipped.
- [ ] `bun x vitest run` shows ≥ 1 green smoke test.
- [ ] `bun x playwright test` shows ≥ 1 green e2e test on built preview, **with browser version pinned** (Playwright `chromium` channel locked in `playwright.config.ts`; CI uses `npx playwright install --with-deps chromium`).
- [ ] `@axe-core/playwright` passes on `/` with **zero violations**.
- [ ] **Visual-regression**: Playwright `expect(page).toHaveScreenshot(…, { maxDiffPixelRatio: 0.001 })` on `/` is stable across two CI jobs run on different commits with no source change in `src/styles/`, `src/pages/index.astro`, or `src/components/{Stack,Cluster,Grid,Frame}.astro`. Fonts region is masked (`mask: [page.locator('h1')]`) to absorb subpixel rendering drift across browser patches.
- [ ] `document.fonts.ready` resolves within 200 ms on built preview.
- [ ] Self-hosted mono `.woff2` returns `Cache-Control: public, max-age=31536000, immutable` from Workers Assets.
- [ ] Lighthouse mobile ≥ 95 (Performance) on `/` — measured by **`@lhci/cli` (`lhci autorun`)** against built preview in CI. **LHCI spawns Node**, so the CI job uses `oven-sh/setup-bun@v2` AND `actions/setup-node@v4` together; LHCI invocation is `npx lhci autorun` (not `bunx`) to keep the Node host explicit.
- [ ] CI workflow runs all of the above on every PR.
- [ ] `git push origin phase/00-foundations` → PR opened → CI green → **merge commit** (no squash, no rebase) into `main` → `phase-0` tag on the merge SHA → `*.workers.dev` redeploys.

## Critical modules (mutation-tested)
None. Stryker is **not installed in Phase 0**; deferred to Phase 1 (ADR 0006).

## Property tests (`fast-check`)
None. **Not installed in Phase 0**; deferred to Phase 1 (ADR 0006).

## Dependencies on previous phases
- None. Phase 0 is first.
- Pre-0 scaffold (git init, root `package.json`, `bunfig.toml`, `.gitignore`, README, LICENSE, spec/plan templates) already on `main`.

## ADRs to write (delivered with this phase)
- `0001-monorepo-bun-workspaces` — Bun workspaces over pnpm/turbo.
- `0002-cloudflare-workers-no-adapter-for-static` — Workers + Assets is the supported path; for `output: 'static'` no `@astrojs/cloudflare` adapter is needed (it returns in Phase 4 with SSR). Compares Workers vs Vercel Hobby (commercial-use prohibited) vs Netlify (credit-based pricing).
- `0003-biome-plus-narrow-prettier` — Biome can't format `.astro` / `.svelte`; Prettier scoped only to those.
- `0004-static-output-default` — `output: 'static'` keeps free-tier-cheap; SSR added per-route in later phases.
- `0005-mono-font-fallback-ofl-only` — ship with Commit Mono / Ioskeley Mono OFL fallback for Phase 0; commercial Berkeley Mono out of scope.
- `0006-defer-stryker-and-fast-check-to-phase-1` — neither is useful in Phase 0 (no logic, no invariants); installing them now would inflate `knip` / dep-cruiser noise.

## Open questions (each FIRES the verify-or-not rule before plan-write)
1. **Astro Fonts API — `weights` value shape per font.** For Fraunces (variable, opsz+wght) and Geist (variable, wght 100–900) the canonical form is the string-range entry `"100 900"`. Confirm against current `astro/zod` schema for the Fonts API. Variable-font axes (opsz, SOFT, WONK) are exposed via CSS `font-variation-settings`, **not** a config option. For local-provider, variants live under `options.variants`, not at the family level.
2. **`wrangler.jsonc` shape for static-assets** — `assets.directory`, `assets.binding`, `not_found_handling: "404-page"`. Verify `html_handling` key name and pinned `compatibility_date` accepted by current Wrangler.
3. **`type-coverage` Bun compatibility** — tool was Node-first; verify it runs cleanly under `bun x` in CI without a Node bridge, or fall back to `node` directly inside the lefthook step.
4. **`oven-sh/setup-bun` + `bun.lock` cache** — confirm the action caches `bun.lock` (text) cleanly on GH Actions, and the `actions/setup-node@v4` companion (needed for LHCI) doesn't conflict.
5. **GH Actions deploy with Wrangler** — `cloudflare/wrangler-action@v3` vs raw `wrangler deploy` step; pick one and verify token-scope (`Workers Scripts:Edit`, `Account:Read`).

## Sources
- `2026-04-25-general-plan` § "Phase 0 — Foundations" (lines 61–170).
- `2026-04-25-general-plan` § Decisions (lines 22–33), § Risks (lines 686–698).
- docs.astro.build/en/guides/integrations-guide/cloudflare/ (verified 2026-04-25): adapter not needed for `output: 'static'`.
- All five Open Questions above must end with a context7 / WebFetch citation in the **plan doc**.

## Reviewer briefing (paste verbatim into the plan-review Task prompt)
> This is the plan for Phase 0 of the utofme project. **Read `CLAUDE.md` first** ("Verify-or-not", "Disagreement protocol", "Inline-fix gate", review-round cap = 1). Use `mcp__codebase-memory-mcp__*` before Grep/Glob; `context7` MCP for any library/API doc; WebFetch / WebSearch / `gh` for everything else uncertain. Plan doc `2026-04-25-general-plan` uses `pnpm` — substitute `bun`. Output must be falsifiable: cite file:line + URL. Tag findings as **blocker** vs **nit**. Apply the inline-fix gate from `CLAUDE.md`.
