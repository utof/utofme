# Nits sweep — tooling lane (`fix/nits-tooling`)

- #94 STALE: `mountSvelteInTest` now has two callsites (tests/unit/cursor.test.ts:28, tests/unit/click-counter.test.ts:28), so the "single-callsite" premise is gone. Folding inline would duplicate it.
- #95 FIXED: `scripts/check-docs.ts` now fails when a `@see` token starting `packages/`, `docs/`, `CLAUDE.md` or `README.md` names a file missing from disk (ADR 0036 itself exists now). Test: `tests/unit/check-docs.test.ts` with fixtures in `tests/fixtures/check-docs-see/`. The check found 5 real dangling pointers (`packages/specs/reviews/ui/{polish,breaker-desktop}.md`, which exist only on unmerged review branches); repointed to the review names and branches in `src/lib/{lightbox,og-image,palette,seo}.ts`. Note: only `.ts` files are scanned, so `.astro` `@see` lines (HCard, SiteHeader, Gallery, _SlashLayout) still carry the same dead paths, unchecked.
- #100 FIXED: comment in `tests/unit/sound-toggle.test.ts` lists what the injected-globals harness does not cover (capture-phase ordering, storage events, real localStorage failures) and points to the e2e specs.
- #103 FIXED: dropped `wrangler` and `lefthook` from `knip.jsonc` `ignoreDependencies`; `bun x knip` is silent with no hints. CI runs knip with `--cwd packages/site` (ci.yml:83), same as here.
- #104 STALE: ADR 0038 already documents the if/return → if/else flip (packages/specs/adrs/0038-time-of-day-inline-script.md:24-40, :63).
- #105 FIXED: `packages/specs/specs/07-atmosphere.md` L87 now says `--color-accent`.
- #106 STALE: `bun x biome check` is clean on current main (177 files, no errors).
- #113 STALE: same, `scripts/sync-obsidian-vault.ts` no longer exists (renamed `scripts/sync-vault.ts`) and biome is clean.
- #114 FIXED: `src/lib/sitemap-filter.ts` regex anchored to the origin (`^(?:https?://host)?/search/?$`), so `/works/search/` is kept. Test added first in `tests/unit/sitemap-filter.test.ts` (failed before).
- #116 KEEP: still vacuous, since no webmentions fixture exists for /garden/welcome/ in the fixtures-off build (tests/e2e/garden-detail.spec.ts:51-62). Proposal: add the positive `aside.webmentions` sibling assertion when a mentions fixture is committed.
- #136 KEEP: owner call. `lib/filter.ts`, `url-state.ts`, `keymap.ts` (keymap is still imported by `CommandPalette.svelte:19`, so not dead), Card's `data-preview-target` (Card.astro:102) and the `works:filter` script (index.astro:106-150) all still exist with property tests. Proposal: delete filter.ts + url-state.ts + their tests + the index.astro script only if `/?type=&tag=` deep links are dropped; keep keymap.
- #137 STALE: no test named 4b exists in tests/e2e/transitions.spec.ts (tests are 1, 2, 5, 6a, 6c, 7). Test 7 is still titled "FilterBar event-listener count" (stale name only; left).
- #138 FIXED: `tests/unit/fixtures-tracked.test.ts` fails if any file under `tests/fixtures/` is git-ignored (verified: it fails with an ignored file present).

## Gates
