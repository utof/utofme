/**
 * Size Limit configuration for Phase 0.
 *
 * Why: enforces the ≤30 KB CSS+HTML gzip budget declared in
 * packages/specs/specs/00-foundations.md §"size-limit budget for Phase 0".
 *
 * The 0 KB JS hard-fail is NOT implemented here via a size-limit entry because
 * size-limit v12 treats "glob matches no files" as `missed=true` and exits 1
 * regardless of the limit. This means a JS-free build (the correct state) would
 * always fail the size-limit check — inverting the gate. Instead, the 0 KB JS
 * hard-fail is implemented exclusively in scripts/no-js-check.ts, which exits 1
 * if any `.js` files are found under `dist/_astro/` and exits 0 if none exist.
 *
 * One check:
 *   "home css+html" — gzipped transfer size of the index page (HTML + any
 *   inlined/linked CSS). The time plugin (from @size-limit/preset-app) is
 *   disabled per-entry via disablePlugins to avoid headless-Chrome dependency.
 *
 * @see packages/specs/specs/00-foundations.md
 * @see packages/specs/plans/00-foundations.md
 */
module.exports = [
	{
		name: "home css+html",
		path: "dist/index.html",
		limit: "30 KB",
		gzip: true,
		// Why: `webpack: false` is NOT used here — that option requires
		// @size-limit/webpack to be installed (size-limit v12 validates this and
		// throws if the webpack plugin is absent). Since we only have
		// @size-limit/file + @size-limit/preset-app, size-limit already uses
		// the file plugin for raw-file measurement without webpack involvement.
		// See: node_modules/size-limit/get-config.js OPTIONS.webpack = 'webpack'
		disablePlugins: ["@size-limit/time"],
	},
];
