/**
 * Card → banner "hero" view-transition marks (spec P9-9, decision D10).
 *
 * Why: exactly ONE pair of elements may carry `view-transition-name: hero` per
 * navigation (a duplicate name makes the whole transition fail). The names are
 * therefore set imperatively at navigation time, from the clicked card, instead
 * of statically per card via `transition:name`. This module keeps the naming
 * logic pure (document in, marks out) so it is unit-testable; `installHeroMorph`
 * wires it to Astro's ClientRouter events (verified against astro@7.4.5
 * `dist/transitions/router.js`: `astro:before-preparation` → loader →
 * `astro:after-preparation` → `startViewTransition(cb)` where `cb` dispatches
 * `astro:before-swap` → swap → `astro:after-swap`).
 *
 * Marks are plain attributes; `transitions.css` maps them to names:
 * `[data-vt-hero]` → `hero`, `[data-vt-cap]` → `hero-cap`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 * @see https://docs.astro.build/en/guides/view-transitions/#router-control
 */

/**
 * Attribute naming the media clipping frame (`hero`).
 *
 * Why: attribute, not `transition:name`, so only the clicked card is ever named.
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
export const HERO_ATTR = "data-vt-hero";
/**
 * Attribute naming the clicked card's caption bar (`hero-cap`).
 *
 * Why: the caption gets its own group so it never stretches with the media.
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
export const CAP_ATTR = "data-vt-cap";
/** Set on `<html>` while a morph is in flight; hides the hover-overlay canvases. */
const MORPH_ATTR = "data-vt-morph";

const WORK_PATH = /^\/works\/([^/]+)\/?$/;

/**
 * Extracts the work slug from a detail path (`/works/<slug>/`), else `null`.
 *
 * Why: the only link between a card in one document and a banner in another is
 * the slug in the URL; `/works/` (the index) must not match.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
export function slugFromWorkPath(pathname: string): string | null {
	const m = WORK_PATH.exec(pathname);
	if (!m?.[1]) return null;
	try {
		return decodeURIComponent(m[1]);
	} catch {
		return null;
	}
}

/** True for the two grid pages that contain cards (`/` and `/works/`). */
function isGridPath(pathname: string): boolean {
	return pathname === "/" || pathname === "/works" || pathname === "/works/";
}

/** `[data-work-slug]` selector value-safe for any slug. */
function bySlug(slug: string): string {
	return `[data-work-slug="${CSS.escape(slug)}"]`;
}

/**
 * Removes every hero/caption mark in `root`.
 *
 * Why: stale marks from an aborted or finished navigation would otherwise yield
 * a second `hero` on the next one. Always run first.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9 (event table, step 1)
 */
export function clearMarks(root: ParentNode): void {
	for (const el of root.querySelectorAll(`[${HERO_ATTR}], [${CAP_ATTR}]`)) {
		el.removeAttribute(HERO_ATTR);
		el.removeAttribute(CAP_ATTR);
	}
}

/**
 * Marks the media frame (and optional caption) inside the element with `slug`.
 * Returns whether a frame was marked.
 *
 * Why: `hero` goes on the clipping `[data-vt-frame]`, never on the scaled
 * child, so the snapshot carries the clip and hover zoom exactly as seen.
 */
function markSlug(root: ParentNode, slug: string, withCap: boolean): boolean {
	const host = root.querySelector(bySlug(slug));
	if (!host) return false;
	const frame = host.matches("[data-vt-frame]") ? host : host.querySelector("[data-vt-frame]");
	if (!frame) return false;
	frame.setAttribute(HERO_ATTR, "");
	if (withCap) host.querySelector("[data-cap]")?.setAttribute(CAP_ATTR, "");
	return true;
}

/**
 * Minimal shape of the router's navigation events used here.
 *
 * Why: structural, so the pure naming functions need no Astro event class.
 * @see https://github.com/withastro/astro/blob/astro%407.4.5/packages/astro/src/transitions/events.ts
 */
export interface NavLike {
	from: URL;
	to: URL;
	direction: string;
	sourceElement: Element | undefined;
}

