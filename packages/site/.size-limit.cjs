/**
 * Size Limit configuration: only entries that measure a single file or a
 * lazy chunk family remain here.
 *
 * Why: the per-route CSS+HTML entries summed `dist/_astro/*.css` (every CSS file
 * on the site, not the CSS a route links), and the site-js / pagefind-ui /
 * graph entries measured chunks no single route loads. Phase 9 moved all of that
 * to `bun run check:budgets` (packages/site/scripts/route-budgets.ts), which
 * walks each route's real import graph. The `pagefind runtime (first query)`
 * entry (120 KB) is added once P9-1 settles the Pagefind filenames.
 *
 * disablePlugins: ["@size-limit/time"] is set on all entries to avoid the
 * headless-Chrome dependency. Only @size-limit/file + @size-limit/preset-app
 * are installed.
 *
 * @see packages/specs/specs/09-project-view.md § P9-2
 * @see packages/specs/adrs/0047-per-route-budgets.md
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 */
module.exports = [
	// Phase 8 flag-gated hover-effect budgets
	{
		// Why: the two hover effects are lazy chunks separate from the platform chunks.
		// Measured 2026-11-02: card-dither 5.18 KB + card-mosh 8.56 KB gzip.
		// See: packages/specs/adrs/0040-light-only-masonry-home.md
		// See: packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
		name: "hover fx js (?dither / ?mosh)",
		path: ["dist/_astro/card-dither.*.js", "dist/_astro/card-mosh.*.js"],
		gzip: true,
		limit: "16 KB",
		disablePlugins: ["@size-limit/time"],
	},
	{
		// Why: the slider panel only ships on the noindex /lab/datamosh/ page.
		// Measured 2026-11-02: 3.76 KB gzip (it reuses the hover-fx chunks above).
		// See: packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
		name: "/lab/datamosh/ js",
		path: ["dist/_astro/MoshLab.*.js"],
		gzip: true,
		limit: "5 KB",
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
		// Why brotli:false (not gzip:false): the @size-limit/file plugin at
		// node_modules/@size-limit/file/index.js gates raw-byte mode on
		// `check.brotli === false`. `gzip: false` falls through to the
		// default brotli branch. Phase-7 nit #79 ("size-limit feed.xml says
		// raw bytes but reports brotli") fixed by switching the option.
		brotli: false,
		disablePlugins: ["@size-limit/time"],
	},
	// Phase 7 atmosphere-island budgets
	{
		// Why: CustomCursor.svelte ships behind `client:media="(pointer:fine)"`,
		// so it loads only on desktops. 1.5 KB gzip ceiling catches accidental
		// bloat (e.g. importing a heavy easing library).
		// See: packages/specs/specs/07-atmosphere.md § "Per-feature size budgets"
		// See: packages/specs/adrs/0036-cursor-svelte-island.md
		name: "cursor-island",
		path: ["dist/_astro/CustomCursor*.js"],
		gzip: true,
		limit: "1.5 KB",
		disablePlugins: ["@size-limit/time"],
	},
	// Why no click-counter-island entry: the light-only masonry home dropped the
	// ClickCounter island, so no ClickCounter chunk is emitted and size-limit
	// fails with "can't find files". Restore the 1 KB entry if it ships again.
	// See: packages/specs/adrs/0040-light-only-masonry-home.md
	{
		// Why: cmd-k.{mp3,webm} + hover.{mp3,webm} ship as static binary
		// audio assets. 40 KB raw is a generous ceiling — current total is
		// ~4.6 KB (under 5 % of the cap). brotli:false because already-
		// compressed audio (Opus/MP3) doesn't gzip meaningfully and we care
		// about the wire bytes the browser actually fetches.
		// See: packages/specs/specs/07-atmosphere.md § "Per-feature size budgets"
		// See: packages/specs/adrs/0037-web-audio-api.md
		name: "audio-assets",
		path: ["dist/audio/*"],
		brotli: false,
		limit: "40 KB",
		disablePlugins: ["@size-limit/time"],
	},
];
