# Plan: Phase NN — <name>

## Branch
`phase/NN-<name>` cut from `main` after Phase (N-1) merge commit.

## Task list (each ≤ 5 minutes of focused work, RED→GREEN order)
Each task is one commit on the phase branch. Test stub lands first, implementation second.

1. **Task 1.** Description.
   - Test (RED): `<path>`
   - Impl: `<path>`
2. **Task 2.** Description.
   - Test (RED): `<path>`
   - Impl: `<path>`

> A plan with > ~10 tasks should be split — flag in review.

## Acceptance tests (must be GREEN before PR)
| Path | Type | Asserts |
|---|---|---|
| `packages/site/src/foo.test.ts` | unit | … |
| `packages/site/tests/integration/bar.test.ts` | integration | … |
| `packages/site/tests/e2e/baz.spec.ts` | e2e | … |

## Property tests
| Module | Invariant |
|---|---|
| … | … |

## Mutation-test targets (Stryker, nightly)
- `<path>` — expected score ≥ X%

## Bundle budgets
| Route | First-load JS | LCP image |
|---|---|---|
| `/` | … KB | … KB |

## Review checklist (paste into PR)
- [ ] `bun x biome check` clean
- [ ] `bun x prettier --check '**/*.{astro,svelte}'` clean
- [ ] `bun x astro check` clean
- [ ] `bun x type-coverage --at-least 100 --strict` passes
- [ ] `bun x knip` clean
- [ ] `bun x depcruise` rules clean
- [ ] `bun run check:docs` passes
- [ ] All Vitest unit + integration tests green
- [ ] All Playwright e2e tests green
- [ ] Axe-core passes on every new route
- [ ] Visual-regression snapshots reviewed
- [ ] `size-limit` budgets met (cite numbers)
- [ ] No new runtime dep > 10 KB gz without ADR
- [ ] No `Co-Authored-By: Claude`, no Claude Code session mentions in commits / PR / issues

## Rollback plan
- One commit per task → revertable in isolation.
- Phase merges via **merge commit** (no squash, no rebase) to preserve task history.
- If a phase regresses post-merge: `git revert -m 1 <merge-sha>` reverts the whole phase atomically.

## ADRs delivered with this phase
- `packages/specs/adrs/NNNN-<kebab-title>.md` — <decision>

## Subagent briefing (paste verbatim into every Task tool prompt)
> **Tools (priority):** `mcp__codebase-memory-mcp__*` before Grep/Glob/find; `context7` MCP for any library/SDK doc — verify even well-known APIs. **deepwiki not installed** — `gh` CLI / WebFetch instead. WebSearch for anything else uncertain. **Read `CLAUDE.md` first**, especially the `Verify-or-not` and `Disagreement protocol` sections. Outputs must be falsifiable: cite file:line + link sources. The plan doc `2026-04-25-general-plan` uses `pnpm` — substitute `bun`.
