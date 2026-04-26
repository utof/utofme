import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
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

	// Why: Deterministic mutation-kill tests for draft-filter logic survivors.
	// Property tests above use random seeds and may generate edge cases (e.g. no
	// draft entries, empty arrays) that leave filter-predicate mutants alive.
	// These fixtures guarantee at least one draft + one non-draft entry, and assert
	// both inclusion (non-draft preserved) and exclusion (draft removed) in PROD mode.
	// Source: packages/specs/adrs/0008-stryker-and-fast-check-targets.md § Consequences
	const draftEntry: EntryLike<TestData> = {
		id: "draft-1",
		data: {
			type: "code",
			title: "WIP",
			date: new Date("2026-01-01"),
			tags: [],
			draft: true,
		},
	};
	const publishedEntry: EntryLike<TestData> = {
		id: "pub-1",
		data: {
			type: "code",
			title: "Published",
			date: new Date("2026-04-01"),
			tags: [],
			draft: false,
		},
	};

	it("PROD: draft entry is excluded", () => {
		const result = listWorks([draftEntry, publishedEntry], { isProd: true });
		expect(result.some((e) => e.id === "draft-1")).toBe(false);
	});
	it("PROD: non-draft entry is preserved", () => {
		const result = listWorks([draftEntry, publishedEntry], { isProd: true });
		expect(result.some((e) => e.id === "pub-1")).toBe(true);
	});
	it("PROD: exactly the non-draft count is returned", () => {
		const result = listWorks([draftEntry, publishedEntry], { isProd: true });
		expect(result.length).toBe(1);
	});
	it("dev: all entries including drafts are returned", () => {
		const result = listWorks([draftEntry, publishedEntry], { isProd: false });
		expect(result.length).toBe(2);
	});
});

// Why: Deterministic sort tests to kill comparator/method-expression mutants.
// fast-check monotone test uses random arrays; the sort-removal mutant
// ([...entries] with no sort) survives if every random sample is already
// monotone or has only one element. A fixed reverse-order fixture guarantees
// the comparator direction is exercised on every run.
// Source: packages/specs/adrs/0008-stryker-and-fast-check-targets.md § Consequences
describe("sortByDateDesc (deterministic)", () => {
	const older: EntryLike<TestData> = {
		id: "older",
		data: {
			type: "code",
			title: "Older",
			date: new Date("2024-01-01"),
			tags: [],
			draft: false,
		},
	};
	const newer: EntryLike<TestData> = {
		id: "newer",
		data: {
			type: "code",
			title: "Newer",
			date: new Date("2026-01-01"),
			tags: [],
			draft: false,
		},
	};

	it("sorts oldest-first input to newest-first", () => {
		const result = sortByDateDesc([older, newer]);
		expect(result[0]?.id).toBe("newer");
		expect(result[1]?.id).toBe("older");
	});
	it("preserves newest-first input", () => {
		const result = sortByDateDesc([newer, older]);
		expect(result[0]?.id).toBe("newer");
		expect(result[1]?.id).toBe("older");
	});
});
