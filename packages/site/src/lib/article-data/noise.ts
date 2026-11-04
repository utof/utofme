/**
 * Dataset `noise` (figure F9): null (A/A) Elo differences, the effect sizes of adopted changes and
 * the project's own noise rules.
 *
 * Whitelist (spec P10-3): `nulls[]{kind, diffs[]}` (CS maps, K = 1 checkpoint), `effects[]{abId,
 * era, cs}` (adopted rows of the A/B table) and `rules{sameSeedSd, indepSd, mdeFactor}`. The three
 * rule numbers are parsed from the notes' rule strings ({@link parseRules}), so a reworded source
 * fails the sync instead of silently drifting from the prose.
 *
 * Why: the dot plot needs the raw differences and the three constants, nothing of the notes'
 * commentary; the strict projected schema turns any extra field into a sync error (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `noise`) and § P10-13
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import { z } from "astro/zod";
import { defineDataset } from "./types";

const NOISE = "noise.json";
const AB = "ab_results.json";

const sourceNoise = z.object({
	null_pairs: z.array(
		z.object({
			maps: z.string(),
			kind: z.string(),
			by_K: z.array(z.object({ K: z.number().int(), diffs: z.array(z.number()) })),
		}),
	),
	rules: z.object({
		same_seed_keeps_sampling: z.object({ sd_per_difference: z.string() }),
		sampling_changing_or_independent: z.object({ sd_per_difference: z.string() }),
		mde: z.string(),
	}),
});
const sourceAb = z.object({
	rows: z.array(z.object({ id: z.string(), era: z.string(), cs: z.number(), kept: z.boolean() })),
});

const KINDS: Readonly<Record<string, "same_seed" | "indep_seed">> = {
	same_seed: "same_seed",
	today_indep: "indep_seed",
};

/**
 * The three constants of the project's rule, as parsed.
 *
 * Why: F9's sentence reads them from the data, never from literals.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
 */
export interface NoiseRules {
	/** SD of one difference when the arm and control share each seed. */
	sameSeedSd: number;
	/** SD of one difference when they do not (first number of "~5.3-6"). */
	indepSd: number;
	/** Detectable-effect factor: 80 % power, one-sided 5 %. */
	mdeFactor: number;
}

function firstNumber(text: string, re: RegExp, what: string): number {
	const m = re.exec(text);
	if (!m?.[1]) throw new Error(`noise: cannot parse ${what} from the rule string`);
	return Number(m[1]);
}

/**
 * Parses the rule numbers out of the source's rule strings.
 *
 * Why: the spec wants 2.5, 5.3 and 2.49 read from the data, with a unit test that the strings
 * contain them, so the page's sentence cannot disagree with the notes.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (`noise` row)
 */
export function parseRules(rules: {
	same_seed_keeps_sampling: { sd_per_difference: string };
	sampling_changing_or_independent: { sd_per_difference: string };
	mde: string;
}): NoiseRules {
	return {
		sameSeedSd: firstNumber(
			rules.same_seed_keeps_sampling.sd_per_difference,
			/^~(\d+(?:\.\d+)?)/,
			"sameSeedSd",
		),
		indepSd: firstNumber(
			rules.sampling_changing_or_independent.sd_per_difference,
			/^~(\d+(?:\.\d+)?)/,
			"indepSd",
		),
		mdeFactor: firstNumber(rules.mde, /(\d+\.\d+)\s*x\s*SD/, "mdeFactor"),
	};
}

const num = z.number();
const projected = z.strictObject({
	schema: z.literal("noise/1"),
	nulls: z.array(
		z.strictObject({ kind: z.enum(["same_seed", "indep_seed"]), diffs: z.array(num).min(1) }),
	),
	effects: z.array(z.strictObject({ abId: z.string(), era: z.string(), cs: num })),
	rules: z.strictObject({ sameSeedSd: num, indepSd: num, mdeFactor: num }),
});

/**
 * The shipped `noise.json`.
 *
 * Why: inferred from the projected schema; islands import this type only, never Zod (ADR 0054).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `noise`)
 */
export type NoiseData = z.infer<typeof projected>;

/**
 * The `noise` dataset definition.
 *
 * Why: F9 draws the null differences beside the adopted effects on one axis; cap 3 KB gzip (spec).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (datasets table, `noise`)
 */
export const dataset = defineDataset({
	name: "noise",
	schemaId: "noise/1",
	sources: { [NOISE]: sourceNoise, [AB]: sourceAb },
	projected,
	project: (src) => {
		const n = sourceNoise.parse(src[NOISE]);
		const ab = sourceAb.parse(src[AB]);
		const diffs: Record<string, number[]> = {};
		for (const p of n.null_pairs) {
			const kind = KINDS[p.kind];
			if (p.maps !== "cs" || !kind) continue;
			const k1 = p.by_K.find((b) => b.K === 1);
			if (k1) diffs[kind] = [...(diffs[kind] ?? []), ...k1.diffs];
		}
		return {
			schema: "noise/1" as const,
			nulls: (["same_seed", "indep_seed"] as const).map((kind) => ({
				kind,
				diffs: diffs[kind] ?? [],
			})),
			effects: ab.rows.filter((r) => r.kept).map((r) => ({ abId: r.id, era: r.era, cs: r.cs })),
			rules: parseRules(n.rules),
		};
	},
	maxGzip: 3072,
});
