# Review — Phase 09 spec (`packages/specs/specs/09-project-view.md`)

Reviewer: independent (did not author the spec). Date: 2026-11-03.
Spec reviewed at `origin/phase/09-project-view` @ `b56f4ec`.

**Status: DRAFT — partial findings, API table pending.**

## Verdict

_pending_

## Findings (partial)

1. **MAJOR — P9-1 duplicates work already on `origin/phase/09-astro7`, and misses `prettier-plugin-astro`.**
   Commit `12d2483` on `phase/09-astro7` already does the unified processor, `compressHTML: true`,
   the container-renderer import path, and bumps `prettier-plugin-astro ^0.14.1 → ^1.1.2`
   (29 files, +930/−760, mostly `.astro` reformatting). The spec's P9-1 table does not list
   `prettier-plugin-astro`, whose 0.14.1 depends on the Go `@astrojs/compiler ^2.9.1`
   while 1.1.2 depends on `@astrojs/compiler-rs ^0.5.2` (`npm view`).
