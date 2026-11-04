/**
 * Unit tests for the post-morph banner swap (D-02): `parseBannerSources` and `upgradeBannerLoops`.
 *
 * @see packages/specs/reports/ui-fix-banner.md
 */
import { describe, expect, it } from "vitest";
import {
	type LoopDeps,
	parseBannerSources,
	upgradeBannerLoops,
} from "../../../src/lib/loops/controller";

const BANNER = {
	width: 1920,
	height: 1080,
	sources: [
		{ url: "/loops/x/banner.av1.mp4", type: 'video/mp4; codecs="av01.0.08M.08"' },
		{ url: "/loops/x/banner.h264.mp4", type: 'video/mp4; codecs="avc1.640028"' },
	],
};

function deps(paused: boolean): LoopDeps {
	return {
		createObserver: () => {
			throw new Error("unused");
		},
		isPaused: () => paused,
		saveData: () => false,
		doc: document,
	};
}

function must<T>(v: T | null | undefined): T {
	if (v === null || v === undefined) throw new Error("missing element");
	return v;
}

function frame(): HTMLElement {
	document.body.innerHTML = `<div class="loop-frame" data-banner-sources='${JSON.stringify(BANNER)}'>
		<video data-loop data-loop-size="card" data-ready data-astro-transition-persist="loop-x" width="768" height="432">
			<source src="/loops/x/card.av1.mp4" type="video/mp4">
		</video></div>`;
	return must(document.querySelector<HTMLElement>(".loop-frame"));
}

describe("parseBannerSources", () => {
	it("returns null for absent, malformed or empty input", () => {
		expect(parseBannerSources(null)).toBeNull();
		expect(parseBannerSources("")).toBeNull();
		expect(parseBannerSources("{nope")).toBeNull();
		expect(parseBannerSources('{"width":1,"height":1,"sources":[]}')).toBeNull();
		expect(parseBannerSources('"str"')).toBeNull();
	});
	it("parses a rendition", () => {
		expect(parseBannerSources(JSON.stringify(BANNER))).toEqual(BANNER);
	});
});

describe("upgradeBannerLoops", () => {
	it("appends a hidden banner-rendition video without persist id and keeps the card one", () => {
		const f = frame();
		upgradeBannerLoops(document, deps(false));
		const vids = f.querySelectorAll("video");
		expect(vids).toHaveLength(2);
		const next = must(vids[1]);
		expect(next.dataset.loopSize).toBe("banner");
		expect(next.hasAttribute("data-ready")).toBe(false);
		expect(next.hasAttribute("data-astro-transition-persist")).toBe(false);
		expect(next.getAttribute("width")).toBe("1920");
		expect([...next.querySelectorAll("source")].map((s) => s.getAttribute("src"))).toEqual(
			BANNER.sources.map((s) => s.url),
		);
	});
	it("drops the card video at once when motion is paused", () => {
		const f = frame();
		upgradeBannerLoops(document, deps(true));
		const vids = f.querySelectorAll("video");
		expect(vids).toHaveLength(1);
		expect(must(vids[0]).dataset.loopSize).toBe("banner");
	});
	it("does nothing on a direct load (video already banner size)", () => {
		const f = frame();
		f.querySelector("video")?.setAttribute("data-loop-size", "banner");
		upgradeBannerLoops(document, deps(false));
		expect(f.querySelectorAll("video")).toHaveLength(1);
	});
});
