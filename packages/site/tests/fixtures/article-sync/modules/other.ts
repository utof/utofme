/**
 * Fixture dataset with two source files, for the sync CLI tests.
 *
 * Why: proves that a projection can read several notes files and that `--only` selects by name.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3
 */
import { z } from "astro/zod";
import { defineDataset } from "../../../../src/lib/article-data/types";

const a = z.object({ values: z.array(z.number()) });
const b = z.object({ label: z.string() });

/** The fixture dataset: the sum of `other_a.json` values and the label of `other_b.json`. */
export const dataset = defineDataset({
	name: "other",
	schemaId: "other/1",
	sources: { "other_a.json": a, "other_b.json": b },
	projected: z.object({ schema: z.literal("other/1"), total: z.number(), label: z.string() }),
	project: (src) => ({
		schema: "other/1" as const,
		total: a.parse(src["other_a.json"]).values.reduce((x, y) => x + y, 0),
		label: b.parse(src["other_b.json"]).label,
	}),
	maxGzip: 2048,
});
