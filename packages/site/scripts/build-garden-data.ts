/**
 * Build-time producer of three garden artefacts:
 *   - src/data/backlinks.json   { [target]: [{slug,title}] }
 *   - src/data/note-previews.json   { [slug]: {title,summary,firstParagraph} }
 *   - src/data/graph.json   { nodes:[{id,label,tags}], edges:[{source,target}] }
 *
 * Determinism contract (load-bearing for CI freshness check):
 *   - Recursive object-key sort (alphabetical, ASCII).
 *   - Array sorts via Intl.Collator("en", {sensitivity:"base"}).
 *   - Trailing newline on every output.
 *   - Tab indent (matches `packages/site/biome.json` `indentStyle: tab`;
 *     Biome reformats committed JSON on precommit, so the script must match).
 *   - Two consecutive runs against identical inputs → byte-identical output.
 *
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import matter from "gray-matter";
import { noteSlug } from "../src/lib/wikilinks.ts";

/**
 * Structured note record consumed by `buildArtefacts`. `outgoing` holds
 * resolved wikilink slugs (after anchor-strip + `noteSlug`), so the inverter
 * sees the same slug shape that the rendering remark plugin will emit.
 * Why: spec § Slug strategy mandates ONE source of truth for slug rules.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export interface Note {
	slug: string;
	title: string;
	tags: string[];
	outgoing: string[];
	summary: string;
	firstParagraph: string;
}

/**
 * Backlink entry: a source note that links TO some target slug.
 * Why: keeping this typed (rather than inline) makes the
 * `Record<string, BacklinkEntry[]>` shape grep-able from the consumer side.
 * @see packages/specs/specs/05-garden.md § Backlinks at build time
 */
export interface BacklinkEntry {
	slug: string;
	title: string;
}

/**
 * Preview record consumed by the LinkPreview Svelte island.
 * @see packages/specs/specs/05-garden.md § Hover link previews
 */
export interface PreviewEntry {
	title: string;
	summary: string;
	firstParagraph: string;
}

/**
 * Graph node record consumed by the GraphView Svelte island.
 * @see packages/specs/specs/05-garden.md § Graph view
 */
export interface GraphNode {
	id: string;
	label: string;
	tags: string[];
}

/**
 * Graph edge record consumed by the GraphView Svelte island.
 * @see packages/specs/specs/05-garden.md § Graph view
 */
export interface GraphEdge {
	source: string;
	target: string;
}

/**
 * Bundle of every artefact buildArtefacts emits — both the structured
 * objects and their canonical JSON-string forms.
 * Why: returning both lets unit tests assert on the parsed shape AND the
 * byte-level output (deterministic-write contract).
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
export interface Artefacts {
	backlinks: Record<string, BacklinkEntry[]>;
	previews: Record<string, PreviewEntry>;
	graph: { nodes: GraphNode[]; edges: GraphEdge[] };
	backlinksJson: string;
	previewsJson: string;
	graphJson: string;
}

const WIKILINK_RE = /(?<!!)\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g;
const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

/**
 * Pure helper: take the raw inner of a `[[...]]` token (or just a raw string),
 * strip a `#section` anchor, and run it through `noteSlug` — the same rule
 * the rendering remark plugin uses. Exported so the parity-test suite can
 * exercise it directly without booting the unified pipeline.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export function extractWikilinkSlug(raw: string): string {
	const head: string = raw.split("#")[0] ?? raw;
	return noteSlug(head);
}

/**
 * JSON-safe value tree. All artefacts in this script are pure JSON shapes
 * (no Date, no Map, no Symbol), so a closed `JSONValue` union lets type-coverage
 * trace recursive sortObject calls without resorting to `unknown`.
 * Why: keeps the deterministic-write helper at 100% type-coverage instead of
 * leaking `any` taint through `Object.keys(...).map(...)`.
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
type JSONValue = string | number | boolean | null | JSONValue[] | { [k: string]: JSONValue };

/**
 * Recursively sort every object's keys alphabetically (ASCII). Arrays are
 * preserved in the caller's chosen order — only `Record<string, ...>` shapes
 * are reordered. The result is suitable for `JSON.stringify` to produce
 * deterministic output.
 *
 * Why: object-key iteration order in `JSON.stringify` follows insertion
 * order; without this normalisation any reshuffle of the input map would
 * trip the freshness-diff check.
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
function sortObject(value: JSONValue): JSONValue {
	if (Array.isArray(value)) {
		return value.map((v) => sortObject(v));
	}
	if (value !== null && typeof value === "object") {
		const out: { [k: string]: JSONValue } = {};
		for (const k of Object.keys(value).sort()) {
			const child = value[k];
			if (child !== undefined) out[k] = sortObject(child);
		}
		return out;
	}
	return value;
}

function emit(value: JSONValue): string {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

/**
 * Pure builder: take a list of `Note` records and produce all three garden
 * artefacts plus their canonical-form JSON strings (deterministic write contract).
 * Why: keeping this pure (no fs I/O) lets fast-check property tests run
 * against random Note arrays without touching disk.
 * @see packages/specs/specs/05-garden.md § Deterministic-write contract
 */
