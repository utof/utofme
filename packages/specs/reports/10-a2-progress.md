# Lane A2 progress

Branch: `claude/phase-10-lane-a2-z3qjua` (the harness-designated branch; the brief named `p10/a2-layout` — recorded conflict, the designated branch wins).

## Done
- Step 1 banner golden + `ProjectBanner.astro` extraction (CSS moved verbatim) — see git log.

## Next
2. Figure + Stamp; 3. `_ArticleLayout` + route switch; 4. 12 stubs + lab pages; 5. e2e; 6. ADR 0052 + report.

## Gotchas
- No Google Fonts egress: unit tests log unifont errors; harmless.
- Golden strips `data-astro-cid-*` and the checkout path (`<ROOT>`).
