/**
 * Unit tests for the pure naming logic in `lib/vt/hero-morph.ts` (P9-9, AC9.1).
 *
 * Why: a duplicate `view-transition-name` aborts the whole transition, so the
 * "exactly one pair, never stale" invariants are tested on real DOM fragments.
 *
 * @see packages/specs/specs/09-project-view.md § P9-9
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CAP_ATTR,
	clearMarks,
	focusTarget,
	HERO_ATTR,
	markNew,
	markOld,
	slugFromWorkPath,
} from "../../src/lib/vt/hero-morph.ts";
import { detailUrl } from "../../src/lib/works.ts";

function grid(slugs: string[]): Document {
	const doc = document.implementation.createHTMLDocument("grid");
	doc.body.innerHTML = slugs
		.map(
			(s) =>
				`<a class="card" data-work-slug="${s}" href="/works/${s}/"><div class="card-figure"><div data-vt-frame></div><div data-cap></div></div></a>`,
		)
		.join("");
	return doc;
}
function project(slug: string): Document {
	const doc = document.implementation.createHTMLDocument("project");
	doc.body.innerHTML = `<div class="banner" data-vt-frame data-work-slug="${slug}"></div><h1 tabindex="-1">T</h1>`;
	return doc;
}
const nav = (
	from: string,
	to: string,
	direction: string,
	sourceElement?: Element,
): Parameters<typeof markOld>[1] => ({
	from: new URL(from, "https://x.test"),
	to: new URL(to, "https://x.test"),
	direction,
	sourceElement,
});
const heroes = (d: Document) => d.querySelectorAll(`[${HERO_ATTR}]`);
const caps = (d: Document) => d.querySelectorAll(`[${CAP_ATTR}]`);

describe("slugFromWorkPath", () => {
	it("round-trips detailUrl for any kebab slug", () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), (id) => {
				expect(slugFromWorkPath(detailUrl({ id }))).toBe(id);
			}),
		);
	});
	it("rejects non-detail paths", () => {
		expect(slugFromWorkPath("/works/")).toBeNull();
		expect(slugFromWorkPath("/")).toBeNull();
		expect(slugFromWorkPath("/works/a/b/")).toBeNull();
	});
});

describe("markOld / markNew forward", () => {
	it("marks only the clicked card's frame and caption, then the banner", () => {
		const g = grid(["a", "b", "c"]);
		const click = g.querySelector("[data-work-slug=b]")?.querySelector(".card-figure");
		const n = nav("/", "/works/b/", "forward", click ?? undefined);
		expect(markOld(g, n)).toBe("b");
		expect(heroes(g)).toHaveLength(1);
		expect(caps(g)).toHaveLength(1);
		expect(heroes(g)[0]?.closest("[data-work-slug]")?.getAttribute("data-work-slug")).toBe("b");
		const p = project("b");
		expect(markNew(p, n, "b")).toBe("b");
		expect(heroes(p)).toHaveLength(1);
		expect(caps(p)).toHaveLength(0);
	});
	it("a second navigation leaves exactly one marked frame (no stale marks)", () => {
		const g = grid(["a", "b"]);
		const a = g.querySelector("[data-work-slug=a]") ?? undefined;
		const b = g.querySelector("[data-work-slug=b]") ?? undefined;
		markOld(g, nav("/", "/works/a/", "forward", a));
		markOld(g, nav("/", "/works/b/", "forward", b));
		expect(heroes(g)).toHaveLength(1);
		expect(caps(g)).toHaveLength(1);
	});
	it("marks nothing when the click target does not match the destination", () => {
		const g = grid(["a", "b"]);
		const a = g.querySelector("[data-work-slug=a]") ?? undefined;
		expect(markOld(g, nav("/", "/works/b/", "forward", a))).toBeNull();
		expect(heroes(g)).toHaveLength(0);
		expect(markOld(g, nav("/", "/works/b/", "forward"))).toBeNull();
	});
	it("never marks the new document without an old pair", () => {
		const p = project("b");
		expect(markNew(p, nav("/", "/works/b/", "forward"), null)).toBeNull();
		expect(heroes(p)).toHaveLength(0);
	});
});

describe("back mirror", () => {
	it("marks the banner in the old doc and the matching card in the new doc", () => {
		const p = project("b");
		const n = nav("/works/b/", "/", "back");
		expect(markOld(p, n)).toBe("b");
		expect(heroes(p)).toHaveLength(1);
		const g = grid(["a", "b", "c"]);
		expect(markNew(g, n, "b")).toBe("b");
		expect(heroes(g)).toHaveLength(1);
		expect(caps(g)).toHaveLength(1);
		expect(focusTarget(g, n)?.getAttribute("data-work-slug")).toBe("b");
	});
	it("does not mark when going back to a non-grid page", () => {
		const p = project("b");
		expect(markOld(p, nav("/works/b/", "/now/", "back"))).toBeNull();
	});
});

describe("cleanup and focus", () => {
	it("clearMarks removes every mark", () => {
		const g = grid(["a", "b"]);
		markOld(
			g,
			nav("/", "/works/a/", "forward", g.querySelector("[data-work-slug=a]") ?? undefined),
		);
		clearMarks(g);
		expect(heroes(g)).toHaveLength(0);
		expect(caps(g)).toHaveLength(0);
	});
	it("forward focus goes to the h1 of a project page", () => {
		const p = project("a");
		expect(focusTarget(p, nav("/", "/works/a/", "forward"))?.tagName).toBe("H1");
		expect(focusTarget(p, nav("/", "/now/", "forward"))).toBeNull();
	});
});
