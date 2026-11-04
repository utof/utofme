import { fc, test } from "@fast-check/vitest";
import { z } from "astro/zod";
import { describe, expect, it } from "vitest";
import {
	buildDataset,
	checkDataset,
	EXIT,
	exitCodeOf,
	formatProblem,
	gzipBytes,
	type Problem,
	serialise,
	sha256Hex,
} from "../../scripts/lib/article-data-core";
import { defineDataset, shapeOf } from "../../src/lib/article-data/types";

const SRC = "tiny_src.json";
const sourceSchema = z.object({
	note: z.string(),
	items: z.array(z.object({ id: z.string(), v: z.number(), src: z.string() })),
});
const projectedSchema = z.object({
	schema: z.literal("tiny/1"),
	items: z.array(z.object({ id: z.string(), v: z.number() })),
});

type Projected = z.infer<typeof projectedSchema>;

function makeDataset(over: { maxGzip?: number; project?: (s: unknown) => Projected } = {}) {
	return defineDataset({
		name: "tiny",
		schemaId: "tiny/1",
		sources: { [SRC]: sourceSchema },
		projected: projectedSchema,
		project: (src) => {
			if (over.project) return over.project(src[SRC]);
			const s = sourceSchema.parse(src[SRC]);
			return { schema: "tiny/1", items: s.items.map(({ id, v }) => ({ id, v })) };
		},
		maxGzip: over.maxGzip ?? 2048,
	});
}

const goodSource = {
	note: "dropped",
	items: [
		{ id: "a", v: 1.5, src: "notes/EXAMPLE.md:1" },
		{ id: "b", v: 2, src: "notes/EXAMPLE.md:2" },
	],
};
const ctx = { denylist: [] as string[], today: "2026-11-04" };
const sources = { [SRC]: goodSource };

