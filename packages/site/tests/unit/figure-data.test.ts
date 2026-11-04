import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FigureDataError, loadFigureData } from "../../src/lib/figure-data";

const URL_A = "/_astro/a.abc123.json";
const URL_B = "/_astro/b.def456.json";
const shape = { schema: "a/1", keys: ["schema", "rows"] } as const;
const good = { schema: "a/1", rows: [1, 2, 3] };

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const swap = () => document.dispatchEvent(new Event("astro:before-swap"));

/** A fetch that never answers but rejects like the platform when its signal aborts. */
const hanging = (_input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> =>
	new Promise((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
	});

async function kindOf(p: Promise<unknown>): Promise<string> {
	try {
		await p;
		return "resolved";
	} catch (e) {
		return e instanceof FigureDataError ? e.kind : `other:${String(e)}`;
	}
}

beforeEach(() => {
	swap();
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("loadFigureData", () => {
	it("returns the parsed body and requests the URL once", async () => {
		fetchMock.mockResolvedValue(json(good));
		await expect(loadFigureData<typeof good>(URL_A, shape)).resolves.toEqual(good);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(URL_A);
	});

	it("an HTTP error is kind http", async () => {
		fetchMock.mockResolvedValue(json({}, { status: 404 }));
		expect(await kindOf(loadFigureData(URL_A, shape))).toBe("http");
	});

	it("a network error is kind network and keeps the cause", async () => {
		const cause = new TypeError("Failed to fetch");
		fetchMock.mockRejectedValue(cause);
		const err = await loadFigureData(URL_A, shape).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(FigureDataError);
		expect(err).toBeInstanceOf(Error);
		expect(err).toMatchObject({ kind: "network", name: "FigureDataError", cause });
	});

	it("a wrong schema, a missing key, a non-object or invalid JSON is kind shape", async () => {
		for (const body of [
			{ schema: "a/2", rows: [] },
			{ schema: "a/1" },
			{ rows: [] },
			[1, 2],
			null,
			"text",
		]) {
			swap();
			fetchMock.mockResolvedValueOnce(json(body));
			expect(await kindOf(loadFigureData(URL_A, shape)), JSON.stringify(body)).toBe("shape");
		}
		swap();
		fetchMock.mockResolvedValueOnce(new Response("{not json", { status: 200 }));
		expect(await kindOf(loadFigureData(URL_A, shape))).toBe("shape");
	});

	it("extra keys are fine (the check is a floor, not a schema)", async () => {
		fetchMock.mockResolvedValue(json({ ...good, extra: true }));
		await expect(loadFigureData(URL_A, shape)).resolves.toMatchObject(good);
	});

	it("a signal that is already aborted rejects with kind abort and makes no request", async () => {
		const c = new AbortController();
		c.abort();
		expect(await kindOf(loadFigureData(URL_A, shape, { signal: c.signal }))).toBe("abort");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("aborting while loading rejects with kind abort and aborts the request", async () => {
		fetchMock.mockImplementation(hanging);
		const c = new AbortController();
		const p = loadFigureData(URL_A, shape, { signal: c.signal });
		const sent = fetchMock.mock.calls[0]?.[1]?.signal;
		c.abort();
		expect(await kindOf(p)).toBe("abort");
		expect(sent?.aborted).toBe(true);
	});

	it("after the last subscriber aborted, the next call requests again", async () => {
		fetchMock.mockImplementationOnce(hanging);
		const c = new AbortController();
		const first = loadFigureData(URL_A, shape, { signal: c.signal });
		c.abort();
		await kindOf(first);
		fetchMock.mockResolvedValueOnce(json(good));
		await expect(loadFigureData(URL_A, shape)).resolves.toEqual(good);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("one subscriber aborting does not cancel a request another still waits for", async () => {
		let release: (r: Response) => void = () => {};
		fetchMock.mockImplementation(
			(_i, init) =>
				new Promise<Response>((resolve, reject) => {
					release = resolve;
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("a", "AbortError")),
					);
				}),
		);
		const c1 = new AbortController();
		const p1 = loadFigureData(URL_A, shape, { signal: c1.signal });
		const p2 = loadFigureData(URL_A, shape);
		c1.abort();
		expect(await kindOf(p1)).toBe("abort");
		release(json(good));
		await expect(p2).resolves.toEqual(good);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("cache (one request per URL per page)", () => {
	it("concurrent and later calls share one request; another URL makes another", async () => {
		fetchMock.mockImplementation(async () => json(good));
		const [a, b] = await Promise.all([loadFigureData(URL_A, shape), loadFigureData(URL_A, shape)]);
		expect(a).toBe(b);
		await loadFigureData(URL_A, shape);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await loadFigureData(URL_B, shape);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("a failure is not cached: Retry requests again", async () => {
		fetchMock.mockResolvedValueOnce(json({}, { status: 500 }));
		expect(await kindOf(loadFigureData(URL_A, shape))).toBe("http");
		fetchMock.mockResolvedValueOnce(json(good));
		await expect(loadFigureData(URL_A, shape)).resolves.toEqual(good);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("is cleared on astro:before-swap", async () => {
		fetchMock.mockImplementation(async () => json(good));
		await loadFigureData(URL_A, shape);
		await loadFigureData(URL_A, shape);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		swap();
		await loadFigureData(URL_A, shape);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
