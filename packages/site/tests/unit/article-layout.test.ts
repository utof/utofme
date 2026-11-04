// @vitest-environment node
/**
 * `_ArticleLayout`: block order, h1/dek/eyebrow wiring, the sections contents
 * list, the variant marker, no gallery, and the KaTeX stylesheet gate.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (AC1.3)
 */
import { loadRenderers } from "astro:container";
import type { CollectionEntry } from "astro:content";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it, vi } from "vitest";
import ArticleLayout from "../../src/layouts/_ArticleLayout.astro";

vi.mock("astro:content", async (importOriginal) => ({
	...(await importOriginal<typeof import("astro:content")>()),
	getCollection: async () => [],
}));
vi.mock("../../src/lib/works-collection", () => ({ getWorksCollection: async () => [] }));

const image = { src: "/img/cover.png", width: 1600, height: 900, format: "png" } as const;

const article = {
	headline: "Stronger, Not More Human",
	dek: "Teaching agents a game on a small board",
	math: false,
	sections: [
		{ id: "intro", title: "Intro" },
		{ id: "method", title: "Method" },
		{ id: "result", title: "Result" },
	],
};

function entry(math: boolean): CollectionEntry<"works"> {
	return {
		id: "sample-article",
		collection: "works",
		data: {
			type: "code",
			title: "Sample Project",
			date: new Date("2026-04-01T00:00:00.000Z"),
			updated: new Date("2026-05-02T00:00:00.000Z"),
			tags: [],
			draft: false,
			summary: "Summary",
			cover: { src: image, alt: "A loop cover", loop: "tactical-arena", focus: 10 },
			gallery: [],
			links: [],
			fixture: false,
			stack: ["ts"],
			repo: undefined,
			article: { ...article, math },
		},
	} satisfies CollectionEntry<"works">;
}

async function render(math = false): Promise<string> {
	const c = await AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
	return c.renderToString(ArticleLayout, {
		props: { entry: entry(math) },
		slots: { default: '<h2 id="intro">Intro</h2><p>Body.</p>' },
	});
}

describe("_ArticleLayout", () => {
	it("orders banner → header → u-url → sections nav → e-content", async () => {
		const html = await render();
		const at = (needle: string | RegExp): number => {
			const i = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
			expect(i, String(needle)).toBeGreaterThan(-1);
			return i;
		};
		const order = [
			at('class="banner"'),
			at(/<div class="nav-row"/),
			at("<h1"),
			at('class="lede p-summary"'),
			at('data-test="project-meta"'),
			at(/<a class="u-url"/),
			at('aria-label="Sections"'),
			at(/class="e-content article-body"/),
		];
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it("marks the variant and uses the headline, dek and eyebrow", async () => {
		const html = await render();
		expect(html).toMatch(/<article[^>]*class="h-entry"[^>]*data-variant="article"/);
		expect(html.match(/<h1\b/g)).toHaveLength(1);
		expect(html).toMatch(/<h1[^>]*class="p-name"[^>]*>\s*Stronger, Not More Human\s*<\/h1>/);
		expect(html).toMatch(/class="lede p-summary"[^>]*>\s*Teaching agents a game on a small board/);
		expect(html).toMatch(/<span[^>]*class="eyebrow"[^>]*>\s*Sample Project · research notes/);
		expect(html).toContain("Updated");
		expect(html).toContain("2026-05-02");
	});

	it("lists every section as an ordered link to its id", async () => {
		const html = await render();
		const nav = html.match(/<nav[^>]*aria-label="Sections"[\s\S]*?<\/nav>/)?.[0] ?? "";
		expect(nav).toContain("<ol");
		expect(nav.match(/<a /g)).toHaveLength(3);
		for (const s of article.sections) expect(nav).toContain(`href="#${s.id}"`);
	});

	it("has no gallery and exactly one hidden u-url", async () => {
		const html = await render();
		const article = html.slice(html.indexOf("<article"), html.indexOf("</article>"));
		expect(article).not.toContain('class="gallery');
		expect(article.match(/<a[^>]*class="u-url"/g)).toHaveLength(1);
		expect(article).toMatch(/<a[^>]*class="u-url"[^>]*hidden/);
	});

	it("links the KaTeX stylesheet iff article.math", async () => {
		// Why: under vitest the `?url` import resolves to an empty string, so the
		// stylesheet link carries no attributes; count links instead of matching the URL.
		const links = (html: string): number => (html.match(/<link\b/g) ?? []).length;
		expect(links(await render(true))).toBe(links(await render(false)) + 1);
	});
});
