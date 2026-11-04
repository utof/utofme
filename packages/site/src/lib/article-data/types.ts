/**
 * Dataset module contract for the research article's shipped data (frozen by the spec).
 *
 * One module per output in `src/lib/article-data/<name>.ts` exports `dataset` (a
 * {@link Dataset}) and its inferred data type. The sync script discovers modules by listing
 * the folder, so no shared registry file exists. Zod is imported only here, by the dataset
 * modules, the sync script and tests: Blocks pass {@link shapeOf} to islands as a prop, and
 * islands import the data type only.
 *
 * Why: whitelist projections keep private notes data off the page by omission, and a typed
 * contract lets parallel figure lanes add datasets without touching shared files (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Dataset module contract"
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { type ZodType, z } from "astro/zod";

/**
 * A whitelist projection of one or more notes-repo data files into one shipped JSON file.
 *
 * Why: `sources` validate what the notes repo hands us, `projected` pins exactly what ships, and
 * `maxGzip` (gzip-9 bytes) is a hard cap that is never raised silently.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Dataset module contract"
 */
export interface Dataset<P extends { schema: string }> {
	/** Output base name: `src/data/article/<name>.json`. */
	readonly name: string;
	/** `${name}/1`; written as the top-level `schema`. */
	readonly schemaId: string;
	/** Notes file name → source schema. */
	readonly sources: Readonly<Record<string, ZodType>>;
	/** The projected value's schema; includes `schema: z.literal(schemaId)`. */
	readonly projected: ZodType<P>;
	/** Whitelist + rounding. Receives the raw parsed source files, keyed by notes file name. */
	readonly project: (src: Readonly<Record<string, unknown>>) => P;
	/** Cap on the gzip-9 size of the serialised output, in bytes. */
	readonly maxGzip: number;
}

/**
 * What an island needs to check a fetched file: its schema id and its top-level keys.
 *
 * Why: a plain object, so islands never import Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Dataset module contract"
 */
export interface Shape {
	readonly schema: string;
	readonly keys: readonly string[];
}

/**
 * Declares a dataset (identity function with type inference) and rejects an id that is not
 * `<name>/<n>`.
 *
 * Why: the id is the contract between the synced file and the client shape check; a typo would
 * only surface in the browser.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Dataset module contract"
 */
export function defineDataset<P extends { schema: string }>(d: Dataset<P>): Dataset<P> {
	if (!new RegExp(`^${d.name}/[1-9]\\d*$`).test(d.schemaId)) {
		throw new Error(`dataset "${d.name}": schemaId must be "${d.name}/<n>", got "${d.schemaId}"`);
	}
	return d;
}

/**
 * The top-level keys of a dataset's projected schema (sorted, `schema` included) with its id.
 *
 * Why: the island's shape check needs no Zod, only this plain object (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Loading in the browser"
 */
export function shapeOf(d: Dataset<{ schema: string }>): Shape {
	if (!(d.projected instanceof z.ZodObject)) {
		throw new Error(`dataset "${d.name}": projected must be a z.object`);
	}
	return { schema: d.schemaId, keys: Object.keys(d.projected.shape).sort() };
}
