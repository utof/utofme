// dependency-cruiser configuration for packages/site/src.
//
// Why: validates that the src/ dependency graph stays clean as the codebase
//   grows across phases. Run via `bun run check:depcruise` or lefthook.
//   Configured at the packages/site level (not workspace root) so that
//   tsConfig resolution picks up astro/tsconfigs/strictest correctly.
//
// Rules active in Phase 0:
//   no-circular          — circular deps cause hard-to-debug runtime issues
//   no-orphans           — orphan src/ modules are dead code (knip also catches this;
//                          belt-and-suspenders for dep-graph orphans specifically)
//   no-deprecated-core   — deprecated Node core modules (e.g. `url`, `querystring`)
//
// Placeholder rule (Phase 3):
//   no-mdx-to-pages      — once MDX content pipeline lands in Phase 1 this rule
//                          will forbid content modules importing from src/pages/
//                          to prevent accidental circular content↔page deps.
//                          Stubbed here so the shape is defined; activated in
//                          the Phase 3 plan when the import pattern exists.
//   See: packages/specs/plans/00-foundations.md § "ADRs to write"
//
// Sources:
//   https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
//   https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: "no-circular",
			severity: "error",
			comment:
				"Circular dependencies make module load order unpredictable and cause hard-to-debug issues.",
			from: {},
			to: { circular: true },
		},
		{
			name: "no-orphans",
			severity: "error",
			comment:
				"Orphan modules in src/ are unreachable dead code. Remove them or wire them to an entry point.",
			from: { orphan: true, pathNot: "^src/env\\.d\\.ts$" },
			to: {},
		},
		// Why: warn (not error) — Node deprecates these on a slow timeline; warning
		// lets us catch use without blocking unrelated work.
		{
			name: "no-deprecated-core",
			severity: "warn",
			comment:
				"Deprecated Node.js core modules (e.g. `url`, `querystring`) have modern replacements.",
			from: {},
			to: { dependencyTypes: ["core"], path: "^(url|querystring|domain|constants|sys|_linklist)$" },
		},
		// Phase 3 placeholder: forbid content modules importing from src/pages/.
		// Uncomment and adjust the path pattern when the MDX content pipeline lands.
		// {
		//   name: "no-mdx-to-pages",
		//   severity: "error",
		//   comment: "Content modules must not import from src/pages/ — activates in Phase 3.",
		//   from: { path: "^src/content/" },
		//   to: { path: "^src/pages/" },
		// },
	],
	options: {
		tsConfig: {
			fileName: "tsconfig.json",
		},
		combinedDependencies: true,
		/* instruct depcruise to look into node_modules for type resolution only */
		exclude: {
			path: "^(node_modules|\\.astro)/",
		},
	},
};
