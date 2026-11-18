/**
 * Pure builder of the home page model.
 *
 * Why: a home layout receives only a {@link HomeModel}; it never reads the
 * collection, the curation file or the topic registry. That keeps layouts
 * swappable (ADR 0061) and this logic unit-testable: no Astro imports, no DOM.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
import type { Topic } from "../../data/topics";

/**
 * The part of a works entry the model reads.
 *
 * Why: structural, so tests use plain objects and the real `CollectionEntry`
 * passes through untouched as {@link HomeItem.entry}.
 *
 * @see packages/site/src/content.config.ts
 */
export interface HomeWork {
	readonly id: string;
	readonly data: {
		readonly title: string;
		readonly date: Date;
		readonly lede?: string | undefined;
		readonly summary?: string | undefined;
		readonly stack?: readonly string[] | undefined;
		readonly topic?: string | undefined;
		readonly icon?: string | undefined;
	};
}

/**
 * Editorial choices of the home page (see `src/data/home.ts`).
 *
 * Why: typed here, next to the builder that validates it.
 *
 * @see packages/site/src/data/home.ts
 */
export interface HomeCuration {
	/** Key of the layout in `src/components/home/registry.ts`. */
	readonly layout: string;
	/** Slug of the one hero project, or `null` for none. */
	readonly hero: string | null;
	/** Slugs of the highlighted projects, in display order. */
	readonly highlighted: readonly string[];
	/** Name of the hero + highlighted block in headings and jump links. */
	readonly featuredLabel: string;
}

/**
 * One project as a layout sees it.
 *
 * Why: derived texts are computed once here so every layout prints the same
 * date and one-liner; `entry` carries the original for media and links.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface HomeItem<E extends HomeWork = HomeWork> {
	readonly slug: string;
	readonly title: string;
	/** One-liner: `lede`, else `summary`, else `undefined`. */
	readonly lede: string | undefined;
	/** `Nov 2026` (UTC). */
	readonly dateLabel: string;
	/** `2026-11` (UTC), for `<time datetime>`. */
	readonly dateIso: string;
	readonly stack: readonly string[];
	readonly topic: Topic;
	/** Key of a named 3D object, or `undefined` for the seeded generic one. */
	readonly icon: string | undefined;
	/** Stable positive integer derived from the slug (object spin offset, generic shape). */
	readonly seed: number;
	readonly entry: E;
}

/**
 * One topic section: a topic and its projects, in input order.
 *
 * Why: `count` is stated so layouts and tests do not recount.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface HomeGroup<E extends HomeWork = HomeWork> {
	readonly topic: Topic;
	readonly items: readonly HomeItem<E>[];
	readonly count: number;
}

/**
 * Everything a home layout may render.
 *
 * Why: the single prop of every layout in `src/components/home/`.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export interface HomeModel<E extends HomeWork = HomeWork> {
	readonly featuredLabel: string;
	readonly hero: HomeItem<E> | undefined;
	readonly highlighted: readonly HomeItem<E>[];
	/** Non-empty topics in registry order; the fallback topic last. */
	readonly groups: readonly HomeGroup<E>[];
	readonly counts: {
		/** Hero (0 or 1) plus highlighted. */
		readonly featured: number;
		/** Every project; equals the sum of the group counts. */
		readonly total: number;
	};
}

/** File named in curation errors, so the message says where to fix the slug. */
const CURATION_FILE = "packages/site/src/data/home.ts";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/**
 * Stable positive integer for a slug (FNV-1a, 32 bit).
 *
 * Why: the generic 3D object and each object's spin offset must not change
 * between builds or with the order of projects.
 *
 * @see http://www.isthe.com/chongo/tech/comp/fnv/
 */
export function slugSeed(slug: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < slug.length; i++) {
		h ^= slug.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0) % 100000;
}

/**
 * `Nov 2026` for a date, in UTC.
 *
 * Why: fixed English month names instead of `Intl`, so the build machine's
 * locale and time zone cannot change the page.
 *
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function monthLabel(date: Date): string {
	return `${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

function toItem<E extends HomeWork>(
	entry: E,
	byId: ReadonlyMap<string, Topic>,
	other: Topic,
): HomeItem<E> {
	const d = entry.data;
	const month = String(d.date.getUTCMonth() + 1).padStart(2, "0");
	return {
		slug: entry.id,
		title: d.title,
		lede: d.lede || d.summary || undefined,
		dateLabel: monthLabel(d.date),
		dateIso: `${d.date.getUTCFullYear()}-${month}`,
		stack: d.stack ?? [],
		topic: (d.topic === undefined ? undefined : byId.get(d.topic)) ?? other,
		icon: d.icon,
		seed: slugSeed(entry.id),
		entry,
	};
}

/**
 * Builds the home model from the (already draft- and fixture-filtered, already
 * ordered) works, the curation and the topic registry.
 *
 * - `hero` / `highlighted` follow the curation; a hero repeated in `highlighted`
 *   and repeated highlighted slugs are dropped, so no project is featured twice.
 * - Every work appears in exactly one group: its topic's, or `other`'s when its
 *   `topic` is missing or not in the registry. Empty topics are omitted.
 * - Items keep the input order inside a group.
 *
 * Why: throws on a curated slug that is not among `works`, so a typo in
 * `src/data/home.ts` fails the build instead of silently dropping the hero.
 *
 * @throws Error naming the bad slug, the field and the curation file.
 * @see packages/specs/adrs/0061-catalogue-home-curated-model.md
 */
export function buildHomeModel<E extends HomeWork>(
	works: readonly E[],
	curation: HomeCuration,
	topics: { readonly list: readonly Topic[]; readonly other: Topic },
): HomeModel<E> {
	const byId = new Map(topics.list.map((t) => [t.id, t]));
	const items = works.map((w) => toItem(w, byId, topics.other));
	const bySlug = new Map(items.map((i) => [i.slug, i]));

	const pick = (slug: string, field: string): HomeItem<E> => {
		const item = bySlug.get(slug);
		if (!item) {
			throw new Error(
				`Home curation: unknown project slug "${slug}" in \`${field}\` (${CURATION_FILE}). ` +
					`Known slugs: ${[...bySlug.keys()].sort().join(", ") || "(none)"}.`,
			);
		}
		return item;
	};

	const hero = curation.hero === null ? undefined : pick(curation.hero, "hero");
	const seen = new Set<string>(hero ? [hero.slug] : []);
	const highlighted: HomeItem<E>[] = [];
	for (const slug of curation.highlighted) {
		const item = pick(slug, "highlighted");
		if (seen.has(slug)) continue;
		seen.add(slug);
		highlighted.push(item);
	}

	const groups: HomeGroup<E>[] = [];
	for (const topic of [...topics.list, topics.other]) {
		const own = items.filter((i) => i.topic === topic);
		if (own.length > 0) groups.push({ topic, items: own, count: own.length });
	}

	return {
		featuredLabel: curation.featuredLabel,
		hero,
		highlighted,
		groups,
		counts: { featured: (hero ? 1 : 0) + highlighted.length, total: items.length },
	};
}
