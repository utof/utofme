/**
 * Typed per-route budgets table for `check:budgets`.
 *
 * Why: budgets live in a type-checked TS module rather than JSONC (spec author's
 * call, P9-2). Units: bytes; "KB" = 1024 like `size-limit`. JS/HTML/CSS are
 * gzip-9, media is raw. Numbers come from the spec's "Budgets for this phase".
 *
 * @see packages/specs/specs/09-project-view.md § "Budgets for this phase"
 * @see packages/specs/adrs/0047-per-route-budgets.md
 */
import type { BudgetsConfig, RouteClassLimits } from "./scripts/lib/route-budgets-core.ts";

const KB = 1024;

const text: RouteClassLimits = {
	firstViewJs: 40 * KB,
	html: 25 * KB,
	css: 10 * KB,
	cssMath: 20 * KB,
};
const listing: RouteClassLimits = {
	firstViewJs: 45 * KB,
	html: 45 * KB,
	css: 10 * KB,
	eagerPosterTotal: 200 * KB,
	lcpPoster: 100 * KB,
	posterTargetWidth: 640,
};

/** Site-chrome islands that R10 does not bound (AC16.3 keeps them unchanged). @see packages/specs/specs/10-tactical-arena-article.md § P10-16 */
const chromeIslands: readonly string[] = ["CommandPalette", "LinkPreview", "CustomCursor"];

/**
 * R10: exclusive lazy JS per island, keyed by the island's `opts.name`.
 *
 * Why: shared chunks count once, in R2; the Svelte runtime is already in the
 * first view (the chrome's `client:idle` islands), so islands pay only for
 * their own code.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-16
 */
const islandJs: Readonly<Record<string, number>> = {
	Replay: 25 * KB,
	SmokeSight: 15 * KB,
	Elo: 12 * KB,
	Tempo: 8 * KB,
	Machine: 8 * KB,
	Notebook: 12 * KB,
	FreePeek: 8 * KB,
	MapStages: 10 * KB,
	Noise: 6 * KB,
	RollMap: 6 * KB,
	AgentsVsPros: 6 * KB,
	EloSentence: 2 * KB,
};

/**
 * The budgets enforced in CI.
 *
 * Why: R7, R8 and the Δ-vs-main baseline stay deferred (spec 09 review); phase 10
 * adds R2 (lazy JS), R9 (eager islands) and R10 (per-island JS) for the classes
 * that declare `lazyJs` / `islandJs`.
 * @see packages/specs/specs/09-project-view.md § P9-2
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-16
 * @see packages/specs/adrs/0057-per-island-lazy-js-budgets.md
 */
export const budgets: BudgetsConfig = {
	platformFirstViewJs: 40 * KB,
	eagerCardCount: 4,
	classes: {
		home: listing,
		project: {
			firstViewJs: 40 * KB,
			html: 30 * KB,
			css: 10 * KB,
			cssEc: 15 * KB,
			lcpPoster: 200 * KB,
			posterTargetWidth: 1280,
		},
		text,
		article: {
			firstViewJs: 40 * KB, // unchanged: every figure island is lazy
			// Why: eleven SSR keyframes with their no-JS tables measure ~47 KB before F6/F7 are
			// drawn in full; Lighthouse mobile stays at 0.95-0.96 (CLS <= 0.0044), so the spec's
			// 45 KB became 60 KB (ADR 0057, integration).
			html: 60 * KB,
			// Why: Astro links every island's CSS in <head>, so each of the 11 figures adds
			// ~1-1.5 KB gzip on top of KaTeX (7.9 KB) and the layouts (~6.5 KB); 15 KB held
			// only the stub figures. Lane I checks LCP/CLS against the real page.
			css: 30 * KB,
			cssMath: 30 * KB,
			lcpPoster: 200 * KB,
			posterTargetWidth: 1280,
			lazyJs: 160 * KB,
			islandJs,
			chromeIslands,
		},
		labFigure: {
			firstViewJs: 40 * KB,
			html: 30 * KB,
			// Why: the lab pages are one dynamic route with an eager glob over every Block, so each
			// links all twelve figures' CSS (10.8 KB once F6/F7 landed). Fixture builds only, never
			// deployed (ADR 0057, integration).
			css: 12 * KB,
			lazyJs: 60 * KB,
			islandJs,
			chromeIslands,
		},
		search: { firstViewJs: 70 * KB, html: 25 * KB, css: 10 * KB },
		graph: text,
		lab: { firstViewJs: 120 * KB, warnOnly: true },
	},
	routes: [
		{ match: "/", class: "home" },
		{ match: "/search/", class: "search" },
		{ match: "/garden/graph/", class: "graph" },
		{ match: /^\/lab\/figures\//, class: "labFigure" },
		{ match: /^\/lab\//, class: "lab" },
		{ match: "/works/tactical-arena/", class: "article" },
		{ match: /^\/works\/[^/]+\/$/, class: "project" },
		{ match: /^\/(?:now|uses|colophon|tops|stats|garden)\/$/, class: "text" },
		{ match: /^\/garden\/[^/]+\/$/, class: "text" },
	],
	excluded: [
		{
			// Why: Sandpack mounts `client:only`, so first-view JS is ~300 KB against the
			// 40 KB project limit. The spec review defers the Sandpack facade (P9-12,
			// finding 8), so the route is measured and reported but cannot fail the build.
			// Remove this entry when the facade lands.
			route: "/works/code-sandbox/",
			reason: "Sandpack mounts client:only; facade (P9-12) deferred by the spec review",
		},
		// Why: these fixture works keep a raw GIF cover (1.2–1.8 MB) to exercise the still
		// fallback; they are built only with UTOFME_FIXTURES on and never deployed (ADR 0049).
		...["code-1", "math-2", "music-2", "no-link", "video-2", "writing-2", "writing-mdx-island"].map(
			(slug) => ({ route: `/works/${slug}/`, reason: "fixture with a GIF cover; not deployed" }),
		),
	],
	// Why: with UTOFME_FIXTURES=false (the deploy) the fixture works are filtered from the
	// collection but their island/EC/Sandpack chunks are still emitted by the bundler and
	// no route reaches them (ADR 0049). With fixtures on, every chunk is reachable.
	unreferencedChunks:
		process.env.UTOFME_FIXTURES === "false"
			? [
					{
						pattern:
							/^_astro\/(?:SandboxIsland|Counter|react|client|runtime|node|utils|index|consoleHook|base|ec)[.-]/,
						reason:
							"fixture-only islands (Sandpack, Counter, expressive-code) when fixtures are hidden",
					},
				]
			: [],
	// Why: banner files were ≤ 1,000,000 B (warn 600 KB) at 1280x720; the banner is now 1920x1080
	// (owner: "banner too low quality"), so the limits are the encoder's: fail > 2.5 MB, warn > 1.5 MB.
	// Keep in sync with SIZE_SPECS.banner in scripts/lib/loops-core.ts (ADR 0044 addendum).
	loops: {
		cardMax: 300 * KB,
		cardWarn: 150 * KB,
		bannerMax: 2.5 * 1024 * KB,
		bannerWarn: 1.5 * 1024 * KB,
	},
};
