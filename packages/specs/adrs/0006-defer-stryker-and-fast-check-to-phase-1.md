# ADR 0006 — Defer Stryker Mutation Tests and fast-check Property Tests to Phase 1

## Status
Accepted — Phase 0

## Context

CLAUDE.md mandates:
- **Stryker mutation tests** on critical modules: content-collection loaders, URL filter logic,
  backlink builder, all Zod schemas. Run nightly in CI, not pre-commit.
- **fast-check property tests** on: URL filter round-trip, wikilink resolver, backlink inverter,
  every Zod schema's `parse`/`safeParse`.

Both tools are powerful correctness tools for logic-heavy modules. However, **Phase 0 ships no
logic-heavy modules**:
- No content collections — no loaders, no Zod schemas.
- No URL filter — not introduced until Phase 1 (wikilink resolver, backlink builder).
- No Zod schemas — none in Phase 0.
- No invariants meaningful to property-test beyond `1 + 1 === 2` (the smoke test).

The spec explicitly lists under § "Critical modules": "None. Stryker is **not installed in Phase 0**;
deferred to Phase 1 (ADR 0006)." And under § "Property tests": "None. **Not installed in Phase 0**;
deferred to Phase 1 (ADR 0006)."

Installing Stryker and fast-check in Phase 0 would:
1. Add unused dependencies that cause `knip` to flag them as unused.
2. Add unused dependency graph edges that `depcruise` would need to explicitly ignore.
3. Inflate `node_modules` and CI install time with no benefit.

## Decision

**Do not install Stryker or fast-check in Phase 0.** Both are deferred to Phase 1, which
introduces the first content-collection logic, URL filter, wikilink resolver, and Zod schemas.
Phase 1's plan must:
1. Add `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` as dev deps.
2. Add `fast-check` as a dev dep.
3. Write the first property tests alongside the first invertible logic (URL filter, wikilink resolver).
4. Configure Stryker nightly CI job on the critical modules list.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| Install Stryker now, no config | Rejected | Triggers `knip` "unused dependency" gate |
| Install fast-check now, no tests | Rejected | Triggers `knip` "unused dependency" gate |
| Write dummy mutation tests | Rejected | No meaningful mutants in Phase 0 code; mutation score would be misleading |
| Write dummy property tests | Rejected | No invariants to express; inflates test suite with no value |

## Consequences

- `package.json` in Phase 0 lists neither `@stryker-mutator/*` nor `fast-check`.
- Phase 1 plan is responsible for installing and wiring both tools.
- Phase 1 spec must add Stryker nightly CI job to `.github/workflows/`.
- Until Phase 1 lands, the CLAUDE.md § "Tests every batch" section's Stryker + fast-check
  lines are acknowledged but explicitly out of scope for Phase 0.

## Sources

- packages/specs/specs/00-foundations.md § "Critical modules" (explicit deferral)
- packages/specs/specs/00-foundations.md § "Property tests" (explicit deferral)
- CLAUDE.md § "Tests every batch" (Stryker + fast-check mandate for Phase 1+)
- stryker-mutator.io (Stryker documentation)
- fast-check.dev (fast-check documentation)
