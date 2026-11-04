# Lane S progress

Branch `p10/s-libs`.

## Done
- grid (AC4.3): `src/lib/grid.ts`, `tests/unit/grid.test.ts` (green)

## Next
- sight + parity, elo, figure-scale? (not in lane S list), keys, motion, live, link, ADRs 0053/0058/0060, report `10-s.md`

## Gotchas
- Parity fixture has no map grids and `maps_cs.json` is not on this VM: the parity test loads maps from `UTOFME_ARTICLE_DATA/maps_cs.json` or `src/data/article-data/maps_cs.json` when present; otherwise only the map-independent cone/range part is checked.
- Map legend assumed: `#` wall, `.` floor (not stated in the spec).
