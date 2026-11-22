/**
 * Card → banner "hero" view-transition marks (spec P9-9, decision D10).
 *
 * Why: exactly ONE pair of elements may carry `view-transition-name: hero` per
 * navigation (a duplicate name makes the whole transition fail). The names are
 * therefore set imperatively at navigation time, from the clicked card, instead
 * of statically per card via `transition:name`. This module keeps the naming
 * logic pure (document in, marks out) so it is unit-testable; `installHeroMorph`
 * wires it to Astro's ClientRouter. Preparation loads the incoming poster
 * before the browser captures either frame.
 *
 * Marks are plain attributes; `transitions.css` maps them to names:
 * `[data-vt-hero]` → `hero`, `[data-vt-cap]` → `hero-cap`.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 * @see https://docs.astro.build/en/guides/view-transitions/#router-control
 */
import { isMotionPaused } from "../motion";

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

/** Custom property on `<html>` carrying the banner's vertical focus for the snapshots' crop. */
const FOCUS_PROP = "--vt-focus";
const POSTER_WAIT_MS = 300;

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

/** True for the grid page that contains cards (`/`; `/works/` only redirects there). */
function isGridPath(pathname: string): boolean {
	return pathname === "/";
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
 * child, so the snapshot carries the clip exactly as seen.
 */
function frameForSlug(root: ParentNode, slug: string): Element | null {
	const host = root.querySelector(bySlug(slug));
	if (!host) return null;
	return host.matches("[data-vt-frame]") ? host : host.querySelector("[data-vt-frame]");
}

function markSlug(root: ParentNode, slug: string, withCap: boolean): boolean {
	const frame = frameForSlug(root, slug);
	if (!frame) return false;
	frame.setAttribute(HERO_ATTR, "");
	if (withCap) frame.closest(bySlug(slug))?.querySelector("[data-cap]")?.setAttribute(CAP_ATTR, "");
	return true;
}

function sourceSlug(nav: NavLike): string | null {
	if (nav.direction === "back") {
		return isGridPath(nav.to.pathname) ? slugFromWorkPath(nav.from.pathname) : null;
	}
	const card = nav.sourceElement?.closest("[data-work-slug]");
	const slug = card?.getAttribute("data-work-slug") ?? null;
	return slugFromWorkPath(nav.to.pathname) === slug ? slug : null;
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
 * Marks the outgoing document after the incoming poster is ready.
 *
 * - Forward from a card to `/works/<same slug>/`: marks that card's frame + caption.
 * - Back from `/works/<slug>/` to a grid: marks the visible banner frame.
 * Always clears stale marks first. Returns the slug marked, or `null`.
 *
 * Why: never touches transforms (whatever the card shows must stay in the snapshot).
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
export function markOld(doc: Document, nav: NavLike): string | null {
	clearMarks(doc);
	const slug = sourceSlug(nav);
	return slug && markSlug(doc, slug, nav.direction !== "back") ? slug : null;
}

/**
 * Marks the incoming document for the same navigation.
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
 * Reads the banner's vertical focus (`--focus`, e.g. `8%`) from a document, else `null`.
 *
 * Why: the morph snapshots crop at `object-position: 50% var(--vt-focus)`; without it
 * the crop jumps from 50 % to the banner's own focus at the ends of the morph.
 *
 * @see packages/specs/reports/ui3-fix-morph.md (M3-03)
 */
export function bannerFocus(doc: ParentNode): string | null {
	const el = doc.querySelector<HTMLElement>(".banner");
	const v = el?.style.getPropertyValue("--focus").trim();
	return v ? v : null;
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
	signal: AbortSignal;
	loader: () => Promise<void>;
}
interface SwapEvent extends Event, NavLike {
	signal: AbortSignal;
	viewTransition: { finished: Promise<unknown> };
}

function isPrep(e: Event): e is PrepEvent {
	return "loader" in e && typeof e.loader === "function";
}
function isSwap(e: Event): e is SwapEvent {
	return "viewTransition" in e && "signal" in e;
}

/** Decode the candidate this viewport picks from the incoming picture. */
async function preparePoster(doc: Document, frame: Element, signal: AbortSignal): Promise<boolean> {
	const poster = frame.querySelector("img");
	if (!poster) return true;

	// Astro's parsed document is inert. Import the whole picture so the live
	// browser can select the right format and resolution before the swap.
	const media = doc.importNode(poster.closest("picture") ?? poster, true);
	const image = media instanceof HTMLImageElement ? media : media.querySelector("img");
	if (!image) return false;
	image.loading = "eager";

	// Keep navigation responsive even when image delivery stalls or fails.
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(POSTER_WAIT_MS)]);
	if (deadline.aborted) return false;
	return new Promise((resolve) => {
		const done = (ready: boolean) => {
			deadline.removeEventListener("abort", stop);
			resolve(ready);
		};
		const stop = () => done(false);
		deadline.addEventListener("abort", stop, { once: true });
		image.decode().then(() => done(true), stop);
	});
}

