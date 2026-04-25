# utofme — agent instructions

Personal site + portfolio. **Astro 6 + Svelte 5 (runes) + Cloudflare Workers (Assets).** Static-first; SSR only for `/stats`. Authoritative research: `./2026-04-25-general-plan` (763 lines, sourced) — **note: that doc uses `pnpm` everywhere; substitute `bun` (e.g. `bun run dev`, `bun x astro check`).**

## Models
- Implementer: **Sonnet** (default). Reviewer / hard decisions: **Opus**.

## Disagreement protocol — push back ONLY if a trigger fires
**FIRE:**
- Action is irreversible (rm / force-push / publish / migration / dep-deletion).
- Request contradicts THIS file, the linked spec, or an ADR — cite the line.
- A source you fetched THIS turn (file:line / URL / MCP graph) contradicts the user's premise — quote it.
- Change exceeds the phase's declared budget (files / lines / size-limit / perf).
- Stated cause ≠ symptom after a 1-step trace.
- Confidence <70% the user's path reaches their stated goal AND you have a concrete alternative.

**JUST COMPLY when:**
- Taste / naming / style / file layout — user's call.
- User has already heard the objection this thread and reaffirmed.
- Reversible local change (single file, <50 lines, no public surface).
- You only have a vibe — no cited source, no spec conflict, no measurement.

**SHAPE when pushing back:**
1. One sentence stating the disagreement.
2. One cited piece of evidence (file:line OR URL fetched this turn OR spec §).
3. One concrete counter-proposal.
4. End: "Proceed as you asked, or switch?" — then WAIT. Frustration ≠ approval; only "yes / proceed / go" approves.

**NEVER:** opener flattery, hedge, list >2 alternatives, repeat an objection already overridden, defend after override.

Source: `docs/2026-04-25-pushback-trigger-research.md`.

## Workflow (per phase = one batch · 7 phases 0–6 + opt-in 7 · no mega-spec)
1. Brainstorm → spec at `packages/specs/specs/NN-phase.md`.
2. **Fresh Opus subagent reviews spec** (never self-review).
3. Revise → green.
4. Plan at `packages/specs/plans/NN-phase.md`.
5. **Fresh Opus subagent reviews plan.**
6. Revise → green.
7. Execute via `/subagent-driven-development` (Sonnet workers).
8. Update `memory/progress.md`; trim stale pointers.

**Review-round cap (per artifact):** spec reviews = **1**, plan reviews = **1**. After the cap, accept residual nits, queue them for `gh issue create -l nit`, and proceed. (Numbers literal — bump to 2 if drift is observed.)

**Nit threshold:** see `## Inline-fix gate` below. **Never** mention Claude Code / sessions / AI authorship in issue / PR / commit text.

## Inline-fix gate (ALL must hold; else `gh issue create -R utof/utofme -l nit`)
**Scope: nits only.** Blockers (failing tests, spec / ADR violations, security regressions, hard-gate breaches) fix on the branch regardless of size — gate doesn't apply.

**Hard gates (never relax — independent of model power):**
- Diff touches no exported symbol, no public type, no config schema, no Zod schema, no DB/migration/ADR.
- No new dep, no version bump, no lockfile churn.
- No public-network surface (env var / secret / route / cron / webhook) added or renamed.

**Capability-bounded gates (Opus-era ceilings; relax further only with measurement):**
- ≤4 impl files (tests / docs / fixtures don't count).
- ≤3 new control-flow tokens across the diff (`if` / `for` / `while` / `case` / `catch` / `&&` / `||` / `?`).
- Max nesting-depth delta ≤ +1.
- ≤12 hunks total (count `@@` headers).
- No file with `rg`-fan-in >20 importers is modified non-trivially.
- Total churn (added + deleted) ≤120; if any single file's churn >60, file an issue regardless.

**Refactor carve-out:** pure rename / extract-function / inline-variable that an LLM can verify is semantics-preserving (no behaviour change, no test added/removed) bypasses the capability gates but **NEVER** the hard gates.

**Tiebreaker** when capability gates are borderline: file the issue. Issue-cost is cheap; phase-scope blur is not. **LoC and file-count are not primary gates.**

Source: `docs/2026-04-25-file-vs-fix-research.md`.

## Subagent briefing (paste verbatim into every Task prompt)
> **Tools (in priority order):** `mcp__codebase-memory-mcp__*` before Grep/Glob/find; `context7` MCP (`mcp__plugin_context7_context7__*`) for any library/framework/SDK doc — training data is stale, verify even well-known APIs. **deepwiki is NOT installed** — use `gh` CLI or WebFetch for GitHub repos. WebSearch / WebFetch for anything else uncertain. Do not guess API shapes. **Read `CLAUDE.md` first.** Outputs must be falsifiable: cite file:line, link sources. The plan doc `2026-04-25-general-plan` uses `pnpm` — substitute `bun`.

> **Subagent output verbosity:** the conciseness rule in this file applies only to Claude→user chat. Implementer + reviewer subagent reports are read solely by Claude (the controller) and are ephemeral — be **thorough**: cite freely, list every file touched with SHAs, quote relevant context7 results, surface every doubt. Do not compress.

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
- **Stryker mutation on (critical only):** content-collection loaders, URL filter logic, backlink builder, all Zod schemas. Run nightly in CI, not precommit.

## Documentation-for-trust (vibe-code rigor)
Every exported function/class **must** carry TSDoc with one of: `@see <url|file>`, `@issue <owner/repo#n>`, or a `Why:` line. Non-obvious runtime behavior gets inline comment linking to an ADR or GH issue.

## ADR convention
- Path: `packages/specs/adrs/NNNN-kebab-title.md` (sequential, never reused).
- Trigger: any decision that future-you or an agent might reverse, or any choice between viable options. Each phase plan ends with "ADRs to write".
- Skeleton: Context · Decision · Alternatives · Consequences · Sources (URLs).

## Branching & merge
Each phase = its own branch `phase/NN-name`. All batches in that phase land on the branch. When phase is done: open PR → CI green → **merge commit into `main` (NOT squash, NOT rebase)** to preserve per-task TDD history. Tag `phase-NN` on the merge commit.

## Repo hygiene
- **No** `Co-Authored-By: Claude` in commits. **No** mention of Claude / sessions / AI in any public artifact.
- `vboxuser` is a scarecrow name — not a real VM, not someone's actual handle. Don't reference it in commits / PRs / issues; user's GitHub handle is `utof`.
- **Never create new auto-memory files, and never edit CLAUDE.md, without an explicit user ask.** `progress.md` is the only file free to update on your own. If you think a new memory or a CLAUDE.md edit is warranted — ask first, then act.
- **Root `.gitignore`:** `*.md` everywhere EXCEPT `/README.md`, `/CLAUDE.md`, `/LICENSE`, and everything under `/packages/specs/**`. Prose belongs in `packages/specs/`.
- `packages/site/.gitignore` adds nothing for .md (root rule covers it).
