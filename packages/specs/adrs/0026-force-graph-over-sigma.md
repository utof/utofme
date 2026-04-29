# ADR 0026 — `force-graph` (vanilla canvas) for graph view over Sigma.js

**Status:** accepted
**Date:** 2026-04-27 (Phase 5)

## Context

`/garden/graph/` renders a force-directed note-link graph. The general-plan §5.5
listed three candidates: `force-graph` (vasturiano), Sigma.js, and D3 direct. The
graph view is a leaf route only: the bundle must not inflate the global site-js
budget, and the island loads only on `/garden/graph/` (`client:visible`).

Key constraints:
- Framework-agnostic API (Svelte 5 island, no React dependency on garden routes).
- Canvas-based preferred over WebGL for broad device support (including
  low-power mobile) and simpler accessibility fallback.
- Per-route JS budget: ≤ 180 KB gzip for all graph-specific chunks combined.
- Measured at Phase 5 Task 12: `graph-vendor` chunk ~57 KB gzip + `GraphView`
  island ~1 KB = ~58 KB total — well under the 180 KB ceiling.

The `graph-vendor` chunk is isolated via `astro.config.mjs`
`vite.build.rollupOptions.output.manualChunks`, matching
`node_modules/{,.bun/}*/[force-graph|d3-force-3d]/` (tightened in Task 6 fixup #2,
commit `7717fcb`). The global `site js (all routes, ex graph-vendor)` size-limit
entry uses a negated glob `["dist/_astro/*.js", "!dist/_astro/graph-vendor-*.js"]`
so the force-graph bundle does not count against the existing 420 KB site-js cap.

## Decision

Use `force-graph@1.51.4` (vasturiano). Implemented in commit `c4be114`
(Phase 5 Task 11) in `src/components/GraphView.svelte`.

## Alternatives considered

- **Sigma.js v3** — WebGL renderer; more complex setup, larger bundle footprint,
  requires an explicit canvas-fallback strategy. No compelling aesthetic advantage
  for the small note-count fixture (≤ ~50 notes in Phase 5).
- **D3 direct (`d3-force`)** — lower-level; would require hand-coding the render
  loop, node/link drawing, zoom, and click handling. Force-graph wraps D3 force
  simulation and adds the canvas draw loop; adopting D3 directly would recreate
  much of force-graph's surface without a net budget saving (D3's relevant modules
  are included transiently anyway via `d3-force-3d`).
- **No graph view** — ruled out by spec requirement: the digital-garden feature
  includes a graph view as a core deliverable (spec acceptance criterion #7).

## Consequences

- `+` ~58 KB gzip (graph-vendor + island), within the 180 KB budget.
- `+` Canvas-based: broad device support; no WebGL fallback needed.
- `+` Framework-agnostic: mounts via plain DOM in Svelte's `onMount`; no React
  dependency on garden routes.
- `+` `force-graph@1.51.4` is MIT-licensed with no transitive `three.js` or 3D
  runtime (verified `npm view force-graph dependencies` 2026-04-27).
- `−` Canvas is opaque to assistive technologies. Mitigated by `role="img"` +
  `aria-label` on the canvas and a `<details>` keyboard-accessible list fallback
  (spec acceptance criterion #7; axe-core enforced).
- `−` The `client:visible` strategy means the graph doesn't render until the
  `<GraphView>` island enters the viewport; a brief loading gap is visible on
  first scroll. Acceptable for a leaf route.

## Sources

- [Phase 5 spec § Graph view](../specs/05-garden.md#graph-view-batch-55)
- [force-graph GitHub](https://github.com/vasturiano/force-graph)
- [npm view force-graph@1.51.4 dependencies](https://www.npmjs.com/package/force-graph/v/1.51.4) (probe 2026-04-27)