/**
 * Marks the OLD document for a navigation (`astro:before-preparation`).
 *
 * - Forward from a card to `/works/<same slug>/`: marks that card's frame + caption.
 * - Back from `/works/<slug>/` to a grid: marks the visible banner frame.
 * Always clears stale marks first. Returns the slug marked, or `null`.
 *
 * Why: never touches transforms (the hover zoom must stay in the snapshot).
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
export function markOld(doc: Document, nav: NavLike): string | null {
	clearMarks(doc);
	if (nav.direction === "back") {
		const slug = slugFromWorkPath(nav.from.pathname);
		if (slug && isGridPath(nav.to.pathname) && markSlug(doc, slug, false)) return slug;
		return null;
	}
	const card = nav.sourceElement?.closest("[data-work-slug]");
	const slug = card?.getAttribute("data-work-slug");
	if (!slug || slugFromWorkPath(nav.to.pathname) !== slug) return null;
	return markSlug(doc, slug, true) ? slug : null;
}

/**
 * Marks the NEW document (`astro:before-swap`, on `event.newDocument`).
 *
 * - Forward to `/works/<slug>/`: marks the banner frame, only if the old
 *   document marked the same slug (`oldSlug`) so names always come in pairs.
 * - Back to a grid: marks the matching card's frame + caption.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
export function markNew(newDoc: Document, nav: NavLike, oldSlug: string | null): string | null {
	clearMarks(newDoc);
	if (!oldSlug) return null;
	if (nav.direction === "back") {
		return isGridPath(nav.to.pathname) && markSlug(newDoc, oldSlug, true) ? oldSlug : null;
	}
	return slugFromWorkPath(nav.to.pathname) === oldSlug && markSlug(newDoc, oldSlug, false)
		? oldSlug
		: null;
}

/**
 * Picks the element to focus after a swap.
 *
 * Why: forward → the `<h1 tabindex="-1">`; Back → the originating card link.
 */
export function focusTarget(doc: Document, nav: NavLike): HTMLElement | null {
	if (nav.direction === "back") {
		const slug = slugFromWorkPath(nav.from.pathname);
		if (!slug) return null;
		return doc.querySelector<HTMLElement>(`a${bySlug(slug)}`);
	}
	return slugFromWorkPath(nav.to.pathname) ? doc.querySelector<HTMLElement>("h1") : null;
}

interface PrepEvent extends Event, NavLike {
	newDocument: Document;
}
interface SwapEvent extends PrepEvent {
	viewTransition: { finished: Promise<unknown> };
}

function isPrep(e: Event): e is PrepEvent {
	return "to" in e && "from" in e && "direction" in e;
}
function isSwap(e: Event): e is SwapEvent {
	return isPrep(e) && "viewTransition" in e;
}

/**
 * Wires the marks to Astro's ClientRouter events. Idempotent per document.
 *
 * Why: see module doc. Overlay canvases (dither/mosh hover) live outside the
 * card and would freeze into the snapshot, so `MORPH_ATTR` on `<html>` hides
 * them (CSS in transitions.css) from preparation until `finished`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
function installHeroMorph(doc: Document = document): void {
	let oldSlug: string | null = null;
	let nav: NavLike | null = null;
	const root = doc.documentElement;

	const clearAll = () => {
		clearMarks(doc);
		root.removeAttribute(MORPH_ATTR);
	};

	doc.addEventListener("astro:before-preparation", (e) => {
		if (!isPrep(e)) return;
		nav = { from: e.from, to: e.to, direction: e.direction, sourceElement: e.sourceElement };
		oldSlug = markOld(doc, nav);
		if (oldSlug) root.setAttribute(MORPH_ATTR, "");
	});

	doc.addEventListener("astro:before-swap", (e) => {
		if (!isSwap(e)) return;
		nav = { from: e.from, to: e.to, direction: e.direction, sourceElement: e.sourceElement };
		markNew(e.newDocument, nav, oldSlug);
		// Why: the new body carries its marks into the live document; clear them (and
		// the old ones) once the animation ends. Rejection (skipped) also cleans up.
		e.viewTransition.finished.then(clearAll, clearAll);
	});

	doc.addEventListener("astro:after-swap", () => {
		if (!nav) return;
		const target = focusTarget(doc, nav);
		target?.focus({ preventScroll: true });
		// Why: without a view transition `finished` never fires from us; marks are
		// harmless then (no names are applied) but must not leak into the next nav.
		if (!oldSlug) clearAll();
		oldSlug = null;
	});
}

if (typeof document !== "undefined") installHeroMorph();
