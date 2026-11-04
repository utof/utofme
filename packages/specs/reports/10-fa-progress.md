# Lane FA progress (F1 replay)

Branch `p10/fa-replay`. A successor continues from the first unchecked step.

## Plan (steps)

1. [x] Dataset `replay_mirage` (b79d059; 1,890 B gzip of 10 KB; real sync idempotent)
2. [x] Logic `src/lib/figures/replay.ts` (9be4497; 34 tests incl. fast-check fog/ghost properties, playback reducer)
3. [x] Keyframe + Block + Container test (6dc3e4d; island is still a SHELL in Replay.svelte, step 4 replaces it)
4. [ ] `Replay.svelte` island + mount tests
5. [ ] e2e `tests/e2e/p10-replay.spec.ts`
6. [ ] Size: build + `check:budgets` (Replay <= 25 KB, data <= 10 KB)
7. [ ] GATE, `check:privacy`, report `10-fa.md`, final push

## Decisions

- Autoplay starts from tick 0 at 1x (whole round once); the static default state is the board at `firstContactTick`.

## Gotchas

- (none yet)

## Facts about the data (for the island/keyframe)

- `kill`/`damage` events: `pid` = victim, `pid2` = attacker; `alive[t]` already 0 at the kill tick (no off-by-one).
- Round: 73 ticks, first contact tick 9 (= 7.2 s = fact `replay.contact.s`), 7 kills, smoke onset tick 28, plant tick 32, T wins by bomb. Keyframe ticks [0, 9, 24, 32, 64, 72].
- Pros marker: fact `tempo.pros.contact.median` (22.8 s) -> tick 28.5 -> fraction 0.396.
- Stamp: `Figure measuredOn="block 28 (5v5), self-play, recorded 2026-11-04"` (date from notes README: recorded 2026-11-04).
- Each commit's lefthook run takes ~70 s (astro check, type-coverage, knip...); batch work per commit.
