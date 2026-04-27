/**
 * Stats snapshot helpers — re-exports the schema (defined in
 * content.config.ts), implements loadSnapshot fallback, and the
 * per-source render formatter.
 *
 * Why: schema lives next to the collection registration (one source
 * of truth); helpers consume it from there.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 * @see packages/specs/adrs/0024-stats-failure-ux.md
 */
import { getEntry } from "astro:content";
import type { z } from "astro/zod";
import fixture from "../content/stats/snapshot.fixture.json";
import { StatsSourceSchema, snapshotSchema } from "../content.config";

export { StatsSourceSchema, snapshotSchema };

/**
 * Parsed type for one stats source record — inferred from `StatsSourceSchema`.
 *
 * Why: re-exported here so page components and formatStatValue callers can
 * type-check source objects without importing from content.config.ts directly.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 */
export type StatsSource = z.infer<typeof StatsSourceSchema>;

/**
 * Parsed type for the full stats snapshot — inferred from `snapshotSchema`.
 *
 * Why: used as the return type of `loadSnapshot` so callers have full
 * structural type information without re-deriving via `z.infer`.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 */
export type Snapshot = z.infer<typeof snapshotSchema>;

/**
 * Returns the parsed snapshot — entry from the `stats` collection if a
 * live `snapshot.json` exists, otherwise the committed fixture.
 *
 * Why: production builds (with secrets) have a fresh snapshot.json on
 * disk; CI / dev does not. Both paths must surface the same shape.
 *
 * In dev/CI the absence of snapshot.json causes Astro's file() loader
 * to log a `File not found` line and skip the entry — the loader does
 * not throw (verified via the loader source 2026-04-27). This is
 * cosmetic; the build remains green.
 *
 * The try/catch also covers unit-test contexts where `getEntry` is
 * unavailable (vitest aliases astro:content to astro/content/config,
 * which does not export getEntry — the call throws, we fall back to
 * fixture).
 *
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 */
export async function loadSnapshot(): Promise<Snapshot> {
	try {
		const entry = await getEntry("stats", "snapshot");
		if (entry) return snapshotSchema.parse(entry.data);
	} catch {
		// getEntry unavailable outside Astro runtime (unit tests, scripts);
		// fall through to fixture below.
	}
	return snapshotSchema.parse(fixture.snapshot);
}

/**
 * Narrows `unknown` to a plain record with scalar values.
 *
 * Why: `StatsSourceSchema` stores `value` as `z.unknown().nullable()` so
 * the concrete shape is only known per-source at runtime. This type guard
 * avoids an unsafe `as` cast while satisfying `type-coverage --strict`,
 * which flags `unknown`-typed expression nodes.
 *
 * @see packages/specs/specs/04-slash-pages.md § Snapshot shape
 */
function isPlainRecord(
	v: unknown,
): v is Record<string, string | number | boolean | null | undefined> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Renders one source's value as a short human string.
 * Returns `"data temporarily unavailable"` for errored sources — never
 * surfaces stale data. See ADR 0024.
 *
 * @see packages/specs/adrs/0024-stats-failure-ux.md
 */
export function formatStatValue(source: StatsSource): string {
	if (source.error || source.value === null) return "data temporarily unavailable";
	if (!isPlainRecord(source.value)) return "—";
	const v = source.value;
	switch (source.id) {
		case "github":
			return `${v.commits30d} commits / 30 d`;
		case "strava":
			return `${v.km30d} km / ${v.activities30d} activities (30 d)`;
		case "lastfm":
			return `${v.scrobbles7d} scrobbles / 7 d — top: ${v.topArtist}`;
		case "literal":
			return `currently reading: ${v.currentBook}`;
		case "wakatime":
			return `${v.hours7d} h coding / 7 d — top: ${v.topLanguage}`;
		default:
			return "—";
	}
}
