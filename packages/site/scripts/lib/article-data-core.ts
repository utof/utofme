/**
 * Dataset sync core (pure apart from gzip/sha): source parse → project → projected parse →
 * deterministic serialise → gzip cap → privacy scan (shipped set) → output + sidecar, and the
 * `--check` counterpart that re-verifies committed files without the notes repo.
 *
 * Problems carry a file, a JSON path and a rule id, never matched text or source values, so logs
 * cannot reproduce what the scan caught.
 *
 * Why: the sync CLI, the CI `--check` and the unit tests share one pipeline, so a dataset that
 * passes locally passes in CI (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync"
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { z } from "astro/zod";
import type { Dataset } from "../../src/lib/article-data/types";
import { type Finding, scanJson, scanText } from "./privacy-scan-core";

/**
 * Process exit codes of `sync:article-data`.
 *
 * Why: CI and humans read the code first; the spec fixes the meanings.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync" (exit codes)
 */
export const EXIT = { ok: 0, schema: 1, privacy: 2, mismatch: 3, missing: 4 } as const;

/** One of the non-zero {@link EXIT} values. */
export type ProblemCode = 1 | 2 | 3 | 4;

/** A reportable failure: where it is, which rule, never the offending text. */
export interface Problem {
	readonly code: ProblemCode;
	readonly file: string;
	readonly where?: string;
	readonly rule?: string;
	readonly message: string;
}

/**
 * The per-dataset sidecar (`src/data/article-meta/sources/<name>.json`).
 *
 * Why: one sidecar per dataset, so parallel lanes never edit the same file; no notes commit
 * hash and no path, only file names.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync"
 */
