/**
 * Typed view of the schema-v2 project fields on a work entry.
 *
 * Why: TEMPORARY mirror of worker W1's `content.config.ts` v2 fields (lede,
 * status, started, links, gallery, cover.loop/focus) so this branch typechecks
 * before W1 is merged. After the merge the intersection collapses to the real
 * type and this file can be deleted.
 *
 * @issue utof/utofme#0 (replace with W1 schema types at merge)
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
import type { ImageMetadata } from "astro";

/** One project link; `private` renders a "private for now" label.
 *
 * Why: temporary mirror of the W1 schema shape.
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export interface ProjectLink {
	label: string;
	href: string;
	private: boolean;
}

/** One gallery item (still, or a loop with `loop` set).
 *
 * Why: temporary mirror of the W1 schema shape.
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export interface GalleryItem {
	src: ImageMetadata;
	alt: string;
	caption: string;
	loop?: string | undefined;
	focus: number;
}

/** The v2 fields, all optional/defaulted as in W1's schema.
 *
 * Why: temporary mirror of the W1 schema shape.
 * @see packages/specs/specs/09-project-view.md § P9-3
 */
export interface ProjectFields {
	lede?: string | undefined;
	status?: "shipped" | "prototype" | "research" | "archived" | undefined;
	started?: Date | undefined;
	links?: ProjectLink[] | undefined;
	gallery?: GalleryItem[] | undefined;
	fixture?: boolean | undefined;
	stack?: string[] | undefined;
	cover?:
		| { src: ImageMetadata; alt: string; loop?: string | undefined; focus?: number | undefined }
		| undefined;
}

/**
 * Returns `data` viewed through {@link ProjectFields}.
 *
 * Why: a typed widening in one place instead of casts at every use site.
 */
export function projectFields<T extends object>(data: T): T & ProjectFields {
	return data;
}
