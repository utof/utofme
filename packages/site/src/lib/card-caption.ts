/**
 * Pure helpers that derive a card's caption text and loop slug from frontmatter.
 *
 * Why: the schema-v2 fields (`lede`, `started`, `cover.loop`) land from another
 * branch; reading them structurally keeps Card/index compiling before and after
 * that merge, and keeps the logic unit-testable without Astro.
 *
 * @see packages/specs/specs/09-project-view.md § P9-7 (Structure)
 */

/** Minimal frontmatter shape the caption needs. */
export interface CaptionInput {
	title: string;
	date: Date;
	summary?: string | undefined;
	/** Schema v2 one-liner (≤ 120 chars); preferred over `summary`. */
	lede?: string | undefined;
	/** Schema v2 start date; shows a `started–date` year range. */
	started?: Date | undefined;
	stack?: readonly string[] | undefined;
}

/**
 * Derived caption text. `description` is absent when neither `lede` nor `summary` exists.
 *
 * Why: lets the card omit an empty description element.
 *
 * @see packages/specs/specs/09-project-view.md § P9-7
 */
export interface CaptionParts {
	title: string;
	description: string | undefined;
	meta: string;
}

function field(obj: object | undefined, key: string): unknown {
	if (!obj) return undefined;
	const entries: [string, unknown][] = Object.entries(obj);
	return new Map(entries).get(key);
}

/**
 * Optional string field read structurally (non-empty strings only).
 *
 * Why: see module doc; also reused for `fixture`-style flags via `optionalFlag`.
 */
function optionalString(obj: object | undefined, key: string): string | undefined {
	const v = field(obj, key);
	return typeof v === "string" && v !== "" ? v : undefined;
}

/**
 * Optional boolean-true flag read structurally.
 *
 * Why: schema-v2 `fixture` may not exist on the type yet (see module doc).
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export function optionalFlag(obj: object | undefined, key: string): boolean {
	return field(obj, key) === true;
}

/**
 * The loop slug of a cover, if any.
 *
 * Why: `cover.loop` selects `LoopMedia` over the still on cards.
 *
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export function coverLoop(cover: object | undefined): string | undefined {
	return optionalString(cover, "loop");
}

/**
 * Title, one-line description (`lede ?? summary`) and meta (`year · up to 3 stack items`).
 *
 * Why: P9-7 caption content; the description element is omitted when empty (review finding 18).
 *
 * @see packages/specs/specs/09-project-view.md § P9-7
 */
export function captionParts(data: CaptionInput): CaptionParts {
	const description = optionalString(data, "lede") ?? optionalString(data, "summary");
	const endYear = data.date.getUTCFullYear();
	const started = field(data, "started");
	const startYear = started instanceof Date ? started.getUTCFullYear() : endYear;
	const years = startYear === endYear ? `${endYear}` : `${startYear}–${endYear}`;
	const stack = (data.stack ?? []).slice(0, 3);
	return { title: data.title, description, meta: [years, ...stack].join(" · ") };
}
