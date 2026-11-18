// Why: the home model is the only thing a home layout receives (ADR 0061), so its
// grouping, ordering, counts and curation errors are pinned here.
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { HOME } from "../../src/data/home";
import { OTHER_TOPIC, TOPICS } from "../../src/data/topics";
import {
	buildHomeModel,
	type HomeCuration,
	type HomeWork,
	monthLabel,
	slugSeed,
} from "../../src/lib/home/model";

const topics = { list: TOPICS, other: OTHER_TOPIC };

function work(id: string, topic?: string, extra: Partial<HomeWork["data"]> = {}): HomeWork {
	return {
		id,
		data: { title: id.toUpperCase(), date: new Date("2026-11-03T00:00:00Z"), topic, ...extra },
	};
}

const curation = (hero: string | null, highlighted: readonly string[] = []): HomeCuration => ({
	layout: "catalogue",
	hero,
	highlighted,
	featuredLabel: "Featured",
});

describe("buildHomeModel", () => {
	const works = [
		work("a", "rl"),
		work("b", "physics"),
		work("c", "physics"),
		work("d"),
		work("e", "notes"),
	];

	it("groups by topic in registry order, items in input order", () => {
		const model = buildHomeModel(works, curation(null), topics);
		expect(model.groups.map((g) => g.topic.id)).toEqual(["physics", "rl", "notes", "other"]);
		expect(model.groups[0]?.items.map((i) => i.slug)).toEqual(["b", "c"]);
	});

	it("omits empty topics", () => {
		const model = buildHomeModel(works, curation(null), topics);
		expect(model.groups.some((g) => g.topic.id === "audio")).toBe(false);
		expect(model.groups.every((g) => g.count > 0)).toBe(true);
	});

	it("puts a missing or unregistered topic in Other, last", () => {
		const model = buildHomeModel([work("x"), work("y", "no-such-topic")], curation(null), topics);
		expect(model.groups).toHaveLength(1);
		expect(model.groups[0]?.topic).toBe(OTHER_TOPIC);
		expect(model.groups[0]?.items.map((i) => i.slug)).toEqual(["x", "y"]);
	});

	it("reports counts", () => {
		const model = buildHomeModel(works, curation("a", ["b", "e"]), topics);
		expect(model.counts).toEqual({ featured: 3, total: 5 });
		expect(model.groups.map((g) => g.count)).toEqual([2, 1, 1, 1]);
	});

	it("resolves hero and highlighted in curation order", () => {
		const model = buildHomeModel(works, curation("c", ["e", "a"]), topics);
		expect(model.hero?.slug).toBe("c");
		expect(model.highlighted.map((i) => i.slug)).toEqual(["e", "a"]);
	});

	it("lists hero and highlighted projects in their topic groups too", () => {
		const model = buildHomeModel(works, curation("a", ["b"]), topics);
		const listed = model.groups.flatMap((g) => g.items.map((i) => i.slug));
		expect(listed).toContain("a");
		expect(listed).toContain("b");
	});

	it("does not repeat the hero or a slug inside highlighted", () => {
		const model = buildHomeModel(works, curation("a", ["a", "b", "b", "c"]), topics);
		expect(model.highlighted.map((i) => i.slug)).toEqual(["b", "c"]);
		expect(model.counts.featured).toBe(3);
	});

	it("allows no hero", () => {
		const model = buildHomeModel(works, curation(null, ["b"]), topics);
		expect(model.hero).toBeUndefined();
		expect(model.counts.featured).toBe(1);
	});

	it("fails on an unknown hero slug, naming the slug, the field and the file", () => {
		expect(() => buildHomeModel(works, curation("nope"), topics)).toThrow(
			/unknown project slug "nope" in `hero` \(packages\/site\/src\/data\/home\.ts\)/,
		);
	});

	it("fails on an unknown highlighted slug", () => {
		expect(() => buildHomeModel(works, curation("a", ["b", "typo"]), topics)).toThrow(
			/unknown project slug "typo" in `highlighted`/,
		);
	});

	it("derives the item texts", () => {
		const model = buildHomeModel(
			[
				work("a", "rl", { lede: "Lede.", summary: "Summary.", stack: ["JAX"], icon: "tactical" }),
				work("b", "rl", { summary: "Summary only." }),
				work("c", "rl"),
			],
			curation(null),
			topics,
		);
		const [a, b, c] = model.groups[0]?.items ?? [];
		expect(a).toMatchObject({
			title: "A",
			lede: "Lede.",
			dateLabel: "Nov 2026",
			dateIso: "2026-11",
			stack: ["JAX"],
			icon: "tactical",
		});
		expect(b?.lede).toBe("Summary only.");
		expect(c?.lede).toBeUndefined();
		expect(c?.stack).toEqual([]);
		expect(c?.icon).toBeUndefined();
	});

	it("keeps the original entry on each item", () => {
		const model = buildHomeModel(works, curation("a"), topics);
		expect(model.hero?.entry).toBe(works[0]);
	});

	it("the committed curation only uses the registered layout key shape", () => {
		expect(HOME.layout).toBe("catalogue");
		expect(new Set(HOME.highlighted).size).toBe(HOME.highlighted.length);
		expect(HOME.highlighted).not.toContain(HOME.hero);
	});
});

