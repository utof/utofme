/**
 * Unit + property tests for `lib/range.ts` (P9-5, AC5.2).
 *
 * Why: Safari/iOS `<video>` needs correct 206/416 semantics; the pure logic is
 * tested exhaustively here so the Worker handler stays a thin adapter.
 *
 * @see packages/specs/specs/09-project-view.md § P9-5
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { rangeHeaders, resolveRange } from "../../src/lib/range";

describe("resolveRange", () => {
	it("returns full when there is no header", () => {
		expect(resolveRange(null, 100)).toEqual({ kind: "full" });
	});
	it("parses bytes=a-b", () => {
		expect(resolveRange("bytes=0-1", 100)).toEqual({ kind: "partial", start: 0, end: 1 });
	});
	it("parses open-ended bytes=a-", () => {
		expect(resolveRange("bytes=10-", 100)).toEqual({ kind: "partial", start: 10, end: 99 });
	});
	it("parses suffix bytes=-n", () => {
		expect(resolveRange("bytes=-10", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
	});
	it("clamps suffix longer than the file", () => {
		expect(resolveRange("bytes=-500", 100)).toEqual({ kind: "partial", start: 0, end: 99 });
	});
	it("clamps end beyond the file", () => {
		expect(resolveRange("bytes=90-500", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
	});
	it("is unsatisfiable when start >= length", () => {
		expect(resolveRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
	});
	it("is unsatisfiable for suffix of zero", () => {
		expect(resolveRange("bytes=-0", 100)).toEqual({ kind: "unsatisfiable" });
	});
	it("is unsatisfiable for any range on an empty file", () => {
		expect(resolveRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
	});
	it("serves full (200) for multi-range requests", () => {
		expect(resolveRange("bytes=0-1,5-6", 100)).toEqual({ kind: "full" });
	});
	it("ignores malformed, reversed and non-bytes headers", () => {
		for (const h of ["", "bytes=", "bytes=a-b", "bytes=5-2", "items=0-1", "bytes=--1", "0-1"]) {
			expect(resolveRange(h, 100)).toEqual({ kind: "full" });
		}
	});
	it("accepts a case-insensitive unit and whitespace", () => {
		expect(resolveRange("Bytes= 0-1 ", 100)).toEqual({ kind: "partial", start: 0, end: 1 });
	});
	it("honours If-Range only on a strong ETag match", () => {
		const o = { etag: '"abc"' };
		expect(resolveRange("bytes=0-1", 100, { ...o, ifRange: '"abc"' }).kind).toBe("partial");
		expect(resolveRange("bytes=0-1", 100, { ...o, ifRange: '"zzz"' }).kind).toBe("full");
		expect(
			resolveRange("bytes=0-1", 100, { ...o, ifRange: "Wed, 21 Oct 2015 07:28:00 GMT" }).kind,
		).toBe("full");
	});
	it("treats weak validators as an If-Range mismatch", () => {
		expect(resolveRange("bytes=0-1", 100, { etag: 'W/"abc"', ifRange: 'W/"abc"' }).kind).toBe(
			"full",
		);
		expect(resolveRange("bytes=0-1", 100, { etag: null, ifRange: '"abc"' }).kind).toBe("full");
	});
	it("does not throw on huge numerals", () => {
		expect(resolveRange("bytes=99999999999999999999999-", 100).kind).toBe("unsatisfiable");
	});
});

describe("rangeHeaders", () => {
	const base = { contentType: "video/mp4", etag: '"e"' };
	it("builds 200 headers", () => {
		const h = rangeHeaders({ kind: "full" }, 100, base);
		expect(h["Accept-Ranges"]).toBe("bytes");
		expect(h["Content-Length"]).toBe("100");
		expect(h["Content-Type"]).toBe("video/mp4");
		expect(h.ETag).toBe('"e"');
		expect(h["Cache-Control"]).toBe("public, max-age=31536000, immutable");
		expect(h["X-Content-Type-Options"]).toBe("nosniff");
		expect(h["Content-Range"]).toBeUndefined();
	});
	it("builds 206 headers", () => {
		const h = rangeHeaders({ kind: "partial", start: 2, end: 5 }, 100, base);
		expect(h["Content-Range"]).toBe("bytes 2-5/100");
		expect(h["Content-Length"]).toBe("4");
	});
	it("builds 416 headers", () => {
		const h = rangeHeaders({ kind: "unsatisfiable" }, 100, base);
		expect(h["Content-Range"]).toBe("bytes */100");
		expect(h["Content-Length"]).toBe("0");
	});
	it("omits ETag when absent", () => {
		expect(
			rangeHeaders({ kind: "full" }, 1, { contentType: "video/mp4", etag: null }).ETag,
		).toBeUndefined();
	});
});

const len = fc.integer({ min: 1, max: 2 ** 24 });

describe("resolveRange properties", () => {
	test.prop([len, fc.nat(2 ** 25), fc.nat(2 ** 25)])(
		"a-b: slice agrees with Content-Range/Length",
		(L, a, b) => {
			const r = resolveRange(`bytes=${a}-${b}`, L);
			if (a > b) {
				expect(r.kind).toBe("full");
				return;
			}
			if (a >= L) {
				expect(r.kind).toBe("unsatisfiable");
				return;
			}
			expect(r.kind).toBe("partial");
			if (r.kind !== "partial") return;
			expect(r.start).toBe(a);
			expect(r.end).toBe(Math.min(b, L - 1));
			const h = rangeHeaders(r, L, { contentType: "x", etag: null });
			expect(h["Content-Range"]).toBe(`bytes ${r.start}-${r.end}/${L}`);
			expect(Number(h["Content-Length"])).toBe(r.end - r.start + 1);
			expect(r.start >= 0 && r.start <= r.end && r.end < L).toBe(true);
		},
	);
	test.prop([len, fc.nat(2 ** 25)])("-n: 416 iff n == 0", (L, n) => {
		const r = resolveRange(`bytes=-${n}`, L);
		if (n === 0) expect(r.kind).toBe("unsatisfiable");
		else expect(r).toEqual({ kind: "partial", start: Math.max(0, L - n), end: L - 1 });
	});
	test.prop([len, fc.nat(2 ** 25)])("a-: 416 iff a >= L", (L, a) => {
		const r = resolveRange(`bytes=${a}-`, L);
		expect(r.kind).toBe(a >= L ? "unsatisfiable" : "partial");
	});
	test.prop([len, fc.string()])("never throws; partial stays in bounds", (L, h) => {
		const r = resolveRange(h, L);
		if (r.kind === "partial") expect(r.start >= 0 && r.start <= r.end && r.end < L).toBe(true);
	});
	test.prop([len, fc.nat(1000), fc.string()])(
		"weak or mismatched If-Range never yields partial",
		(L, a, tag) => {
			const r = resolveRange(`bytes=${a}-`, L, { etag: `W/"${tag}"`, ifRange: `W/"${tag}"` });
			expect(r.kind).toBe("full");
		},
	);
});
