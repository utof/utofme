import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import type { WorkEntry } from "../../src/content.config";
import { type EntryLike, listWorks, sortByDateDesc } from "../../src/lib/works";

/** Minimal entry shape that satisfies {@link EntryLike} for property testing. */
type TestData = {
	type: WorkEntry["type"];
	title: string;
	date: Date;
	tags: string[];
	draft: boolean;
};

const entryArb: fc.Arbitrary<EntryLike<TestData>> = fc.record({
	id: fc.string({ minLength: 1 }),
	data: fc.record({
		type: fc.constantFrom("code", "video", "music", "math", "writing") as fc.Arbitrary<
			WorkEntry["type"]
		>,
		title: fc.string({ minLength: 1 }),
		// Why: fc.date() can still generate Invalid Date (NaN) even with min/max;
		// filter to valid dates matching the z.coerce.date() contract in content.config.
		date: fc
			.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
			.filter((d) => !Number.isNaN(d.getTime())),
		tags: fc.array(fc.string(), { maxLength: 5 }),
		draft: fc.boolean(),
	}),
});

describe("sortByDateDesc", () => {
	test.prop([fc.array(entryArb)])("is idempotent", (xs) => {
		const once = sortByDateDesc(xs);
		const twice = sortByDateDesc(once);
		expect(twice).toEqual(once);
	});
	test.prop([fc.array(entryArb, { minLength: 2 })])("monotone non-increasing", (xs) => {
		const sorted = sortByDateDesc(xs);
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1];
			const curr = sorted[i];
			if (prev !== undefined && curr !== undefined) {
				expect(prev.data.date.getTime()).toBeGreaterThanOrEqual(curr.data.date.getTime());
			}
		}
	});
	test.prop([fc.array(entryArb)])("permutation: same multiset", (xs) => {
		const sorted = sortByDateDesc(xs);
		expect(sorted.length).toBe(xs.length);
		const ids = (arr: EntryLike<TestData>[]) => arr.map((e) => e.id).sort();
		expect(ids(sorted)).toEqual(ids(xs));
	});
});

describe("listWorks draft filter", () => {
	test.prop([fc.array(entryArb)])("PROD excludes drafts", (xs) => {
		const result = listWorks(xs, { isProd: true });
		expect(result.every((e) => e.data.draft !== true)).toBe(true);
	});
	test.prop([fc.array(entryArb)])("dev includes drafts", (xs) => {
		const result = listWorks(xs, { isProd: false });
		expect(result.length).toBe(xs.length);
	});
	test.prop([fc.array(entryArb)])("count(prod) ≤ count(dev)", (xs) => {
		expect(listWorks(xs, { isProd: true }).length).toBeLessThanOrEqual(
			listWorks(xs, { isProd: false }).length,
		);
	});
});
