/**
 * Dataset `notebook` (figure F7): the dated lab-notebook entries.
 *
 * Whitelist (spec P10-3): `entries[]{id, date, title, area, outcome, metric, delta, ci, summary}`.
 * `time`, `source` (a private file name and line) and anything else are dropped; `metric`, `delta`
 * and `ci` are omitted when the source has null. Ids must be unique, because the figure links to
 * `#nb-<id>`.
 *
 * Why: a card shows its date, id and the allowed text only (no provenance beyond that), and the
 * strict projected schema turns any extra field into a sync error (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `notebook`) and § P10-11
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { z } from "astro/zod";
import { OUTCOMES } from "../figures/notebook";
import { defineDataset } from "./types";

const SRC = "notebook.json";
/**
 * Rewrites the few private-repo file and journal names that appear in free text into public words,
 * and the notes' run labels into plain block names ("Elo g5line10 - v5a2" becomes "Elo block 10 vs
 * block 2").
 *
 * Why: the notes' free text sometimes cites their own bookkeeping files ("PARKED.md", "JOURNAL 11-01",
 * "env.py"); the page calls the whole thing "the notebook" and never names a file. Run labels follow
 * the notes' naming table (FACTS.md: `gline` 3v3 line, `g5line` 5v5 line, `g6line` v3 line, `g7line`
 * crouch line, number = block; `v5a1`/`v5a2` the first two 5v5 blocks), which a reader cannot know.
 * Applied to every shipped string of `notebook` and `notebook_parked`; the shipped privacy scan is
 * the backstop.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10 (no file names) and § P10-11 (card provenance)
 */
export function publicText(text: string): string {
	return text
		.replace(/PARKED\.md/g, "the parked list")
		.replace(/JOURNAL(\.md)?/g, "notebook")
		.replace(/\bjournal\b/g, "notebook")
		.replace(/\b([A-Za-z0-9_]+)\.py\b/g, "$1 code")
		.replace(/\bhead - (?=v5a\d\b|g\d*line\d)/g, "newest block - ")
		.replace(/\bg5line(\d+)\b/g, "block $1")
		.replace(/\bg6line(\d+)\b/g, "v3-line block $1")
		.replace(/\bg7line(\d+)\b/g, "crouch-line block $1")
		.replace(/\bgline(\d+)w?\b/g, "3v3 block $1")
		.replace(/\bv5a(\d)\b/g, "block $1")
		.replace(/\b(block \d+|newest block) - (?=(?:[\w-]+ )?block \d+)/g, "$1 vs ");
}

const outcome = z.enum(OUTCOMES);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ci = z.tuple([z.number(), z.number()]);

const sourceNotebook = z.object({
	entries: z
		.array(
			z.object({
				id: z.string().min(1),
				date,
				title: z.string(),
				area: z.string().min(1),
				outcome,
				metric: z.string().nullable(),
				delta: z.number().nullable(),
				ci: ci.nullable(),
				summary: z.string(),
			}),
		)
		.min(1),
});

const projected = z.strictObject({
	schema: z.literal("notebook/1"),
	entries: z.array(
		z.strictObject({
			id: z.string().min(1),
			date,
			title: z.string(),
			area: z.string().min(1),
			outcome,
			metric: z.string().optional(),
			delta: z.number().optional(),
			ci: ci.optional(),
			summary: z.string(),
		}),
	),
});

/**
 * The shipped `notebook.json`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `notebook`)
 */
export type NotebookData = z.infer<typeof projected>;

/**
 * The `notebook` dataset definition.
 *
 * Why: see the module comment; the cap (24 KB gzip) is the spec's.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `notebook`)
 */
export const dataset = defineDataset({
	name: "notebook",
	schemaId: "notebook/1",
	sources: { [SRC]: sourceNotebook },
	projected,
	project: (src) => {
		const n = sourceNotebook.parse(src[SRC]);
		const seen = new Set<string>();
		for (const e of n.entries) {
			if (seen.has(e.id)) throw new Error(`notebook: duplicate entry id "${e.id}"`);
			seen.add(e.id);
		}
		return {
			schema: "notebook/1" as const,
			entries: n.entries.map((e) => ({
				id: e.id,
				date: e.date,
				title: publicText(e.title),
				area: e.area,
				outcome: e.outcome,
				...(e.metric === null ? {} : { metric: publicText(e.metric) }),
				...(e.delta === null ? {} : { delta: e.delta }),
				...(e.ci === null ? {} : { ci: e.ci }),
				summary: publicText(e.summary),
			})),
		};
	},
	maxGzip: 24576,
});
