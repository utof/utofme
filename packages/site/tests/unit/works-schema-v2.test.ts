/**
 * Property tests for the P9-3 works schema v2 (`lede`, `status`, `started`, `links`, media, `fixture`).
 *
 * @see packages/specs/specs/09-project-view.md § P9-3 (AC3.1–AC3.3)
 */
import type { SchemaContext } from "astro:content";
import { fc, test } from "@fast-check/vitest";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import { worksSchema } from "../../src/content.config";
import { listWorks, prevNext } from "../../src/lib/works";

const mockImage: SchemaContext["image"] = () =>
	z.object({
		src: z.string(),
		width: z.number(),
		height: z.number(),
		format: z.union([
			z.literal("png"),
			z.literal("jpg"),
			z.literal("jpeg"),
			z.literal("tiff"),
			z.literal("webp"),
			z.literal("gif"),
			z.literal("svg"),
			z.literal("avif"),
			z.literal("apng"),
		]),
	});
const schema = worksSchema({ image: mockImage });
const img = { src: "/a.png", width: 10, height: 10, format: "png" as const };
const base = { type: "code", title: "T", date: "2026-01-01", stack: ["ts"] };

const slugArb = fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/).filter((s) => s.length <= 64);
const textArb = (max: number) =>
	fc.string({ minLength: 1, maxLength: max }).filter((s) => s.trim().length > 0);
const mediaArb = fc.record({
	src: fc.constant(img),
	alt: textArb(200),
	loop: fc.option(slugArb, { nil: undefined }),
	focus: fc.integer({ min: 0, max: 100 }),
});
const linkArb = fc.record({
	label: textArb(24),
	href: fc.constantFrom("https://a.dev/x", "https://b.dev"),
	private: fc.boolean(),
});
const validArb = fc.record({
	cover: mediaArb,
	gallery: fc.array(
		mediaArb.map((m) => ({ ...m, caption: "c" })),
		{ maxLength: 5 },
	),
	lede: textArb(120),
	status: fc.constantFrom("shipped", "prototype", "research", "archived"),
	links: fc.array(linkArb, { maxLength: 5 }),
	fixture: fc.boolean(),
});

describe("works schema v2", () => {
	test.prop([validArb])("valid arbitrary entries parse", (extra) => {
		expect(schema.safeParse({ ...base, ...extra }).success).toBe(true);
	});

	it("defaults: fixture false, focus 50, links/gallery []", () => {
		const r = schema.parse({ ...base, cover: { src: img, alt: "a" } });
		expect(r.fixture).toBe(false);
		expect(r.links).toEqual([]);
		expect(r.gallery).toEqual([]);
		expect(r.cover?.focus).toBe(50);
	});

	it("legacy cover { src, alt } still parses (AC3.2)", () => {
		expect(schema.safeParse({ ...base, cover: { src: img, alt: "x" } }).success).toBe(true);
	});

	test.prop([fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 101 }))])(
		"cover.focus outside [0,100] fails at that path",
		(focus) => {
			const r = schema.safeParse({ ...base, cover: { src: img, alt: "a", focus } });
			expect(r.error?.issues[0]?.path).toEqual(["cover", "focus"]);
		},
	);

	test.prop([
		fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)),
	])("bad loop slug fails", (loop) => {
		const r = schema.safeParse({ ...base, cover: { src: img, alt: "a", loop } });
		expect(r.error?.issues[0]?.path).toEqual(["cover", "loop"]);
	});

	test.prop([fc.integer({ min: 121, max: 400 })])("lede > 120 chars fails", (n) => {
		const r = schema.safeParse({ ...base, lede: "x".repeat(n) });
		expect(r.error?.issues[0]?.path).toEqual(["lede"]);
	});

	test.prop([fc.integer({ min: 101, max: 300 })])("gallery caption > 100 chars fails", (n) => {
		const r = schema.safeParse({
			...base,
			gallery: [{ src: img, alt: "a", caption: "x".repeat(n) }],
		});
		expect(r.error?.issues[0]?.path).toEqual(["gallery", 0, "caption"]);
	});

	it("more than 5 gallery items or links fails", () => {
		const g = { src: img, alt: "a", caption: "c" };
		const l = { label: "l", href: "https://a.dev" };
		expect(
			schema.safeParse({ ...base, gallery: Array.from({ length: 6 }, () => g) }).error?.issues[0]
				?.path,
		).toEqual(["gallery"]);
		expect(
			schema.safeParse({ ...base, links: Array.from({ length: 6 }, () => l) }).error?.issues[0]
				?.path,
		).toEqual(["links"]);
	});

	test.prop([textArb(10).filter((s) => !s.includes(":") && !s.includes("/"))])(
		"link href that is not a URL fails",
		(href) => {
			const r = schema.safeParse({ ...base, links: [{ label: "l", href }] });
			expect(r.error?.issues[0]?.path).toEqual(["links", 0, "href"]);
		},
	);

	it("link.private defaults to false; bad status fails", () => {
		const r = schema.parse({ ...base, links: [{ label: "l", href: "https://a.dev" }] });
		expect(r.links[0]?.private).toBe(false);
		expect(schema.safeParse({ ...base, status: "wip" }).success).toBe(false);
	});

	test.prop([fc.integer({ min: 1, max: 3650 })])(
		"started after date fails with path started",
		(days) => {
			const started = new Date(Date.UTC(2026, 0, 1) + days * 86_400_000).toISOString();
			const r = schema.safeParse({ ...base, started });
			expect(r.error?.issues[0]?.path).toEqual(["started"]);
		},
	);

	test.prop([fc.integer({ min: 0, max: 3650 })])("started on/before date parses", (days) => {
		const started = new Date(Date.UTC(2026, 0, 1) - days * 86_400_000).toISOString();
		expect(schema.safeParse({ ...base, started }).success).toBe(true);
	});

	it("non-code variants accept optional stack ≤ 8", () => {
		const v = { type: "video", title: "T", date: "2026-01-01", duration: 3 };
		expect(schema.safeParse({ ...v, stack: ["a"] }).success).toBe(true);
		expect(schema.safeParse({ ...v, stack: Array.from({ length: 9 }, () => "a") }).success).toBe(
			false,
		);
	});
});

type E = { id: string; data: { date: Date; draft: boolean; fixture: boolean } };
const entryArb: fc.Arbitrary<E[]> = fc.uniqueArray(
	fc.record({
		id: fc.string({ minLength: 1 }),
		data: fc.record({
			date: fc.date({
				min: new Date("2020-01-01"),
				max: new Date("2030-01-01"),
				noInvalidDate: true,
			}),
			draft: fc.boolean(),
			fixture: fc.boolean(),
		}),
	}),
	{ selector: (e) => e.id },
);

describe("fixture filtering and prevNext (AC3.3)", () => {
	test.prop([entryArb])("includeFixtures:false never returns a fixture", (entries) => {
		const out = listWorks(entries, { isProd: false, includeFixtures: false });
		expect(out.every((e) => !e.data.fixture)).toBe(true);
		expect(listWorks(entries, { isProd: false }).length).toBe(entries.length);
	});

	test.prop([entryArb])("prevNext returns neighbours, undefined at ends", (entries) => {
		for (const [i, e] of entries.entries()) {
			const { prev, next } = prevNext(entries, e.id);
			expect(prev).toBe(entries[i - 1]);
			expect(next).toBe(entries[i + 1]);
		}
		expect(prevNext(entries, "\u0000missing")).toEqual({ prev: undefined, next: undefined });
	});
});
