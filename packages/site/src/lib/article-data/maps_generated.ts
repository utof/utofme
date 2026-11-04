/**
 * Dataset `maps_generated` (figure F10): twelve precomputed maps from each of the project's
 * three map generators (v1, v2, v3), plus how many key structure metrics each generation misses
 * on average against the real maps' range.
 *
 * Whitelist: `generators[]{id ∈ v1, v2, v3, maps[12]}` where each map is its 28 bare rows (same
 * legend as `maps_cs`: `#` wall, `.` floor, `A`/`B` site centre, `t`/`c` spawn tile), and
 * `csLikeness{v2, v3, real}` (`real` is the real maps measured against each other). The other
 * generators, per-map statistics, family statistics, route and sightline numbers, text fields and
 * source citations are dropped.
 *
 * Why: the page rolls maps without a generator in the browser; a strict projected schema turns any
 * extra field into a sync error (ADR 0054). The likeness numbers also exist as keyed facts the
 * caption prints; a unit test asserts the two agree.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `maps_generated`)
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const SOURCE_FILE = "maps_generated.json";
const IDS = ["v1", "v2", "v3"] as const;
const MAPS_PER_GENERATOR = 12;

const gridRow = z.string().regex(/^[#.ABtc]{28}$/);
const grid = z.array(gridRow).length(28);

const sourceGenerator = z.looseObject({
	id: z.string(),
	maps: z.array(z.looseObject({ rows: grid })),
});
const source = z.looseObject({
	generators: z.array(sourceGenerator),
	cs_likeness: z.looseObject({
		v2: z.number(),
		v3: z.number(),
		real_cs_vs_each_other: z.number(),
	}),
});

const generator = <I extends (typeof IDS)[number]>(id: I) =>
	z.strictObject({ id: z.literal(id), maps: z.array(grid).length(MAPS_PER_GENERATOR) });

const projected = z.strictObject({
	schema: z.literal("maps_generated/1"),
	generators: z.tuple([generator("v1"), generator("v2"), generator("v3")]),
	csLikeness: z.strictObject({ v2: z.number(), v3: z.number(), real: z.number() }),
});

/**
 * The shipped `maps_generated.json`: `{ schema, generators: [{ id, maps }], csLikeness }`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `maps_generated`)
 */
export type MapsGeneratedData = z.infer<typeof projected>;

/**
 * The `maps_generated` dataset definition.
 *
 * Why: the cap is 6 KB gzip (spec); the generators are picked by id, so a re-export that reorders
 * or adds generators cannot change what ships.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `maps_generated`)
 */
export const dataset = defineDataset({
	name: "maps_generated",
	schemaId: "maps_generated/1",
	sources: { [SOURCE_FILE]: source },
	projected,
	project: (src) => {
		const parsed = source.parse(src[SOURCE_FILE]);
		const pick = (id: (typeof IDS)[number]) => {
			const g = parsed.generators.find((x) => x.id === id);
			if (g === undefined) throw new Error(`generator ${id} is missing from ${SOURCE_FILE}`);
			return { id, maps: g.maps.slice(0, MAPS_PER_GENERATOR).map((m) => m.rows) };
		};
		return projected.parse({
			schema: "maps_generated/1",
			generators: IDS.map(pick),
			csLikeness: {
				v2: parsed.cs_likeness.v2,
				v3: parsed.cs_likeness.v3,
				real: parsed.cs_likeness.real_cs_vs_each_other,
			},
		});
	},
	maxGzip: 6144,
});
