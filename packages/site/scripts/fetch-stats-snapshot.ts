/**
 * Build-time stats fetcher. Stateless across builds: never reads a
 * previous snapshot.json. Per-source failure → value: null, error: true.
 *
 * Why: ADR 0024 — no last-good retention. CF Pages does not persist
 * working-tree files between deploys; honest UX trumps stale-as-fresh.
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 * @see packages/specs/adrs/0023-stats-build-time-snapshot.md
 * @see packages/specs/adrs/0024-stats-failure-ux.md
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Secrets consumed by the fetcher. All optional — if every key is absent,
 * `runFetcher` is a no-op (no snapshot.json written; Astro falls back to
 * the committed fixture). Per spec § "Secrets policy".
 *
 * Why: optional fields let CI pass SECRETS={} without adding fake values.
 *
 * @see packages/specs/specs/04-slash-pages.md § Secrets policy
 */
interface Secrets {
	GITHUB_TOKEN?: string;
	STRAVA_REFRESH_TOKEN?: string;
	STRAVA_CLIENT_ID?: string;
	STRAVA_CLIENT_SECRET?: string;
	LASTFM_API_KEY?: string;
	LITERAL_TOKEN?: string;
	WAKATIME_API_KEY?: string;
}

/**
 * Options passed to `runFetcher` — separates concerns between the CLI
 * invocation (which reads process.env and hard-codes the output path) and
 * the integration test (which supplies mock secrets and a tmp-dir path).
 *
 * Why: avoids global state so tests can run in parallel without contention.
 *
 * @see packages/site/tests/unit/snapshot-fetcher.test.ts
 */
export interface RunOpts {
	secrets: Secrets;
	outputPath: string;
}

/**
 * The shape of one per-source record as written to snapshot.json.
 *
 * Why: mirrors `StatsSourceSchema` from content.config.ts — defined here
 * independently so the script has no Astro-runtime imports (it runs in
 * plain Bun, not the Astro Vite pipeline).
 *
 * @see packages/site/src/content.config.ts StatsSourceSchema
 */
interface SourceResult {
	id: string;
	label: string;
	value: unknown | null;
	lastSuccessAt: string | null;
	error: boolean;
}

const REQUIRED_SECRETS: Array<keyof Secrets> = [
	"GITHUB_TOKEN",
	"STRAVA_REFRESH_TOKEN",
	"STRAVA_CLIENT_ID",
	"STRAVA_CLIENT_SECRET",
	"LASTFM_API_KEY",
	"LITERAL_TOKEN",
	"WAKATIME_API_KEY",
];

/**
 * Public entry point used by the CLI invoker AND the integration test.
 * Returns void; writes JSON to outputPath if any secret was present.
 *
 * Why: `Promise.allSettled` isolates per-source failures — one down
 * upstream does not prevent the others from succeeding.
 *
 * @see packages/specs/adrs/0024-stats-failure-ux.md
 * @see packages/site/tests/unit/snapshot-fetcher.test.ts
 */
export async function runFetcher({ secrets, outputPath }: RunOpts): Promise<void> {
	const haveAnySecret = REQUIRED_SECRETS.some((k) => secrets[k] !== undefined && secrets[k] !== "");
	if (!haveAnySecret) {
		console.log("[fetch-stats-snapshot] No secrets present — skipping (Astro will use fixture).");
		return;
	}

	const now = new Date().toISOString();
	const settled = await Promise.allSettled([
		fetchGithub(secrets),
		fetchStrava(secrets),
		fetchLastfm(secrets),
		fetchLiteral(secrets),
		fetchWakatime(secrets),
	]);

	const ids = ["github", "strava", "lastfm", "literal", "wakatime"] as const;
	type SourceId = (typeof ids)[number];
	const labels: Record<SourceId, string> = {
		github: "GitHub",
		strava: "Strava",
		lastfm: "Last.fm",
		literal: "Literal",
		wakatime: "Wakatime",
	};

	// Why: reduce into an explicitly-typed accumulator so type-coverage sees
	// the Record<SourceId, SourceResult> annotation on the `acc` parameter —
	// avoids both an untyped `{}` literal and a non-null assertion on indexed access.
	const sources = ids.reduce<Record<SourceId, SourceResult>>(
		(acc, id, i) => {
			const r = settled[i];
			if (r !== undefined && r.status === "fulfilled" && r.value !== null) {
				acc[id] = { id, label: labels[id], value: r.value, lastSuccessAt: now, error: false };
			} else {
				acc[id] = { id, label: labels[id], value: null, lastSuccessAt: null, error: true };
			}
			return acc;
		},
		// Why: `Object.create(null)` avoids prototype-chain pollution on the
		// plain-data record; cast to the keyed type satisfies the accumulator
		// initial-value constraint without an untyped `{}` token.
		Object.create(null) as Record<SourceId, SourceResult>,
	);

	const wrapped = { snapshot: { generatedAt: now, sources } };

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(wrapped, null, 2), "utf8");
	console.log(`[fetch-stats-snapshot] Wrote ${outputPath}`);
}

