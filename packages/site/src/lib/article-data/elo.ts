/**
 * Dataset `elo` (figure F3): the 5v5 main line, its compiled-maps cross-check, the segments after
 * block 28, the 3v3 era (a different game) and the markers for adopted changes.
 *
 * Whitelist (spec P10-3): `main[]{block, hand{v, lo?, hi?}, gen, chained, perSeed?{s1, s2}}`,
 * `compiled[]{block, v, lo, hi}`, `after28[]{id, v, lo?, hi?, game, alt?{game, v}}`,
 * `era3v3{seed0[], seed1[]}{block, v, lo, hi}`, `markers[]{abId, block, cs, lo, hi}`. Markers also
 * carry `notebookId`, the id of the notebook entry the marker's card links to (plan, lane FC): it is
 * the one field beyond the spec's row, recorded in the lane report. Run labels, readout dates,
 * `src` lines, `method` formulas and the notes' free text are dropped. Game descriptions of the
 * `after28` segments are replaced by the short public labels in {@link GAME_LABELS}.
 *
 * Why: the page prints Elo numbers and intervals, never where or how they were produced; a strict
 * projected schema turns any extra field into a sync error (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `elo`) and § P10-7
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const MAIN = "elo_main_line.json";
const TOURS = "elo_5v5_tournaments.json";
const ERAS = "elo_3v3_lines.json";
const AB = "ab_results.json";

/**
 * The A/B rows drawn as markers on the hand-maps line, with the notebook entry each opens.
 * Block = the last block of the two-block segment the change was adopted in.
 *
 * Why: the notebook ids are a literal, resolved by reading the notes' `notebook.json`
 * (flash arc: `p3-flash-arc`, bot roles: `p3-bot-roles`, flash kick: `p3-kick-fixed`); lane FE's
 * AC11.7 checks that every id still resolves.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11 (AC11.7)
 */
export const MARKER_SPECS = [
	{ abId: "F1", block: 6, notebookId: "p3-flash-arc" },
	{ abId: "F2", block: 6, notebookId: "p3-bot-roles" },
	{ abId: "F4", block: 8, notebookId: "p3-kick-fixed" },
] as const;

/**
 * Public labels for the game each post-block-28 segment was measured in.
 *
 * Why: the notes' own descriptions name internal map-generator versions; the page only needs
 * which game the number belongs to.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
 */
export const GAME_LABELS: Readonly<Record<string, string>> = {
	"b29-30": "5v5 control",
	"b32-33": "today's game",
	snap: "snap game",
	g6: "v3 game",
	crouch: "crouch game",
};

const ALT_LABELS: Readonly<Record<string, string>> = {
	snap_game: "snap game",
	today: "today's game",
	crouch_game: "crouch game",
};

const round = (v: number, digits: number): number => {
	const f = 10 ** digits;
	return (Math.sign(v) * Math.round(Math.abs(v) * f)) / f;
};

const interval = z.object({ lo: z.number().optional(), hi: z.number().optional() });

const sourceMain = z.object({
	points: z
		.array(
			z.object({
				block: z.number().int(),
				elo: z.number(),
				lo: z.number().optional(),
				hi: z.number().optional(),
				elo_generated: z.number(),
				method: z.string(),
				per_seed: z.object({ s1: z.number(), s2: z.number() }).optional(),
			}),
		)
		.min(1),
	segments: z.array(
		z.object({
			id: z.string(),
			elo: z.number(),
			lo: z.number().optional(),
			hi: z.number().optional(),
			game: z.string(),
			alt: z.record(z.string(), z.number()).optional(),
		}),
	),
});

const sourceTours = z.object({
	tournaments: z.array(
		z.object({
			maps: z.string(),
			pairs: z.array(
				z.object({ a: z.string(), b: z.string(), elo: z.number(), lo: z.number(), hi: z.number() }),
			),
		}),
	),
});

const eraPoint = z.object({
	block: z.number().int(),
	elo: z.number(),
	lo: z.number(),
	hi: z.number(),
});
const sourceEras = z.object({
	eras: z.array(
		z.object({
			era: z.string(),
			maps: z.string(),
			series: z.record(z.string(), z.array(eraPoint)),
		}),
	),
});

const sourceAb = z.object({
	rows: z.array(z.object({ id: z.string() }).extend(interval.shape).extend({ cs: z.number() })),
});

