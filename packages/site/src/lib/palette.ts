/**
 * Command-palette entry list builder (pure; no Astro imports).
 *
 * Why: the palette must reach every project, note and lab page, but the data
 * comes from content collections at build time. Keeping the shaping logic here
 * makes it unit-testable, and keeps fixture works out of the deploy when the
 * caller passes the already-filtered `getWorksCollection()` result.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 * @see desktop breaker review, branch review/ui-breaker-desktop (B-04)
 */

/** A titled palette destination. */
export interface PaletteLink {
	/** Stable unique id (`work:<slug>`, `note:<slug>`, `lab:<slug>`). */
	id: string;
	/** Visible label and match target. */
	label: string;
	/** Same-origin URL. */
	target: string;
}

/** Minimal collection-entry shape the builder reads. */
interface TitledEntry {
	id: string;
	data: { title: string; fixture?: boolean };
}

/** Lab pages (static; each is a hand-written route under `src/pages/lab/`). */
const LAB_PAGES: readonly PaletteLink[] = [
	{ id: "lab:datamosh", label: "Lab: datamosh", target: "/lab/datamosh/" },
];

/**
 * Builds the work / note / lab destinations for the palette.
 *
 * Why: titles + URLs only keeps the serialized island prop tiny. Entries with
 * `data.fixture === true` are dropped here as a second line of defence, in
 * case a caller forgets to use `getWorksCollection()`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export function buildPaletteLinks(
	works: readonly TitledEntry[],
	notes: readonly TitledEntry[],
): PaletteLink[] {
	return [
		...works
			.filter((w) => w.data.fixture !== true)
			.map((w) => ({ id: `work:${w.id}`, label: w.data.title, target: `/works/${w.id}/` })),
		...notes.map((n) => ({
			id: `note:${n.id}`,
			label: `Garden: ${n.data.title}`,
			target: `/garden/${n.id}/`,
		})),
		...LAB_PAGES,
	];
}

/**
 * Case-insensitive substring match, then initials match.
 *
 * Why: same rule the palette always used for its fixed commands, extracted so
 * it is testable ("linsae" → the Linsae work; "gth" → "Go to home").
 *
 * @see packages/specs/plans/02-interactivity.md § Task 9
 */
export function matchesLabel(label: string, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const l = label.toLowerCase();
	if (l.includes(q)) return true;
	const initials = l
		.split(/\s+/)
		.map((w) => w[0] ?? "")
		.join("");
	return initials.includes(q);
}
