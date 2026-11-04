// @vitest-environment node
/**
 * AC1.2 — `ProjectBanner` renders the same markup as the pre-extraction
 * `_WorkLayout` banner, for a loop cover and a still cover.
 *
 * Why: the card → banner morph (ADR 0046) and `banner-quality.spec.ts` depend on
 * the exact frame markup; the goldens in `tests/fixtures/banner-golden/` were
 * captured from the layout before the extraction (`data-astro-cid-*` stripped).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (AC1.2)
 */

import { loadRenderers } from "astro:container";
import type { CollectionEntry } from "astro:content";
import { readFileSync, writeFileSync } from "node:fs";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte/container-renderer";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it, vi } from "vitest";
import ProjectBanner from "../../src/components/ProjectBanner.astro";
import WorkLayout from "../../src/layouts/_WorkLayout.astro";

vi.mock("astro:content", async (importOriginal) => ({
	...(await importOriginal<typeof import("astro:content")>()),
	getCollection: async () => [],
}));
vi.mock("../../src/lib/works-collection", () => ({ getWorksCollection: async () => [] }));

const image = { src: "/img/cover.png", width: 1600, height: 900, format: "png" } as const;

function work(cover: CollectionEntry<"works">["data"]["cover"]): CollectionEntry<"works"> {
	return {
		id: "sample-work",
		collection: "works",
		data: {
			type: "code",
			title: "Sample work entry",
			date: new Date("2026-04-01T00:00:00.000Z"),
			updated: undefined,
			tags: [],
			draft: false,
			summary: undefined,
			cover,
			gallery: [],
			links: [],
			fixture: false,
			stack: [],
			repo: undefined,
		},
	} satisfies CollectionEntry<"works">;
}

const covers = {
	loop: { src: image, alt: "A loop cover", loop: "tactical-arena", focus: 10 },
	still: { src: image, alt: "A still cover", focus: 30 },
} as const;

/**
 * Strips scoped-style ids and the checkout's absolute path.
 *
 * Why: the dev image service emits `/@fs/<checkout>/…` hrefs; the golden must not
 * depend on where the repo is cloned.
 */
function strip(html: string): string {
	const root = process.cwd();
	return html
		.replace(/\sdata-astro-cid-[a-z0-9]+(="[^"]*")?/g, "")
		.replaceAll(encodeURIComponent(root), "%3CROOT%3E")
		.replaceAll(root, "<ROOT>");
}

/** Cuts the `.banner` element (balanced `<div>`s) out of a page. */
function banner(html: string): string {
	const start = html.indexOf('<div class="banner"');
	if (start < 0) throw new Error("no banner in output");
	let depth = 0;
	for (const m of html.slice(start).matchAll(/<(\/?)div\b/g)) {
		depth += m[1] ? -1 : 1;
		if (depth === 0) return strip(html.slice(start, start + (m.index ?? 0) + "</div>".length));
	}
	throw new Error("unbalanced banner");
}

async function container(): Promise<AstroContainer> {
	return AstroContainer.create({ renderers: await loadRenderers([getSvelteRenderer()]) });
}

describe("ProjectBanner (AC1.2)", () => {
	for (const kind of ["loop", "still"] as const) {
		const path = new URL(`../fixtures/banner-golden/${kind}.html`, import.meta.url);
		it(`the ${kind} banner of _WorkLayout equals the golden`, async () => {
			const html = await (await container()).renderToString(WorkLayout, {
				props: { entry: work(covers[kind]) },
			});
			if (process.env["UPDATE_BANNER_GOLDEN"]) writeFileSync(path, `${banner(html)}\n`);
			expect(`${banner(html)}\n`).toBe(readFileSync(path, "utf8"));
		});
		it(`ProjectBanner renders the ${kind} golden`, async () => {
			const html = await (await container()).renderToString(ProjectBanner, {
				props: { slug: "sample-work", cover: covers[kind] },
			});
			expect(`${banner(html)}\n`).toBe(readFileSync(path, "utf8"));
		});
	}
});
