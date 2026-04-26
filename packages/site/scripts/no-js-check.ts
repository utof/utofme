/**
 * Post-build gate: asserts that no `.js` chunks exist under `dist/_astro/`
 * **unless** the build is running after Phase 2 Task 5 or later, in which
 * case Svelte island JS is expected.
 *
 * Why: Phase 2 Task 5 introduces `<FilterBar client:load>` which causes Astro
 * to emit Svelte runtime + component JS chunks. The original Phase 0 gate
 * (zero JS) no longer applies. This script now exits 0 unconditionally so the
 * rest of the build pipeline (size-limit, lighthouse) can verify budgets.
 * The per-route JS budget is enforced by size-limit (.size-limit.cjs) once
 * Task 13a adds JS budget entries.
 *
 * Why retained: keeping this script (as a no-op pass) preserves the CI
 * reference in package.json#scripts.check:no-js without breaking the pipeline.
 * It can be re-armed in a future phase if a zero-JS route is added.
 *
 * @see packages/specs/specs/00-foundations.md
 * @see packages/specs/plans/02-interactivity.md § Task 5
 */

// Why: Bun.Glob is the Bun-native glob API; no extra dep needed.
// Verified: Bun 1.x Glob.scanSync({ cwd }) matches relative paths under cwd.
// https://bun.sh/docs/api/glob

const glob = new Bun.Glob("_astro/*.js");
const distDir = new URL("../dist", import.meta.url).pathname;

const matches = Array.from(glob.scanSync({ cwd: distDir }));

// Why: Phase 2 Task 5+ emits JS — report count informatively but do not fail.
if (matches.length > 0) {
	process.stdout.write(
		`INFO: ${matches.length.toString()} JS chunk(s) found under dist/_astro/ (expected — Svelte island JS from Phase 2+).\n`,
	);
} else {
	process.stdout.write("OK: dist/_astro/ contains no .js chunks.\n");
}

process.exit(0);
