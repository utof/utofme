# ADR 0008 — Stryker + fast-check targets

## Status

Accepted — Phase 1

## Date

2026-04-26

## Context

CLAUDE.md § "Tests every batch" mandates mutation testing on content-collection loaders, URL filter
logic, backlink builder, and all Zod schemas — nightly in CI, not pre-commit. ADR 0006 explicitly
deferred both Stryker and fast-check from Phase 0 because Phase 0 shipped no logic-heavy modules.

Phase 1 introduces:

- `src/content.config.ts` — the discriminated-union `worksSchema` (Zod + `z.discriminatedUnion`),
  the first Zod schema in the project.
- `src/lib/works.ts` — `sortByDateDesc` (comparator) and `listWorks` (draft filter), the first
  query helpers.

Both modules are pure logic with no DOM or Astro runtime dependency, making them ideal Stryker
targets. Spec § "Critical modules" (line 227) lists these two files explicitly.

## Decision

- Stryker configuration at `packages/site/stryker.conf.json`; scoped Vitest config at
  `packages/site/vitest.mutation.config.ts`. The mutation config uses `mergeConfig` to inherit
  the `astro:content` alias from the base `vitest.config.ts` — without this alias Stryker's
  vitest-runner cannot resolve the import chain in `content.config.ts`.
- `environment: "node"` in the mutation config replaces `happy-dom`: mutation runs exercise pure
  logic only; DOM overhead is unnecessary and slows runs.
- Mutated files: `src/content.config.ts`, `src/lib/works.ts` only. `.astro` files are excluded
  (Stryker cannot meaningfully mutate JSX-like template syntax; logic lives in `lib/`).
- Threshold: mutation score ≥ 80% (`"break": 80`); high tier 90%, low tier 80%.
- Stryker runs nightly via `.github/workflows/mutation.yml` (cron `0 5 * * *`), separate from PR
  CI to avoid blocking on slow mutation runs. `workflow_dispatch` allows on-demand execution.
- `packageManager: "npm"` in `stryker.conf.json` — controls which tool Stryker uses for peer-dep
  auto-install, not the project's primary package manager. `npm` is the safe default; Bun ships
  an npm-compatible CLI so this is unlikely to diverge.
- Property tests via `@fast-check/vitest@^0.4` cover the 6 invariants in spec § "Property tests":
  `sortByDateDesc` idempotent / monotone / permutation; `listWorks` PROD-excludes / dev-includes /
  count-≤. Schema property tests (`worksSchema.parse` round-trip + `safeParse` failure shape)
  deferred to follow-up issue per Task 4 review (#16).

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Mutate `.astro` components | Rejected | Stryker cannot mutate JSX-like template syntax meaningfully; all logic is extracted to `lib/` |
| Run Stryker on PR CI | Rejected | Mutation runs are slow (minutes); blocking PR merge creates throughput drag. Nightly + `workflow_dispatch` gives the same coverage with no throughput cost |
| Lower threshold below 80% | Rejected | Spec L217 floor is 80%; lowering = spec deviation |
| Copy alias into mutation config instead of `mergeConfig` | Rejected | DRY violation; future alias additions to `vitest.config.ts` would silently diverge |

## Consequences

- Two new mutation targets (`src/content.config.ts`, `src/lib/works.ts`) must stay covered by
  tests in `tests/unit/`. Adding logic outside these two files requires expanding `mutate:` in
  `stryker.conf.json` OR documenting the uncovered area in a follow-up ADR.
- Nightly run means roughly one night after a merge before the first mutation report. Regressions
  will surface the next morning.
- `vitest.mutation.config.ts` must be kept in sync with `vitest.config.ts` for any new aliases
  or resolver plugins added to the base config (the `mergeConfig` strategy handles this
  automatically).

## Sources

- https://stryker-mutator.io/docs/stryker-js/configuration/ (fetched 2026-04-26)
- https://stryker-mutator.io/docs/stryker-js/vitest-runner/ (fetched 2026-04-26)
- https://github.com/dubzzz/fast-check/tree/main/packages/vitest (fetched 2026-04-26)
- packages/specs/specs/01-card-grid-mvp.md § Critical modules + § Property tests
- packages/specs/adrs/0006-defer-stryker-and-fast-check-to-phase-1.md
