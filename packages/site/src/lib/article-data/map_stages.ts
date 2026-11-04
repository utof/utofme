/**
 * Dataset `map_stages` (figure F5): the project's own radar-to-grid translator, stages 2 to 5,
 * for the five hand-translated CS maps, in the canonical frame (T west, CT east, A north).
 *
 * Whitelist: `maps[]{name, stages{frac_0_9, majority, corridors, final}, counts{majority_floor,
 * corridor_tiles_added, final_floor}}`. Stage 1 (`radar_floor_x4`, the 112×112 radar trace) is
 * never read into the projection, so it cannot ship (OD-5); neither can the radar hashes, pixel
 * sizes, transform names, leak-wall coordinates or the source's text fields. Legends of the rows:
 * `frac_0_9` one digit per tile (floor share × 9); `majority` and `corridors` `#` wall, `.` floor;
 * `final` additionally `A`/`B` site centre, `t`/`c` spawn tile.
 *
 * Why: the page shows how a floor plan becomes the grid, nothing about where the floor plan came
 * from; a strict projected schema turns any extra field into a sync error (ADR 0054). Stage 2 is a
 * 28×28 grid of digits, heavily transformed from the radar picture; the owner chose to show it
 * (OD-5, risk 10).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `map_stages`)
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const SOURCE_FILE = "maps_radar_stages.json";

const rows = (glyphs: RegExp) => z.array(z.string().regex(glyphs)).length(28);
const fracRows = rows(/^[0-9]{28}$/);
const floorRows = rows(/^[#.]{28}$/);
const finalRows = rows(/^[#.ABtc]{28}$/);
const mapName = z.string().regex(/^de_[a-z0-9]+$/);
const count = z.number().int().nonnegative();

const sourceMap = z.looseObject({
	name: mapName,
	stages: z.looseObject({
		frac_0_9: fracRows,
		majority: floorRows,
		corridors: floorRows,
		final: finalRows,
	}),
	counts: z.looseObject({
		majority_floor: count,
		corridor_tiles_added: count,
		final_floor: count,
	}),
});

const source = z.looseObject({ maps: z.array(sourceMap).min(1) });

const projected = z.strictObject({
	schema: z.literal("map_stages/1"),
	maps: z
		.array(
			z.strictObject({
				name: mapName,
				stages: z.strictObject({
					frac_0_9: fracRows,
					majority: floorRows,
					corridors: floorRows,
					final: finalRows,
				}),
				counts: z.strictObject({
					majority_floor: count,
					corridor_tiles_added: count,
					final_floor: count,
				}),
			}),
		)
		.min(1),
});

/**
 * The shipped `map_stages.json`: `{ schema, maps: [{ name, stages, counts }] }`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `map_stages`)
 */
export type MapStagesData = z.infer<typeof projected>;

/**
 * The `map_stages` dataset definition.
 *
 * Why: the cap is 4 KB gzip (spec); the whitelist is built field by field so a new source field
 * can never reach the page by omission (AC9.3).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `map_stages`)
 */
export const dataset = defineDataset({
	name: "map_stages",
	schemaId: "map_stages/1",
	sources: { [SOURCE_FILE]: source },
	projected,
	project: (src) => ({
		schema: "map_stages/1" as const,
		maps: source.parse(src[SOURCE_FILE]).maps.map(({ name, stages, counts }) => ({
			name,
			stages: {
				frac_0_9: stages.frac_0_9,
				majority: stages.majority,
				corridors: stages.corridors,
				final: stages.final,
			},
			counts: {
				majority_floor: counts.majority_floor,
				corridor_tiles_added: counts.corridor_tiles_added,
				final_floor: counts.final_floor,
			},
		})),
	}),
	maxGzip: 4096,
});
