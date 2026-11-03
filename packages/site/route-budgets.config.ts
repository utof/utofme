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

/**
 * The budgets enforced in CI.
 *
 * Why: R2 (lazy JS), R7–R9 and the Δ-vs-main baseline are deferred by the spec
 * review (finding list "Defer"); only R1, R3, R4, R5, R6 are implemented.
 * @see packages/specs/specs/09-project-view.md § P9-2
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
		search: { firstViewJs: 70 * KB, html: 25 * KB, css: 10 * KB },
		graph: text,
		lab: { firstViewJs: 120 * KB, warnOnly: true },
	},
	routes: [
		{ match: "/", class: "home" },
		{ match: "/search/", class: "search" },
		{ match: "/garden/graph/", class: "graph" },
		{ match: /^\/lab\//, class: "lab" },
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
	unreferencedChunks: [],
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
