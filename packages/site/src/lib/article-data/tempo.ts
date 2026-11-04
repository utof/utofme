/**
 * Dataset `tempo` (figure F4): per-round timing of the first fight, agents against pros.
 *
 * Whitelist: `binS` (0.8), `series{v5a2, b6, b10, b28, pros}{contact, firstKill, plant}{hist[160],
 * q[5], n, nEvent, noneShare}`, `rounds{…}`, `prosCi{contact, firstKill, plant}` as `[v, lo, hi]`
 * and `botsContact` (the scripted bots' median only). The notes file's other series (the holds
 * lane's `head` rollouts, spotted, length, by-map and per-demo counts) and every source text are
 * dropped.
 *
 * The agents' rounds are a rerun of the same checkpoints on 2026-11-04 (notes data README, § "F4:
 * tempo, agents vs pros", `tempo_dists.json`); {@link TEMPO_RERUN_DATE} carries that date.
 *
 * Why: F4 needs every round's value as a 0.8 s histogram (never smoothed) and nothing about how or
 * where it was recorded; a strict projected schema turns any extra field into a sync error (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `tempo`)
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const DISTS = "tempo_dists.json";
const MEDIANS = "tempo.json";

/**
 * Date of the CPU rerun that produced the agents' per-round values (notes data README, F4).
 *
 * Why: the stamp under F4 says "2026-11-04 rerun"; the date belongs to the data, not the prose.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
 */
export const TEMPO_RERUN_DATE = "2026-11-04";

/** Series keys of the file. */
const SERIES_KEYS = ["v5a2", "b6", "b10", "b28", "pros"] as const;
/** Metric keys of one series. */
const METRIC_KEYS = ["contact", "firstKill", "plant"] as const;

const BINS = 160;
const count = z.number().int().nonnegative();

const sourceSeries = z.object({
	n: count,
	n_event: count,
	none_share: z.number().min(0).max(1),
	hist: z.array(count).length(BINS),
	q10_25_50_75_90: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
});
const sourceAgent = z.object({
	rounds: count,
	contact: sourceSeries,
	first_kill: sourceSeries,
	plant: sourceSeries,
});
const sourceDists = z.object({
	bin_edges_s: z.object({ start: z.literal(0), step: z.literal(0.8), n: z.literal(BINS) }),
	agents: z.object({ v5a2: sourceAgent, b6: sourceAgent, b10: sourceAgent, b28: sourceAgent }),
	pros: z.object({
		rounds: count,
		contact: sourceSeries,
		first_kill: sourceSeries,
		plant: sourceSeries,
	}),
});
const stat = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const sourceMedians = z.object({
	pros: z.object({
		contact_s_median: stat,
		first_kill_s_median: stat,
		plant_s_median: stat,
	}),
	medians: z.array(z.object({ who: z.string(), contact: z.number().optional() })),
});

const series = z.strictObject({
	hist: z.array(count).length(BINS),
	q: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
	n: count,
	nEvent: count,
	noneShare: z.number().min(0).max(1),
});
const metrics = z.strictObject({ contact: series, firstKill: series, plant: series });
const triple = z.tuple([z.number(), z.number(), z.number()]);

const projected = z
	.strictObject({
		schema: z.literal("tempo/1"),
		binS: z.literal(0.8),
		series: z.strictObject({
			v5a2: metrics,
			b6: metrics,
			b10: metrics,
			b28: metrics,
			pros: metrics,
		}),
		rounds: z.strictObject({
			v5a2: count,
			b6: count,
			b10: count,
			b28: count,
			pros: count,
		}),
		prosCi: z.strictObject({ contact: triple, firstKill: triple, plant: triple }),
		botsContact: z.number().positive(),
	})
	.superRefine((d, ctx) => {
		for (const s of SERIES_KEYS) {
			for (const m of METRIC_KEYS) {
				const v = d.series[s][m];
				if (v.hist.reduce((a, b) => a + b, 0) !== v.nEvent)
					ctx.addIssue({
						code: "custom",
						message: "histogram does not sum to nEvent",
						path: ["series", s, m, "hist"],
					});
			}
		}
	});

/**
 * The shipped `tempo.json`.
 *
 * Why: inferred from the projected schema; the island imports this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `tempo`)
 */
export type TempoData = z.infer<typeof projected>;

const r4 = (v: number): number => Math.round(v * 10000) / 10000;

function pick(s: z.infer<typeof sourceSeries>): z.infer<typeof series> {
	return {
		hist: s.hist,
		q: s.q10_25_50_75_90,
		n: s.n,
		nEvent: s.n_event,
		noneShare: r4(s.none_share),
	};
}
function metricsOf(a: {
	contact: z.infer<typeof sourceSeries>;
	first_kill: z.infer<typeof sourceSeries>;
	plant: z.infer<typeof sourceSeries>;
}): z.infer<typeof metrics> {
	return { contact: pick(a.contact), firstKill: pick(a.first_kill), plant: pick(a.plant) };
}
const ci = (s: readonly [number, number, number, number]): [number, number, number] => [
	s[0],
	s[1],
	s[2],
];

/**
 * The `tempo` dataset definition.
 *
 * Why: F4 draws every round as a histogram bin, so the file carries 15 histograms of 160 bins;
 * the cap is 4 KB gzip (ADR 0054), measured in the lane report.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `tempo`)
 */
export const dataset = defineDataset({
	name: "tempo",
	schemaId: "tempo/1",
	sources: { [DISTS]: sourceDists, [MEDIANS]: sourceMedians },
	projected,
	project: (src) => {
		const d = sourceDists.parse(src[DISTS]);
		const m = sourceMedians.parse(src[MEDIANS]);
		const bots = m.medians.find((row) => row.who.toLowerCase().includes("scripted bots"));
		if (bots?.contact === undefined)
			throw new Error('no "scripted bots" row with a contact median');
		return {
			schema: "tempo/1" as const,
			binS: 0.8 as const,
			series: {
				v5a2: metricsOf(d.agents.v5a2),
				b6: metricsOf(d.agents.b6),
				b10: metricsOf(d.agents.b10),
				b28: metricsOf(d.agents.b28),
				pros: metricsOf(d.pros),
			},
			rounds: {
				v5a2: d.agents.v5a2.rounds,
				b6: d.agents.b6.rounds,
				b10: d.agents.b10.rounds,
				b28: d.agents.b28.rounds,
				pros: d.pros.rounds,
			},
			prosCi: {
				contact: ci(m.pros.contact_s_median),
				firstKill: ci(m.pros.first_kill_s_median),
				plant: ci(m.pros.plant_s_median),
			},
			botsContact: bots.contact,
		};
	},
	maxGzip: 4 * 1024,
});
