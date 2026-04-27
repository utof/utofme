/**
 * Why: snapshot Zod schema is the contract between the fetcher script
 * and the page renderer. Property tests guard against drift.
 */

import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import fixture from "../../src/content/stats/snapshot.fixture.json";
import {
	formatStatValue,
	loadSnapshot,
	StatsSourceSchema,
	snapshotSchema,
} from "../../src/lib/stats";

describe("snapshotSchema", () => {
	it("parses the committed fixture", () => {
		expect(() => snapshotSchema.parse(fixture.snapshot)).not.toThrow();
	});

	it("requires all 5 sources present", () => {
		const partial = { ...fixture.snapshot, sources: { github: fixture.snapshot.sources.github } };
		expect(() => snapshotSchema.parse(partial)).toThrow();
	});

	it("accepts error: true with value: null", () => {
		const errCase = {
			...fixture.snapshot.sources.github,
			value: null,
			lastSuccessAt: null,
			error: true,
		};
		expect(() => StatsSourceSchema.parse(errCase)).not.toThrow();
	});
});

describe("formatStatValue", () => {
	it("returns 'data temporarily unavailable' when error: true", () => {
		const errSrc = { id: "github", label: "GitHub", value: null, lastSuccessAt: null, error: true };
		expect(formatStatValue(errSrc)).toBe("data temporarily unavailable");
	});

	it("formats github commits as '<n> commits / 30 d'", () => {
		const src = {
			id: "github",
			label: "GitHub",
			value: { commits30d: 47 },
			lastSuccessAt: "2026-04-27T10:00:00Z",
			error: false,
		};
		expect(formatStatValue(src)).toMatch(/47 commits/);
	});
});

describe("loadSnapshot", () => {
	it("returns the parsed fixture when no live entry exists", async () => {
		const snap = await loadSnapshot();
		expect(snap.sources.github).toBeDefined();
		expect(snap.sources.strava).toBeDefined();
	});
});

test.prop([
	fc.record({
		id: fc.string({ minLength: 1 }),
		label: fc.string({ minLength: 1 }),
		value: fc.option(fc.anything(), { nil: null }),
		lastSuccessAt: fc.option(fc.constantFrom("2026-04-27T10:00:00Z"), { nil: null }),
		error: fc.boolean(),
	}),
])("StatsSourceSchema accepts well-shaped sources", (src) => {
	const result = StatsSourceSchema.safeParse(src);
	return result.success;
});