function ok(r: ReturnType<typeof buildDataset>) {
	if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.problems)}`);
	return r;
}
function fail(r: ReturnType<typeof buildDataset>): Problem[] {
	if (r.ok) throw new Error("expected failure");
	return [...r.problems];
}

describe("defineDataset / shapeOf", () => {
	it("returns the dataset unchanged", () => {
		const d = makeDataset();
		expect(d.name).toBe("tiny");
		expect(d.schemaId).toBe("tiny/1");
	});
	it("rejects a schemaId that is not `<name>/<n>`", () => {
		expect(() =>
			defineDataset({
				name: "tiny",
				schemaId: "other/1",
				sources: {},
				projected: projectedSchema,
				project: () => ({ schema: "tiny/1" as const, items: [] }),
				maxGzip: 10,
			}),
		).toThrow(/schemaId/);
	});
	it("shapeOf lists the top-level keys of the projected schema, sorted", () => {
		expect(shapeOf(makeDataset())).toEqual({ schema: "tiny/1", keys: ["items", "schema"] });
	});
});

describe("serialise", () => {
	it("sorts keys at every depth, is compact and ends with one newline", () => {
		expect(serialise({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe(
			'{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}\n',
		);
	});
	it("sorts integer-like keys as strings, not numerically", () => {
		expect(serialise({ "10": 1, "9": 2, a: 3 })).toBe('{"10":1,"9":2,"a":3}\n');
	});
	it("skips undefined object values and refuses non-finite numbers", () => {
		expect(serialise({ a: undefined, b: 1 })).toBe('{"b":1}\n');
		expect(() => serialise({ a: Number.NaN })).toThrow(/finite/);
		expect(() => serialise([Number.POSITIVE_INFINITY])).toThrow(/finite/);
	});
	test.prop([fc.jsonValue()])("round-trips through JSON.parse", (v) => {
		expect(JSON.parse(serialise(v))).toEqual(JSON.parse(JSON.stringify(v)));
	});
	test.prop([fc.dictionary(fc.string(), fc.integer())])("is independent of key order", (o) => {
		const rev = Object.fromEntries(Object.entries(o).reverse());
		expect(serialise(rev)).toBe(serialise(o));
	});
});

describe("buildDataset", () => {
	it("projects, serialises deterministically and writes a sidecar", () => {
		const r = ok(buildDataset(makeDataset(), sources, ctx));
		expect(r.output).toBe('{"items":[{"id":"a","v":1.5},{"id":"b","v":2}],"schema":"tiny/1"}\n');
		expect(r.sidecar).toEqual({
			schema: "tiny/1",
			sources: [SRC],
			bytes: Buffer.byteLength(r.output),
			gzipBytes: gzipBytes(r.output),
			sha256: sha256Hex(r.output),
			syncedAt: "2026-11-04",
		});
		expect(r.output).not.toContain("EXAMPLE");
	});
	it("keeps syncedAt when the output is unchanged, renews it when it changed", () => {
		const first = ok(buildDataset(makeDataset(), sources, ctx));
		const again = ok(
			buildDataset(makeDataset(), sources, {
				...ctx,
				today: "2027-01-01",
				previous: first.sidecar,
			}),
		);
		expect(again.sidecar).toEqual(first.sidecar);
		const changed = ok(
			buildDataset(
				makeDataset(),
				{ [SRC]: { ...goodSource, items: [{ id: "a", v: 9, src: "notes/EXAMPLE.md:1" }] } },
				{ ...ctx, today: "2027-01-01", previous: first.sidecar },
			),
		);
		expect(changed.sidecar.syncedAt).toBe("2027-01-01");
	});
	it("a missing source file is exit 4 and names the file", () => {
		const p = fail(buildDataset(makeDataset(), {}, ctx));
		expect(p).toHaveLength(1);
		expect(p[0]).toMatchObject({ code: EXIT.missing, file: SRC });
		expect(exitCodeOf(p)).toBe(4);
	});
	it("a source schema error is exit 1 with file and JSON path, never the value", () => {
		const bad = {
			note: "x",
			items: [
				{ id: "a", v: 1, src: "s" },
				{ id: "b", v: "LEAKY", src: "s" },
			],
		};
		const p = fail(buildDataset(makeDataset(), { [SRC]: bad }, ctx));
		expect(p[0]).toMatchObject({ code: EXIT.schema, file: SRC, where: "$.items[1].v" });
		expect(p.map(formatProblem).join("\n")).not.toContain("LEAKY");
	});
	it("a projection that breaks its own schema is exit 1 on the output file", () => {
		const d = makeDataset({
			project: () => JSON.parse('{"schema":"tiny/1","items":[{"id":"a","v":"no"}]}'),
		});
		const p = fail(buildDataset(d, sources, ctx));
		expect(p[0]).toMatchObject({ code: EXIT.schema, file: "tiny.json", where: "$.items[0].v" });
	});
	it("a gzip size over the cap is exit 1", () => {
		const p = fail(buildDataset(makeDataset({ maxGzip: 10 }), sources, ctx));
		expect(p[0]).toMatchObject({ code: EXIT.schema, file: "tiny.json" });
		expect(p.map(formatProblem)[0]).toMatch(/cap/);
	});
	it("a privacy hit is exit 2 with rule id and path, not the text", () => {
		const d = makeDataset({
			project: () => ({ schema: "tiny/1", items: [{ id: "100.64.0.1", v: 1 }] }),
		});
		const p = fail(buildDataset(d, sources, ctx));
		expect(p[0]).toMatchObject({
			code: EXIT.privacy,
			rule: "cgnat",
			file: "tiny.json",
			where: "$.items[0].id",
		});
		expect(p.map(formatProblem).join("\n")).not.toContain("100.64.0.1");
	});
	it("scans with the shipped set (transfer wording) and the denylist (also in keys)", () => {
		const transfer = makeDataset({
			project: () => ({ schema: "tiny/1", items: [{ id: "uses a GitHub release", v: 1 }] }),
		});
		expect(fail(buildDataset(transfer, sources, ctx))[0]).toMatchObject({
			code: EXIT.privacy,
			rule: "transfer",
		});
		const keyed = defineDataset({
			name: "keyed",
			schemaId: "keyed/1",
			sources: { "k.json": z.unknown() },
			projected: z.object({ schema: z.literal("keyed/1"), zorblax: z.number() }),
			project: () => ({ schema: "keyed/1", zorblax: 1 }),
			maxGzip: 100,
		});
		const p = fail(buildDataset(keyed, { "k.json": {} }, { ...ctx, denylist: ["zorblax"] }));
		expect(p[0]).toMatchObject({ code: EXIT.privacy, rule: "denylist", where: "$.<redacted>" });
		expect(p.map(formatProblem).join("\n")).not.toContain("zorblax");
	});
});

describe("checkDataset (--check)", () => {
	const d = makeDataset();
	const built = ok(buildDataset(d, sources, ctx));
	const sidecarText = serialise(built.sidecar);
	const run = (output: string | undefined, sidecar: string | undefined | null = sidecarText) =>
		checkDataset(d, { output, sidecar: sidecar ?? undefined, denylist: [] });

	it("accepts a freshly built output and sidecar", () => {
		expect(run(built.output)).toEqual([]);
	});
	it("a missing output or sidecar is exit 3", () => {
		expect(run(undefined)[0]).toMatchObject({ code: EXIT.mismatch, file: "tiny.json" });
		expect(run(built.output, "")[0]).toMatchObject({ code: EXIT.mismatch });
		expect(run(built.output, null)[0]).toMatchObject({ code: EXIT.mismatch });
	});
	it("a tampered output fails the sha256 (3); an unparsable one is exit 1", () => {
		const tampered = built.output.replace("1.5", "1.6");
		expect(run(tampered).map((x) => x.code)).toContain(EXIT.mismatch);
		expect(run("{not json")[0]).toMatchObject({ code: EXIT.schema, file: "tiny.json" });
	});
	it("a schema error carries the JSON path (1)", () => {
		const bad = serialise({ schema: "tiny/1", items: [{ id: "a", v: "x" }] });
		const p = run(bad);
		expect(p[0]).toMatchObject({ code: EXIT.schema, where: "$.items[0].v" });
	});
	it("a wrong schema id is a mismatch (3)", () => {
		const bad = serialise({ schema: "tiny/2", items: [] });
		expect(run(bad)[0]).toMatchObject({ code: EXIT.mismatch, where: "$.schema" });
	});
	it("an output that is not in canonical form is a mismatch (3)", () => {
		const pretty = `${JSON.stringify(JSON.parse(built.output), null, 2)}\n`;
		expect(run(pretty).map((x) => x.code)).toContain(EXIT.mismatch);
	});
	it("a sidecar whose numbers or schema disagree is a mismatch (3)", () => {
		const wrong = serialise({ ...built.sidecar, bytes: 1 });
		expect(run(built.output, wrong)[0]).toMatchObject({ code: EXIT.mismatch });
		const wrongSchema = serialise({ ...built.sidecar, schema: "other/1" });
		expect(run(built.output, wrongSchema)[0]).toMatchObject({ code: EXIT.mismatch });
	});
	it("a sidecar gzip size from another zlib build is not a mismatch", () => {
		const other = serialise({ ...built.sidecar, gzipBytes: built.sidecar.gzipBytes + 45 });
		expect(run(built.output, other)).toEqual([]);
	});
	it("an output over its cap is a mismatch (3)", () => {
		const tight = makeDataset({ maxGzip: 10 });
		const p = checkDataset(tight, { output: built.output, sidecar: sidecarText, denylist: [] });
		expect(p[0]).toMatchObject({ code: EXIT.mismatch, file: "tiny.json" });
	});
	it("a privacy hit in a committed output is exit 2", () => {
		const dirty = serialise({ schema: "tiny/1", items: [{ id: "100.64.0.1", v: 1 }] });
		const sc = serialise({
			...built.sidecar,
			sha256: sha256Hex(dirty),
			bytes: Buffer.byteLength(dirty),
			gzipBytes: gzipBytes(dirty),
		});
		const p = run(dirty, sc);
		expect(p[0]).toMatchObject({ code: EXIT.privacy, rule: "cgnat" });
	});
});

describe("exit codes", () => {
	it("0 for no problems, otherwise the first problem's code", () => {
		expect(EXIT).toEqual({ ok: 0, schema: 1, privacy: 2, mismatch: 3, missing: 4 });
		expect(exitCodeOf([])).toBe(0);
		expect(
			exitCodeOf([
				{ code: 3, file: "a", message: "m" },
				{ code: 1, file: "b", message: "m" },
			]),
		).toBe(3);
	});
	it("formatProblem names file, path and rule", () => {
		expect(
			formatProblem({
				code: 2,
				file: "a.json",
				where: "$.x[0]",
				rule: "cgnat",
				message: "privacy",
			}),
		).toBe("a.json at $.x[0] (cgnat): privacy");
		expect(formatProblem({ code: 4, file: "a.json", message: "source file missing" })).toBe(
			"a.json: source file missing",
		);
	});
});
