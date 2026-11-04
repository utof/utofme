/**
 * Fixture dataset for the sync CLI tests (one source file, a whitelist projection).
 *
 * Why: the CLI discovers modules by listing a folder, so its tests need a folder of their own that
 * is not the real `src/lib/article-data/`.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3
 */
import { z } from "astro/zod";
import { defineDataset } from "../../../../src/lib/article-data/types";

const source = z.object({
	note: z.string(),
	items: z.array(z.object({ id: z.string(), v: z.number(), src: z.string() })),
});

/** The fixture dataset: keeps `items[].{id, v}` and drops `note` and `src`. */
export const dataset = defineDataset({
	name: "tiny",
	schemaId: "tiny/1",
	sources: { "tiny_src.json": source },
	projected: z.object({
		schema: z.literal("tiny/1"),
		items: z.array(z.object({ id: z.string(), v: z.number() })),
	}),
	project: (src) => ({
		schema: "tiny/1" as const,
		items: source.parse(src["tiny_src.json"]).items.map(({ id, v }) => ({ id, v })),
	}),
	maxGzip: 2048,
});
