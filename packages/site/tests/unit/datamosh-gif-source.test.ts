// @vitest-environment happy-dom
/**
 * Unit tests for the fallback paths of `lib/datamosh/gif-source.ts`.
 *
 * Why: the `ImageDecoder` happy path needs a real browser (covered by the playground
 * readouts and the e2e hover test); what must never regress is that every
 * unsupported / opted-out case degrades to "a still on frame 0" without fetching
 * or throwing.
 *
 * @see packages/site/src/lib/datamosh/gif-source.ts
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isGifUrl, startGifSource } from "../../src/lib/datamosh/gif-source";

function img(src: string): HTMLImageElement {
	const el = document.createElement("img");
	el.src = src;
	return el;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("isGifUrl", () => {
	it("recognises .gif by extension, ignoring query and hash", () => {
		expect(isGifUrl("/_astro/pendulum.AbC123.gif")).toBe(true);
		expect(isGifUrl("/_astro/pendulum.gif?origWidth=658&origHeight=689")).toBe(true);
		expect(isGifUrl("/a/b.GIF#x")).toBe(true);
	});

	it("rejects everything else", () => {
		expect(isGifUrl("/a/photo.jpg")).toBe(false);
		expect(isGifUrl("/a/gifted.png")).toBe(false);
		expect(isGifUrl("/a/b.gif.jpg")).toBe(false);
		expect(isGifUrl("")).toBe(false);
	});
});

describe("startGifSource fallbacks", () => {
	const options = (mode: "auto" | "frame0", src = "http://localhost/a.gif") => ({
		img: img(src),
		width: 16,
		height: 16,
		mode,
		onFrame: vi.fn(),
	});

	it("never fetches or decodes in frame0 mode", () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		vi.stubGlobal("ImageDecoder", class {});
		const opts = options("frame0");
		const source = startGifSource(opts);
		expect(source.kind).toBe("frame0");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(opts.onFrame).not.toHaveBeenCalled();
		source.close();
	});

	it("stays on frame 0 when ImageDecoder does not exist", () => {
		vi.stubGlobal("ImageDecoder", undefined);
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const source = startGifSource(options("auto"));
		expect(source.kind).toBe("frame0");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("stays on frame 0 for a non-GIF url", () => {
		vi.stubGlobal("ImageDecoder", class {});
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const source = startGifSource(options("auto", "http://localhost/a.jpg"));
		expect(source.kind).toBe("frame0");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("falls back quietly when the GIF type is unsupported, and close() is idempotent", async () => {
		const isTypeSupported = vi.fn().mockResolvedValue(false);
		vi.stubGlobal("ImageDecoder", Object.assign(class {}, { isTypeSupported }));
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const opts = options("auto");
		const source = startGifSource(opts);
		await vi.waitFor(() => expect(isTypeSupported).toHaveBeenCalledWith("image/gif"));
		expect(source.kind).toBe("frame0");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(opts.onFrame).not.toHaveBeenCalled();
		source.close();
		source.close();
	});

	it("warns once and stays on frame 0 when the fetch fails", async () => {
		vi.stubGlobal(
			"ImageDecoder",
			Object.assign(class {}, { isTypeSupported: vi.fn().mockResolvedValue(true) }),
		);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const opts = options("auto", "http://localhost/missing.gif");
		const source = startGifSource(opts);
		await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
		expect(source.kind).toBe("frame0");
		expect(opts.onFrame).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