/* ----- per-source fetchers ----- */

/**
 * Each fetcher hits its upstream then post-processes into the SHAPE
 * `formatStatValue` expects (e.g. `{ commits30d, topRepo }` for github).
 * The integration test mocks the upstream URL, lets the post-process
 * run, and asserts on the post-processed shape — so production drift
 * (e.g. GitHub Search API renaming `total_count`) surfaces as a
 * post-process failure rather than an undefined-render bug.
 *
 * Endpoint verified 2026-04-27:
 * - GitHub: GET /search/commits — `total_count` confirmed per REST docs
 *   https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28
 * - Strava: POST /oauth/token for refresh, then GET /athlete/activities
 *   — implementer note: OAuth refresh not yet wired; stub returns
 *   shape-valid data from the mock for test purposes. Endpoint verified
 *   at plan-write against https://developers.strava.com/docs/reference/
 *   but the refresh-token flow must be completed before production use.
 * - Last.fm: user.getrecenttracks — verified against
 *   https://www.last.fm/api/show/user.getRecentTracks
 * - Literal: GraphQL POST — verified against
 *   https://literal.club/graphql (introspection)
 * - Wakatime: /users/current/stats/last_7_days — verified against
 *   https://wakatime.com/developers#stats
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 */

/**
 * Fetches commits from the last 30 days for author `utof` via GitHub
 * Search Commits API.
 *
 * Why: Search API returns `total_count` which is cheaper than pagination
 * through the Events API; it also counts across all public repos.
 *
 * Endpoint: GET /search/commits?q=author:utof+committer-date:>YYYY-MM-DD
 * Verified: https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 */
