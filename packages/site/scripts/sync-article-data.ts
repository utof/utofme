/**
 * Article data sync: projects the notes repo's data files into the committed, privacy-scanned
 * files under `src/data/article/` (plus sidecars and `facts.json` under `src/data/article-meta/`).
 *
 * Usage: `bun run sync:article-data [--from <notes>/article/data] [--only <name>...] [--check]`
 * Test seams: `--site-root <dir>` (where outputs live; default: this package) and
 * `--modules <dir>` (dataset modules; default `<site-root>/src/lib/article-data`).
 * `--only` names datasets, plus `facts` for the facts file. `--from` defaults to the env var
 * `UTOFME_ARTICLE_DATA` (local only, never set in CI; no absolute path is written anywhere).
 * Exit codes: 0 ok · 1 schema error · 2 privacy hit · 3 `--check` mismatch · 4 source missing.
 *
 * Why: islands fetch hashed static JSON that is a whitelist of the private data; one tool makes
 * that reproducible (a second run leaves `git diff` empty) and CI re-verifies it without the
 * notes repo (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync"
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Dataset } from "../src/lib/article-data/types";
import {
	buildDataset,
	buildFacts,
	checkDataset,
	checkFacts,
	EXIT,
	exitCodeOf,
	formatProblem,
	type Problem,
	parseSidecar,
	serialise,
} from "./lib/article-data-core";
import { parseDenylist } from "./lib/privacy-scan-core";

const TAG = "sync-article-data";

interface Args {
	readonly from: string | undefined;
	readonly only: readonly string[];
	readonly check: boolean;
	readonly siteRoot: string | undefined;
	readonly modules: string | undefined;
}

function parseArgs(argv: readonly string[]): Args | string {
	let from: string | undefined;
	let siteRoot: string | undefined;
	let modules: string | undefined;
	let check = false;
	const only: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i] ?? "";
		const value = (): string | undefined => {
			i++;
			return argv[i];
		};
		if (a === "--check") check = true;
		else if (a === "--from") from = value();
		else if (a === "--site-root") siteRoot = value();
		else if (a === "--modules") modules = value();
		else if (a === "--only") {
			while (argv[i + 1] !== undefined && !(argv[i + 1] ?? "").startsWith("--")) {
				i++;
				only.push(argv[i] ?? "");
			}
			if (only.length === 0) return "--only needs at least one name";
		} else return `unknown argument "${a}"`;
	}
	if ((from === "" || siteRoot === "" || modules === "") && !check) return "empty path argument";
	return { from, only, check, siteRoot, modules };
}

function isDataset(x: unknown): x is Dataset<{ schema: string }> {
	return (
		typeof x === "object" &&
		x !== null &&
		"name" in x &&
		typeof x.name === "string" &&
		"schemaId" in x &&
		typeof x.schemaId === "string" &&
		"sources" in x &&
		typeof x.sources === "object" &&
		"projected" in x &&
		typeof x.projected === "object" &&
		"project" in x &&
		typeof x.project === "function" &&
		"maxGzip" in x &&
		typeof x.maxGzip === "number"
	);
}

/** Lists `*.ts` in the modules folder (not `types.ts`) and loads each module's `dataset` export. */
async function discover(
	dir: string,
): Promise<{ datasets: Dataset<{ schema: string }>[]; problems: Problem[] }> {
	const datasets: Dataset<{ schema: string }>[] = [];
	const problems: Problem[] = [];
	const files = existsSync(dir)
		? readdirSync(dir)
				.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && f !== "types.ts")
				.sort()
		: [];
	for (const f of files) {
		const mod: unknown = await import(pathToFileURL(join(dir, f)).href);
		const ds =
			typeof mod === "object" && mod !== null && "dataset" in mod ? mod.dataset : undefined;
		if (!isDataset(ds)) {
			problems.push({ code: 1, file: f, message: "module does not export a `dataset`" });
		} else if (ds.name !== basename(f, ".ts")) {
			problems.push({
				code: 1,
				file: f,
				message: `dataset name "${ds.name}" differs from the file name`,
			});
		} else datasets.push(ds);
	}
	return { datasets, problems };
}

