# Spec: Phase NN — <name>

## Goal
One-paragraph description of the user-visible outcome of this phase.

## Context / invariants
- The site is **Astro 6.x** on **Cloudflare Workers (Assets)**, **Svelte 5 (runes)** islands.
- Output is `static` by default; SSR only where this spec explicitly notes it.
- **Bun** runtime + workspaces; **TypeScript** `strict` + `astro/tsconfigs/strictest`.
- Zero third-party network calls at runtime unless listed under "External services".

## Non-goals
Bullet list of what is explicitly out of scope for this phase. Each non-goal cites where it lives instead (later phase, deferred backlog, ADR).

## Interfaces
- File paths added / changed (predicted; the plan will refine).
- Component props / event shapes.
- URL routes added or changed.
- Public exports introduced (each must obey the docs-for-trust rule in `CLAUDE.md`).

## External services / runtime deps
- API endpoints called at build or request time (URL + auth model).
- Cloudflare bindings (KV / R2 / Durable Objects / Secrets) used.
- Third-party libraries pinned in `package.json` — name + reason + source URL.

## Success criteria (falsifiable)
- [ ] Command X produces output Y.
- [ ] Lighthouse mobile ≥ N on route Z.
- [ ] Axe-core passes on every route this phase ships.
- [ ] Visual-regression snapshots stable across re-runs.
- [ ] Bundle budget per route: `< K KB` first-load JS (declared here).
- [ ] `type-coverage --at-least 100 --strict` passes.
- [ ] `bun run check:docs` passes (every exported symbol has TSDoc with `@see` / `@issue` / `Why:`).
- [ ] Stryker mutation score ≥ M% on the modules listed under "Critical modules".

## Critical modules (mutation-tested)
List the modules that will be in Stryker's nightly run for this phase. Empty is allowed only if this phase ships no critical logic.

## Property tests (`fast-check`)
List the modules to property-test and the invariants. Empty is allowed only if no invariant exists.

## Dependencies on previous phases
- Phase X must have shipped Y.
- Branch must be cut from `main` after Phase (N-1) merge commit.

## ADRs to write
- `NNNN-<kebab-title>` — <decision>, alternatives, why.

## Open questions
Items to resolve during brainstorm phase. **Each question should fire the verify-or-not heuristic in `CLAUDE.md` before moving to plan.**

## Sources
- `2026-04-25-general-plan` § <section>
- <other URLs the spec relies on>
