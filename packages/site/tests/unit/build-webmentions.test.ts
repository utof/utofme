/**
 * Why: pin the build-webmentions producer's four guarantees — slug
 * grouping, schema rejection of malformed jf2, offset pagination via
 * `page=N`, and deterministic output across runs. Mocks `globalThis.fetch`
 * so no network is touched.
 * @see packages/specs/specs/06-indieweb.md § Webmentions
 * @see packages/specs/plans/06-indieweb.md § Task 7
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWebmentions } from "../../scripts/build-webmentions.ts";

interface FixtureChild {
	"wm-id": number;
	"wm-property": string;
	"wm-target": string;
	"wm-source": string;
	"wm-received": string;
	type?: string;
	url?: string;
	published?: string | null;
	author?: { name?: string; photo?: string; url?: string };
	content?: { text?: string };
}

const FIXTURE_PATH = join(import.meta.dirname, "../fixtures/webmentions/sample.jf2.json");
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
	type: string;
	name: string;
	children: FixtureChild[];
};

// Why: `globalThis.fetch` (Bun's lib.dom-augmented type) carries a
// `preconnect` static method that vi.fn() doesn't reproduce. We narrow the
// stub to the call signature that `buildWebmentions` actually exercises;
// using `vi.fn<Sig>()` keeps type-coverage at 100% without any `as` casts.
type FetchSig = (input: string | URL | Request) => Promise<Response>;
function installFetch(impl: FetchSig): void {
	(globalThis as { fetch: FetchSig }).fetch = vi.fn<FetchSig>(impl);
}

describe("build-webmentions", () => {
	beforeEach(() => {
		installFetch(async (input) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("page=0")) return new Response(JSON.stringify(FIXTURE));
			return new Response(JSON.stringify({ type: "feed", children: [] }));
		});
	});
	afterEach(() => vi.restoreAllMocks());

	it("groups by wm-target slug", async () => {
		const result = await buildWebmentions(["https://utof.me/works/code-2/"]);
		expect(result["code-2"]).toBeDefined();
		expect(result["code-2"]?.length ?? 0).toBeGreaterThan(0);
	});

	it("rejects mentions with malformed jf2 (Zod boundary)", async () => {
		installFetch(
			async () =>
				new Response(JSON.stringify({ type: "feed", children: [{ "wm-id": "not a number" }] })),
		);
		const result = await buildWebmentions(["https://utof.me/x/"]);
		expect(result["x"]).toBeUndefined();
	});

	it("paginates via page=N until short page", async () => {
		const calls: string[] = [];
		const firstChild = FIXTURE.children[0];
		if (firstChild === undefined) throw new Error("fixture missing first child");
		installFetch(async (input) => {
			const url = typeof input === "string" ? input : input.toString();
			calls.push(url);
			if (url.includes("page=0")) {
				const children = Array.from({ length: 100 }, (_, i) => ({
					...firstChild,
					"wm-id": i,
				}));
				return new Response(JSON.stringify({ type: "feed", children }));
			}
			if (url.includes("page=1")) {
				return new Response(
					JSON.stringify({
						type: "feed",
						children: [{ ...firstChild, "wm-id": 999 }],
					}),
				);
			}
			return new Response(JSON.stringify({ type: "feed", children: [] }));
		});
		await buildWebmentions(["https://utof.me/x/"]);
		expect(calls.some((c) => c.includes("page=0"))).toBe(true);
		expect(calls.some((c) => c.includes("page=1"))).toBe(true);
		expect(calls.length).toBeLessThanOrEqual(3);
	});

	it("writes byte-identical JSON across runs (deterministic)", async () => {
		const a = await buildWebmentions(["https://utof.me/works/code-2/"]);
		const b = await buildWebmentions(["https://utof.me/works/code-2/"]);
		expect(JSON.stringify(a, null, "\t")).toBe(JSON.stringify(b, null, "\t"));
	});
});
