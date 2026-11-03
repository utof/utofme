# 09 · W3 — `/loops/*` Range Worker (P9-5, D15)

## Built
A Worker that runs first only for `/loops/*` (`assets.run_worker_first`), fetches the asset via `env.ASSETS.fetch` with a clean GET, and answers with 206 / 416 / 200 (+ `Accept-Ranges: bytes`), HEAD support and 405 for other methods. Verified live with `wrangler dev`: `Range: bytes=0-1` → 206 `Content-Range: bytes 0-1/1000`; `bytes=5000-` → 416; `/` is served by assets as before. `wrangler deploy --dry-run` validates the config.

## Files
- `packages/site/worker/index.ts` (Worker, local `Env` type, no new deps)
- `packages/site/src/lib/range.ts` (pure `resolveRange`, `rangeHeaders`)
- `packages/site/tests/unit/range.test.ts` (unit + fast-check), `tests/unit/loops-worker.test.ts` (handler with fake ASSETS)
- `wrangler.jsonc` (`main`, `run_worker_first`; existing keys kept), `tsconfig.json` + `knip.jsonc` (`worker/**`), `stryker.conf.json` (`src/lib/range.ts`), `package.json` (`preview:worker`)
- `.github/workflows/deploy.yml` (warn-only Range probe appended)
- `packages/specs/adrs/0045-loops-range-worker.md`

## Gates
- biome: my files clean (repo has pre-existing infos only)
- astro check: 0 errors, 0 warnings, 3 hints (pre-existing)
- type-coverage: 100.00% (21627/21627)
- knip: only the 2 pre-existing configuration hints (wrangler, lefthook)
- check:docs: pass
- Vitest full suite: 375 passed, 73 skipped; 1 failed file (`card-pagefind-attrs`, pre-existing). My two files: 35 tests pass.
- `bun run build` not run (no build input changed); no deps / lockfile changed.

## Decisions
- Multi-range → plain 200 (documented in ADR and `range.ts`).
- Weak ETag / non-ETag `If-Range` → 200 (review item 21). Non-`/loops/` path → delegate to ASSETS unchanged (item 20).
- Assets with `Content-Length` > 25 MiB stream as 200 (no buffering).
- Probe reads the first `/loops/*.mp4` URL from `src/data/loops.json`; skips with a warning if the manifest doesn't exist yet; `continue-on-error: true`; hits `https://utof.me`.

## Open issues
- developers.cloudflare.com was unreachable from this session (network allowlist), so the wrangler keys were verified against the local wrangler 4.85.0 schema/dry-run/dev plus the spec review's citations, not the live docs page.
- `depcruise` doesn't cover `worker/`. No e2e for Safari; manual check via `bun run preview:worker`.
