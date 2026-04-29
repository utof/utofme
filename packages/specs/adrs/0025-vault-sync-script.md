# ADR 0025 — Vault import via custom sync script (not `astro-loader-obsidian`)

**Status:** accepted
**Date:** 2026-04-27 (Phase 5)

## Context

Phase 5 imports notes from an Obsidian vault into the static site. The general-plan
(§5.1) identified two main paths:

- **Path b:** use the existing `astro-loader-obsidian` npm package to stream vault
  files directly into Astro's content collection at build time.
- **Path c:** a hand-rolled sync script that copies `publish: true` notes from the
  vault into `packages/site/src/content/notes/` as tracked `.mdx` files, with a
  separate build-time artefact-builder (`build-garden-data.ts`).

At spec-write (2026-04-27), an npm-registry probe confirmed:
`astro-loader-obsidian@0.10.0` declares `"astro": "^5.12.5"` as a peer dependency.
Our lockfile pins `astro@6.x`. The `^5.12.5` constraint is incompatible with
Astro 6 — the peer-dep would be reported as unmet and the integration's internal
APIs (Astro content loader contract, which changed between Astro 5 → 6) would
silently break or hard-error.

The project's library-version policy (CLAUDE.md) requires "latest stable major is
the default." Pinning back to Astro 5 to accommodate one loader plugin is not an
acceptable trade-off.

## Decision

Use path c: a custom `scripts/sync-vault.ts` one-way copy script, driven by the
`OBSIDIAN_VAULT_PATH` environment variable, with `publish: true` as the privacy
gate. Notes land in `src/content/notes/` as tracked `.mdx` files. The sync script
runs locally only; it never runs in CI.

Commit `4b6232b` (Phase 5 Task 3) implements `scripts/sync-vault.ts`. Commit
`c006594` (Phase 5 Task 1) establishes the `notes` collection wiring in
`src/content.config.ts`.

## Alternatives considered

- **`astro-loader-obsidian@0.10.0`** — rejected: Astro 5 peer-dep incompatible
  with our locked Astro 6 (`^5.12.5` vs `6.x`). Verified via npm-registry probe
  2026-04-27. Upstream issue tracker shows no Astro 6 migration in progress at
  spec-write time.
- **Symlinks from vault into `src/content/notes/`** — rejected: the general-plan
  §5.1 documents symlink-corruption risk under Obsidian's sync engine (Obsidian Sync
  resolves symlinks inconsistently across platforms). Same doc references the Obsidian
  community note on avoiding symlinks in synced vaults.
- **Runtime Cloudflare KV fetch** — rejected: spec invariant "Output remains static;
  no SSR introduced in Phase 5" (spec line 10). Vault content must be embedded at
  build time.

## Consequences

- `+` No peer-dep conflict; Astro version stays at latest (6.x).
- `+` Notes are trackable Git objects: `git diff` before commit surfaces vault
  drift; accidental-publish incidents are caught before push.
- `+` CI builds work without vault access (`src/content/notes/` is committed).
- `−` `sync:vault` is a manual local step; the site does not auto-publish vault
  changes on push. The user must run `bun run sync:vault` and commit the diff.
- `−` The committed note files are owned by the sync script: manual edits inside
  `src/content/notes/` will be overwritten on the next sync run.

## Sources

- [Phase 5 spec § Vault sync (path c)](../specs/05-garden.md#vault--repo-sync-batch-51)
- [astro-loader-obsidian@0.10.0 peerDependencies](https://www.npmjs.com/package/astro-loader-obsidian/v/0.10.0) (probe 2026-04-27)
- [general-plan §5.1 — symlink risk note](../../2026-04-25-general-plan)
