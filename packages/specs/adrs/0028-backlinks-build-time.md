# ADR 0028 — Backlinks computed at build time, not at runtime

**Status:** accepted
**Date:** 2026-04-27 (Phase 5)

## Context

Each garden note detail page (`/garden/[slug]/`) shows a "Linked from" footer
listing other notes that link to it. This requires inverting the wikilink forward
edge list. The inversion can happen at:

1. **Build time** — a prebuild script walks `src/content/notes/`, extracts
   wikilinks, inverts the edge list, and writes `src/data/backlinks.json`. The
   Astro component imports the JSON statically; no client JS.
2. **Runtime (Cloudflare edge)** — a Worker handler scans the notes collection on
   each request. Requires SSR / Cloudflare adapter.
3. **Client-side JS** — the island fetches a `backlinks.json` on demand and renders.

The Phase 5 spec invariant (spec line 10) is: "Output remains static. No SSR
introduced in Phase 5." Option 2 is ruled out by spec. Option 3 adds client JS to
content pages that are otherwise zero-JS (beyond the global islands).

## Decision

Build-time via `scripts/build-garden-data.ts` (commit `0cb2570`, Phase 5 Task 7).

The script writes three artefacts to `src/data/`:
- `backlinks.json` — `{ [targetSlug]: [{ slug, title }] }`
- `note-previews.json` — `{ [slug]: { title, summary, firstParagraph } }`
- `graph.json` — `{ nodes, edges }`

The `<Backlinks>` Astro component imports `backlinks.json` directly at build time —
zero client JS for the backlinks footer.

**Deterministic-write contract:** the script sorts all object keys (alphabetical,
ASCII), sorts arrays by locale-locked `Intl.Collator("en", { sensitivity: "base" })`,
and emits tab-indented JSON with a trailing newline. Two runs against identical
inputs produce byte-identical output. This is enforced by a unit test in
`tests/unit/build-garden-data.test.ts`.

**CI freshness gate:** lefthook's `freshness-garden` job (added in Phase 5 Task 12)
runs `bun run prebuild:garden && bunx biome format --write src/data/` and then
checks `git diff --exit-code src/data/`. A non-zero exit indicates the committed
artefacts are stale relative to the current note set. The job only triggers when
`packages/site/src/content/notes/**/*` files are staged.

## Alternatives considered

- **SSR / Cloudflare Worker** — ruled out by the Phase 5 static-first invariant.
  Adds adapter complexity for a single metadata feature.
- **Client-side fetch of `backlinks.json`** — would add JS to content pages that
  are otherwise fully static. Increases page weight and creates a flash of empty
  content before the fetch resolves.
- **Astro integration (hook into the build pipeline)** — viable but more complex
  than a standalone prebuild script for this use case. The script approach is
  simpler to test and audit.

## Consequences

- `+` `/garden/[slug]/` backlinks footer is server-rendered HTML — zero JS, full
  accessibility, instant render.
- `+` Deterministic-write contract + CI freshness gate prevents stale committed
  artefacts from shipping silently.
- `+` The same script also builds `note-previews.json` and `graph.json` — one
  pass over the notes directory produces all three artefacts.
- `−` Backlinks are only as fresh as the last committed artefact. A developer who
  adds a note without running `prebuild:garden` will have stale backlinks until the
  lefthook step catches it on the next commit.
- `−` Biome reformatting is required in the freshness CI step because the script
  emits `JSON.stringify` expanded arrays while Biome compacts single-element arrays.
  The step runs `biome format --write src/data/` before the git diff so the
  comparison is against the Biome-normalised committed form.

## Sources

- [Phase 5 spec § Backlinks at build time](../specs/05-garden.md#backlinks-at-build-time-batch-53)
- [Phase 5 spec § Deterministic-write contract](../specs/05-garden.md#deterministic-write-contract-load-bearing-for-the-ci-freshness-check)
