/**
 * `/loops/*` Range Worker (P9-5, D15): answers `Range` with 206/416 for Safari/iOS.
 *
 * Why: Workers Static Assets return 200 + full body for `Range`; Safari will not play
 * `<video>` that way. `wrangler.jsonc` runs this Worker first only for `/loops/*`;
 * everything else never reaches it. Local `Env` type avoids `@cloudflare/workers-types`.
 *
 * @see https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
 * @see packages/specs/adrs/0045-loops-range-worker.md
 */
import { rangeHeaders, resolveRange } from "../src/lib/range";

/**
 * Minimal Worker environment: only the assets binding.
 *
 * Why: declared locally so no `@cloudflare/workers-types` dependency is needed.
 *
 * @see https://developers.cloudflare.com/workers/static-assets/binding/
 */
export interface Env {
	ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
}

/** Assets above this size are streamed through as a plain 200 (no buffering). */
const MAX_BUFFER = 25 * 1024 * 1024;

async function handle(request: Request, env: Env): Promise<Response> {
	if (!new URL(request.url).pathname.startsWith("/loops/")) return env.ASSETS.fetch(request);
	const head = request.method === "HEAD";
	if (request.method !== "GET" && !head) {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
	}
	const asset = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
	const declared = Number(asset.headers.get("Content-Length") ?? 0);
	if (asset.status !== 200 || declared > MAX_BUFFER) {
		if (asset.status !== 200) return asset;
		const out = new Response(head ? null : asset.body, asset);
		out.headers.set("Accept-Ranges", "bytes");
		return out;
	}
	const bytes = await asset.arrayBuffer();
	const etag = asset.headers.get("ETag");
	const result = resolveRange(request.headers.get("Range"), bytes.byteLength, {
		ifRange: request.headers.get("If-Range"),
		etag,
	});
	const headers = rangeHeaders(result, bytes.byteLength, {
		contentType: asset.headers.get("Content-Type") ?? "application/octet-stream",
		etag,
	});
	if (head || result.kind === "unsatisfiable") {
		return new Response(null, { status: statusOf(result.kind), headers });
	}
	const payload = result.kind === "partial" ? bytes.slice(result.start, result.end + 1) : bytes;
	return new Response(payload, { status: statusOf(result.kind), headers });
}

function statusOf(kind: "full" | "partial" | "unsatisfiable"): number {
	return kind === "partial" ? 206 : kind === "unsatisfiable" ? 416 : 200;
}

/**
 * Worker entry point.
 *
 * Why: module-syntax default export is what `main` in wrangler.jsonc expects.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
 */
export default { fetch: handle } satisfies { fetch(request: Request, env: Env): Promise<Response> };