function readText(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Writes only when the content differs, so an unchanged sync touches no file. */
function writeIfChanged(path: string, text: string): boolean {
	if (readText(path) === text) return false;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
	return true;
}

function readSource(path: string, file: string): { value: unknown } | Problem {
	const text = readText(path);
	if (text === undefined) return { code: 4, file, message: "source file missing" };
	try {
		return { value: JSON.parse(text) };
	} catch {
		return { code: 1, file, message: "source is not valid JSON" };
	}
}

function report(tag: string, problems: readonly Problem[]): void {
	for (const p of problems) console.error(`${TAG}: [${tag}] ${formatProblem(p)}`);
}

function jsonNames(dir: string): string[] {
	return existsSync(dir)
		? readdirSync(dir)
				.filter((f) => f.endsWith(".json"))
				.map((f) => basename(f, ".json"))
				.sort()
		: [];
}

async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2));
	if (typeof args === "string") {
		console.error(`${TAG}: ${args}`);
		console.error(`usage: ${TAG} [--from <dir>] [--only <name>...] [--check]`);
		return EXIT.schema;
	}
	const siteRoot = resolve(args.siteRoot ?? fileURLToPath(new URL("..", import.meta.url)));
	const modulesDir = resolve(args.modules ?? join(siteRoot, "src/lib/article-data"));
	const outDir = join(siteRoot, "src/data/article");
	const metaDir = join(siteRoot, "src/data/article-meta");
	const sideDir = join(metaDir, "sources");

	const denylist = parseDenylist(process.env["PRIVACY_DENYLIST"]);
	if (denylist.length === 0) {
		console.warn(`${TAG}: warning: PRIVACY_DENYLIST not set; the denylist rule is skipped`);
	}

	const found = await discover(modulesDir);
	const known = new Set([...found.datasets.map((d) => d.name), "facts"]);
	const unknown = args.only.filter((n) => !known.has(n));
	if (unknown.length > 0) {
		console.error(`${TAG}: unknown dataset name(s): ${unknown.join(", ")}`);
		return EXIT.schema;
	}
	const wanted = (name: string): boolean => args.only.length === 0 || args.only.includes(name);
	const datasets = found.datasets.filter((d) => wanted(d.name));
	const all: Problem[] = [...found.problems];
	report("modules", found.problems);

	if (args.check) {
		for (const ds of datasets) {
			const problems = checkDataset(ds, {
				output: readText(join(outDir, `${ds.name}.json`)),
				sidecar: readText(join(sideDir, `${ds.name}.json`)),
				denylist,
			});
			report(ds.name, problems);
			all.push(...problems);
		}
		if (wanted("facts")) {
			const problems = checkFacts(readText(join(metaDir, "facts.json")), denylist);
			report("facts", problems);
			all.push(...problems);
		}
		if (args.only.length === 0) {
			const names = new Set(found.datasets.map((d) => d.name));
			const orphans: Problem[] = [
				...jsonNames(outDir)
					.filter((n) => !names.has(n))
					.map(
						(n): Problem => ({
							code: 3,
							file: `${n}.json`,
							message: "committed output has no dataset module",
						}),
					),
				...jsonNames(sideDir)
					.filter((n) => !names.has(n))
					.map(
						(n): Problem => ({
							code: 3,
							file: `sources/${n}.json`,
							message: "sidecar has no dataset module",
						}),
					),
			];
			report("orphans", orphans);
			all.push(...orphans);
		}
		const code = exitCodeOf(all);
		if (code === EXIT.ok)
			console.log(
				`${TAG}: check ok (${datasets.length} dataset(s)${wanted("facts") ? " + facts" : ""})`,
			);
		return code;
	}

	const from = args.from ?? process.env["UTOFME_ARTICLE_DATA"];
	if (from === undefined || from === "") {
		console.error(
			`${TAG}: no source folder: pass --from <notes>/article/data or set UTOFME_ARTICLE_DATA`,
		);
		return EXIT.missing;
	}
	const today = new Date().toISOString().slice(0, 10);
	for (const ds of datasets) {
		const sources: Record<string, unknown> = {};
		const problems: Problem[] = [];
		for (const file of Object.keys(ds.sources)) {
			const r = readSource(join(from, file), file);
			if ("value" in r) sources[file] = r.value;
			else problems.push(r);
		}
		if (problems.length === 0) {
			const built = buildDataset(ds, sources, {
				denylist,
				today,
				previous: parseSidecar(readText(join(sideDir, `${ds.name}.json`))),
			});
			if (built.ok) {
				// Why: both files are written even when the first changed (no short-circuit).
				const wroteOutput = writeIfChanged(join(outDir, `${ds.name}.json`), built.output);
				const wroteSidecar = writeIfChanged(
					join(sideDir, `${ds.name}.json`),
					serialise(built.sidecar),
				);
				const changed = wroteOutput || wroteSidecar;
				console.log(
					`${TAG}: ${ds.name}: ${changed ? "written" : "unchanged"} (${built.sidecar.bytes} B, ${built.sidecar.gzipBytes} B gzip)`,
				);
				continue;
			}
			problems.push(...built.problems);
		}
		report(ds.name, problems);
		all.push(...problems);
	}
	if (wanted("facts")) {
		const r = readSource(join(from, "facts.json"), "facts.json");
		if ("value" in r) {
			const built = buildFacts(r.value, denylist);
			if (built.ok) {
				const changed = writeIfChanged(join(metaDir, "facts.json"), built.output);
				console.log(`${TAG}: facts: ${changed ? "written" : "unchanged"}`);
			} else {
				report("facts", built.problems);
				all.push(...built.problems);
			}
		} else {
			report("facts", [r]);
			all.push(r);
		}
	}
	return exitCodeOf(all);
}

process.exit(await main());
