/**
 * Walks every `.ts` file under a given root directory and asserts that each
 * exported symbol carries a TSDoc comment with at least one of:
 *   - a `@see` tag,
 *   - an `@issue` tag, or
 *   - a description line matching `/^\s*\*?\s*Why:/`.
 *
 * Exit 0 = all exports documented. Exit 1 = one or more offenders printed to stderr.
 *
 * Why: CLAUDE.md § "Documentation-for-trust" mandates every exported symbol
 * carries a TSDoc with `@see`, `@issue`, or `Why:` — this script enforces it
 * at precommit time (lefthook job 7) and in CI.
 * @see CLAUDE.md
 */

import { join, resolve } from "node:path";
import { type JSDoc, Node, Project } from "ts-morph";

/** Regex that matches a "Why:" documentation line anywhere in JSDoc inner text. */
const WHY_RE = /^\s*\*?\s*Why:/m;

/**
 * Parses `--root <path>` from process.argv; defaults to `"src"`.
 *
 * Why: the check-docs script must be runnable on arbitrary sub-trees so that
 * Task 5a's fixture-based RED test can point at `tests/fixtures/check-docs`
 * without re-scanning the whole project.
 * @see packages/specs/plans/00-foundations.md
 */
function parseRootArg(): string {
	const idx = process.argv.indexOf("--root");
	if (idx !== -1 && idx + 1 < process.argv.length) {
		const arg = process.argv[idx + 1];
		if (arg !== undefined) return arg;
	}
	return "src";
}

/**
 * Returns true if the given array of JSDoc nodes satisfies the documentation
 * rule: at least one doc must have a `@see` tag, `@issue` tag, or a `Why:`
 * line in its inner text.
 *
 * Why: centralises the three-branch rule so both the variable-statement path
 * and the direct-declaration path share the same logic without duplication.
 * @see CLAUDE.md
 */
function isDocumented(jsDocs: JSDoc[]): boolean {
	for (const doc of jsDocs) {
		// Check tags first — O(tags) not O(text length)
		for (const tag of doc.getTags()) {
			const name = tag.getTagName();
			if (name === "see" || name === "issue") return true;
		}
		// Fall back to full inner-text scan for Why: lines
		if (WHY_RE.test(doc.getInnerText())) return true;
	}
	return false;
}

/**
 * Main entry point. Scans `<cwd>/<root>` for exported declarations lacking
 * required TSDoc and exits 1 listing offenders to stderr.
 *
 * Why: invoked by `bun run check:docs` (package.json script) and lefthook
 * precommit job 7. Bun executes this file directly via TS transpilation —
 * no compile step needed.
 * @see packages/specs/plans/00-foundations.md
 */
function main(): void {
	const rootArg = parseRootArg();
	const cwd = process.cwd();
	const root = resolve(cwd, rootArg);

	const project = new Project({
		tsConfigFilePath: join(cwd, "tsconfig.json"),
		skipFileDependencyResolution: true,
	});

	// Add only the files under the requested root — do not rely on tsconfig
	// include globs, which may not cover fixtures or arbitrary --root paths.
	project.addSourceFilesAtPaths(join(root, "**/*.ts"));

	const offenders: Array<{ file: string; line: number; name: string }> = [];

	for (const sourceFile of project.getSourceFiles()) {
		// Skip files outside the requested root to avoid contamination from
		// tsconfig-included paths (e.g. .astro/types.d.ts).
		if (!sourceFile.getFilePath().startsWith(root)) continue;

		for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
			for (const decl of declarations) {
				let documented = false;

				if (Node.isVariableDeclaration(decl)) {
					// VariableDeclaration is not JSDocableNode; JSDoc lives on the
					// parent VariableStatement.
					// Why: TypeScript AST attaches JSDoc to the statement, not the
					// individual declarator. ts-morph docs/details/documentation.md
					// confirms getJsDocs() is on JSDocableNode which VariableStatement
					// implements but VariableDeclaration does not.
					const stmt = decl.getVariableStatement();
					if (stmt !== undefined && Node.isJSDocable(stmt)) {
						documented = isDocumented(stmt.getJsDocs());
					}
				} else if (Node.isJSDocable(decl)) {
					documented = isDocumented(decl.getJsDocs());
				} else {
					// Expression / SourceFile re-exports — not documentable at the
					// declaration site. Treat as pass to avoid false positives on
					// `export { foo } from "./bar"` re-exports.
					documented = true;
				}

				if (!documented) {
					offenders.push({
						file: sourceFile.getFilePath(),
						line: decl.getStartLineNumber(),
						name,
					});
				}
			}
		}
	}

	if (offenders.length === 0) {
		process.exit(0);
	}

	for (const { file, line, name } of offenders) {
		process.stderr.write(`ERROR ${file}:${line} exported '${name}' lacks @see / @issue / Why:\n`);
	}
	process.exit(1);
}

main();
