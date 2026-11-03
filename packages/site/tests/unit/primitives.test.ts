// @vitest-environment node
// Why: Astro 6 dropped support for rendering .astro components in client
// environments (happy-dom/jsdom). Container API tests must run in node.
// See: https://docs.astro.build/en/guides/upgrade-to/v6/#vitest-client-environment-support

/**
 * Unit tests: layout primitives emit their `data-component` marker.
 *
 * Why: the e2e smoke test (tests/e2e/primitives.spec.ts) needs a page that renders
 * each primitive. After ADR 0040 the masonry home dropped the Phase-0 typography
 * sentinel, which was the only page rendering `<Cluster>` and `<Frame>`, so those
 * two can no longer be checked in a browser. The marker is the contract the stagger
 * CSS (`[data-component="grid"]`) and the tests select on, so it is asserted here
 * through the Container API. `<Grid>` is left to the e2e case: its dynamic `as`
 * tag is a known Container API limitation (see card-pagefind-attrs.test.ts).
 *
 * @see packages/specs/plans/00-foundations.md § Task 9 step 4
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Cluster from "../../src/components/Cluster.astro";
import Frame from "../../src/components/Frame.astro";
import Stack from "../../src/components/Stack.astro";

describe("layout primitives (Container API)", () => {
	it("Stack emits data-component=stack and renders its slot", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(Stack, {
			props: { gap: "6" },
			slots: { default: "<p>child</p>" },
		});
		expect(html).toContain('data-component="stack"');
		expect(html).toContain("gap:var(--space-6)");
		expect(html).toContain("<p>child</p>");
	});

	it("Cluster emits data-component=cluster with the requested gap and justify", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(Cluster, {
			props: { gap: "2", justify: "between" },
			slots: { default: "<span>a</span>" },
		});
		expect(html).toContain('data-component="cluster"');
		expect(html).toContain("gap:var(--space-2)");
		expect(html).toContain("justify-content:space-between");
		expect(html).toContain("<span>a</span>");
	});

	it("Frame emits data-component=frame with the requested aspect ratio", async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(Frame, {
			props: { ratio: "4/3" },
			slots: { default: "<img alt='' />" },
		});
		expect(html).toContain('data-component="frame"');
		expect(html).toContain("aspect-ratio:4/3");
	});
});
