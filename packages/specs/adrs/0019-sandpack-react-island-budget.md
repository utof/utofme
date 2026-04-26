# ADR 0019 — Sandpack React island budget

## Status

Accepted — Phase 3.

## Date

2026-04-26

## Context

Phase 3 ships a live code-execution playground (`<Sandbox>` MDX component) powered by `@codesandbox/sandpack-react`. The Sandpack package ships a React runtime and a browser-based bundler; it is the heaviest single dependency introduced in Phase 3.

The site enforces a per-route gzipped JS budget via `packages/site/.size-limit.cjs` (ADR 0016). The Phase 2 ceiling was `60 KB` for the combined `dist/_astro/*.js` glob. That ceiling cannot hold once the Sandpack island chunk lands in `dist/_astro/`: Sandpack's React runtime + sandbox client alone exceed 60 KB.

### Measured values (Task 11, commit `5269071`)

After Task 10 (Sandpack island) + Task 11 (budget sweep), `bun x size-limit` measured:

| Chunk | Gzip size |
|---|---|
| `SandboxIsland.*.js` | **208 KB** |
| All other `dist/_astro/*.js` (Svelte runtime, ClientRouter, FilterBar/Preview/CommandPalette islands, pagefind init) | ~185 KB |
| **Total `dist/_astro/*.js`** | **~393 KB** |
| `bun x size-limit` exact output | **397.29 KB** |

