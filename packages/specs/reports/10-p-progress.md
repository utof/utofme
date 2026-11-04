# Lane P progress

Branch `p10/p-copy` (cut from `phase/10-research-article` with A1, A2, D1, D2, S merged). Plan § Lane P; spec P10-17, P10-1, OD-2/3/4.

## Done (SHA)
- Step 1 provenance lint: `tests/unit/helpers/mdx-prose.ts` (shared `scan`, `parseMdxSource`, `lintProvenance`, inline `EloSentenceBlock`), `tests/unit/article-provenance.test.ts`, fixtures `tests/fixtures/article-provenance/` (pass + 32 negatives) — commit follows this file's first version.

## Next
1. Step 2+3 in one commit: rewrite `src/content/works/tactical-arena.mdx` (frontmatter + 9 sections), delete the two Valve stills and the recipe's `stills`, add the real-entry provenance test and the AC17.4/17.5 cleanup checks.
2. Step 4: list numbers left out for lack of a key (report).
3. Step 5: ADR 0059, report `10-p.md`, GATE, e2e `banner-quality chrome footer layout-chrome project-layout p09-morph` under the lock.

## Gotchas for a successor
- `PATH=/home/vboxuser/.local/node-v22.23.4-linux-x64/bin:$PATH` before commits (the hook runs `astro check`).
- `type-coverage` needs `.astro/types.d.ts`: run `bun run check:astro` first in a fresh worktree.
- Build + e2e only under `flock /tmp/p10-build.lock`; the build rewrites `src/data/graph.json` (restore it).
