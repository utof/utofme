/**
 * Post-build gate: asserts that no `.js` chunks exist under `dist/_astro/`.
 *
 * Why: Phase 0 hydrates zero islands — `output: 'static'` Astro with no
 * `client:*` directives emits no JS bundles. If a future change accidentally
 * adds a client directive (or registers `@astrojs/svelte` in astro.config.mjs
 * prematurely), this script exits 1 with the offending paths on stderr, making
 * the violation obvious in CI logs before the size-limit check runs.
 *
 * This is the post-build hard-fail gate referenced in:
 * @see packages/specs/specs/00-foundations.md
 * @see packages/specs/plans/00-foundations.md
 */

// Why: Bun.Glob is the Bun-native glob API; no extra dep needed.
// Verified: Bun 1.x Glob.scanSync({ cwd }) matches relative paths under cwd.
// https://bun.sh/docs/api/glob

const glob = new Bun.Glob("_astro/*.js");
const distDir = new URL("../dist", import.meta.url).pathname;

const matches = Array.from(glob.scanSync({ cwd: distDir }));

if (matches.length > 0) {
	for (const match of matches) {
		process.stderr.write(`ERROR: unexpected JS chunk in dist: ${match}\n`);
	}
	process.stderr.write(
		`FAIL: ${matches.length.toString()} JS chunk(s) found under dist/_astro/ — Phase 0 must ship 0 KB JS.\n`,
	);
	process.exit(1);
}

process.stdout.write("OK: dist/_astro/ contains no .js chunks.\n");
process.exit(0);
