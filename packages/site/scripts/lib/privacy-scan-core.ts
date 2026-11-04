/**
 * Privacy scan core (pure): rule sets, scope table and the denylist matcher.
 *
 * Findings carry the rule id and a location (JSON path), never the matched text,
 * so logs and CI output cannot leak what the scan caught.
 *
 * Why: the research article ships derived data from a private notes repo; one
 * scanner guards sync output, source files and the built `dist/` (ADR 0055).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Privacy scan"
 */

/**
 * Which rules run: `core` everywhere, `shipped` adds the notes-repo rules, `docs` is denylist + email only,
 * `bundle` (built JS/CSS in `dist/`) is denylist + `cgnat` + `home-path` + `token-like`.
 *
 * Why: `bundle` is a deliberate narrowing of the spec's "core on every other text file in dist":
 * vendored bundles contain email regexes and loopback literals (127.0.0.1) that fail `email`/`ipv4`
 * on a clean build. Recorded in ADR 0055 and the lane report.
 */
export type RuleSet = "core" | "shipped" | "docs" | "bundle";

/** A scan hit. `where` is a JSON path (`$.a[0].b`) or a line marker; never the matched text. */
export interface Finding {
	readonly rule: string;
	readonly where?: string;
}

/** Every rule id, in the spec's table order. */
export const RULE_IDS = [
	"ipv4",
	"cgnat",
	"email",
	"home-path",
	"tilde-path",
	"token-like",
	"credential-word",
	"denylist",
	"internal-path",
	"transfer",
	"lane-name",
	"hex-rev",
] as const;

interface Rule {
	readonly id: string;
	readonly set: "core" | "shipped";
	/** Why: some rules are only meaningful for JSON string values (prose legitimately says "secret"). */
	readonly jsonOnly: boolean;
	readonly test: (text: string) => boolean;
}

const QUAD = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]*\d)/g;

function quads(text: string): number[][] {
	const out: number[][] = [];
	for (const m of text.matchAll(QUAD)) {
		const o = m.slice(1, 5).map(Number);
		if (o.every((n) => n <= 255) && !o.every((n) => n === 0)) out.push(o);
	}
	return out;
}

const isCgnat = (o: number[]): boolean => o[0] === 100 && (o[1] ?? 0) >= 64 && (o[1] ?? 0) <= 127;

