/**
 * Keyed facts: the schema of `facts.json` (`facts/1`) and a server-side reader that formats a fact
 * the same way everywhere (`<N k="…">` in prose, figure captions, marks).
 *
 * A fact stores its value **as printed in its unit** (percent facts store 80, not 0.8) with the
 * printed precision, so formatting never rounds a stored value a second time. An unknown key
 * throws, which fails the build: a sentence can never print a number nobody sourced.
 *
 * Why: prose and figures read the same keyed value, so they cannot drift apart, and a bare digit
 * in prose becomes a lint error (spec P10-17, ADR 0059).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
import { z } from "astro/zod";
import factsJson from "../data/article-meta/facts.json";
import { formatInterval, formatNumber, formatSigned } from "./figure-scale";

const NBSP = " ";

/**
 * Valid fact keys: dotted lower-case, e.g. `tempo.pros.contact.median`.
 *
 * Why: the pattern is the spec's; the notes repo's checker and this schema must accept the same set.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export const FACT_KEY = /^[a-z0-9]+(\.[a-z0-9_]+)+$/;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const measuredOnSchema = z.strictObject({
	line: z.enum(["5v5", "3v3"]),
	block: z.number().int().positive().optional(),
	date: isoDate,
});

const fields = {
	v: z.number(),
	digits: z.number().int().min(0).max(6),
	unit: z.string().min(1).optional(),
	sign: z.boolean().optional(),
	alt: z.string().min(1).optional(),
	lo: z.number().optional(),
	hi: z.number().optional(),
	measuredOn: measuredOnSchema.optional(),
};

/** Why: an interval is both ends or neither, and brackets the stored value. */
function intervalOk(e: { v: number; lo?: number | undefined; hi?: number | undefined }): boolean {
	if (e.lo === undefined && e.hi === undefined) return true;
	return e.lo !== undefined && e.hi !== undefined && e.lo <= e.v && e.v <= e.hi;
}
const intervalIssue = { message: "lo and hi must both be set and bracket v", path: ["lo"] };

/**
 * One fact as shipped: `v, digits, unit?, sign?, alt?, lo?, hi?, measuredOn?` and nothing else.
 *
 * Why: strict, so a hand edit or a re-export cannot smuggle a field (`src`, notes) onto the page.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export const factEntrySchema = z.strictObject(fields).refine(intervalOk, intervalIssue);

/**
 * One fact, as shipped.
 *
 * Why: inferred from the schema so the type and the validation cannot drift.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export type FactEntry = z.infer<typeof factEntrySchema>;

/**
 * The shipped `facts.json`: `{ schema: "facts/1", facts: { <key>: entry } }`.
 *
 * Why: parsed at sync time, in CI (`--check`) and when the reader is created.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (facts) and § P10-17
 */
export const factsSchema = z.strictObject({
	schema: z.literal("facts/1"),
	facts: z.record(z.string().regex(FACT_KEY), factEntrySchema),
});

/**
 * The notes repo's `facts.json`: like {@link factsSchema} but every entry carries a `src` citation.
 * Unknown fields are stripped by parsing, so the sync's output is a whitelist.
 *
 * Why: lane N checks `src` against FACTS.md; the site never ships it (P10-3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (facts)
 */
export const factsSourceSchema = z.object({
	schema: z.literal("facts/1"),
	facts: z.record(
		z.string().regex(FACT_KEY),
		z.object({ ...fields, src: z.string().min(1) }).refine(intervalOk, intervalIssue),
	),
});

/**
 * A fact with its key.
 *
 * Why: formatting errors name the key.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export type Fact = FactEntry & { readonly key: string };

/**
 * Options of `formatFact`.
 *
 * Why: `<N ci alt>` maps straight onto these.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export interface FormatFactOptions {
	/** Append " (lo to hi)" at the fact's digits; the fact must have an interval. */
	readonly ci?: boolean;
	/** Print the approved wording (`alt`) instead of the number; the fact must have one. */
	readonly alt?: boolean;
}

/**
 * Where an agent-vs-pro number was measured: "block 28 (5v5), 2026-11-02" or "the 3v3 line, 2026-10-25".
 *
 * Why: OD-4 puts an "as measured on …" stamp on every agent-vs-pro number; one wording for `title`
 * and `<Stamp>`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17 (`<N>`)
 */
export function measuredOnText(m: NonNullable<FactEntry["measuredOn"]>): string {
	return m.block === undefined
		? `the ${m.line} line, ${m.date}`
		: `block ${m.block} (${m.line}), ${m.date}`;
}

/**
 * A reader over a parsed facts file.
 *
 * Why: one shape for the committed file's reader and for test readers.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export interface FactReader {
	/** The fact for `key`; throws on an unknown key. */
	fact(key: string): Fact;
	/** The fact printed as the page prints it. */
	formatFact(key: string, opts?: FormatFactOptions): string;
}

/**
 * Validates a facts file and returns a reader over it. The default reader (`fact`, `formatFact`)
 * is this over the committed `facts.json`.
 *
 * Why: a factory keeps the formatting rules testable without the committed file; an unknown key
 * throws (the build fails) instead of printing a guess.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export function createFacts(raw: unknown): FactReader {
	const { facts } = factsSchema.parse(raw);
	const fact = (key: string): Fact => {
		const e = Object.hasOwn(facts, key) ? facts[key] : undefined;
		if (e === undefined) throw new Error(`unknown fact key "${key}"`);
		return { ...e, key };
	};
	const formatFact = (key: string, opts: FormatFactOptions = {}): string => {
		const e = fact(key);
		if (opts.alt === true) {
			if (e.alt === undefined) throw new Error(`fact "${key}" has no approved wording (alt)`);
			return e.alt;
		}
		const num = e.sign === true ? formatSigned(e.v, e.digits) : formatNumber(e.v, e.digits);
		const base = e.unit === undefined ? num : `${num}${NBSP}${e.unit}`;
		if (opts.ci !== true) return base;
		if (e.lo === undefined || e.hi === undefined) {
			throw new Error(`fact "${key}" has no interval (lo/hi)`);
		}
		return `${base} (${formatInterval(e.lo, e.hi, e.digits, { signed: e.sign === true })})`;
	};
	return { fact, formatFact };
}

let defaultReader: FactReader | undefined;
/** Why: validation runs on first use, so importing this module never throws; a bad file fails the build at the first `<N>`. */
function committed(): FactReader {
	defaultReader ??= createFacts(factsJson);
	return defaultReader;
}

/**
 * The fact for `key` from the committed `src/data/article-meta/facts.json`; throws on an unknown
 * key (the build fails).
 *
 * Why: the JSON is imported as a module only (never `?url`), so it is never emitted to `dist/`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export function fact(key: string): Fact {
	return committed().fact(key);
}

/**
 * The committed fact printed as the page prints it (see {@link FormatFactOptions}).
 *
 * Why: figures that print a number in a caption or mark use the same function as `<N>`.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export function formatFact(key: string, opts?: FormatFactOptions): string {
	return committed().formatFact(key, opts);
}
