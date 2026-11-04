# utofme — agent instructions

Personal site + portfolio. **Astro + Svelte 5 (runes) + Cloudflare Workers (Assets).** Static-first; SSR only for `/stats`. Authoritative research: `./2026-04-25-general-plan` (763 lines, sourced) — **note: that doc uses `pnpm` everywhere; substitute `bun` (e.g. `bun run dev`, `bun x astro check`).**

## Verify-or-not (context7 / WebSearch / WebFetch)
Cover both library choice AND named-API correctness. Don't reflex-audit.

**FIRE (any one):**
- **Spec / plan writing: verify every named API the spec references (function, component, config key, CLI flag, option name). Wrong names propagate into TDD tests for every batch on the branch.**
- Library had a SemVer-major release in the last 12 months, OR you don't know its current major.
- Library/package not in the top ~5k by ecosystem rank (npm/PyPI/crates).
- About to write `import` for a package not already used in this repo.
- Composing 2+ APIs you haven't both verified this session.
- Two sampled drafts disagree on an API name, signature, or option key.
- Plan doc cites a third-party blog / HN / tutorial for the API in question.

**SKIP:**
- Symbol appears verbatim in repo source under cwd → read it.
- A prior tool call this session already returned the exact symbol/signature.
- Language/runtime feature stable 2+ years (TS strict flags, Bun built-ins, ECMAScript stable).
- Next step is `bun run` / typecheck / test AND surface is small (one function call) — let the compiler be the oracle.

**NEVER** gate on self-rated confidence — verbalised probabilities are uncalibrated (Xiong ICLR 2024).

Source: `docs/2026-04-25-verify-trigger-research.md`.

## Stack
- **Bun** (runtime + pkg mgr + workspaces). Monorepo:
  ```
  utofme/
    package.json (root, "workspaces": ["packages/*"])
    bunfig.toml
    packages/site/   ← Astro app
    packages/specs/  ← specs/ plans/ adrs/
    CLAUDE.md  README.md  LICENSE  .gitignore
  ```
- **TS:** `strict: true` + `extends: "astro/tsconfigs/strictest"`. CI: `type-coverage --at-least 100 --strict`. No `any`, no `@ts-ignore` without linked issue. `@ts-expect-error` must cite issue.
- **Library version policy:** latest stable major is the default — "latest is coolest". Fall back only when a verified, cited incompatibility forces it (peer-dep break, ecosystem lag, security advisory). Spec amendments to a pinned version must cite the reason.
- **Format/lint:** **Biome** for JS/TS/JSON/JSONC/CSS. **Prettier** only via lefthook for `.astro`/`.svelte`. No ESLint, no broader Prettier.

## Precommit (lefthook · order matters)
1. `bun x biome check --write`
2. `bun x prettier --write '**/*.{astro,svelte}'`
3. `bun x astro check`
4. `bun x type-coverage --at-least 100 --strict`
5. `bun x knip` (dead code / unused deps / unused exports)
6. `bun x depcruise --config .dependency-cruiser.cjs packages/site/src`
7. `bun run check:docs` — ts-morph asserts every exported symbol has TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line.

## Tests every batch
Vitest unit + integration (happy-dom) + Playwright e2e + Axe-core on every route + visual-regression snapshots + `size-limit` per-route budgets (declared in that phase's spec).
- **fast-check property tests on:** URL filter round-trip, wikilink resolver, backlink inverter, every Zod schema's `parse`/`safeParse`.

## Documentation-for-trust (vibe-code rigor)
Every exported function/class **must** carry TSDoc with one of: `@see <url|file>`, `@issue <owner/repo#n>`, or a `Why:` line. Non-obvious runtime behavior gets inline comment linking to an ADR or GH issue.

## ADR convention
- Path: `packages/specs/adrs/NNNN-kebab-title.md` (sequential, never reused).
- Trigger: any decision that future-you or an agent might reverse, or any choice between viable options. Each phase plan ends with "ADRs to write".
- Skeleton: Context · Decision · Alternatives · Consequences · Sources (URLs).


## Repo hygiene
- `vboxuser` is a scarecrow name — not a real VM, not someone's actual handle. Don't reference it in commits / PRs / issues; user's GitHub handle is `utof`.

