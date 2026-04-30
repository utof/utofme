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
});
