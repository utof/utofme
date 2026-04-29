/**
 * Why: notes helpers are wrappers over astro:content. Tests use vitest
 * aliases that map "astro:content" → "astro/content/config" (per Phase 4
 * vitest.config). Helpers stay thin and pure.
 * @see packages/specs/specs/05-garden.md § _NoteLayout
 */
import { describe, expect, it } from "vitest";
import type { Note } from "../../src/lib/notes";
import { sortNotes } from "../../src/lib/notes";

/**
 * Minimal Note fixture. Fills every required field so the object is
 * structurally assignable to `Note` (CollectionEntry<"notes">) without
 * going through `as unknown` — which type-coverage counts as an uncovered node.
 * Why: 100% type-coverage gate (CLAUDE.md precommit step 4).
 * @see packages/specs/specs/05-garden.md § _NoteLayout
 */
function makeNote(id: string, title: string, created: Date, updated?: Date): Note {
	return {
		id,
		collection: "notes",
		data: {
			title,
			created,
			updated,
			tags: [],
			math: false,
		},
	} satisfies Note;
}

describe("sortNotes", () => {
	it("sorts by title locale-locked, secondary updated desc", () => {
		const a = makeNote("a", "Banana", new Date("2026-01-01"));
		const b = makeNote("b", "Apple", new Date("2026-01-02"));
		const c = makeNote("c", "Apple", new Date("2026-02-01"), new Date("2026-03-01"));
		const sorted = sortNotes([a, b, c]);
		expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
	});
});
