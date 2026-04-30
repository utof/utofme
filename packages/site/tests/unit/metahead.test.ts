// @vitest-environment node
// Why: Astro 6 dropped support for rendering .astro components in client
// environments (happy-dom/jsdom). Container API tests must run in node.
// See: https://docs.astro.build/en/guides/upgrade-to/v6/#vitest-client-environment-support

import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import MetaHead from "../../src/components/MetaHead.astro";

describe("MetaHead.astro", () => {
	it("emits <link rel='webmention'> with utof.me endpoint", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/" } });
		expect(html).toMatch(
			/<link rel="webmention" href="https:\/\/webmention\.io\/utof\.me\/webmention"/,
		);
	});

	it("emits firehose RSS alternate", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/" } });
		expect(html).toMatch(
			/<link\s+rel="alternate"[^>]*type="application\/rss\+xml"[^>]*href="\/feed\.xml"/,
		);
	});

	it("includes the firehose alternate title", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/" } });
		expect(html).toMatch(/title="utof\.me\s+—\s+firehose"/);
	});

	it("emits works rel=alternate on /", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/" } });
		expect(html).toMatch(/href="\/feed\/works\.xml"/);
	});

	it("emits works rel=alternate on /works/", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/works/" } });
		expect(html).toMatch(/href="\/feed\/works\.xml"/);
	});

	it("does NOT emit works rel=alternate on a works detail page", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/works/code-2/" } });
		expect(html).not.toMatch(/href="\/feed\/works\.xml"/);
	});

	it("emits garden rel=alternate on /garden/", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/garden/" } });
		expect(html).toMatch(/href="\/feed\/garden\.xml"/);
	});

	it("emits garden rel=alternate on /garden/graph/", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/garden/graph/" } });
		expect(html).toMatch(/href="\/feed\/garden\.xml"/);
	});

	it("does NOT emit garden rel=alternate on a garden detail page", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/garden/welcome/" } });
		expect(html).not.toMatch(/href="\/feed\/garden\.xml"/);
	});

	it("emits rel=me for every profile", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(MetaHead, { props: { route: "/" } });
		expect(html).toMatch(/<link\s+rel="me"\s+href="https:\/\/github\.com\/utof"/);
	});
});
