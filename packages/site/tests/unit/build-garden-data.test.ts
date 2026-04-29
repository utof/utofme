/**
 * Why: build-garden-data is the single producer of three artefacts the rest
 * of the garden consumes. Two fast-check properties pin the inverter's
 * mutual inversion (P1 + P2). A third deterministic-write test asserts
 * byte-identical re-runs (load-bearing for CI freshness check).
 * @see packages/specs/specs/05-garden.md § Backlinks at build time + § Deterministic-write contract
 */

import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { buildArtefacts, type Note } from "../../scripts/build-garden-data";

const arbNote: fc.Arbitrary<Note> = fc.record({
	slug: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
	title: fc.string({ minLength: 1, maxLength: 30 }),
	tags: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 }),
	outgoing: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/), { maxLength: 6 }),
	summary: fc.string({ maxLength: 100 }),
	firstParagraph: fc.string({ maxLength: 200 }),
});

fcTest.prop([fc.uniqueArray(arbNote, { selector: (n) => n.slug, maxLength: 20 })])(
	"P1: ∀ (A,B) ∈ forwardEdges, A ∈ backlinks(B)",
	(notes) => {
		const { backlinks } = buildArtefacts(notes);
		for (const a of notes) {
			for (const target of a.outgoing) {
				if (notes.some((n) => n.slug === target)) {
					expect(backlinks[target] ?? []).toEqual(
						expect.arrayContaining([expect.objectContaining({ slug: a.slug })]),
					);
				}
			}
		}
	},
);

fcTest.prop([fc.uniqueArray(arbNote, { selector: (n) => n.slug, maxLength: 20 })])(
	"P2: ∀ X ∈ backlinks(B), (X,B) ∈ forwardEdges",
	(notes) => {
		const { backlinks } = buildArtefacts(notes);
		for (const [target, sources] of Object.entries(backlinks)) {
			for (const src of sources) {
				const a = notes.find((n) => n.slug === src.slug);
				expect(a).toBeDefined();
				if (a !== undefined) {
					expect(a.outgoing).toContain(target);
				}
			}
		}
	},
);

describe("buildArtefacts deterministic writes", () => {
	it("emits byte-identical strings on two consecutive runs given identical inputs", () => {
		const notes: Note[] = [
			{ slug: "a", title: "A", tags: ["x"], outgoing: ["b"], summary: "", firstParagraph: "" },
			{ slug: "b", title: "B", tags: [], outgoing: ["a"], summary: "", firstParagraph: "" },
		];
		const a = buildArtefacts(notes);
		const b = buildArtefacts(notes);
		expect(a.backlinksJson).toBe(b.backlinksJson);
		expect(a.previewsJson).toBe(b.previewsJson);
		expect(a.graphJson).toBe(b.graphJson);
	});

	it("emits objects with sorted keys + trailing newline", () => {
		const notes: Note[] = [
			{ slug: "z", title: "Z", tags: [], outgoing: [], summary: "", firstParagraph: "" },
			{ slug: "a", title: "A", tags: [], outgoing: [], summary: "", firstParagraph: "" },
		];
		const { backlinksJson, graphJson } = buildArtefacts(notes);
		expect(backlinksJson.endsWith("\n")).toBe(true);
		expect(graphJson.endsWith("\n")).toBe(true);
		const parsedGraph = JSON.parse(graphJson) as {
			nodes: Array<{ id: string; label: string; tags: string[] }>;
			edges: Array<{ source: string; target: string }>;
		};
		expect(parsedGraph.nodes[0]?.id).toBe("a"); // sorted by id ascending
	});
});

describe("identical-title backlink ordering is deterministic", () => {
	// Why: COLLATOR returns 0 for identical titles, so insertion order (which
	// tracks readdir, NOT specified by POSIX) leaks into output. Tiebreaker on
	// slug guarantees stable order across filesystems / CI runners.
	it("orders sources with the same title by slug", () => {
		const notes: Note[] = [
			{
				slug: "note-b",
				title: "Same Title",
				tags: [],
				outgoing: ["target"],
				summary: "",
				firstParagraph: "",
			},
			{
				slug: "note-a",
				title: "Same Title",
				tags: [],
				outgoing: ["target"],
				summary: "",
				firstParagraph: "",
			},
			{
				slug: "target",
				title: "Target",
				tags: [],
				outgoing: [],
				summary: "",
				firstParagraph: "",
			},
		];
		const { backlinks } = buildArtefacts(notes);
		const sources = backlinks["target"] ?? [];
		expect(sources.map((s) => s.slug)).toEqual(["note-a", "note-b"]);
	});
});

describe("readNotes embed exclusion", () => {
	// Why: WIKILINK_RE prefix `(?<!!)` must reject `![[asset.png]]` embeds so
	// they don't surface as phantom backlinks if an image basename ever
	// collides with a note slug.
	it("does not capture ![[image]] embeds as wikilink targets", async () => {
		const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const { readNotes } = await import("../../scripts/build-garden-data");
		const dir = await mkdtemp(join(tmpdir(), "garden-embed-"));
		try {
			await writeFile(
				join(dir, "src.md"),
				"---\ntitle: Src\n---\n\n![[asset.png]] and [[Real]]\n",
				"utf8",
			);
			const notes = await readNotes(dir);
			expect(notes[0]?.outgoing).toEqual(["real"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("readNotes wikilink-extraction slug parity", () => {
	// Why: the script's wikilink extractor and the rendering remark plugin must
	// resolve [[Title]] to the SAME slug — otherwise a backlink edge points to
	// a slug that doesn't match any rendered href, and the backlinks footer
	// silently disappears. This is the single source of truth assertion.
	// @see packages/specs/specs/05-garden.md § Slug strategy
	it.each([
		["Welcome", "welcome"],
		["Hello, World!", "hello-world"],
		["Café au lait", "café-au-lait"],
		["Title#section", "title"], // anchor-stripped before slug
	])("readNotes uses noteSlug for '%s' → '%s'", async (raw, expected) => {
		const { extractWikilinkSlug } = await import("../../scripts/build-garden-data");
		expect(extractWikilinkSlug(raw)).toBe(expected);
	});
});
