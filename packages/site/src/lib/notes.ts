/**
 * Note collection helpers.
 * Why: thin wrappers over astro:content keep page code declarative. The
 * sort uses a locale-locked Intl.Collator so the ordering is stable across
 * build environments (CF Pages vs local).
 * @see packages/specs/specs/05-garden.md § Slug strategy + § Open questions
 */
import { type CollectionEntry, getCollection } from "astro:content";

const COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

/**
 * Convenience alias for the `notes` collection entry type.
 * Why: avoids re-typing `CollectionEntry<"notes">` in every caller.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export type Note = CollectionEntry<"notes">;

/**
 * Returns every note sorted by title (asc, locale-locked) then updated/created desc.
 * Why: central single-call access point; sorting delegated to {@link sortNotes}.
 * @public Task 9 (garden pages) consumes this; @public suppresses knip unused-export
 * at the Task 8 boundary before the pages exist.
 * @see packages/specs/specs/05-garden.md § Slug strategy
 */
export async function getAllNotes(): Promise<Note[]> {
	return sortNotes(await getCollection("notes"));
}

/**
 * Stable sort: title asc (locale-locked en, base sensitivity), then updated/created desc.
 * Why: locale-locking to "en" avoids per-machine collation drift between CF Pages
 * Linux build agents and developer macOS; base sensitivity folds diacritics.
 * @see packages/specs/specs/05-garden.md § Slug strategy + § Open questions
 */
export function sortNotes(notes: Note[]): Note[] {
	return [...notes].sort((a, b) => {
		const tCmp = COLLATOR.compare(a.data.title, b.data.title);
		if (tCmp !== 0) return tCmp;
		const ua = (a.data.updated ?? a.data.created).getTime();
		const ub = (b.data.updated ?? b.data.created).getTime();
		return ub - ua; // newer first
	});
}
