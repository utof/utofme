/**
 * Size Limit configuration for Phase 2 + Phase 3.
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
		name: "site js (all routes)",
		path: ["dist/_astro/*.js"],
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
];
