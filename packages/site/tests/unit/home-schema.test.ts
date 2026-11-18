// Why: `topic` and `icon` are validated against the registries, so a typo in
// frontmatter fails the build (ADR 0061).
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
import type { SchemaContext } from "astro:content";
import { fc, test as fcTest } from "@fast-check/vitest";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import { worksSchema } from "../../src/content.config";
import { TOPIC_IDS } from "../../src/data/topics";
import { OBJECT_KEYS } from "../../src/lib/home/objects/registry";

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
const base = { type: "code", title: "T", date: "2026-01-01", stack: [] };

describe("works schema: topic and icon", () => {
	it("both are optional", () => {
		const r = schema.safeParse(base);
		expect(r.success).toBe(true);
		expect(r.data?.topic).toBeUndefined();
		expect(r.data?.icon).toBeUndefined();
	});

	it("rejects an unknown icon and names the valid keys", () => {
		const r = schema.safeParse({ ...base, icon: "spaceship" });
		expect(r.success).toBe(false);
		expect(JSON.stringify(r.error?.issues)).toContain("tactical");
	});

	it("rejects 'other' as an explicit topic", () => {
		expect(schema.safeParse({ ...base, topic: "other" }).success).toBe(false);
	});

	fcTest.prop([fc.constantFrom(...TOPIC_IDS), fc.constantFrom(...OBJECT_KEYS)])(
		"accepts every registered topic and icon, on every work type",
		(topic, icon) => {
			for (const extra of [
				{ type: "code", stack: [] },
				{ type: "video", duration: 1 },
				{ type: "music" },
				{ type: "math" },
				{ type: "writing" },
			]) {
				const r = schema.safeParse({ ...base, ...extra, topic, icon });
				expect(r.success).toBe(true);
				expect(r.data?.topic).toBe(topic);
				expect(r.data?.icon).toBe(icon);
			}
		},
	);

	fcTest.prop([fc.string()])("parse and safeParse agree on any topic string", (topic) => {
		const known = TOPIC_IDS.some((id) => id === topic);
		expect(schema.safeParse({ ...base, topic }).success).toBe(known);
		if (known) expect(schema.parse({ ...base, topic }).topic).toBe(topic);
		else expect(() => schema.parse({ ...base, topic })).toThrow();
	});

	fcTest.prop([fc.string()])("parse and safeParse agree on any icon string", (icon) => {
		const known = OBJECT_KEYS.includes(icon);
		expect(schema.safeParse({ ...base, icon }).success).toBe(known);
		if (known) expect(schema.parse({ ...base, icon }).icon).toBe(icon);
		else expect(() => schema.parse({ ...base, icon })).toThrow();
	});
});
