# Lane FB progress

**Status: finished.** Everything is pushed on `p10/fb-maps`. Final report: `10-fb.md` (SHAs, ACs, sizes, doubts).

## Done (SHA)
- a6d58f9 `map_stages` dataset · c197872 `maps_generated` dataset
- 8603a41 F2 smoke sight · c904a4b F5 map stages · ba05ee1 F10 roll a map
- 8a0fd7f merge of the phase branch · cb4d1e6 merged wall rectangles, "Floor fraction" stop name
- Report commit follows (see `git log`).

## Gotchas for a successor
- Node >= 22.23 on `PATH` before every commit (the hook runs `astro check`, about 45 to 75 s per commit).
- Sync env: `UTOFME_NOTES=<notes checkout> UTOFME_ARTICLE_DATA=$UTOFME_NOTES/article/data`; a second `sync:article-data --only <name>` must leave `git diff` empty.
- Build and e2e only under `flock /tmp/p10-build.lock`; the build rewrites `src/data/graph.json` (restore it).
