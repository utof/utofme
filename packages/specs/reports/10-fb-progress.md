# Lane FB progress

**Status: in progress.** Branch `p10/fb-maps` (cut from `phase/10-research-article`). Figures F2 (smoke sight), F5 (map stages), F10 (roll a map).

## Done (SHA)
- a6d58f9 `map_stages` dataset (module, fixture, test, real sync, sidecar; 2,567 B gzip of 4,096)
- c197872 `maps_generated` dataset (module, fixture, test, real sync, sidecar; 3,706 B gzip of 6,144)
- 8603a41 F2 smoke sight: logic, keyframe, Block, island, e2e (14 pass locally on the lab page); CSS shared in `SmokeSight.css`
- c904a4b F5 map stages: logic, keyframe, Block, island, e2e (11 pass locally); F2 CSS reserve now `calc(100cqw + 20rem)`; keyframe and island boxes equal at 320 to 1440 px

## Next
1. F10 logic + keyframe + Block + island + e2e
3. Budgets (`check:budgets`), GATE, report `10-fb.md`

## Gotchas for a successor
- Node >= 22.23 on `PATH` before every commit (the hook runs `astro check`, ~75 s per commit).
- Sync env: `UTOFME_NOTES=<notes checkout> UTOFME_ARTICLE_DATA=$UTOFME_NOTES/article/data`; a second `sync:article-data --only <name>` must leave `git diff` empty.
- Build + e2e only under `flock /tmp/p10-build.lock`.