function isVisible(frame: Element): boolean {
	const { top, bottom, left, right, width, height } = frame.getBoundingClientRect();
	return (
		width > 0 && height > 0 && bottom > 0 && top < innerHeight && right > 0 && left < innerWidth
	);
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
	let activeMorph: AbortSignal | undefined;
	let swapped: NavLike | undefined;
	const root = doc.documentElement;

	const clearAll = () => {
		clearMarks(doc);
		root.removeAttribute(MORPH_ATTR);
		root.style.removeProperty(FOCUS_PROP);
		activeMorph = undefined;
	};

	doc.addEventListener("astro:before-preparation", (e) => {
		if (!isPrep(e)) return;
		const slug = sourceSlug(e);
		if (
			!slug ||
			!doc.startViewTransition ||
			isMotionPaused() ||
			matchMedia("(prefers-reduced-motion: reduce)").matches
		)
			return;

		const load = e.loader;
		e.loader = async () => {
			await load();
			if (e.defaultPrevented || e.signal.aborted) return;

			const oldFrame = frameForSlug(doc, slug);
			const newFrame = frameForSlug(e.newDocument, slug);
			if (!oldFrame || !newFrame || !isVisible(oldFrame)) return;
			if (!(await preparePoster(doc, newFrame, e.signal)) || e.signal.aborted) return;
			if (!isVisible(oldFrame)) return;
			if (
				oldFrame.querySelector("img")?.naturalWidth === 0 &&
				!oldFrame.querySelector("video[data-ready]")
			)
				return;

			clearAll();
			const oldSlug = markOld(doc, e);
			if (!markNew(e.newDocument, e, oldSlug)) {
				clearAll();
				return;
			}
			activeMorph = e.signal;
			const focus = bannerFocus(e.direction === "back" ? doc : e.newDocument);
			for (const html of [root, e.newDocument.documentElement]) {
				html.setAttribute(MORPH_ATTR, "");
				if (focus) html.style.setProperty(FOCUS_PROP, focus);
			}
			const outgoingBody = doc.body;
			e.signal.addEventListener(
				"abort",
				() => {
					if (activeMorph === e.signal && doc.body === outgoingBody) clearAll();
				},
				{ once: true },
			);
		};
	});

	doc.addEventListener("astro:before-swap", (e) => {
		if (!isSwap(e)) return;
		swapped = e;
		if (activeMorph !== e.signal) return;
		// A newer morph can already own the marks when this animation settles.
		const done = () => {
			if (activeMorph === e.signal) clearAll();
		};
		e.viewTransition.finished.then(done, done);
	});

	doc.addEventListener("astro:after-swap", () => {
		if (swapped) focusTarget(doc, swapped)?.focus({ preventScroll: true });
		swapped = undefined;
	});
}

if (typeof document !== "undefined") installHeroMorph();
