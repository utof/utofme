# ADR 0003 — Biome + Narrow Prettier (`.astro` / `.svelte` only)

## Status
Accepted — Phase 0

## Context

The project needs both a **linter** and a **formatter** for:
- TypeScript / JavaScript / JSON / JSONC / CSS — the bulk of the codebase.
- `.astro` files — Astro component templates.
- `.svelte` files — Svelte 5 island components.

**Biome** (biomejs.dev) is a fast, unified linter + formatter for JS/TS/JSON/JSONC/CSS written
in Rust. It replaced ESLint + Prettier for those file types in the Biome 1.x era and reached
maturity for Biome 2.x. As of 2026-04-25, Biome **cannot** format `.astro` or `.svelte` files
(the Astro/Svelte parsers are not yet stable in Biome; tracked in biomejs/biome GitHub issues).

**Prettier** has stable plugins for both:
- `prettier-plugin-astro` (handles `.astro` template syntax)
- `prettier-plugin-svelte` (handles `.svelte` SFC syntax)

The CLAUDE.md mandate is explicit: "Biome for JS/TS/JSON/JSONC/CSS. Prettier only via lefthook
for `.astro`/`.svelte`. No ESLint, no broader Prettier."

Running Prettier broadly (over `.ts`, `.json` etc.) would conflict with Biome's formatter and
cause lefthook hook failures as the two tools apply different styles. Scoping Prettier strictly
to `**/*.{astro,svelte}` avoids the conflict.

## Decision

Use **Biome 2.x** for all JS/TS/JSON/JSONC/CSS formatting and linting. Use **Prettier** (with
`prettier-plugin-astro` + `prettier-plugin-svelte`) **only** for `.astro` and `.svelte` files,
invoked only inside the lefthook pre-commit `format-and-check` piped group (step 2) and in CI.
No ESLint. No broader Prettier invocation.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| ESLint + Prettier (broad) | Rejected | CLAUDE.md explicitly rejects ESLint; broad Prettier conflicts with Biome |
| Biome only (no Prettier) | Rejected | Biome cannot format `.astro` / `.svelte` as of 2026-04-25 |
| dprint | Rejected | No stable Astro or Svelte plugin available as of 2026-04-25 |
| oxc / oxlint | Considered | Maturing fast; chosen not to adopt yet because Biome provides both lint + format in one tool, reducing config surface |
| Prettier only (no Biome) | Rejected | Slower than Biome for TS/JS/JSON; would require ESLint for linting, adding back the rejected toolchain |

## Consequences

- `biome.json` configures tab indent, lineWidth 100, double quotes, `linter.rules.recommended: true`.
- `.prettierrc` (or inline Prettier config in `package.json`) is scoped to `overrides` for
  `.astro`/`.svelte` only.
- `lefthook.yml` step order: `biome-format` runs before `prettier-format` (Biome auto-fixes
  that Prettier later reformats; both must run before `astro-check`).
- CI scripts: `check:biome` (`biome check .`) and `check:prettier` (`prettier --check '**/*.{astro,svelte}'`)
  run as separate steps in the CI workflow.
- When Biome adds stable Astro/Svelte support, Prettier can be removed — this ADR should be
  revisited at that point.

## Sources

- biomejs.dev (Biome 2.x formatter/linter capabilities)
- github.com/biomejs/biome/issues (Astro/Svelte parser status tracking)
- CLAUDE.md § "Format/lint" (explicit mandate)
- packages/specs/specs/00-foundations.md § "Lefthook ordering requirement"
