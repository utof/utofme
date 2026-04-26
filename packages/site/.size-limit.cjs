/**
 * Size Limit configuration for Phase 1.
 *
 * Why: enforces the ≤60 KB CSS+HTML gzip budget per route declared in
 * packages/specs/specs/01-card-grid-mvp.md §"size-limit budget".
 * Ceiling raised from 30 KB (Phase 0 / home only) to 60 KB to accommodate
 * the /works card-grid page with fixture card HTML.
 *
 * The 0 KB JS hard-fail is NOT implemented here via a size-limit entry because
 * size-limit v12 treats "glob matches no files" as `missed=true` and exits 1
 * regardless of the limit. This means a JS-free build (the correct state) would
 * always fail the size-limit check — inverting the gate. Instead, the 0 KB JS
 * hard-fail is implemented exclusively in scripts/no-js-check.ts, which exits 1
 * if any `.js` files are found under `dist/_astro/` and exits 0 if none exist.
 * That script globs `dist/_astro/*.js` route-agnostically, so /works coverage
 * is automatic without adding a JS entry here.
 *
 * Two checks (CSS+HTML only per route):
 *   "home css+html"  — gzipped transfer size of / (HTML + inlined/linked CSS).
 *   "works css+html" — gzipped transfer size of /works (HTML + inlined/linked CSS).
 * The time plugin (from @size-limit/preset-app) is disabled per-entry via
 * disablePlugins to avoid headless-Chrome dependency.
 *
 * @see packages/specs/specs/01-card-grid-mvp.md
 * @see packages/specs/plans/01-card-grid-mvp.md
 * @see scripts/no-js-check.ts
 */
module.exports = [
	{
		name: "home css+html",
		path: "dist/index.html",
		limit: "60 KB",
		gzip: true,
		// Why: `webpack: false` is NOT used here — that option requires
		// @size-limit/webpack to be installed (size-limit v12 validates this and
		// throws if the webpack plugin is absent). Since we only have
		// @size-limit/file + @size-limit/preset-app, size-limit already uses
		// the file plugin for raw-file measurement without webpack involvement.
		// See: node_modules/size-limit/get-config.js OPTIONS.webpack = 'webpack'
		disablePlugins: ["@size-limit/time"],
	},
	{
		name: "works css+html",
		path: "dist/works/index.html",
		limit: "60 KB",
		gzip: true,
		disablePlugins: ["@size-limit/time"],
	},
];
