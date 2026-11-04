# Lane P progress

**Status: finished.** Branch `p10/p-copy`, pushed. Final report: `10-p.md`.

## Done (SHA)
- f3c85aa provenance and claims lint (helper, test, 32 negative fixtures + pass)
- 8044de1 article copy (frontmatter + 9 sections), Valve stills and recipe `stills` deleted, real-entry and cleanup tests
- ADR 0059 + report: the commit after 8044de1 (see `git log`)

## Next
Nothing in this lane. Lane I collects the missing-key list (report § "Numbers left out") for lane N.

## Gotchas for a successor
- `PATH=/home/vboxuser/.local/node-v22.23.4-linux-x64/bin:$PATH` before commits (the hook runs `astro check`).
- `type-coverage` needs `.astro/types.d.ts`: run `bun run check:astro` first in a fresh worktree.
- Build + e2e only under `flock /tmp/p10-build.lock`; the build rewrites `src/data/graph.json` (restore it).
- Run Playwright with `ASTRO_PREVIEW_BACKGROUND=1`: under an agent environment `astro preview` daemonises itself, and Playwright then reuses whatever holds port 4321 (report, Doubt 5).
