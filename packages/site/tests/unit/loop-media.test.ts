// @vitest-environment node
// Why: Container API tests must run in node (Astro 6+ dropped client environments).

/**
 * Container-API render test: `LoopMedia.astro` markup against the P9 contract
 * (R5 rules) using a test-only manifest entry and poster.
 *
 * @see packages/specs/specs/09-project-view.md § P9-6
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import LoopMedia from "../../src/components/LoopMedia.astro";

const entry = {
	posterPath: "src/assets/loops/demo/poster.png",
	card: {
		width: 768,
		height: 432,
		sources: [
			{
				url: "/loops/demo/card.aaaaaaaa.av1.mp4",
				type: 'video/mp4; codecs="av01.0.04M.08"',
				bytes: 1000,
			},
			{
				url: "/loops/demo/card.bbbbbbbb.h264.mp4",
				type: 'video/mp4; codecs="avc1.64001E"',
				bytes: 2000,
			},
		],
	},
	banner: null,
};
const poster = { src: "/poster.png", width: 768, height: 432, format: "png" } as const;

async function render(props: Record<string, unknown>): Promise<string> {
	const container = await AstroContainer.create();
	return container.renderToString(LoopMedia, {
		props: { slug: "demo", size: "card", alt: "", entry, poster, ...props },
	});
}

describe("LoopMedia.astro markup contract", () => {
	it("wraps in .loop-frame[data-loop-frame][data-slug]", async () => {
		const html = await render({});
		expect(html).toMatch(/class="[^"]*loop-frame[^"]*"/);
		expect(html).toContain("data-loop-frame");
		expect(html).toContain('data-slug="demo"');
	});

	it("video is muted, loop, playsinline, preload=none, aria-hidden, sized; no autoplay / poster", async () => {
		const html = await render({});
		const video = html.match(/<video\b[^>]*>/)?.[0] ?? "";
		expect(video).toContain("data-loop");
		for (const a of ["muted", "loop", "playsinline"])
			expect(video).toMatch(new RegExp(`\\b${a}\\b`));
		expect(video).toContain('preload="none"');
		expect(video).toContain('aria-hidden="true"');
		expect(video).toContain('width="768"');
		expect(video).toContain('height="432"');
		expect(video).not.toMatch(/\bautoplay\b/);
		expect(video).not.toMatch(/\bposter\b/);
		expect(video).not.toContain("transition");
	});

	it("has two sources, AV1 first then H.264", async () => {
		const html = (await render({})).match(/<video\b[\s\S]*<\/video>/)?.[0] ?? "";
		const types = [...html.matchAll(/<source\b[^>]*\btype="([^"]+)"/g)].map((m) => m[1]);
		expect(types).toHaveLength(2);
		expect(types[0]).toContain("av01");
		expect(types[1]).toContain("avc1");
	});

	it("poster image: lazy by default, eager + fetchpriority=high only with priority", async () => {
		const lazy = await render({});
		expect(lazy).toMatch(/<img\b[^>]*loading="lazy"/);
		expect(lazy).not.toContain("fetchpriority");
		const hi = await render({ eager: true, priority: true });
		expect(hi).toMatch(/<img\b[^>]*loading="eager"/);
		expect(hi).toContain('fetchpriority="high"');
	});

	it("persistId adds the transition:persist marker to the video", async () => {
		const html = await render({ persistId: "loop-demo" });
		expect(html).toMatch(/<video\b[^>]*data-astro-transition-persist="loop-demo"/);
	});

	it("banner poster offers srcset widths up to the 1920 px source, never above it", async () => {
		const bannerEntry = { ...entry, banner: { ...entry.card, width: 1920, height: 1080 } };
		const big = { src: "/poster.png", width: 1920, height: 1080, format: "png" } as const;
		const html = await render({ size: "banner", entry: bannerEntry, poster: big });
		const widths = [...html.matchAll(/\s(\d+)w[",]/g)].map((m) => Number(m[1]));
		expect(Math.max(...widths)).toBe(1920);
		expect(widths).toEqual(expect.arrayContaining([640, 960, 1280, 1920]));
		expect(widths).not.toContain(2560);
		expect(html).toContain('sizes="(min-width: 1580px) 1340px, (min-width: 700px) 85vw, 100vw"');
		expect(html).toContain('data-loop-size="banner"');
		expect(html).toContain('width="1920"');
	});

	it("banner poster that is narrower than 2560 px still offers its own width", async () => {
		const bannerEntry = { ...entry, banner: { ...entry.card, width: 1920, height: 1080 } };
		const html = await render({ size: "banner", entry: bannerEntry });
		const widths = [...html.matchAll(/\s(\d+)w[",]/g)].map((m) => Number(m[1]));
		expect(Math.max(...widths)).toBe(768);
		expect(widths).toContain(640);
	});

	it("alt text lands on the poster image", async () => {
		const html = await render({ alt: "A demo" });
		expect(html).toMatch(/<img\b[^>]*alt="A demo"/);
	});
});