const int = z.number().int();
const num = z.number();
const projectedPoint = z.strictObject({ block: int, v: num, lo: num, hi: num });
const projected = z.strictObject({
	schema: z.literal("elo/1"),
	main: z.array(
		z.strictObject({
			block: int,
			hand: z.strictObject({ v: num, lo: num.optional(), hi: num.optional() }),
			gen: num,
			chained: z.boolean(),
			perSeed: z.strictObject({ s1: num, s2: num }).optional(),
		}),
	),
	compiled: z.array(projectedPoint),
	after28: z.array(
		z.strictObject({
			id: z.string(),
			v: num,
			lo: num.optional(),
			hi: num.optional(),
			game: z.string(),
			alt: z.strictObject({ game: z.string(), v: num }).optional(),
		}),
	),
	era3v3: z.strictObject({ seed0: z.array(projectedPoint), seed1: z.array(projectedPoint) }),
	markers: z.array(
		z.strictObject({
			abId: z.string(),
			block: int,
			cs: num,
			lo: num,
			hi: num,
			notebookId: z.string(),
		}),
	),
});

/**
 * The shipped `elo.json`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `elo`)
 */
export type EloData = z.infer<typeof projected>;

function need<T>(v: T | undefined, what: string): T {
	if (v === undefined) throw new Error(`elo: missing ${what} in the source`);
	return v;
}

/**
 * The `elo` dataset definition.
 *
 * Why: F3 needs one file for its three map sets, the after-block-28 strip and the 3v3 panel; the
 * cap is 4 KB gzip (spec), measured well below.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `elo`)
 */
export const dataset = defineDataset({
	name: "elo",
	schemaId: "elo/1",
	sources: { [MAIN]: sourceMain, [TOURS]: sourceTours, [ERAS]: sourceEras, [AB]: sourceAb },
	projected,
	project: (src) => {
		const main = sourceMain.parse(src[MAIN]);
		const tours = sourceTours.parse(src[TOURS]);
		const eras = sourceEras.parse(src[ERAS]);
		const ab = sourceAb.parse(src[AB]);

		const compiledTour = need(
			tours.tournaments.find((t) => t.maps === "compiled"),
			"compiled tournament",
		);
		const vsAnchor = (a: string) =>
			need(
				compiledTour.pairs.find((p) => p.a === a && p.b === "v5a2"),
				`compiled pair ${a}`,
			);
		const compiled = [
			{ block: 2, v: 0, lo: 0, hi: 0 },
			...[
				[10, "g5line10"],
				[28, "g5line28"],
			].map(([block, a]) => {
				const p = vsAnchor(String(a));
				return {
					block: Number(block),
					v: round(p.elo, 0),
					lo: round(p.lo, 0),
					hi: round(p.hi, 0),
				};
			}),
		];

		const era = (name: string) =>
			need(
				eras.eras.find((e) => e.era === name && e.maps === "cs"),
				`3v3 era ${name}`,
			);
		const series = (k: string) =>
			need(era("A").series[k], `era A ${k}`).map((p) => ({
				block: p.block,
				v: round(p.elo, 1),
				lo: round(p.lo, 1),
				hi: round(p.hi, 1),
			}));

		return {
			schema: "elo/1" as const,
			main: main.points.map((p) => ({
				block: p.block,
				hand: {
					v: round(p.elo, 0),
					...(p.lo !== undefined && p.hi !== undefined
						? { lo: round(p.lo, 0), hi: round(p.hi, 0) }
						: {}),
				},
				gen: round(p.elo_generated, 0),
				chained: p.method.startsWith("chain"),
				...(p.per_seed ? { perSeed: { s1: p.per_seed.s1, s2: p.per_seed.s2 } } : {}),
			})),
			compiled,
			after28: main.segments
				.filter((s) => s.id !== "widen")
				.map((s) => {
					const alt = s.alt ? Object.entries(s.alt)[0] : undefined;
					return {
						id: s.id,
						v: round(s.elo, 1),
						...(s.lo !== undefined && s.hi !== undefined
							? { lo: round(s.lo, 1), hi: round(s.hi, 1) }
							: {}),
						game: need(GAME_LABELS[s.id], `game label for ${s.id}`),
						...(alt
							? {
									alt: {
										game: need(ALT_LABELS[alt[0]], `alt label ${alt[0]}`),
										v: round(alt[1], 0),
									},
								}
							: {}),
					};
				}),
			era3v3: { seed0: series("seed0"), seed1: series("seed1") },
			markers: MARKER_SPECS.map((m) => {
				const row = need(
					ab.rows.find((r) => r.id === m.abId),
					`A/B row ${m.abId}`,
				);
				return {
					abId: m.abId,
					block: m.block,
					cs: row.cs,
					lo: need(row.lo, `${m.abId}.lo`),
					hi: need(row.hi, `${m.abId}.hi`),
					notebookId: m.notebookId,
				};
			}),
		};
	},
	maxGzip: 4096,
});
