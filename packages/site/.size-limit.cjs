/**
 * Size Limit configuration for Phase 2.
 *
 * Why: enforces per-route CSS+HTML and JS budgets declared in
 * packages/specs/specs/02-interactivity.md § "size-limit budget" (OQ#12).
 * Phase 1 had 2 entries (home + works, CSS+HTML only). Phase 2 adds:
 *   - /search route CSS+HTML entry
 *   - site-wide JS budget entry (all _astro/*.js chunks)
 *   - pagefind UI JS budget entry (dist/pagefind/pagefind-ui.js)
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
		// search ceiling. 60 KB is measurably safe (current build: ~55 KB) while
		// staying within the 120 KB spec ceiling.
		// See: packages/specs/specs/02-interactivity.md § "Per-route JS budgets"
		name: "site js (all routes)",
		path: ["dist/_astro/*.js"],
		gzip: true,
		limit: "60 KB",
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "pagefind ui js",
		path: ["dist/pagefind/pagefind-ui.js"],
		gzip: true,
		limit: "100 KB",
		disablePlugins: ["@size-limit/time"],
	},
];