describe("monthLabel / slugSeed", () => {
	it("formats in UTC", () => {
		expect(monthLabel(new Date("2026-02-28T23:59:59Z"))).toBe("Feb 2026");
		expect(monthLabel(new Date("2026-12-01T00:00:00Z"))).toBe("Dec 2026");
	});

	it("seed is stable and positive", () => {
		expect(slugSeed("tactical-arena")).toBe(slugSeed("tactical-arena"));
		expect(slugSeed("a")).not.toBe(slugSeed("b"));
	});

	fcTest.prop([fc.string()])("seed is a non-negative integer below 100000", (slug) => {
		const seed = slugSeed(slug);
		expect(Number.isInteger(seed)).toBe(true);
		expect(seed).toBeGreaterThanOrEqual(0);
		expect(seed).toBeLessThan(100000);
	});
});

const topicArb = fc.option(fc.constantFrom(...TOPICS.map((t) => t.id), "unregistered"), {
	nil: undefined,
});
const worksArb = fc
	.uniqueArray(fc.stringMatching(/^[a-z0-9-]{1,12}$/), { maxLength: 30 })
	.chain((ids) =>
		fc.tuple(...ids.map((id) => topicArb.map((topic) => work(id, topic)))).map((ws) => [...ws]),
	);
const modelInputArb = worksArb.chain((ws) => {
	const ids = ws.map((w) => w.id);
	const slugArb = ids.length > 0 ? fc.constantFrom(...ids) : fc.constant("");
	return fc.record({
		works: fc.constant(ws),
		hero: ids.length > 0 ? fc.option(slugArb, { nil: null }) : fc.constant(null),
		highlighted: fc.array(slugArb, { maxLength: ids.length > 0 ? 8 : 0 }),
	});
});

describe("buildHomeModel properties", () => {
	fcTest.prop([modelInputArb])("every work appears in exactly one group", (input) => {
		const model = buildHomeModel(input.works, curation(input.hero, input.highlighted), topics);
		const listed = model.groups.flatMap((g) => g.items.map((i) => i.slug));
		expect([...listed].sort()).toEqual(input.works.map((w) => w.id).sort());
		expect(new Set(listed).size).toBe(listed.length);
	});

	fcTest.prop([modelInputArb])("group counts sum to the total", (input) => {
		const model = buildHomeModel(input.works, curation(input.hero, input.highlighted), topics);
		const sum = model.groups.reduce((n, g) => n + g.count, 0);
		expect(sum).toBe(model.counts.total);
		expect(model.counts.total).toBe(input.works.length);
		for (const g of model.groups) expect(g.count).toBe(g.items.length);
	});

	fcTest.prop([modelInputArb])("no project is featured twice", (input) => {
		const model = buildHomeModel(input.works, curation(input.hero, input.highlighted), topics);
		const featured = [
			...(model.hero ? [model.hero.slug] : []),
			...model.highlighted.map((i) => i.slug),
		];
		expect(new Set(featured).size).toBe(featured.length);
		expect(model.counts.featured).toBe(featured.length);
	});

	fcTest.prop([modelInputArb])("groups follow the registry order, Other last", (input) => {
		const model = buildHomeModel(input.works, curation(input.hero, input.highlighted), topics);
		const order: string[] = [...TOPICS.map((t) => t.id), OTHER_TOPIC.id];
		const positions = model.groups.map((g) => order.indexOf(g.topic.id));
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(positions.every((p) => p >= 0)).toBe(true);
	});

	fcTest.prop([modelInputArb, fc.stringMatching(/^[A-Z]{3,6}$/)])(
		"an unknown curated slug always throws",
		(input, bad) => {
			expect(() => buildHomeModel(input.works, curation(bad), topics)).toThrow(bad);
		},
	);
});
