// @vitest-environment node
// Why: Astro 6 dropped support for rendering .astro components in client
// environments (happy-dom/jsdom). Container API tests must run in node.
// See: https://docs.astro.build/en/guides/upgrade-to/v6/#vitest-client-environment-support

import { loadRenderers } from "astro:container";
import type { CollectionEntry } from "astro:content";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { mf2 } from "microformats-parser";
import { describe, expect, it } from "vitest";
import WorkLayout from "../../src/layouts/_WorkLayout.astro";

/**
 * Minimal works fixture — structurally satisfies CollectionEntry<"works">
 * (all required fields filled; no `as` casts so type-coverage stays at 100%).
 *
 * `type` is `code` with `repo: undefined` so `externalUrl` in _WorkLayout
 * resolves to `undefined` (no external link branch). `cover: undefined`
 * skips the <CoverImage> branch — that branch needs an `ImageMetadata`
 * object only produced through Astro's asset pipeline at build-time.
 *
 * Why: 100% type-coverage gate (CLAUDE.md precommit step 4); mirrors the
 * same `satisfies` pattern used in `feed.test.ts`.
 *
 * @see packages/site/src/content.config.ts § worksSchema
 * @see packages/site/tests/unit/feed.test.ts § fakeWork
 */
const fakeWork = {
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
		cover: undefined,
		stack: ["typescript"],
		repo: undefined,
	},
} satisfies CollectionEntry<"works">;

describe("h-entry microformats markup", () => {
	it("_WorkLayout renders a parseable h-entry", async () => {
		// _BaseLayout (parent of _WorkLayout) mounts a Svelte CommandPalette
		// island. Container API needs the Svelte renderer registered so the
		// island renders instead of throwing NoMatchingRenderer.
		// See: https://docs.astro.build/en/reference/container-reference/#loadrenderers
		const renderers = await loadRenderers([getSvelteRenderer()]);
		const container = await AstroContainer.create({ renderers });
		const html = await container.renderToString(WorkLayout, {
			props: { entry: fakeWork },
			slots: { default: "<p>Body content goes here.</p>" },
		});

		const parsed = mf2(html, { baseUrl: "https://utof.me/" });
		const hEntry = parsed.items.find((i) => i.type?.includes("h-entry"));
		expect(hEntry, "expected an h-entry root in parsed mf2 items").toBeDefined();
		if (!hEntry) return;

		expect(hEntry.properties.name?.length, "p-name should be non-empty").toBeGreaterThan(0);
		expect(hEntry.properties.published?.length, "dt-published should be non-empty").toBeGreaterThan(
			0,
		);
		expect(hEntry.properties.content?.length, "e-content should be non-empty").toBeGreaterThan(0);
		expect(hEntry.properties.url?.length, "u-url should be non-empty").toBeGreaterThan(0);
	});

	// TODO Phase 6 Task 12: assert rels.me on the built dist/index.html
	// (microformats-parser only operates on rendered HTML; rel=me lives in
	// the page <head> via MetaHead.astro, exercised in the e2e/build path).
	it.skip("home page exposes rels.me for every profile", () => {});
});
