/**
 * Dataset `architecture` (figure F6): the machine diagram's geometry and box/arrow labels.
 *
 * Whitelist (spec P10-3): `groups[]{id, label}`, `nodes[]{id, label, group, x, y}` and
 * `edges[]{from, to, label}`. The notes' `files`, `blurb`, `data`, `note` and `title` fields name
 * the private repository's files and internals and never ship; the public copy is hand-written in
 * `src/lib/figures/machine.ts`. Every edge must connect two known nodes and every node must belong
 * to a known group, so a stale source fails the sync instead of drawing a dangling arrow.
 *
 * Why: the diagram needs positions and labels only; omission by whitelist is the privacy mechanism
 * (ADR 0054), and the strict projected schema turns any extra field into a sync error.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `architecture`) and § P10-10
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const SRC = "architecture.json";

const sourceArch = z.object({
	groups: z.array(z.object({ id: z.string().min(1), label: z.string() })).min(1),
	nodes: z
		.array(
			z.object({
				id: z.string().min(1),
				label: z.string(),
				group: z.string().min(1),
				x: z.number(),
				y: z.number(),
			}),
		)
		.min(1),
	edges: z.array(z.object({ from: z.string().min(1), to: z.string().min(1), label: z.string() })),
});

const projected = z.strictObject({
	schema: z.literal("architecture/1"),
	groups: z.array(z.strictObject({ id: z.string().min(1), label: z.string() })),
	nodes: z.array(
		z.strictObject({
			id: z.string().min(1),
			label: z.string(),
			group: z.string().min(1),
			x: z.number(),
			y: z.number(),
		}),
	),
	edges: z.array(
		z.strictObject({ from: z.string().min(1), to: z.string().min(1), label: z.string() }),
	),
});

/**
 * The shipped `architecture.json`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `architecture`)
 */
export type ArchitectureData = z.infer<typeof projected>;

/**
 * The `architecture` dataset definition.
 *
 * Why: see the module comment; the cap (2 KB gzip) is the spec's.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `architecture`)
 */
export const dataset = defineDataset({
	name: "architecture",
	schemaId: "architecture/1",
	sources: { [SRC]: sourceArch },
	projected,
	project: (src) => {
		const a = sourceArch.parse(src[SRC]);
		const groups = new Set(a.groups.map((g) => g.id));
		const ids = new Set(a.nodes.map((n) => n.id));
		for (const n of a.nodes)
			if (!groups.has(n.group))
				throw new Error(`architecture: node "${n.id}" has an unknown group`);
		for (const e of a.edges)
			if (!ids.has(e.from) || !ids.has(e.to))
				throw new Error(`architecture: edge "${e.from}" -> "${e.to}" names an unknown node`);
		return {
			schema: "architecture/1" as const,
			groups: a.groups.map((g) => ({ id: g.id, label: g.label })),
			nodes: a.nodes.map((n) => ({ id: n.id, label: n.label, group: n.group, x: n.x, y: n.y })),
			edges: a.edges.map((e) => ({ from: e.from, to: e.to, label: e.label })),
		};
	},
	maxGzip: 2048,
});
