# Plan: Phase 0 — Foundations

## Branch
`phase/00-foundations` cut from `main` after pre-0 scaffold. All tasks land as ordered commits. Phase merges via merge-commit (no squash, no rebase) and is tagged `phase-0` on the merge SHA.

## Task list

Each task is one commit, RED→GREEN **within the same commit** (failing test stub → implementation → green tests → commit). **Hard cap: 30 min focused work per task.** Phase 0 is large foundationally; 13 tasks reflects splits flagged in plan-review (Tasks 5 and 10).

### Task 1 — Astro 6 scaffold + strictest TS

- **RED:** `packages/site/tests/unit/scaffold.test.ts` asserts `import.meta.env.BASE_URL === '/'`. Fails until Vitest + Astro env wired.
- **Impl:**
  - `cd packages/site && bun init -y` → add `bun add -D astro@^6 @astrojs/svelte@^7 svelte@^5`.
  - `astro.config.mjs`: `export default defineConfig({ output: 'static' })`.
  - `tsconfig.json`: `extends: "astro/tsconfigs/strictest"`, plus `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
  - `src/env.d.ts` with Astro client reference.
  - Stub `src/pages/index.astro` rendering `<h1>utofme</h1>`.
  - `package.json` scripts: `dev`, `build`, `preview`, `astro`.
- **GREEN:** `bun run build` produces `dist/index.html`; `bun x astro check` exits 0.

### Task 2 — Biome + Prettier (narrow) + lefthook piped group

- **RED:** `tests/unit/tooling.test.ts` parses `biome.json` and `lefthook.yml` (via `js-yaml`), asserts `pre-commit.jobs[0].group.piped === true`.
- **Impl:**
  - `bun add -D @biomejs/biome prettier prettier-plugin-astro prettier-plugin-svelte lefthook js-yaml @types/js-yaml`.
  - `biome.json`: tab indent, lineWidth 100, double quotes, `linter.rules.recommended: true`.
  - `lefthook.yml` at root using `pre-commit.jobs[0].group: { piped: true, jobs: [...] }` per [evilmartians/lefthook configuration](https://github.com/evilmartians/lefthook/blob/master/docs/configuration.md). Order matches CLAUDE.md § Precommit.
  - `bun x lefthook install`.
- **GREEN:** `bun x biome check .` exits 0; `bun x prettier --check '**/*.{astro,svelte}'` exits 0; manual `git commit -m test` triggers ordered hook chain.

### Task 3 — type-coverage + knip + dep-cruiser (resolve OQ #3 at start)

- **At task start:** `context7` query on `type-coverage` for Bun support. Decide `bun x type-coverage` vs `node ./node_modules/.bin/type-coverage`. Pin choice in commit message; if Node fallback needed, lefthook step uses `node`.
- **RED:** `tests/unit/type-coverage.test.ts` invokes the chosen CLI via `child_process.execSync`, expects exit 0; same shape for `tests/unit/knip.test.ts` and `tests/unit/depcruise.test.ts`.
- **Impl:**
  - `bun add -D type-coverage knip dependency-cruiser`.
  - `package.json`: `"typeCoverage": { "atLeast": 100, "strict": true }`.
  - `knip.json`: `entry: ["src/pages/**/*.astro"]`, `project: ["src/**/*.{ts,astro,svelte}"]` (does **not** include `tests/`).
  - `.dependency-cruiser.cjs` rules: no orphans, no circular, no `mdx → pages` import (placeholder).
- **GREEN:** all three CLIs exit 0 on stub source.

### Task 4 — ts-morph `check:docs` (fixture-based RED, `--root` flag)

- **At task start:** confirm ts-morph current API at context7 (`ExportedDeclarations`, `getJsDocs()`).
- **RED:** `tests/unit/check-docs.test.ts` writes a tmp fixture at `tests/fixtures/check-docs/missing.ts` exporting an undocumented `foo()`; runs `bun run check:docs --root tests/fixtures/check-docs`; expects exit 1 + stderr matching `/foo/`. The fixture lives **outside** the `knip.json` `project` glob and outside `dependency-cruiser`'s `packages/site/src` scan, so it can't trip Task 3 gates.
- **Impl:**
  - `bun add -D ts-morph`.
  - `packages/site/scripts/check-docs.ts`: walk `<root>/**/*.ts`, find every `ExportedDeclarations`, assert TSDoc contains `@see`, `@issue`, OR a line matching `/^\s*\*?\s*Why:/`. Default `--root = src`. Exit 1 listing offenders. **TSDoc on the script itself** with `Why:` linking to CLAUDE.md § "Documentation-for-trust".
  - `package.json` script: `"check:docs": "bun run scripts/check-docs.ts"`.
  - Append to lefthook piped group as final step.
- **GREEN:** test passes; `bun run check:docs` exits 0 on `src/` (Phase 0 ships zero exported symbols).

### Task 5a — Vitest + happy-dom smoke

- **RED:** `tests/unit/smoke.test.ts` asserting `1 + 1 === 2`. Fails until vitest installed + configured.
- **Impl:**
  - `bun add -D vitest @vitest/coverage-v8 happy-dom`.
  - `vitest.config.ts`: `test: { environment: 'happy-dom', coverage: { provider: 'v8', reporter: ['text', 'lcov'] } }`.
  - `package.json` script: `"test": "vitest run"`.
- **GREEN:** `bun x vitest run` green.

### Task 5b — Playwright + Axe + landing e2e + browser pin

- **At task start:** verify `toHaveScreenshot({ mask: Locator[] })` API in current Playwright via context7.
- **RED:** `tests/e2e/landing.spec.ts` with three asserts: (i) HTTP 200 on `/` via `page.goto('/')` and check `response.status()`; (ii) `await new AxeBuilder({ page }).analyze()` returns `violations.length === 0`; (iii) `await expect(page).toHaveTitle(/utofme/)`. Fails until preview server + page exist.
- **Impl:**
  - `bun add -D @playwright/test @axe-core/playwright`.
  - `playwright.config.ts`: pin `use: { channel: 'chromium' }`, `projects: [{ name: 'chromium-mobile', use: { ...devices['Pixel 5'] } }]`, `webServer: { command: 'bun run preview', url: 'http://localhost:4321' }`.
  - CI installs browser: `npx playwright install --with-deps chromium`.
- **GREEN:** Playwright + Axe e2e green on built preview.

### Task 5c — Visual-regression baseline (corrected mask region)

- **RED:** `tests/e2e/landing.spec.ts` extended with `await expect(page).toHaveScreenshot('landing.png', { maxDiffPixelRatio: 0.001, mask: [page.locator('[data-test="typography-specimen"]')] })`. Mask scopes the typography specimen container (Task 9 will tag it), which absorbs subpixel font-rendering drift across browser patches. Fails until baseline committed.
- **Impl:** generate baseline via `bun x playwright test --update-snapshots` once locally; commit `tests/e2e/landing.spec.ts-snapshots/landing-chromium-mobile.png`.
- **GREEN:** snapshot stable across two CI runs.

### Task 6 — size-limit (0 KB JS hard fail) + post-build glob

- **RED:** `tests/unit/no-js.test.ts` runs `execSync('bun run build')` in `beforeAll`, then asserts `Array.from(new Bun.Glob('dist/_astro/*.js').scanSync({ cwd: 'packages/site' })).length === 0`. Without size-limit installed and without the glob check, RED is real (build will produce JS for Astro 6 default if islands present).
- **Impl:**
  - `bun add -D size-limit @size-limit/preset-app @size-limit/file`.
  - `.size-limit.cjs`: `[{ name: 'home css+html', path: 'dist/index.html', limit: '30 KB', gzip: true }, { name: 'home js', path: 'dist/_astro/*.js', limit: '0 KB' }]`.
  - `scripts/no-js-check.ts` (TSDoc with `Why:` linking ADR 0006): `Bun.Glob` + exit 1 if non-empty. Emits the offending paths to stderr.
- **GREEN:** `bun x size-limit` exits 0 AND `bun run scripts/no-js-check.ts` exits 0.

### Task 7 — `@lhci/cli` + lighthouserc (no Playwright duplicate)

- **At task start:** verify `@lhci/cli` requires Node host (vs running under Bun) at context7.
- **RED:** delete any prior `lighthouse.spec.ts` if present (was a duplicate gate). New RED is the CI-side: `lighthouserc.cjs` missing → CI step `npx lhci autorun` fails. No Vitest spec for this; CI exit code is the gate.
- **Impl:**
  - `bun add -D @lhci/cli`.
  - `lighthouserc.cjs`: `module.exports = { ci: { collect: { staticDistDir: 'packages/site/dist', settings: { preset: 'desktop' } }, assert: { assertions: { 'categories:performance': ['error', { minScore: 0.95 }] } } } };`.
  - CI invokes `npx lhci autorun` (Node host explicit) after `bun run build`.
- **GREEN:** `npx lhci autorun` exits 0 with mobile Performance ≥ 95.

### Task 8 — Design tokens + Astro Fonts API + OFL mono fallback

- **At task start:** verify Astro Fonts API `weights` shape AND local-provider `options.variants[].weight` numeric-vs-string semantics at context7. Plan reviewer confirmed: variable = string range `"100 900"`, static = numeric `400`.
- **RED:** `tests/e2e/typography.spec.ts`: (i) computed style of `body` references `--font-sans`, of `h1` references `--font-serif`, of `<code>` references `--font-mono`; (ii) `<link rel="preload" as="font">` exists for the OFL mono; (iii) `await page.evaluate(async () => { const t0 = performance.now(); await document.fonts.ready; return performance.now() - t0; })` returns `< 200`; (iv) `page.request.fetch(<mono-url>)` response header `cache-control` includes `max-age=31536000` and `immutable`.
- **Impl:**
  - `src/styles/tokens.css` — CSS custom properties (colors, spacing scale, type scale, radii, shadow, motion durations).
  - `astro.config.mjs` Fonts API:
    ```js
    import { fontProviders } from 'astro/config';
    fonts: [
      { provider: fontProviders.fontsource(), name: 'Fraunces', cssVariable: '--font-serif',
        weights: ['100 900'], styles: ['normal'], subsets: ['latin'] },
      { provider: fontProviders.fontsource(), name: 'Geist', cssVariable: '--font-sans',
        weights: ['100 900'], styles: ['normal'], subsets: ['latin'] },
      { provider: fontProviders.local(), name: 'CommitMono', cssVariable: '--font-mono',
        options: { variants: [
          { src: ['./public/fonts/CommitMono-400.woff2'], weight: 400, style: 'normal' }
        ] } },
    ];
    ```
  - Drop Commit Mono v1 OFL `.woff2` (≤ 70 KB) into `public/fonts/CommitMono-400.woff2`; bundle `public/fonts/OFL.txt`.
- **GREEN:** all four typography asserts pass.

### Task 9 — Layout primitives + landing page

- **RED:** `tests/e2e/landing.spec.ts` extended: assert each of `<Stack>`, `<Cluster>`, `<Grid>`, `<Frame>` renders with the expected ARIA role / `data-component` attribute and that `index.astro` contains a `[data-test="typography-specimen"]` container demonstrating all three faces.
- **Impl:**
  - `src/components/{Stack,Cluster,Grid,Frame}.astro` — pure CSS Grid / Flex wrappers consuming `--space-*` tokens. Each carries TSDoc with a `Why:` line stating the design choice (no ADR ref — these are taste-level primitives).
  - `src/pages/index.astro` — typography specimen using all primitives, with `[data-test="typography-specimen"]` outer wrapper for the visual-regression mask.
- **GREEN:** all extended landing asserts + visual-regression baseline (Task 5c re-confirmed).

### Task 10a — `wrangler.jsonc` + ADRs 0002, 0004

- **At task start:** verify `assets.binding`, `assets.directory`, `not_found_handling` keys at context7 (`/cloudflare/workers-sdk`).
- **RED:** `tests/unit/wrangler-config.test.ts` parses `wrangler.jsonc`, asserts (i) no top-level `main` key (omit, not `null`), (ii) `assets.directory === './dist'`, (iii) `assets.not_found_handling === '404-page'`.
- **Impl:**
  - `wrangler.jsonc`: `{ "name": "utofme", "compatibility_date": "2026-04-01", "assets": { "directory": "./dist", "binding": "ASSETS", "not_found_handling": "404-page" } }`. **No `main` key.**
  - Write `packages/specs/adrs/0002-cloudflare-workers-no-adapter-for-static.md` and `0004-static-output-default.md`.
- **GREEN:** unit test passes.

### Task 10b — CI workflow (resolve OQ #4)

- **At task start:** verify `oven-sh/setup-bun@v2` `cache: true` caches `bun.lock` (text), and that pairing with `actions/setup-node@v4` works without conflict — context7 / GH releases.
- **RED:** `.github/workflows/ci.yml` missing → CI absent → no run on PR. Verified by `actionlint` (one-off CLI check, not a Vitest spec).
- **Impl:** `.github/workflows/ci.yml`:
  - `actions/checkout@v4`
  - `oven-sh/setup-bun@v2` with `cache: true`
  - `actions/setup-node@v4` with `node-version: '22'` (for LHCI + npx playwright)
  - `bun install --frozen-lockfile`
  - `bun run --cwd packages/site check:biome`
  - `bun run --cwd packages/site check:prettier`
  - `bun run --cwd packages/site check:astro`
  - `bun run --cwd packages/site check:type-coverage`
  - `bun run --cwd packages/site check:knip`
  - `bun run --cwd packages/site check:depcruise`
  - `bun run --cwd packages/site check:docs`
  - `bun x vitest run --coverage`
  - `npx playwright install --with-deps chromium`
  - `bun x playwright test`
  - `bun run build`
  - `bun x size-limit`
  - `bun run scripts/no-js-check.ts`
  - `npx lhci autorun`
- **GREEN:** PR CI run is green.

### Task 10c — Deploy workflow + ADR 0005

- **At task start:** verify `cloudflare/wrangler-action@v3` token-scope requirements at context7.
- **RED:** `.github/workflows/deploy.yml` missing → no deploy on merge.
- **Impl:**
  - `.github/workflows/deploy.yml`: trigger `push: branches: [main]`. Steps: checkout → setup-bun + setup-node → install → build → `cloudflare/wrangler-action@v3` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}` and `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `command: deploy --config packages/site/wrangler.jsonc`.
  - Write `packages/specs/adrs/0005-mono-font-fallback-ofl-only.md`.
- **GREEN:** push to `main` deploys to `*.workers.dev` with HTTP 200 in <2 min.

### Task 10d — Remaining ADRs (0001, 0003, 0006)

- **RED:** spec ADR list not all present. `tests/unit/adr-completeness.test.ts` parses `packages/specs/adrs/` and asserts six `0001-…0006-` files exist.
- **Impl:** write `0001-monorepo-bun-workspaces.md`, `0003-biome-plus-narrow-prettier.md`, `0006-defer-stryker-and-fast-check-to-phase-1.md` per ADR skeleton (Context · Decision · Alternatives · Consequences · Sources).
- **GREEN:** completeness test passes.

## Acceptance tests (gates for PR)

| Path | Type | Asserts |
|---|---|---|
| `tests/unit/smoke.test.ts` | unit | Vitest harness wired (Phase 1 will be the first phase to add real Vitest tests) |
| `tests/e2e/landing.spec.ts` | e2e | landing renders + Axe + status 200 + visual-regression |
| `tests/e2e/typography.spec.ts` | e2e | three faces wired (font-family cascade includes Fraunces / Geist / Commit Mono) + fonts.ready < 200 ms + preload link present (woff2 immutable cache-header asserted in production only — see spec § Success criteria) |
| `tests/e2e/primitives.spec.ts` | e2e | Stack / Cluster / Grid / Frame each render with `[data-component]` attribute |

### Plan-amendment rationale (Task 10 final polish)

The earlier draft of this table listed 10 unit-test files (scaffold, tooling, type-coverage, knip, depcruise, check-docs, no-js, wrangler-config, adr-completeness, smoke). All except smoke were comment-only RED stubs that, if activated, would only shell out via `child_process.execSync` to a CLI gate already wired into lefthook + CI:

- `check:biome`, `check:prettier`, `check:astro`, `check:type-coverage`, `check:knip`, `check:depcruise`, `check:docs` — each runs in lefthook and on every CI commit.
- `check:no-js`, `check:size`, `check:lighthouse` — post-build gates in CI.
- The wrangler / ADR-completeness assertions are static config / file-list checks; `wrangler validate` (when wrangler is installed) and the existing ADR review process cover these.

Wrapping each gate in a Vitest stub that asserts `execSync(cli).status === 0` adds no signal — when the CLI fails the stub fails, when the CLI passes the stub passes; the CLI is the source of truth in both cases. Phase 0 final polish therefore deletes the 9 stubs and trims `vitest.config.ts:exclude` to the e2e directory only. `smoke.test.ts` retains the harness so Phase 1 can land Vitest unit tests for actual application logic (content-collection loaders, URL filter, backlink builder, Zod schemas) without re-bootstrapping the runner.

The `tests/e2e/primitives.spec.ts` row was added in Task 9 (layout primitives) and was missing from the original table.

## Property tests
N/A (per spec + ADR 0006).

## Mutation tests
N/A (per spec + ADR 0006).

## Bundle budgets

| Route | First-load JS | CSS+HTML gzip | LCP image |
|---|---|---|---|
| `/` | **0 KB hard fail** | ≤ 30 KB | n/a |

## Review checklist (paste into PR)

- [ ] `bun x biome check .` clean
- [ ] `bun x prettier --check '**/*.{astro,svelte}'` clean
- [ ] `bun x astro check` clean
- [ ] `bun x type-coverage --at-least 100 --strict` passes
- [ ] `bun x knip` clean
- [ ] `bun x depcruise --validate` clean
- [ ] `bun run check:docs` passes
- [ ] All Vitest unit tests green
- [ ] All Playwright e2e tests green (chromium pinned)
- [ ] `@axe-core/playwright` zero violations
- [ ] Visual-regression snapshots stable
- [ ] `bun x size-limit` 0 KB JS / ≤ 30 KB CSS+HTML met
- [ ] `bun run scripts/no-js-check.ts` exits 0
- [ ] `npx lhci autorun` Performance ≥ 95 mobile
- [ ] `wrangler deploy` previews `*.workers.dev` with HTTP 200
- [ ] No new runtime dep > 10 KB gz without ADR
- [ ] No `Co-Authored-By: Claude` / no Claude Code session mentions
- [ ] All six ADRs land under `packages/specs/adrs/`
- [ ] Phase merges via merge commit (not squash, not rebase); `phase-0` tag on merge SHA

## Rollback plan

- One commit per task → revertable in isolation.
- Phase merges via merge commit. Post-merge regression: `git revert -m 1 <merge-sha>` reverts the whole phase atomically. Cloudflare auto-redeploys `main` on push (deploy.yml trigger) — no `wrangler rollback` needed unless `main` HEAD push is deferred.

## ADRs delivered

- `0001-monorepo-bun-workspaces.md`
- `0002-cloudflare-workers-no-adapter-for-static.md`
- `0003-biome-plus-narrow-prettier.md`
- `0004-static-output-default.md`
- `0005-mono-font-fallback-ofl-only.md`
- `0006-defer-stryker-and-fast-check-to-phase-1.md`

## Subagent briefing (paste verbatim into every Task tool prompt)

> **Tools (priority):** `mcp__codebase-memory-mcp__*` before Grep/Glob/find; `context7` MCP for any library/SDK doc — verify even well-known APIs. **deepwiki not installed** — `gh` CLI / WebFetch instead. WebSearch for anything else uncertain. **Read `CLAUDE.md` first**, especially "Verify-or-not", "Disagreement protocol", "Inline-fix gate", and review-round cap = 1. Plan doc `2026-04-25-general-plan` uses `pnpm` — substitute `bun`. Outputs must be falsifiable: cite file:line + URL. Tag findings as **blocker** vs **nit**. Any library or config-key the spec or this plan references must be verified via context7 before you write the line that uses it. RED test must actually fail before impl lands — no spurious-RED. Never modify files outside the current task's scope.