The raw `gzip -c dist/_astro/*.js | wc -c` measurement (plan OQ#7) returned **397,371 bytes** (~388 KB via `wc`, ≈397 KB via `size-limit`'s independent gzip implementation). `size-limit` and raw `gzip` may differ by a few KB due to concatenation artefacts; the `size-limit` number is the operative gate value.

The Phase 3 plan (OQ#7) prescribed: `measured + 20% headroom`. 397 KB + ~6% (not 20%) reaches 420 KB. The plan's `±25%` divergence test against the general-plan estimate of ~190 KB failed: Sandpack alone was ~208 KB gzipped (within 10% of the 190 KB estimate for Sandpack alone, but combined all-routes total was 397 KB vs the plan's "acceptable upper bound: 250 KB"). The discrepancy is because the plan's 250 KB advisory was for the Sandpack-page JS only, not the **combined** `dist/_astro/*.js` glob.

### The glob collision problem

`dist/_astro/*.js` is a flat directory containing chunks from **all routes**. Astro's build emitter places island chunks there without per-route sub-paths. The `size-limit` entry that measures `dist/_astro/*.js` therefore measures the union of:

- Site-wide chunks (Svelte runtime, ClientRouter): loaded on every page.
- Route-specific islands (FilterBar, CommandPalette, Preview): loaded on `/` and `/works`.
- Page-specific islands (Sandpack): loaded only on pages that embed `<Sandbox>`.

When the Sandpack chunk (`SandboxIsland.*.js`) was added, the combined glob jumped from ~185 KB to ~393 KB. There are two policy choices:

- **Option (a): Exclude the Sandpack chunk from the glob** — e.g. add a `!dist/_astro/SandboxIsland.*.js` exclusion. This restores the 60 KB site-wide ceiling but allows the Sandpack chunk to grow unchecked.
- **Option (b): Add a separate Sandpack chunk budget** — measure the Sandpack chunk alone and add a second `size-limit` entry for it. This is accurate but adds a second entry that depends on a hash in the chunk filename (fragile without a glob exclusion anyway).
- **Option (c): Bump the combined ceiling to cover the measured total.** Less precise per-route attribution, but honest about what the browser actually fetches for Sandpack-using pages. The ceiling (420 KB) is above the measured value (397 KB) by ~6%, providing a small buffer.

## Decision

**Option (c): bump the `"site js (all routes)"` ceiling from 60 KB to 420 KB.**

- 420 KB = 397 KB measured + ~6% headroom (rounding to a clean number). Headroom is kept small (not 20%) because the intent is to catch growth, not grant a blank check.
- The `SandboxIsland.*.js` chunk lives at `dist/_astro/SandboxIsland.*.js`; its gzipped size is ~208 KB.
- Pages **without** `<Sandbox>` ship **0 bytes of React**. Astro's island architecture ensures the React runtime and Sandpack bundle are only fetched when a page contains a `<Sandbox>` component (`client:visible`). This is the key property that makes the 420 KB ceiling honest: it reflects the worst-case page (Sandpack article), not every page.
- Options (a) and (b) were rejected because both rely on matching a content-hashed filename (`SandboxIsland.<hash>.js`) in the glob or exclusion pattern — fragile across deploys unless normalised, and more complex than a single ceiling bump.

The decision is documented here (ADR 0019) as the citation required by ADR 0016 Consequences: *"Adding a new hydrated island must be preceded by a measurement pass; if the new island pushes `dist/_astro/*.js` past 60 KB, the budget line must be amended with a citation."*

## Alternatives

### StackBlitz WebContainers

Rejected. WebContainers require a `COOP: same-origin-embedder-policy` header, which limits deployability in the current Cloudflare Workers Assets setup and requires HTTP header configuration. The runtime is also larger and the integration with Astro is less mature. General-plan line 397 explicitly rejected WebContainers.

### `sandpack-client` (headless) driven from a Svelte island

Rejected. `sandpack-client` is the low-level message-passing layer; building a custom UI (editor, preview iframe, error overlay) around it is substantial implementation work for a portfolio site. `@codesandbox/sandpack-react` provides the full UI out of the box with theme tokens. The React runtime cost is the accepted price.

### Plain `<iframe sandbox>` pointing at CodeSandbox or StackBlitz

Rejected. Embeds an external domain, adds a CSP `frame-src` hole, and loads an entire external app in the iframe — worse isolation than Sandpack's `sandpack-executor` in-browser bundler. No offline capability.

### Lazy-load Sandpack chunk on interaction (not `client:visible`)

Considered but not adopted. `client:visible` already defers load until the Sandpack editor scrolls into viewport; adding an additional click-to-load gate improves perceived performance but degrades the "it just works" authoring experience. Phase 3 opts for `client:visible` as the default; a future ADR can tighten to `client:only` + lazy import if performance metrics regress on a Sandpack article.

## Consequences

- `packages/site/.size-limit.cjs` `"site js (all routes)"` limit is `420 KB` from Phase 3 onward (previously `60 KB`).
- The 420 KB ceiling is a **site-wide JS ceiling** covering all routes' chunks combined. It is not a per-page ceiling; Sandpack-free pages still benefit from the Phase 2 architecture (the React + Sandpack chunks are not fetched on those pages).
- Future islands added to the site that push beyond 420 KB must amend this ADR with a new measurement.
- Phase 3 ships JS/TS/React Sandpack templates only. Python (Pyodide) sandboxes and other language runtimes are out of scope; they would require a separate budget line if adopted.
- The Sandpack chunk is content-hashed by Astro (`SandboxIsland.<hash>.js`); the `*.js` glob in `.size-limit.cjs` captures it regardless of hash rotation.

## Sources

- `packages/site/.size-limit.cjs` (current entries; inline `Why:` comment at the `420 KB` line)
- `packages/specs/adrs/0016-route-budget-replaces-zero-js-gate.md` (original 60 KB ceiling + amendment protocol)
- Phase 3 Task 11 commit `5269071` (budget measurement: 397.29 KB measured, 420 KB ceiling set)
- Phase 3 Task 10 commit `8d58db9` (Sandpack island: `SandboxIsland.*.js` ~208 KB gzipped)
- `packages/specs/specs/03-content-pipeline.md` § "Per-route + per-page JS budgets" (OQ#7 calibration requirement)
- https://sandpack.codesandbox.io/docs (verified 2026-04-26)
- General-plan line 380–404 (Sandpack rationale, WebContainers rejection)
