# ADR 0001 — Monorepo: Bun Workspaces

## Status
Accepted — Phase 0

## Context

The site is structured as a monorepo with two packages:
- `packages/site/` — the Astro app
- `packages/specs/` — specs, plans, and ADRs

A workspace manager must handle:
1. Hoisting shared dev deps (TypeScript, Biome, etc.) to the root `node_modules/`.
2. Cross-package script invocation (e.g., `bun run --cwd packages/site build`).
3. Lockfile management (single `bun.lock` at workspace root).
4. Fast installs (CI performance matters).

The authoritative research doc (`2026-04-25-general-plan`) was written assuming **pnpm**. The
project standardized on **Bun** as the unified runtime + package manager to reduce toolchain
surface area (one tool for runtime, bundling, test runner, and package management).

TypeScript ^6 compatibility with Bun's permissive peer resolution was verified at spec revision
round 2 (Task 1 commit `125d07f`, spec line 81). Despite `@astrojs/check@^0.9` declaring a
stale `^5` peer for TypeScript, Bun's workspace hoisting resolves TypeScript ^6 correctly.

Bun workspaces use the same `workspaces` field in `package.json` as pnpm/yarn/npm workspaces:
```jsonc
{ "workspaces": ["packages/*"] }
```
Source: bun.sh/docs/install/workspaces

## Decision

Use **Bun workspaces** (Bun ≥ 1.2, text `bun.lock` format) for the monorepo. pnpm, Turborepo,
and yarn workspaces are all rejected. The `bun.lock` text lockfile is committed at the workspace
root.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| pnpm workspaces | Rejected | Research doc default, but project standardizes on Bun for runtime + pkg manager unity; two tools for the same job adds friction |
| Turborepo | Rejected | Overkill for a 2-package monorepo with no pipeline parallelism needed; adds a build orchestration layer with no benefit at this scale |
| yarn workspaces | Rejected | Yarn 3+ (PnP) has known Astro incompatibilities; Yarn Classic is unmaintained |
| npm workspaces | Rejected | npm install is slower than Bun; no runtime benefits |

## Consequences

- `bun.lock` (text, Bun ≥ 1.2 format) is committed at workspace root. No `bun.lockb` binary.
- Root `package.json` declares `"workspaces": ["packages/*"]`.
- `bunfig.toml` at root configures any Bun-specific registry / install settings.
- All CI steps use `bun install --frozen-lockfile` (lockfile-frozen install for reproducibility).
- TypeScript ^6 is the pinned version; see spec line 81 for peer-resolution rationale.
- Future phases adding new `packages/*` are automatically covered by the glob pattern.
- `bun run --cwd packages/site <script>` is the canonical cross-package invocation pattern in CI.

## Sources

- bun.sh/docs/install/workspaces (Bun workspace configuration)
- packages/specs/specs/00-foundations.md line 81 (TypeScript ^6 + Bun peer resolution)
- packages/specs/specs/00-foundations.md § "Pinned dev deps"
- `2026-04-25-general-plan` § "Phase 0 — Foundations" (pnpm → bun substitution note)
