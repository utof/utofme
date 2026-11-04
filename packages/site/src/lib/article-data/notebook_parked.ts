/**
 * Dataset `notebook_parked` (figure F7 drawer): ideas that were parked or ruled out, each with what
 * would make the author reopen it.
 *
 * Whitelist (spec P10-3): `parked[]{id, title, kind, why, reopenIf, area}`; the source's
 * `reopen_if` is renamed `reopenIf`, and `number` and `source` are dropped. Fetched only when the
 * drawer first opens (AC11.6).
 *
 * Why: the drawer is secondary content, so it is its own file and its own request (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `notebook_parked`) and § P10-11
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { z } from "astro/zod";
import { publicText } from "./notebook";
import { defineDataset } from "./types";

const SRC = "notebook.json";

/**
 * Public wording for the one item whose source title trips the `credential-word` rule although it
 * names no credential (an idea about third-party data access). Applied by id, only when the source
 * title is exactly the listed one, so a reworded source fails loudly instead of shipping unreviewed.
 */
const TITLE_OVERRIDES: Readonly<Record<string, { from: string; to: string }>> = {
	P19: { from: "FACEIT data API key", to: "FACEIT data access" },
};

const kind = z.enum(["parked", "ruled-out"]);

const sourceParked = z.object({
	parked: z
		.array(
			z.object({
				id: z.string().min(1),
				title: z.string(),
				kind,
				why: z.string(),
				reopen_if: z.string(),
				area: z.string().min(1),
			}),
		)
		.min(1),
});

const projected = z.strictObject({
	schema: z.literal("notebook_parked/1"),
	parked: z.array(
		z.strictObject({
			id: z.string().min(1),
			title: z.string(),
			kind,
			why: z.string(),
			reopenIf: z.string(),
			area: z.string().min(1),
		}),
	),
});

function publicTitle(id: string, title: string): string {
	const o = TITLE_OVERRIDES[id];
	if (!o) return title;
	if (title !== o.from)
		throw new Error(`notebook_parked: title of "${id}" changed; review its public wording`);
	return o.to;
}

/**
 * The `notebook_parked` dataset definition.
 *
 * Why: see the module comment; the cap (8 KB gzip) is the spec's.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `notebook_parked`)
 */
export const dataset = defineDataset({
	name: "notebook_parked",
	schemaId: "notebook_parked/1",
	sources: { [SRC]: sourceParked },
	projected,
	project: (src) => {
		const n = sourceParked.parse(src[SRC]);
		return {
			schema: "notebook_parked/1" as const,
			parked: n.parked.map((p) => ({
				id: p.id,
				title: publicText(publicTitle(p.id, p.title)),
				kind: p.kind,
				why: publicText(p.why),
				reopenIf: publicText(p.reopen_if),
				area: p.area,
			})),
		};
	},
	maxGzip: 8192,
});
