# 0055 — Privacy scan with a secret denylist

Status: accepted (phase 10, spec P10-3)

## Context
The research article ships data and prose derived from a private notes repo. Leaks to avoid: real names, addresses, home paths, tokens, the private repo's folder and file names, release-based transfer wording, lane names and commit-like revisions. The list of real names cannot live in the repo in any form (a hash list is brute-forceable for short names).

## Decision
- **One pure core** (`scripts/lib/privacy-scan-core.ts`) and a CLI (`scripts/check-privacy.ts`, `bun run check:privacy [--dist <dir>] [--require-denylist] [paths…]`).
- **Rule sets by scope.** `shipped` (core + notes-repo rules) for article data, the article MDX, article components, figure code and, with `--dist`, the article route and every `dist/_astro/*.json`. `core` for derived metadata, dataset modules, article fixtures and the other text in `dist/`. `docs` (denylist + email only) for phase-10 specs, plans, reports and ADRs 0052–0060, which quote the patterns. Excluded: the rule fixtures and the scanner.
- **`bundle` set (deviation, recorded).** Built `.js`/`.mjs`/`.css` in `dist/` get denylist, `cgnat`, `home-path` and `token-like` only. A clean production build otherwise fails `email` and `ipv4` on vendored bundles (an email regex in the Pagefind UI, a `127.0.0.1` literal in the sandbox island).
- **Denylist** only in the Actions secret `PRIVACY_DENYLIST` (declared by this ADR) and the owner's env. Text is lower-cased, split on `[^a-z0-9_-]+`; each token, its `-`/`_` parts and adjacent pairs are matched. JSON keys are scanned too.
- **Messages** carry the rule id, file and JSON path, never the matched text.
- **Without the denylist**: local and CI runs warn and run every other rule; `--require-denylist` (deploy) exits 4. No `if:` on secrets; the script decides.
- **Wiring**: `ci.yml` job env + steps + a `deploy-build` job, `deploy.yml` job env + `--require-denylist` step, a lefthook `check-privacy` job.

## Alternatives
- **Committed hash list.** Reversible for short names; rejected.
- **Skip the scan step when the secret is absent (`if:`).** A missing secret would silently disable the guard in the deploy.
- **A third-party secret scanner.** Does not know the notes repo's folder names or the denylist semantics, and adds a dependency.

## Consequences
- Contributors without the secret still get every non-name rule locally and in CI; only the deploy is strict.
- The `internal-path` list must track the notes repo's privacy checklist.
- Adding a rule means a fixture pair in `tests/fixtures/privacy/rules.json`.

## Sources
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- packages/specs/specs/10-tactical-arena-article.md § P10-3
