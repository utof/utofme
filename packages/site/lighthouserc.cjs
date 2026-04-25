// Why: LHCI config shape follows the lighthouserc.cjs CJS module.exports convention.
// ci.collect.staticDistDir tells lhci autorun to spin up a static server from the
// built dist/ directory (no startServerCommand needed for static sites).
// ci.collect.settings.preset = "desktop" disables mobile throttling for this site
// (desktop-first layout; mobile audit deferred to Phase 8 performance hardening).
// ci.assert.assertions uses eslint-style [level, options] arrays; "error" means
// lhci exits non-zero if the threshold is not met.
// Source: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
// (verified 2026-04-25: staticDistDir, preset:desktop, and the LeveledAssertionDef
//  [level, {minScore}] shape are all confirmed in the official configuration guide)
module.exports = {
	ci: {
		collect: {
			staticDistDir: "./dist",
			settings: {
				preset: "desktop",
			},
		},
		assert: {
			assertions: {
				"categories:performance": ["error", { minScore: 0.95 }],
			},
		},
	},
};
