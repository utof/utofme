/**
 * Privacy scan CLI: runs the rules in `scripts/lib/privacy-scan-core.ts` over the
 * article surfaces (default), explicit paths, and/or a built `dist/`.
 *
 * Usage: `bun run check:privacy [--dist <dir>] [--require-denylist] [--root <repo>] [paths…]`
 * Exit codes: 0 clean · 2 hit(s) (rule id + file + JSON path, never the matched text) ·
 * 4 `--require-denylist` without `PRIVACY_DENYLIST`.
 *
 * Why: the denylist (real names) lives only in the Actions secret / owner env and is never
 * committed; without it local and CI runs warn and still run every other rule, the deploy
 * passes `--require-denylist` (ADR 0055).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Privacy scan"
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
	classifyPath,
	type Finding,
	parseDenylist,
	type RuleSet,
	scanJson,
	scanText,
} from "./lib/privacy-scan-core";

const TEXT_EXT =
	/\.(html|xml|txt|json|jsonc|js|mjs|cjs|css|svg|webmanifest|md|mdx|ts|astro|svelte)$/;

const SITE = "packages/site";
const DEFAULT_ROOTS = [
	`${SITE}/src/data/article`,
	`${SITE}/src/data/article-meta`,
	`${SITE}/src/content/works/tactical-arena.mdx`,
	`${SITE}/src/components/article`,
	`${SITE}/src/lib/figures`,
	`${SITE}/src/lib/article-data`,
	`${SITE}/tests/fixtures/article`,
	`${SITE}/tests/fixtures/article-sync`,
	"packages/specs/specs",
	"packages/specs/plans",
	"packages/specs/reports",
	"packages/specs/adrs",
];

function flag(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

function walk(path: string, out: string[]): void {
	let st: ReturnType<typeof statSync>;
	try {
		st = statSync(path);
	} catch {
		return;
	}
	if (st.isDirectory()) for (const n of readdirSync(path)) walk(join(path, n), out);
	else out.push(path);
}

/** Why: positional paths are everything that is not a flag or a flag's value. */
function positional(): string[] {
	const valued = new Set(["--dist", "--root"]);
	const out: string[] = [];
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		const a = args[i] ?? "";
		if (valued.has(a)) i++;
		else if (!a.startsWith("--")) out.push(a);
	}
	return out;
}

function main(): number {
	const denylist = parseDenylist(process.env["PRIVACY_DENYLIST"]);
	if (denylist.length === 0) {
		if (process.argv.includes("--require-denylist")) {
			console.error("check-privacy: PRIVACY_DENYLIST is empty or unset (required here)");
			return 4;
		}
		console.warn("check-privacy: warning: PRIVACY_DENYLIST not set; the denylist rule is skipped");
	}
	const root = resolve(flag("--root") ?? join(process.cwd(), "..", ".."));
	const distArg = flag("--dist");
	const dist = distArg === undefined ? undefined : resolve(distArg);

	// [absolute file, logical repo-relative path]
	const files: Array<[string, string]> = [];
	const explicit = positional();
	if (explicit.length > 0) {
		for (const p of explicit) {
			const found: string[] = [];
			walk(resolve(p), found);
			for (const f of found) files.push([f, relative(root, f).split(sep).join("/")]);
		}
	} else {
		for (const r of DEFAULT_ROOTS) {
			const found: string[] = [];
			walk(join(root, r), found);
			for (const f of found) files.push([f, relative(root, f).split(sep).join("/")]);
		}
	}
	if (dist !== undefined) {
		const found: string[] = [];
		walk(dist, found);
		for (const f of found)
			files.push([f, `${SITE}/dist/${relative(dist, f).split(sep).join("/")}`]);
	}

	let hits = 0;
	let scanned = 0;
	for (const [abs, rel] of files) {
		if (!TEXT_EXT.test(abs)) continue;
		const cls = classifyPath(rel);
		if (cls === "excluded") continue;
		// Why: explicit paths outside the scope table still get the core rules.
		const set: RuleSet = cls ?? "core";
		if (cls === undefined && explicit.length === 0) continue;
		const text = readFileSync(abs, "utf8");
		let found: Finding[];
		if (abs.endsWith(".json")) {
			try {
				found = scanJson(JSON.parse(text), set, denylist);
			} catch {
				found = scanText(text, set, denylist);
			}
		} else found = scanText(text, set, denylist);
		scanned++;
		for (const f of found) {
			hits++;
			console.error(
				`check-privacy: ${rel}: ${f.rule}${f.where === undefined ? "" : ` at ${f.where}`}`,
			);
		}
	}
	if (hits > 0) {
		console.error(`check-privacy: ${hits} hit(s) in ${scanned} file(s)`);
		return 2;
	}
	console.log(`check-privacy: clean (${scanned} files)`);
	return 0;
}

process.exit(main());
