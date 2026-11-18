/**
 * Topic registry for the home page: the ordered list of project topics.
 *
 * Why: the order of this list is the order of the topic sections on `/`, and its
 * ids are the only values a work's `topic` frontmatter field accepts. Adding a
 * topic is one line here.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */

/**
 * One topic: `id` is what frontmatter names, `label` is what the page prints.
 *
 * Why: a registry entry instead of a free-text field keeps section names consistent.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface Topic {
	readonly id: string;
	readonly label: string;
}

/**
 * Topics in display order. Add a topic by adding one line.
 *
 * Why: `as const` keeps the ids as literals so the works schema can validate against them.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export const TOPICS = [
	{ id: "physics", label: "Physics" },
	{ id: "rl", label: "Reinforcement learning" },
	{ id: "audio", label: "Audio" },
	{ id: "electronics", label: "Electronics" },
	{ id: "notes", label: "Notes" },
] as const satisfies readonly Topic[];

/**
 * Ids accepted by the `topic` frontmatter field.
 *
 * Why: derived from {@link TOPICS} so the schema never drifts from the registry.
 *
 * @see packages/site/src/content.config.ts
 */
export const TOPIC_IDS = TOPICS.map((t) => t.id);

/**
 * Group for works without a `topic`; always listed last.
 *
 * Why: a missing topic must not hide a project or fail the build.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export const OTHER_TOPIC = { id: "other", label: "Other" } as const satisfies Topic;
