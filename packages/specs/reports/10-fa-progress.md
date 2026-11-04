# Lane FA progress (F1 replay)

Branch `p10/fa-replay`. A successor continues from the first unchecked step.

## Plan (steps)

1. [ ] Dataset `replay_mirage` (module, fixture, test, real sync, sidecar)
2. [ ] Logic `src/lib/figures/replay.ts` (fog, ghosts, markers, interpolation, playback machine) + unit tests
3. [ ] `ReplayKeyframe.astro` + `ReplayBlock.astro` + Container test
4. [ ] `Replay.svelte` island + mount tests
5. [ ] e2e `tests/e2e/p10-replay.spec.ts`
6. [ ] Size: build + `check:budgets` (Replay <= 25 KB, data <= 10 KB)
7. [ ] GATE, `check:privacy`, report `10-fa.md`, final push

## Decisions

- Autoplay starts from tick 0 at 1x (whole round once); the static default state is the board at `firstContactTick`.

## Gotchas

- (none yet)
