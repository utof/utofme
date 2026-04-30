/**
 * Size Limit configuration for Phase 2 + Phase 3 + Phase 5.
 *
 * Why: enforces per-route CSS+HTML and JS budgets declared in
 * packages/specs/specs/02-interactivity.md § "size-limit budget" (OQ#12).
 * Phase 1 had 2 entries (home + works, CSS+HTML only). Phase 2 adds:
 *   - /search route CSS+HTML entry
 *   - site-wide JS budget entry (all _astro/*.js chunks)
 *   - pagefind UI JS budget entry (dist/pagefind/pagefind-ui.js)
 * Phase 3 adds:
 *   - detail page CSS+HTML entries (no-island fixture + EC code-fence fixture)
 *   - bumped site JS limit to absorb React+Sandpack chunks (option c, ADR 0019)
 * Phase 5 adds:
 *   - /garden/ index css+html entry (≤ 60 KB)
 *   - /garden/welcome/ detail css+html entry (≤ 60 KB)
 *   - /garden/graph/ css+html entry (≤ 60 KB)
 *   - /garden/graph/ JS entry covering graph-vendor + GraphView (≤ 180 KB)
 *   - Site-js entry updated with negated glob to exclude graph-vendor chunk so
 *     the force-graph bundle (~57 KB gzip) does not count against the 420 KB cap.
 *     ADR 0026 documents the manualChunks isolation strategy.
 *
 * The no-js-check.ts script that previously enforced a "0 KB JS" gate was
 * retired in Task 13a (ADR 0016). Per-route JS is now enforced exclusively here.
 *
 * CSS entries use a glob pattern `dist/_astro/*.css` to capture all CSS chunks
 * alongside the route HTML. The glob path array is how size-limit v12 @size-limit/file
 * plugin measures multiple files summed together.
 *
 * disablePlugins: ["@size-limit/time"] is set on all entries to avoid the
 * headless-Chrome dependency (time plugin requires @size-limit/webpack + browser).
 * We only have @size-limit/file + @size-limit/preset-app installed.
 *
 * @see packages/specs/specs/02-interactivity.md
 * @see packages/specs/plans/02-interactivity.md § Task 13a / OQ#12
 * @see packages/specs/specs/03-content-pipeline.md
 * @see packages/specs/specs/05-garden.md § Per-route size budgets summary
 * @see packages/specs/adrs/0026-force-graph-over-sigma.md
 */
