/**
 * Pure HTTP `Range` helpers for the `/loops/*` Worker (P9-5, decision D15).
 *
 * Why: Workers Static Assets answer `Range` with 200 + full body, which Safari/iOS
 * refuse to play `<video>` from. The slice maths lives here, free of any runtime
 * API, so it can be fast-checked and mutation-tested; `worker/index.ts` is a thin adapter.
 * Multi-range requests are deliberately answered with a plain 200 (RFC 9110 §14.2
 * allows ignoring `Range`); a single contiguous range is all `<video>` ever asks for.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests
 * @see packages/specs/adrs/0045-loops-range-worker.md
 */

/**
 * Outcome of resolving a `Range` header against a representation length.
 *
 * Why: a discriminated union makes the 200 / 206 / 416 branches exhaustive.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests
 */
export type RangeResult =
	| { kind: "full" }
	| { kind: "partial"; start: number; end: number }
	| { kind: "unsatisfiable" };

/**
 * Validators for `If-Range` evaluation.
 *
 * Why: `If-Range` must only be honoured on a strong ETag match.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-if-range
 */
export interface RangeOptions {
	/** The `If-Range` request header, if any. */
	ifRange?: string | null;
	/** The representation's `ETag`, if any. */
	etag?: string | null;
}

const SPEC = /^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/i;

/**
 * Resolve a `Range` header against a representation of `length` bytes.
 *
 * Why: returns `full` (serve 200) for anything absent, malformed, multi-range or
 * failing `If-Range`; `unsatisfiable` (416) only for a well-formed single range
 * that lies wholly outside the representation. Never throws.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-range
 */
export function resolveRange(
	header: string | null,
	length: number,
	opts: RangeOptions = {},
): RangeResult {
	if (header === null) return { kind: "full" };
	if (opts.ifRange != null) {
		const tag = opts.ifRange.trim();
		if (
			tag.startsWith("W/") ||
			opts.etag == null ||
			opts.etag.startsWith("W/") ||
			tag !== opts.etag
		) {
			return { kind: "full" };
		}
	}
	const m = SPEC.exec(header.trim());
	if (m === null) return { kind: "full" };
	const first = m[1] ?? "";
	const last = m[2] ?? "";
	if (first === "" && last === "") return { kind: "full" };
	if (first === "") {
		const n = Number(last);
		if (n === 0 || length === 0) return { kind: "unsatisfiable" };
		return { kind: "partial", start: Math.max(0, length - n), end: length - 1 };
	}
	const start = Number(first);
	const end = last === "" ? Number.POSITIVE_INFINITY : Number(last);
	if (end < start) return { kind: "full" };
	if (start >= length) return { kind: "unsatisfiable" };
	return { kind: "partial", start, end: Math.min(end, length - 1) };
}

/**
 * Representation metadata copied onto every generated response.
 *
 * Why: `_headers` is not applied to Worker-generated responses, so these are set explicitly.
 *
 * @see https://developers.cloudflare.com/workers/static-assets/headers/
 */
export interface RangeBase {
	/** The asset's `Content-Type`. */
	contentType: string;
	/** The asset's `ETag`, or null. */
	etag: string | null;
}

/**
 * Build the response headers for a resolved range.
 *
 * Why: `Content-Range`/`Content-Length` are derived from the same `RangeResult`
 * as the body slice, so they cannot disagree (property-tested, AC5.2).
 * `Cache-Control` is immutable because loop files are content-hashed.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9110.html#name-content-range
 */
export function rangeHeaders(
	result: RangeResult,
	length: number,
	base: RangeBase,
): Record<string, string> {
	const h: Record<string, string> = {
		"Accept-Ranges": "bytes",
		"Content-Type": base.contentType,
		"Cache-Control": "public, max-age=31536000, immutable",
		"X-Content-Type-Options": "nosniff",
	};
	if (base.etag !== null) h.ETag = base.etag;
	if (result.kind === "partial") {
		h["Content-Range"] = `bytes ${result.start}-${result.end}/${length}`;
		h["Content-Length"] = String(result.end - result.start + 1);
	} else if (result.kind === "unsatisfiable") {
		h["Content-Range"] = `bytes */${length}`;
		h["Content-Length"] = "0";
	} else {
		h["Content-Length"] = String(length);
	}
	return h;
}