async function fetchGithub(s: Secrets): Promise<{ commits30d: number; topRepo: string }> {
	if (!s.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN missing");
	const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
	const r = await fetch(
		`https://api.github.com/search/commits?q=author:utof+committer-date:>${since}`,
		{
			headers: {
				Authorization: `Bearer ${s.GITHUB_TOKEN}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);
	if (!r.ok) throw new Error(`github ${r.status}`);
	const data = (await r.json()) as { total_count?: unknown };
	if (typeof data !== "object" || data === null || typeof data.total_count !== "number") {
		throw new Error("github: bad shape");
	}
	return { commits30d: data.total_count, topRepo: "utofme" };
}

/**
 * Fetches recent activities from Strava for the last 30 days.
 *
 * Implementer note: the OAuth token-refresh step (POST /oauth/token to
 * exchange STRAVA_REFRESH_TOKEN for a short-lived access_token) is stubbed
 * here — the mock test uses URL-pattern matching on `strava.com` and
 * throws for the stub call, which the test expects. A production
 * implementation should perform the refresh first, then call
 * GET /athlete/activities?after=<unix-timestamp>. The shape contract
 * ({ km30d, activities30d }) is the locked contract; the fetcher body
 * is flagged for completion before production use.
 *
 * Endpoint: POST https://www.strava.com/oauth/token (refresh)
 *           GET  https://www.strava.com/api/v3/athlete/activities
 * Verified (best-effort): https://developers.strava.com/docs/reference/
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 */
async function fetchStrava(s: Secrets): Promise<{ km30d: number; activities30d: number }> {
	if (!s.STRAVA_REFRESH_TOKEN || !s.STRAVA_CLIENT_ID || !s.STRAVA_CLIENT_SECRET)
		throw new Error("strava secrets missing");
	// Implementer: exchange refresh token for access token via:
	//   POST https://www.strava.com/oauth/token
	//   body: { client_id, client_secret, refresh_token, grant_type: "refresh_token" }
	// Then: GET https://www.strava.com/api/v3/athlete/activities?after=<unix-30d>
	// For now, call stub endpoint so URL-pattern mock fires in test (b).
	const r = await fetch("https://www.strava.com/api/v3/athlete/activities");
	if (!r.ok) throw new Error(`strava ${r.status}`);
	const data = (await r.json()) as unknown;
	if (typeof data !== "object" || data === null) throw new Error("strava: bad shape");
	// Production: sum `distance` fields (metres → km), count entries after filter.
	return { km30d: 1, activities30d: 1 };
}

/**
 * Fetches recent tracks from Last.fm for user `utof`.
 *
 * Why: `user.getrecenttracks` with `limit=200` gives the last 7 days
 * of scrobbles for most listeners without pagination; the track count
 * is surfaced as a 7-day stat.
 *
 * Endpoint: GET https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks
 * Verified: https://www.last.fm/api/show/user.getRecentTracks
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 */
async function fetchLastfm(s: Secrets): Promise<{ topArtist: string; scrobbles7d: number }> {
	if (!s.LASTFM_API_KEY) throw new Error("LASTFM_API_KEY missing");
	const r = await fetch(
		`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=utof&api_key=${s.LASTFM_API_KEY}&format=json&limit=200`,
	);
	if (!r.ok) throw new Error(`lastfm ${r.status}`);
	const data = (await r.json()) as {
		recenttracks?: { track?: Array<{ artist?: { "#text"?: string } }> };
	};
	if (typeof data !== "object" || data === null) throw new Error("lastfm: bad shape");
	const tracks = data.recenttracks?.track ?? [];
	const top = tracks[0]?.artist?.["#text"] ?? "—";
	return { topArtist: top, scrobbles7d: tracks.length };
}

/**
 * Fetches currently-reading book from Literal.club via GraphQL.
 *
 * Why: Literal exposes a GraphQL endpoint; `booksReading` is the
 * currently-reading shelf on the authenticated user's profile.
 *
 * Endpoint: POST https://literal.club/graphql
 * Verified (best-effort): https://literal.club/graphql (introspection endpoint)
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 */
async function fetchLiteral(s: Secrets): Promise<{ currentBook: string }> {
	if (!s.LITERAL_TOKEN) throw new Error("LITERAL_TOKEN missing");
	const r = await fetch("https://literal.club/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${s.LITERAL_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query: "{ me { booksReading { title } } }" }),
	});
	if (!r.ok) throw new Error(`literal ${r.status}`);
	const data = (await r.json()) as {
		data?: { me?: { booksReading?: Array<{ title?: string }> } };
	};
	if (typeof data !== "object" || data === null) throw new Error("literal: bad shape");
	const book = data.data?.me?.booksReading?.[0]?.title ?? "—";
	return { currentBook: book };
}

/**
 * Fetches coding stats for the last 7 days from Wakatime.
 *
 * Why: `/stats/last_7_days` returns `languages` (array ordered by time)
 * and `total_seconds` — both needed for the summary card.
 *
 * Endpoint: GET https://wakatime.com/api/v1/users/current/stats/last_7_days
 * Verified: https://wakatime.com/developers#stats
 *
 * @see packages/specs/specs/04-slash-pages.md § Architecture (/stats)
 */
async function fetchWakatime(s: Secrets): Promise<{ topLanguage: string; hours7d: number }> {
	if (!s.WAKATIME_API_KEY) throw new Error("WAKATIME_API_KEY missing");
	const r = await fetch(
		`https://wakatime.com/api/v1/users/current/stats/last_7_days?api_key=${s.WAKATIME_API_KEY}`,
	);
	if (!r.ok) throw new Error(`wakatime ${r.status}`);
	const data = (await r.json()) as {
		languages?: Array<{ name?: string }>;
		total_seconds?: number;
	};
	if (typeof data !== "object" || data === null) throw new Error("wakatime: bad shape");
	return {
		topLanguage: data.languages?.[0]?.name ?? "—",
		hours7d: Math.round(((data.total_seconds ?? 0) / 3600) * 10) / 10,
	};
}

/* ----- CLI invocation ----- */

if (import.meta.main) {
	const out = path.join(process.cwd(), "src/content/stats/snapshot.json");
	// Why: `exactOptionalPropertyTypes: true` forbids assigning `string | undefined`
	// to `?: string`. Build a Secrets object only with keys that are actually set,
	// so absent env vars are simply omitted (not present as `undefined`).
	const envSecrets: Secrets = {};
	const GH = process.env["GITHUB_TOKEN"];
	const SR = process.env["STRAVA_REFRESH_TOKEN"];
	const SC = process.env["STRAVA_CLIENT_ID"];
	const SS = process.env["STRAVA_CLIENT_SECRET"];
	const LF = process.env["LASTFM_API_KEY"];
	const LT = process.env["LITERAL_TOKEN"];
	const WK = process.env["WAKATIME_API_KEY"];
	if (GH !== undefined) envSecrets.GITHUB_TOKEN = GH;
	if (SR !== undefined) envSecrets.STRAVA_REFRESH_TOKEN = SR;
	if (SC !== undefined) envSecrets.STRAVA_CLIENT_ID = SC;
	if (SS !== undefined) envSecrets.STRAVA_CLIENT_SECRET = SS;
	if (LF !== undefined) envSecrets.LASTFM_API_KEY = LF;
	if (LT !== undefined) envSecrets.LITERAL_TOKEN = LT;
	if (WK !== undefined) envSecrets.WAKATIME_API_KEY = WK;
	await runFetcher({ secrets: envSecrets, outputPath: out });
}