module.exports = [
	// Phase 1 carry-over (CSS+HTML combined per route)
	{
		name: "home css+html",
		path: ["dist/index.html", "dist/_astro/*.css"],
		gzip: true,
		limit: "60 KB",
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "works css+html",
		path: ["dist/works/index.html", "dist/_astro/*.css"],
		gzip: true,
		limit: "60 KB",
		disablePlugins: ["@size-limit/time"],
	},
	// Phase 2 additions
	{
		name: "search css+html",
		path: ["dist/search/index.html", "dist/_astro/*.css"],
		gzip: true,
		limit: "60 KB",
		disablePlugins: ["@size-limit/time"],
	},
	{
		// Why: OQ#12 originally set 30 KB but the Search.astro inline script
		// (pagefind-ui init, ~27.5 KB gzipped) + Svelte runtime render.js (~11.7 KB)
		// + ClientRouter (~5.5 KB) + islands (~7 KB) totals ~55 KB.
		// Spec § "Per-route JS budgets" (line 130) allows /search ≤ 120 KB; the
		// combined single-entry approach (per OQ#12 spec line 253) gates at the
		// search ceiling.
		//
		// Why 420 KB (Phase 3 bump from 60 KB): Phase 3 Task 10 ships a Sandpack
		// playground at /works/code-sandbox/. Astro emits the Sandpack island chunk
		// (SandboxIsland.js) into shared dist/_astro/. Measured all-JS gzip total:
		//   `gzip -c dist/_astro/*.js | wc -c` = 397,371 bytes (~388 KB).
		//   SandboxIsland alone: 212,640 bytes (~208 KB).
		//   Non-Sandpack chunks: ~185 KB (Search island, Svelte runtime, ClientRouter,
		//   pagefind init, Svelte islands, etc.).
		// Adding ~8% headroom → 420 KB. Option (c) per the Phase 3 plan: accept the
		// collision, bump the limit, and document in ADR 0019 (pending) that 420 KB
		// is the Phase 3 ceiling for the combined all-routes JS glob.
		// See: packages/specs/adrs/0019-sandpack-js-budget.md (pending)
		//
		// Why negated glob (Phase 5): the graph-vendor chunk (~57 KB gzip) is isolated
		// via astro.config.mjs manualChunks so it doesn't count against this cap.
		// The GraphView island only loads on /garden/graph/ (client:visible), so
		// including it in the global all-routes cap would be misleading. The graph-
		// specific JS budget is tracked in its own entry below.
		// See: packages/specs/adrs/0026-force-graph-over-sigma.md
		// Note: Vite appends `.{hash}.js` to manualChunks names, so the chunk
		// lands as `graph-vendor.{hash}.js` (dot-separated), not `graph-vendor-*`.
		name: "site js (all routes, ex graph-vendor)",
		path: ["dist/_astro/*.js", "!dist/_astro/graph-vendor.*.js"],
		gzip: true,
		limit: "420 KB",
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "pagefind ui js",
		path: ["dist/pagefind/pagefind-ui.js"],
		gzip: true,
		limit: "100 KB",
		disablePlugins: ["@size-limit/time"],
	},
	// Phase 3 detail-page budgets
	{
		// Why: /works/code-2/ is the representative no-island detail page (has body
		// text but no Svelte or Sandpack island). This fixtures the CSS+HTML budget
		// for detail pages that ship zero interactive islands.
		// See: packages/specs/specs/03-content-pipeline.md
		name: "detail page css+html (no-island)",
		path: ["dist/works/code-2/index.html", "dist/_astro/*.css"],
		gzip: true,
		limit: "60 KB",
		disablePlugins: ["@size-limit/time"],
	},
	{
		// Why: /works/code-1/ is the representative EC (Expressive Code) code-fence
		// detail page (has body text + JS-rendered code block). This fixtures the
		// CSS+HTML budget for detail pages that include EC syntax-highlighted fences.
		// See: packages/specs/specs/03-content-pipeline.md
		name: "detail page css+html (EC code)",
		path: ["dist/works/code-1/index.html", "dist/_astro/*.css"],
		gzip: true,
		limit: "60 KB",
		disablePlugins: ["@size-limit/time"],
	},
	// Phase 4 slash-page budgets
	{
		name: "now page css+html",
		path: ["dist/now/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "uses page css+html",
		path: ["dist/uses/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "colophon page css+html",
		path: ["dist/colophon/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "tops page css+html",
		path: ["dist/tops/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "stats page css+html",
		path: ["dist/stats/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	// Phase 5 garden route budgets
	{
		// Why: /garden/ index is a zero-JS static page (no islands beyond the
		// global CommandPalette + LinkPreview). 60 KB gzip matches the Phase 1
		// per-route ceiling for content pages.
		// See: packages/specs/specs/05-garden.md § Per-route size budgets summary
		name: "/garden/ css+html",
		path: ["dist/garden/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		// Why: /garden/welcome/ is the representative detail page (has body
		// text, wikilinks, backlinks footer). Same 60 KB ceiling as the index.
		// See: packages/specs/specs/05-garden.md § Per-route size budgets summary
		name: "/garden/welcome/ css+html",
		path: ["dist/garden/welcome/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		// Why: /garden/graph/ CSS+HTML share the same 60 KB ceiling. The JS
		// budget for the graph is tracked separately below.
		// See: packages/specs/specs/05-garden.md § Per-route size budgets summary
		name: "/garden/graph/ css+html",
		path: ["dist/garden/graph/index.html", "dist/_astro/*.css"],
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	{
		// Why: graph-vendor (force-graph + d3-force-3d) is isolated via
		// astro.config.mjs manualChunks so this budget covers only the chunks
		// loaded by /garden/graph/ that aren't part of the global site-js cap.
		// Measured at Phase 5 Task 12: graph-vendor ~57 KB gzip + GraphView ~1 KB
		// = ~58 KB total, well under the 180 KB spec ceiling.
		// See: packages/specs/specs/05-garden.md § Per-route size budgets summary
		// See: packages/specs/adrs/0026-force-graph-over-sigma.md
		// Note: Vite appends `.{hash}.js` (dot-separated) to manualChunks names.
		name: "/garden/graph/ js",
		path: ["dist/_astro/graph-vendor.*.js", "dist/_astro/GraphView*.js"],
		limit: "180 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
	// Phase 6 RSS firehose budget
	{
		// Why: /feed.xml is the unified firehose RSS feed (works + garden + slashes).
		// 30 KB ungzipped covers the spec's 30-item limit at typical post sizes
		// (~few hundred bytes of metadata + summary per <item>). Catches both
		// runaway item counts and accidental full-content embedding.
		// gzip:false because RSS is XML — readers fetch ungzipped from many CDNs
		// and the wire-size is what matters for RSS-reader memory.
		// See: packages/specs/specs/06-indieweb.md § "Per-route size budgets"
		// See: packages/specs/plans/06-indieweb.md § Task 11
		name: "feed.xml (RSS firehose)",
		path: "dist/feed.xml",
		limit: "30 KB",
		gzip: false,
		disablePlugins: ["@size-limit/time"],
	},
];