export function buildArtefacts(notes: Note[]): Artefacts {
	const slugSet = new Set(notes.map((n) => n.slug));

	// Backlinks (only for known targets).
	const backlinks: Record<string, BacklinkEntry[]> = {};
	for (const n of notes) {
		for (const target of n.outgoing) {
			if (!slugSet.has(target)) continue;
			const list = backlinks[target] ?? [];
			list.push({ slug: n.slug, title: n.title });
			backlinks[target] = list;
		}
	}
	for (const k of Object.keys(backlinks)) {
		const list = backlinks[k];
		if (list !== undefined) {
			list.sort((a, b) => COLLATOR.compare(a.title, b.title) || COLLATOR.compare(a.slug, b.slug));
		}
	}

	// Previews.
	const previews: Record<string, PreviewEntry> = {};
	for (const n of notes) {
		previews[n.slug] = { title: n.title, summary: n.summary, firstParagraph: n.firstParagraph };
	}

	// Graph.
	const nodes: GraphNode[] = notes
		.map((n) => ({
			id: n.slug,
			label: n.title,
			tags: [...new Set(n.tags)].sort((a, b) => COLLATOR.compare(a, b)),
		}))
		.sort((a, b) => COLLATOR.compare(a.id, b.id));
	const edges: GraphEdge[] = notes
		.flatMap((n) =>
			n.outgoing.filter((t) => slugSet.has(t)).map((target) => ({ source: n.slug, target })),
		)
		.sort((a, b) => COLLATOR.compare(a.source, b.source) || COLLATOR.compare(a.target, b.target));

	// Round-trip the typed shapes through JSON.parse to land them inside
	// `JSONValue`. JSON.stringify is total over our shapes (only string,
	// string[], plain objects) so the parse is sound; this avoids the
	// `as unknown as JSONValue` cast that type-coverage flags as `any`-ish.
	const backlinksJsonInput = JSON.parse(JSON.stringify(backlinks)) as JSONValue;
	const previewsJsonInput = JSON.parse(JSON.stringify(previews)) as JSONValue;
	const graphJsonInput = JSON.parse(JSON.stringify({ nodes, edges })) as JSONValue;
	return {
		backlinks,
		previews,
		graph: { nodes, edges },
		backlinksJson: emit(sortObject(backlinksJsonInput)),
		previewsJson: emit(sortObject(previewsJsonInput)),
		graphJson: emit(graphJsonInput),
	};
}

/**
 * Narrow gray-matter's `data: { [k: string]: any }` into a typed record by
 * round-tripping through JSON. Drops functions / undefined / Symbol values
 * (none of which occur in YAML frontmatter anyway).
 *
 * Why: type-coverage 100%-strict flags every property access on the raw
 * `any` map. Casting via `unknown` here gives us a single, audited cast
 * boundary instead of dozens of `any` taints.
 * @see packages/site/scripts/sync-vault.ts (frontmatter helper)
 */
function frontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	const parsed = matter(raw);
	const data = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
	return { data, content: parsed.content };
}

/**
 * Narrow an `unknown` frontmatter field into a `string[]`. Non-array values
 * map to `[]`; array entries that aren't strings are dropped.
 * Why: factoring this lets the call-site avoid a free-floating `unknown`
 * binding (which type-coverage --strict counts as imprecise).
 */
function pickStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const arr = value as readonly unknown[];
	const out: string[] = [];
	for (const v of arr) {
		if (typeof v === "string") out.push(v);
	}
	return out;
}

/**
 * Walk `src/content/notes/`, parse each note's frontmatter + body, and
 * return one structured `Note` per file. Wikilink targets are normalised
 * via `extractWikilinkSlug` (single source of truth — see ADR 0027).
 * Why: keeping the slug rule shared between this script and the remark
 * plugin prevents backlinks from silently dropping for any title with
 * punctuation or a heading anchor.
 * @see packages/specs/specs/05-garden.md § Backlinks at build time
 */
export async function readNotes(notesDir: string): Promise<Note[]> {
	const out: Note[] = [];
	for (const f of await readdir(notesDir)) {
		const ext = extname(f);
		if (ext !== ".md" && ext !== ".mdx") continue;
		const raw = await readFile(join(notesDir, f), "utf8");
		const { data, content } = frontmatter(raw);
		const slug = basename(f, ext);
		const titleVal = data["title"];
		const title = typeof titleVal === "string" && titleVal.length > 0 ? titleVal : slug;
		const tags: string[] = pickStringArray(data["tags"]);
		const summaryVal = data["summary"];
		const summary = typeof summaryVal === "string" ? summaryVal : "";
		const firstParagraph: string = (content.split(/\n\s*\n/)[0] ?? "").slice(0, 240).trim();
		const outgoing = [...content.matchAll(WIKILINK_RE)].map((m) =>
			extractWikilinkSlug((m[1] ?? "").trim()),
		);
		out.push({ slug, title, tags, outgoing, summary, firstParagraph });
	}
	return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function main(): Promise<void> {
	const notesDir = join(process.cwd(), "src", "content", "notes");
	const dataDir = join(process.cwd(), "src", "data");
	await mkdir(dataDir, { recursive: true });
	const notes = await readNotes(notesDir);
	const a = buildArtefacts(notes);
	await writeFile(join(dataDir, "backlinks.json"), a.backlinksJson, "utf8");
	await writeFile(join(dataDir, "note-previews.json"), a.previewsJson, "utf8");
	await writeFile(join(dataDir, "graph.json"), a.graphJson, "utf8");
	console.log(
		`built ${notes.length} notes, ${Object.keys(a.backlinks).length} backlink targets, ${a.graph.edges.length} edges`,
	);
}

if (import.meta.main) await main();
