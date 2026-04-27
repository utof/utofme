/**
 * Why: per-source failure handling is the trickiest behaviour in Phase 4.
 * Each branch of the merge rule needs an explicit test because the
 * fetcher is the single writer of snapshot.json.
 *
 * Mocks fetch by URL pattern (NOT by call-index) so the test survives
 * future changes in per-source fetch counts (e.g. Strava OAuth refresh
 * adding a second fetch). Per plan review nit #6 + blocker #2(b).
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runFetcher } from "../../scripts/fetch-stats-snapshot";

const TMP = path.join(os.tmpdir(), `snapshot-fetcher-${process.pid}`);
const SNAPSHOT_PATH = path.join(TMP, "snapshot.json");

beforeEach(async () => {
	await fs.mkdir(TMP, { recursive: true });
});

afterEach(async () => {
	await fs.rm(TMP, { recursive: true, force: true });
	vi.unstubAllGlobals();
});

const SECRETS = {
	GITHUB_TOKEN: "x",
	STRAVA_REFRESH_TOKEN: "x",
	STRAVA_CLIENT_ID: "x",
	STRAVA_CLIENT_SECRET: "x",
	LASTFM_API_KEY: "x",
	LITERAL_TOKEN: "x",
	WAKATIME_API_KEY: "x",
};

/**
 * URL-pattern fetch mock. Per-source post-processed shapes returned
 * directly (each fetcher's downstream of the network call). When an
 * upstream URL matches `failingPatterns`, throw — emulating outage.
 */
function makeFetchMock(failingPatterns: RegExp[] = []) {
	return async (input: RequestInfo | URL): Promise<Response> => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: (input as Request).url;
		for (const p of failingPatterns) if (p.test(url)) throw new Error(`mock fail: ${url}`);
		// Return a benign object — each fetcher's post-process step shapes it.
		return new Response(
			JSON.stringify({
				stub: true,
				total_count: 5,
				items: [],
				recenttracks: {
					track: [{ name: "x", artist: { "#text": "x" } }],
				},
				data: { me: { booksReading: [{ title: "x" }] } },
				languages: [{ name: "TS" }],
				total_seconds: 60 * 60 * 5,
				distance: 1000,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	};
}

describe("snapshot fetcher", () => {
	it("(a) all-succeed → all sources error: false, value populated", async () => {
		vi.stubGlobal("fetch", makeFetchMock([]));
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const written = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as {
			snapshot: { sources: Record<string, { error: boolean; value: unknown }> };
		};
		const sources = Object.values(written.snapshot.sources) as Array<{
			error: boolean;
			value: unknown;
		}>;
		expect(sources.every((s) => s.error === false)).toBe(true);
		expect(sources.every((s) => s.value !== null)).toBe(true);
	});

	it("(b) Strava down → strava errored; the other 4 normal", async () => {
		vi.stubGlobal("fetch", makeFetchMock([/strava\.com/]));
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const { sources } = (
			JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as {
				snapshot: { sources: Record<string, { error: boolean; value: unknown }> };
			}
		).snapshot;
		expect(sources["strava"]?.error).toBe(true);
		expect(sources["strava"]?.value).toBeNull();
		for (const id of ["github", "lastfm", "literal", "wakatime"]) {
			expect(sources[id]?.error).toBe(false);
			expect(sources[id]?.value).not.toBeNull();
		}
	});

	it("(c) all upstreams down → all 5 errored; file still written", async () => {
		vi.stubGlobal("fetch", makeFetchMock([/.*/]));
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const sources = Object.values(
			(
				JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as {
					snapshot: { sources: Record<string, { error: boolean; value: unknown }> };
				}
			).snapshot.sources,
		) as Array<{ error: boolean; value: unknown }>;
		expect(sources.every((s) => s.error === true)).toBe(true);
		expect(sources.every((s) => s.value === null)).toBe(true);
	});

	it("(d) one source returns malformed (non-object) → that source errored", async () => {
		// Override only github with a bad-shape response
		vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: (input as Request).url;
			if (/api\.github\.com/.test(url)) {
				return new Response(JSON.stringify("not an object"), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return makeFetchMock([])(input);
		});
		await runFetcher({ secrets: SECRETS, outputPath: SNAPSHOT_PATH });
		const { sources } = (
			JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as {
				snapshot: { sources: Record<string, { error: boolean; value: unknown }> };
			}
		).snapshot;
		expect(sources["github"]?.error).toBe(true);
		expect(sources["strava"]?.error).toBe(false);
	});

	it("(e) all secrets absent → no-op (file not created)", async () => {
		vi.stubGlobal("fetch", makeFetchMock([]));
		await runFetcher({ secrets: {}, outputPath: SNAPSHOT_PATH });
		await expect(fs.access(SNAPSHOT_PATH)).rejects.toThrow();
	});
});
