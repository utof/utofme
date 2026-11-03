/**
 * Datamosh hover: real animated-GIF frames for the engine's source plane.
 *
 * Every browser hands canvas only the FIRST frame of an animated `<img>`
 * (`drawImage`, `createImageBitmap`, `texImage2D`), so a GIF card needs its own
 * decoder clock. This module feature-detects `ImageDecoder`, fetches the GIF's
 * bytes once (`force-cache`, a small per-URL cache), then decodes ONE frame at a
 * time on the GIF's own timing, draws it at the engine's internal size and hands the
 * RGBA bytes to `onFrame`. Anywhere it cannot (no `ImageDecoder`, no GIF support,
 * fetch/decode error, `gifSource: "frame0"`, a single-frame GIF) the card is simply
 * a still: the caller's own `drawImage` of frame 0, which reads as "the decoder
 * lost its keyframe".
 *
 * Never decodes ahead (one `VideoFrame` alive at a time, closed immediately),
 * stops its timer, aborts its fetch and closes its decoder on `close()`.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder
 * @see https://html.spec.whatwg.org/multipage/canvas.html (animated images draw their default frame)
 */

/** What actually feeds the source plane. */
export type GifSourceKind = "imagedecoder" | "frame0";

/**
 * Handle for one running GIF source.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface GifSource {
	/** `imagedecoder` once frames are flowing; `frame0` when it fell back (or never started). */
	readonly kind: GifSourceKind;
	/** Stop decoding and release the decoder, the timer and the fetch. Idempotent. */
	close(): void;
}

/**
 * Inputs for {@link startGifSource}.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface GifSourceOptions {
	/** The card's `<img>`; its `currentSrc` is the GIF to decode. */
	img: HTMLImageElement;
	/** Engine internal size, px. */
	width: number;
	height: number;
	/** `frame0` never starts a decoder. */
	mode: "auto" | "frame0";
	/** A freshly decoded frame as RGBA bytes at `width` x `height` (a new array each call). */
	onFrame(rgba: Uint8ClampedArray): void;
}

/** GIFs with a missing or absurdly small delay play at this speed instead (browsers do the same). */
const DEFAULT_FRAME_MS = 100;
const MIN_FRAME_MS = 20;
/** Per-URL byte cache: a few GIFs, so hopping between hovered cards does not refetch. */
const CACHE_LIMIT = 4;
const bytesCache = new Map<string, ArrayBuffer>();

/**
 * True when `url` looks like a GIF (by extension, query string ignored).
 *
 * Why: the card markup does not say a cover is animated; CoverImage renders GIFs as
 * a plain `<img>` of the original asset, so the URL is the signal (the dither makes
 * the same call).
 *
 * @see packages/site/src/components/CoverImage.astro
 */
export function isGifUrl(url: string): boolean {
	return /\.gif(?:$|[?#])/i.test(url);
}

async function loadBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
	const cached = bytesCache.get(url);
	if (cached) {
		// Refresh recency (Map keeps insertion order).
		bytesCache.delete(url);
		bytesCache.set(url, cached);
		return cached;
	}
	const response = await fetch(url, { cache: "force-cache", signal });
	if (!response.ok) throw new Error(`GIF fetch failed: ${response.status}`);
	const bytes = await response.arrayBuffer();
	bytesCache.set(url, bytes);
	while (bytesCache.size > CACHE_LIMIT) {
		const oldest = bytesCache.keys().next();
		if (oldest.done) break;
		bytesCache.delete(oldest.value);
	}
	return bytes;
}

/**
 * Start feeding real GIF frames to `onFrame`.
 *
 * Returns immediately with `kind: "frame0"`; the kind flips to `imagedecoder` when
 * the first decoded frame is delivered. The loop starts at frame 0 (replacing the
 * caller's synchronous `drawImage` of it, so timing stays true) and wraps.
 *
 * Why: see the module header. Failures never throw to the caller; they leave the
 * card as a still and warn once.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function startGifSource(options: GifSourceOptions): GifSource {
	let kind: GifSourceKind = "frame0";
	let closed = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let decoder: ImageDecoder | null = null;
	const abort = new AbortController();

	const handle: GifSource = {
		get kind() {
			return kind;
		},
		close() {
			if (closed) return;
			closed = true;
			clearTimeout(timer);
			abort.abort();
			decoder?.close();
			decoder = null;
		},
	};

	const url = options.img.currentSrc || options.img.src;
	if (options.mode === "frame0" || typeof ImageDecoder === "undefined" || !isGifUrl(url)) {
		return handle;
	}

	const run = async (): Promise<void> => {
		if (!(await ImageDecoder.isTypeSupported("image/gif")) || closed) return;
		const bytes = await loadBytes(url, abort.signal);
		if (closed) return;
		const active = new ImageDecoder({ data: bytes, type: "image/gif" });
		decoder = active;
		await active.tracks.ready;
		const frames = active.tracks.selectedTrack?.frameCount ?? 0;
		if (closed || frames < 2) return;

		// Created only once there is something to decode, so every fallback stays allocation-free.
		const work = document.createElement("canvas");
		work.width = options.width;
		work.height = options.height;
		const ctx = work.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";

		let index = -1;
		const tick = async (): Promise<void> => {
			if (closed) return;
			const started = performance.now();
			index = (index + 1) % frames;
			const { image } = await active.decode({ frameIndex: index });
			let delay = DEFAULT_FRAME_MS;
			try {
				if (closed) return;
				ctx.clearRect(0, 0, options.width, options.height);
				ctx.drawImage(image, 0, 0, options.width, options.height);
				const pixels = ctx.getImageData(0, 0, options.width, options.height).data;
				if (image.duration !== null) {
					delay = Math.max(MIN_FRAME_MS, image.duration / 1000);
				}
				kind = "imagedecoder";
				options.onFrame(pixels);
			} finally {
				image.close();
			}
			timer = setTimeout(() => void guarded(), Math.max(0, delay - (performance.now() - started)));
		};
		const guarded = async (): Promise<void> => {
			try {
				await tick();
			} catch (error) {
				fail(error);
			}
		};
		await tick();
	};

	const fail = (error: unknown): void => {
		if (closed) return;
		console.warn("[mosh] GIF decoding failed; the card stays on frame 0:", error);
		kind = "frame0";
		handle.close();
	};

	run().catch(fail);
	return handle;
}
