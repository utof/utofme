/**
 * Dataset `maps_cs` (figures F2 and F10): the five CS2 maps the project hand-translated from
 * radar overviews to its own 28×28 grid, in the canonical frame (T west, CT east, A north).
 *
 * Whitelist: `maps[]{name, rows}`. Everything else in the notes file (translation statistics,
 * held-out flags, source citations, pipeline text, tile sizes) is dropped. Legend of `rows`:
 * `#` wall, `.` floor, `A`/`B` site centre (the site is the 3×3 around it), `t`/`c` spawn tile.
 *
 * Why: the page needs the grids and nothing about how or from where they were produced; a
 * strict projected schema makes any extra field a sync error (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `maps_cs`)
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const SOURCE_FILE = "maps_cs.json";

const gridRow = z.string().regex(/^[#.ABtc]{28}$/);
const gridRows = z.array(gridRow).length(28);
const mapName = z.string().regex(/^de_[a-z0-9]+$/);

const sourceMap = z.object({
	name: mapName,
	w: z.literal(28),
	h: z.literal(28),
	rows: gridRows,
	held_out: z.boolean(),
	tile_units: z.number(),
	tile_m: z.number(),
	translate: z.unknown(),
	stats: z.unknown(),
});

const source = z.object({
	about: z.string(),
	code: z.record(z.string(), z.string()),
	frame: z.string(),
	sources: z.array(z.string()),
	pipeline: z.array(z.string()),
	pipeline_source: z.string(),
	maps: z.array(sourceMap).min(1),
});

const projected = z.strictObject({
	schema: z.literal("maps_cs/1"),
	maps: z.array(z.strictObject({ name: mapName, rows: gridRows })).min(1),
});

/**
 * The shipped `maps_cs.json`: `{ schema, maps: [{ name, rows }] }`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `maps_cs`)
 */
export type MapsCsData = z.infer<typeof projected>;

/**
 * The `maps_cs` dataset definition.
 *
 * Why: first dataset module and the worked example of the contract (AC3.1, AC3.7); the cap is
 * 2 KB gzip, measured about 0.7 KB for five maps.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `maps_cs`)
 */
export const dataset = defineDataset({
	name: "maps_cs",
	schemaId: "maps_cs/1",
	sources: { [SOURCE_FILE]: source },
	projected,
	project: (src) => ({
		schema: "maps_cs/1" as const,
		maps: source.parse(src[SOURCE_FILE]).maps.map(({ name, rows }) => ({ name, rows })),
	}),
	maxGzip: 2048,
});
