/**
 * Handler tests for `worker/index.ts` with a fake `env.ASSETS` (P9-5, AC5.1).
 *
 * Why: the Worker is the only way Safari/iOS gets a 206 from Workers Assets.
 *
 * @see packages/specs/specs/09-project-view.md § P9-5
 */
import { describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);
const URL_ = "https://utof.me/loops/a/card.abcd1234.h264.mp4";

function makeEnv(res?: Response) {
	const fetch = vi.fn(
		async (_req: Request | URL | string) =>
			res ??
			new Response(BYTES, {
				status: 200,
				headers: { "Content-Type": "video/mp4", ETag: '"v1"' },
			}),
	);
	return { env: { ASSETS: { fetch } }, fetch };
}
const get = (headers: Record<string, string> = {}, method = "GET", url = URL_) =>
	new Request(url, { method, headers });
function sent(fetch: { mock: { calls: unknown[][] } }): Request {
	const first = fetch.mock.calls[0]?.[0];
	if (!(first instanceof Request)) throw new Error("expected a Request");
	return first;
}
const body = async (r: Response) => new Uint8Array(await r.arrayBuffer());

describe("loops range worker", () => {
	it("200 + Accept-Ranges with the full body when no Range", async () => {
		const { env, fetch } = makeEnv();
		const r = await worker.fetch(get(), env);
		expect(r.status).toBe(200);
		expect(r.headers.get("Accept-Ranges")).toBe("bytes");
		expect(r.headers.get("Content-Length")).toBe("100");
		expect(r.headers.get("Content-Type")).toBe("video/mp4");
		expect(r.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
		expect(await body(r)).toEqual(BYTES);
		expect(sent(fetch).headers.get("Range")).toBeNull();
	});
	it("206 with the exact slice", async () => {
		const { env, fetch } = makeEnv();
		const r = await worker.fetch(get({ Range: "bytes=10-19", "If-None-Match": '"v1"' }), env);
		expect(r.status).toBe(206);
		expect(r.headers.get("Content-Range")).toBe("bytes 10-19/100");
		expect(r.headers.get("Content-Length")).toBe("10");
		expect(await body(r)).toEqual(BYTES.slice(10, 20));
		expect(sent(fetch).headers.get("Range")).toBeNull();
		expect(sent(fetch).headers.get("If-None-Match")).toBeNull();
	});
	it("206 for suffix and open-ended ranges", async () => {
		const { env } = makeEnv();
		const a = await worker.fetch(get({ Range: "bytes=-4" }), env);
		expect(await body(a)).toEqual(BYTES.slice(96));
		const b = await worker.fetch(get({ Range: "bytes=98-" }), env);
		expect(b.headers.get("Content-Range")).toBe("bytes 98-99/100");
	});
	it("416 with Content-Range */len", async () => {
		const { env } = makeEnv();
		const r = await worker.fetch(get({ Range: "bytes=500-" }), env);
		expect(r.status).toBe(416);
		expect(r.headers.get("Content-Range")).toBe("bytes */100");
		expect(r.headers.get("Accept-Ranges")).toBe("bytes");
		expect((await body(r)).length).toBe(0);
	});
	it("multi-range serves a full 200", async () => {
		const { env } = makeEnv();
		const r = await worker.fetch(get({ Range: "bytes=0-1,4-5" }), env);
		expect(r.status).toBe(200);
		expect((await body(r)).length).toBe(100);
	});
	it("If-Range mismatch serves 200; match serves 206", async () => {
		const { env } = makeEnv();
		expect((await worker.fetch(get({ Range: "bytes=0-1", "If-Range": '"old"' }), env)).status).toBe(
			200,
		);
		expect((await worker.fetch(get({ Range: "bytes=0-1", "If-Range": '"v1"' }), env)).status).toBe(
			206,
		);
	});
	it("HEAD mirrors status and headers with no body", async () => {
		const { env } = makeEnv();
		const r = await worker.fetch(get({ Range: "bytes=0-9" }, "HEAD"), env);
		expect(r.status).toBe(206);
		expect(r.headers.get("Content-Length")).toBe("10");
		expect((await body(r)).length).toBe(0);
		const full = await worker.fetch(get({}, "HEAD"), env);
		expect(full.status).toBe(200);
		expect(full.headers.get("Content-Length")).toBe("100");
		expect((await body(full)).length).toBe(0);
	});
	it("405 for other methods", async () => {
		const { env } = makeEnv();
		const r = await worker.fetch(get({}, "POST"), env);
		expect(r.status).toBe(405);
		expect(r.headers.get("Allow")).toBe("GET, HEAD");
	});
	it("passes non-200 asset responses through (404 page)", async () => {
		const { env } = makeEnv(new Response("nope", { status: 404 }));
		const r = await worker.fetch(get({ Range: "bytes=0-1" }), env);
		expect(r.status).toBe(404);
		expect(await r.text()).toBe("nope");
	});
	it("delegates paths outside /loops/ unchanged", async () => {
		const { env, fetch } = makeEnv(new Response("x", { status: 404 }));
		const req = get({ Range: "bytes=0-1" }, "GET", "https://utof.me/missing.js");
		const r = await worker.fetch(req, env);
		expect(fetch).toHaveBeenCalledWith(req);
		expect(r.status).toBe(404);
	});
	it("streams assets larger than 25 MiB through as 200", async () => {
		const big = new Response("x", {
			status: 200,
			headers: { "Content-Length": String(26 * 1024 * 1024), "Content-Type": "video/mp4" },
		});
		const { env } = makeEnv(big);
		const r = await worker.fetch(get({ Range: "bytes=0-1" }), env);
		expect(r.status).toBe(200);
		expect(r.headers.get("Accept-Ranges")).toBe("bytes");
	});
});