// Why: the internal-path list mirrors the notes repo's privacy checklist (snapshot, session,
// local-only, run and job folders, the journal file, checkpoint files). Reconcile with
// $UTOFME_NOTES/article/PRIVACY.md § 1 when that checkout is available (see lane report).
const INTERNAL_PATH =
	/(^|[\s"'`(/\\])(snapshots?|sessions?|runs?|jobs?)\/|local-only|\bjournal\.(md|jsonl?)\b|\bcheckpoints?[\w.-]*\.(pt|pth|ckpt|safetensors|bin)\b/i;

const RULES: readonly Rule[] = [
	{ id: "ipv4", set: "core", jsonOnly: false, test: (t) => quads(t).some((o) => !isCgnat(o)) },
	{ id: "cgnat", set: "core", jsonOnly: false, test: (t) => quads(t).some(isCgnat) },
	{
		id: "email",
		set: "core",
		jsonOnly: false,
		test: (t) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/.test(t),
	},
	{
		id: "home-path",
		set: "core",
		jsonOnly: false,
		test: (t) => /(\/home\/|\/Users\/|[A-Za-z]:\\Users\\|\/root\/)/.test(t),
	},
	{ id: "tilde-path", set: "core", jsonOnly: false, test: (t) => /(^|[\s"'`(=:])~\/\S/.test(t) },
	{
		id: "token-like",
		set: "core",
		jsonOnly: false,
		test: (t) =>
			/\bgh[pousr]_[A-Za-z0-9]{36,}|\bsk-[A-Za-z0-9_-]{20,}|\bxox[bap]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b/.test(
				t,
			),
	},
	{
		id: "credential-word",
		set: "core",
		jsonOnly: true,
		test: (t) => /\b(password|passwd|secret|rcon)\b|\bapi[ _-]?key\b/i.test(t),
	},
	{ id: "internal-path", set: "shipped", jsonOnly: false, test: (t) => INTERNAL_PATH.test(t) },
	{ id: "transfer", set: "shipped", jsonOnly: false, test: (t) => /github\s+releases?\b/i.test(t) },
	{
		id: "lane-name",
		set: "shipped",
		jsonOnly: true,
		test: (t) => /\blane\s+[a-z0-9]+(-[a-z0-9]+)+/i.test(t),
	},
	{
		id: "hex-rev",
		set: "shipped",
		jsonOnly: true,
		test: (t) => /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/i.test(t),
	},
];

/**
 * Parses a newline-separated denylist: lower-cases, trims, drops blanks and `#` comments.
 *
 * Why: the list lives only in the `PRIVACY_DENYLIST` secret / owner env (ADR 0055), never in a file.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Privacy scan"
 */
export function parseDenylist(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(/\r?\n/)
		.map((l) => l.trim().toLowerCase().replace(/\s+/g, " "))
		.filter((l) => l !== "" && !l.startsWith("#"));
}

/** Why: tokens, their `-`/`_` parts and adjacent pairs catch words inside paths and host-like names. */
function denyHit(text: string, denylist: readonly string[]): boolean {
	if (denylist.length === 0) return false;
	const tokens = text
		.toLowerCase()
		.split(/[^a-z0-9_-]+/)
		.filter(Boolean);
	const parts = tokens.flatMap((t) => t.split(/[-_]+/).filter(Boolean));
	const cands = new Set<string>([...tokens, ...parts]);
	for (const seq of [tokens, parts])
		for (let i = 0; i + 1 < seq.length; i++) cands.add(`${seq[i]} ${seq[i + 1]}`);
	return denylist.some((d) => cands.has(d));
}

const BUNDLE_RULES: ReadonlySet<string> = new Set(["cgnat", "home-path", "token-like"]);

function applies(rule: Rule, set: RuleSet): boolean {
	if (set === "docs") return false;
	if (set === "bundle") return BUNDLE_RULES.has(rule.id);
	return set === "shipped" || rule.set === "core";
}

function scanString(
	text: string,
	set: RuleSet,
	denylist: readonly string[],
	isJsonValue: boolean,
	where: string | undefined,
): Finding[] {
	const out: Finding[] = [];
	const add = (rule: string): void => {
		out.push(where === undefined ? { rule } : { rule, where });
	};
	for (const r of RULES) {
		if (!applies(r, set) || (r.jsonOnly && !isJsonValue)) continue;
		if (r.test(text)) add(r.id);
	}
	// Why: docs files quote the rule patterns, so only email and the denylist run there.
	if (set === "docs" && RULES.find((r) => r.id === "email")?.test(text)) add("email");
	if (denyHit(text, denylist)) add("denylist");
	return out;
}

/**
 * Scans plain text (prose, MDX, HTML, JS). JSON-only rules do not run.
 *
 * Why: findings name the rule only, so a log line never reproduces the match.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Privacy scan"
 */
export function scanText(text: string, set: RuleSet, denylist: readonly string[]): Finding[] {
	return scanString(text, set, denylist, false, undefined);
}

/**
 * Scans a parsed JSON value: every string value (all rules) and every key (non-JSON-only rules).
 *
 * Why: keys can carry a denylisted word as easily as values; paths locate hits without echoing them.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Privacy scan"
 */
export function scanJson(value: unknown, set: RuleSet, denylist: readonly string[]): Finding[] {
	const out: Finding[] = [];
	const walk = (v: unknown, path: string): void => {
		if (typeof v === "string") out.push(...scanString(v, set, denylist, true, path));
		else if (Array.isArray(v)) {
			for (const [i, x] of (v as unknown[]).entries()) walk(x, `${path}[${i}]`);
		} else if (v !== null && typeof v === "object") {
			for (const [k, x] of Object.entries(Object(v) as Record<string, unknown>)) {
				const kp = /^[A-Za-z_]\w*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`;
				out.push(...scanString(k, set, denylist, false, kp));
				walk(x, kp);
			}
		}
	};
	walk(value, "$");
	const seen = new Set<string>();
	return out.filter((f) => {
		const key = `${f.rule}|${f.where ?? ""}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

const SHIPPED_PATHS: readonly RegExp[] = [
	/^packages\/site\/src\/data\/article\//,
	/^packages\/site\/src\/content\/works\/tactical-arena\.mdx$/,
	/^packages\/site\/src\/components\/article\//,
	/^packages\/site\/src\/lib\/figures\//,
	/^packages\/site\/dist\/works\/tactical-arena\//,
	/^packages\/site\/dist\/_astro\/[^/]+\.json$/,
];
const CORE_PATHS: readonly RegExp[] = [
	/^packages\/site\/src\/data\/article-meta\//,
	/^packages\/site\/src\/lib\/article-data\//,
	/^packages\/site\/tests\/fixtures\/article\//,
	/^packages\/site\/tests\/fixtures\/article-sync\//,
	/^packages\/site\/dist\//,
];
const DOCS_PATHS: readonly RegExp[] = [
	/^packages\/specs\/(specs|plans|reports)\/10-/,
	/^packages\/specs\/adrs\/005[2-9]-/,
	/^packages\/specs\/adrs\/0060-/,
];
const EXCLUDED_PATHS: readonly RegExp[] = [
	/^packages\/site\/tests\/fixtures\/privacy\//,
	/^packages\/site\/scripts\/lib\/privacy-scan-core\.ts$/,
];

/**
 * Maps a repo-relative POSIX path to the rule set that applies, `"excluded"`, or `undefined` (out of scope).
 *
 * Why: the spec's scope table is code, so tests and the CLI cannot drift from it.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Privacy scan" (scopes)
 */
export function classifyPath(rel: string): RuleSet | "excluded" | undefined {
	if (EXCLUDED_PATHS.some((r) => r.test(rel))) return "excluded";
	if (SHIPPED_PATHS.some((r) => r.test(rel))) return "shipped";
	if (/^packages\/site\/dist\/.*\.(m?js|css)$/.test(rel)) return "bundle";
	if (CORE_PATHS.some((r) => r.test(rel))) return "core";
	if (DOCS_PATHS.some((r) => r.test(rel))) return "docs";
	return undefined;
}