const sidecarSchema = z.strictObject({
	schema: z.string(),
	sources: z.array(z.string()),
	bytes: z.number().int().nonnegative(),
	gzipBytes: z.number().int().nonnegative(),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	syncedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** A parsed sidecar. */
export type Sidecar = z.infer<typeof sidecarSchema>;

/**
 * Parses sidecar text; `undefined` when absent, not JSON or not a sidecar.
 *
 * Why: the CLI reads the previous sidecar to keep `syncedAt` stable; `--check` reports an
 * unreadable one as a mismatch.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync"
 */
export function parseSidecar(text: string | undefined): Sidecar | undefined {
	try {
		const r = sidecarSchema.safeParse(JSON.parse(text ?? ""));
		return r.success ? r.data : undefined;
	} catch {
		return undefined;
	}
}

/** `gzip -9` size of the UTF-8 text, in bytes. @see https://nodejs.org/api/zlib.html */
export function gzipBytes(text: string): number {
	return gzipSync(Buffer.from(text, "utf8"), { level: 9 }).length;
}

/** Lower-case hex SHA-256 of the UTF-8 text. @see https://nodejs.org/api/crypto.html */
export function sha256Hex(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

function ser(v: unknown, inArray: boolean): string {
	if (v === null) return "null";
	switch (typeof v) {
		case "string":
		case "boolean":
			return JSON.stringify(v);
		case "number":
			if (!Number.isFinite(v)) throw new Error("serialise: numbers must be finite");
			return JSON.stringify(v);
		case "object": {
			if (Array.isArray(v)) return `[${(v as unknown[]).map((x) => ser(x, true)).join(",")}]`;
			const o: Record<string, unknown> = Object(v);
			const parts: string[] = [];
			for (const k of Object.keys(o).sort()) {
				const x = o[k];
				if (x === undefined) continue;
				parts.push(`${JSON.stringify(k)}:${ser(x, false)}`);
			}
			return `{${parts.join(",")}}`;
		}
		default:
			if (inArray) return "null";
			throw new Error(`serialise: unsupported value of type ${typeof v}`);
	}
}

/**
 * Deterministic compact JSON: object keys sorted by code unit at every depth, one trailing
 * newline; refuses `NaN` and infinities (JSON would write `null`).
 *
 * Why: a second sync must leave `git diff` empty (AC3.7) and the sidecar's sha256 must be
 * reproducible; integer-like keys would otherwise be ordered numerically by `JSON.stringify`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync"
 */
export function serialise(value: unknown): string {
	return `${ser(value, false)}\n`;
}

function pathOf(path: ReadonlyArray<PropertyKey>): string {
	let out = "$";
	for (const seg of path) {
		if (typeof seg === "number") out += `[${seg}]`;
		else {
			const s = String(seg);
			out += /^[A-Za-z_]\w*$/.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`;
		}
	}
	return out;
}

/** Why: Zod messages can quote received values; the issue `code` and the path are enough to fix it. */
function schemaProblems(file: string, issues: ReadonlyArray<z.core.$ZodIssue>): Problem[] {
	return issues.map((i) => ({
		code: 1,
		file,
		where: pathOf(i.path),
		message: `schema error (${i.code})`,
	}));
}

/**
 * Why: a denylisted word can be a JSON key, and the finding's path would print it; such key
 * segments are replaced so a log never reproduces the matched text.
 */
function redactPath(where: string, denylist: readonly string[]): string {
	return where.replace(/\.(\w+)|\["((?:[^"\\]|\\.)*)"\]/g, (seg, id?: string, quoted?: string) => {
		const key = id ?? quoted ?? "";
		const hit = scanText(key, "core", denylist).some((f) => f.rule === "denylist");
		return hit ? ".<redacted>" : seg;
	});
}

function privacyProblems(
	file: string,
	findings: readonly Finding[],
	denylist: readonly string[],
): Problem[] {
	return findings.map((f) => ({
		code: 2,
		file,
		...(f.where === undefined ? {} : { where: redactPath(f.where, denylist) }),
		rule: f.rule,
		message: "privacy scan hit",
	}));
}

/**
 * One-line, log-safe rendering of a problem: `file[ at path][ (rule)]: message`.
 *
 * Why: the CLI prints this verbatim; it must never contain matched text.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync" (exit codes)
 */
export function formatProblem(p: Problem): string {
	return `${p.file}${p.where === undefined ? "" : ` at ${p.where}`}${
		p.rule === undefined ? "" : ` (${p.rule})`
	}: ${p.message}`;
}

/**
 * The exit code for a list of problems: 0 when empty, else the first problem's code.
 *
 * Why: a deterministic single code for CI while the log lists every problem.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync" (exit codes)
 */
export function exitCodeOf(problems: readonly Problem[]): number {
	return problems[0]?.code ?? EXIT.ok;
}

/** A successful build: the file text and its sidecar. */
export interface BuildOk {
	readonly ok: true;
	readonly output: string;
	readonly sidecar: Sidecar;
}

/** A failed build. */
export interface BuildFail {
	readonly ok: false;
	readonly problems: readonly Problem[];
}

/** Inputs of {@link buildDataset} besides the sources. */
export interface BuildContext {
	/** Parsed `PRIVACY_DENYLIST` words (may be empty). */
	readonly denylist: readonly string[];
	/** UTC date `YYYY-MM-DD` stamped into a new sidecar. */
	readonly today: string;
	/** The committed sidecar, so an unchanged output keeps its `syncedAt`. */
	readonly previous?: Sidecar | undefined;
}

/**
 * Runs the full pipeline for one dataset on already parsed source files (keyed by notes file name).
 *
 * Why: `syncedAt` is kept while the output's sha256 is unchanged, so a second run changes no file
 * (AC3.7); a cap overrun is an error here and is never raised silently.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync"
 */
export function buildDataset(
	ds: Dataset<{ schema: string }>,
	sources: Readonly<Record<string, unknown>>,
	ctx: BuildContext,
): BuildOk | BuildFail {
	const outFile = `${ds.name}.json`;
	const names = Object.keys(ds.sources).sort();
	const problems: Problem[] = [];
	for (const name of names) {
		const raw = sources[name];
		if (raw === undefined) {
			problems.push({ code: 4, file: name, message: "source file missing" });
			continue;
		}
		const schema = ds.sources[name];
		const r = schema?.safeParse(raw);
		if (r !== undefined && !r.success) problems.push(...schemaProblems(name, r.error.issues));
	}
	if (problems.length > 0) return { ok: false, problems };

	let projected: { schema: string };
	try {
		projected = ds.project(sources);
	} catch (e) {
		const msg = e instanceof Error ? e.message : "unknown error";
		return {
			ok: false,
			problems: [{ code: 1, file: outFile, message: `projection threw: ${msg}` }],
		};
	}
	const check = ds.projected.safeParse(projected);
	if (!check.success) return { ok: false, problems: schemaProblems(outFile, check.error.issues) };

	const output = serialise(projected);
	const gz = gzipBytes(output);
	if (gz > ds.maxGzip) {
		return {
			ok: false,
			problems: [
				{ code: 1, file: outFile, message: `gzip size ${gz} B is over the cap of ${ds.maxGzip} B` },
			],
		};
	}
	const hits = privacyProblems(outFile, scanJson(projected, "shipped", ctx.denylist), ctx.denylist);
	if (hits.length > 0) return { ok: false, problems: hits };

	const sha = sha256Hex(output);
	const bytes = Buffer.byteLength(output, "utf8");
	const prev = ctx.previous;
	const unchanged =
		prev !== undefined &&
		prev.sha256 === sha &&
		prev.bytes === bytes &&
		prev.schema === ds.schemaId &&
		prev.sources.join("\n") === names.join("\n");
	return {
		ok: true,
		output,
		sidecar: {
			schema: ds.schemaId,
			sources: names,
			bytes,
			gzipBytes: gz,
			sha256: sha,
			syncedAt: unchanged ? prev.syncedAt : ctx.today,
		},
	};
}

/** The top-level `schema` of a parsed value, or `undefined`. */
function schemaOf(value: unknown): unknown {
	return typeof value === "object" && value !== null && "schema" in value
		? value.schema
		: undefined;
}

/** Inputs of {@link checkDataset}: committed file texts (`undefined` = file absent). */
export interface CheckInput {
	readonly output: string | undefined;
	readonly sidecar: string | undefined;
	readonly denylist: readonly string[];
}

/**
 * `--check` for one dataset, without the notes repo: the committed output parses with its
 * `projected` schema (1), carries its schema id, is canonical, matches its sidecar's sha256 and
 * sizes and stays within its cap (all 3), and scans clean (2).
 *
 * Why: CI proves that what is committed is what a sync would have produced under the same rules,
 * and that nobody hand-edited a data file or raised a cap (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Sync" (`--check`)
 */
export function checkDataset(ds: Dataset<{ schema: string }>, input: CheckInput): Problem[] {
	const file = `${ds.name}.json`;
	const text = input.output;
	if (text === undefined) return [{ code: 3, file, message: "committed output is missing" }];
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return [{ code: 1, file, message: "output is not valid JSON" }];
	}
	const problems: Problem[] = [];
	const id = schemaOf(value);
	if (id !== ds.schemaId) {
		problems.push({
			code: 3,
			file,
			where: "$.schema",
			message: `schema id differs from the dataset's "${ds.schemaId}"`,
		});
	} else {
		const r = ds.projected.safeParse(value);
		if (!r.success) problems.push(...schemaProblems(file, r.error.issues));
	}
	if (serialise(value) !== text) {
		problems.push({ code: 3, file, message: "output is not in canonical (sorted, compact) form" });
	}

	const side = parseSidecar(input.sidecar);
	if (side === undefined) {
		problems.push({
			code: 3,
			file: `sources/${ds.name}.json`,
			message: "sidecar is missing or invalid",
		});
	} else {
		const sc = `sources/${ds.name}.json`;
		const bytes = Buffer.byteLength(text, "utf8");
		if (side.schema !== ds.schemaId) {
			problems.push({ code: 3, file: sc, message: "sidecar schema differs from the dataset" });
		}
		if (side.sha256 !== sha256Hex(text)) {
			problems.push({ code: 3, file: sc, message: "sidecar sha256 differs from the output" });
		}
		if (side.bytes !== bytes || side.gzipBytes !== gzipBytes(text)) {
			problems.push({ code: 3, file: sc, message: "sidecar sizes differ from the output" });
		}
	}
	const gz = gzipBytes(text);
	if (gz > ds.maxGzip) {
		problems.push({
			code: 3,
			file,
			message: `gzip size ${gz} B is over the cap of ${ds.maxGzip} B`,
		});
	}
	problems.push(
		...privacyProblems(file, scanJson(value, "shipped", input.denylist), input.denylist),
	);
	return problems;
}
