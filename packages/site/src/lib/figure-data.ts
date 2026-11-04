/**
 * Browser loader for the article's dataset files: `fetch` → `res.ok` → `json()` → shape check →
 * typed value, with one in-memory request per URL per page and typed errors.
 *
 * Islands start the load in `onMount` and pass their `AbortSignal`; the request is shared by every
 * caller of a URL and aborted only when the last of them aborts. Failures are never cached, so a
 * Retry button simply calls again. The cache is cleared on `astro:before-swap` (ClientRouter).
 *
 * Why: the files are Zod-validated at sync time and in CI and cannot change after the build, so
 * the client checks only the schema id and the top-level keys and ships no Zod (ADR 0054).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Loading in the browser"
 * @see packages/specs/adrs/0054-article-data-whitelist-projections.md
 */
import type { Shape } from "./article-data/types";

/**
 * Why a load failed: `http` status, `network` failure, `shape` mismatch or `abort`.
 *
 * Why: islands switch on it (keyframe + note + Retry) instead of parsing messages.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Loading in the browser"
 */
export type FigureDataErrorKind = "http" | "network" | "shape" | "abort";

/**
 * A typed load failure: islands switch on `kind` to show the keyframe, the one-line failure note
 * and the Retry button.
 *
 * Why: a typed `kind` keeps UI decisions out of message strings.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Loading in the browser"
 */
export class FigureDataError extends Error {
	readonly kind: FigureDataErrorKind;

	constructor(kind: FigureDataErrorKind, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "FigureDataError";
		this.kind = kind;
	}
}

interface Entry {
	readonly promise: Promise<unknown>;
	readonly controller: AbortController;
	subscribers: number;
	settled: boolean;
}

const cache = new Map<string, Entry>();

// Why: ClientRouter swaps the document; a stale cache would hold data for islands that are gone.
if (typeof document !== "undefined") {
	document.addEventListener("astro:before-swap", () => cache.clear());
}

function isAbort(e: unknown): boolean {
	return e instanceof Error && e.name === "AbortError";
}

function matchesShape<T>(value: unknown, shape: Shape): value is T {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	if (!("schema" in value) || value.schema !== shape.schema) return false;
	return shape.keys.every((k) => k in value);
}

async function fetchChecked(url: string, shape: Shape, signal: AbortSignal): Promise<unknown> {
	let res: Response;
	try {
		res = await fetch(url, { signal });
	} catch (cause) {
		if (isAbort(cause)) throw new FigureDataError("abort", `request for ${url} aborted`, { cause });
		throw new FigureDataError("network", `request for ${url} failed`, { cause });
	}
	if (!res.ok) throw new FigureDataError("http", `request for ${url} returned ${res.status}`);
	// Why: `json()` is typed `any`, assigned to `unknown` so nothing untyped leaks; the file was
	// validated at sync time (ADR 0054), the shape check below catches a wrong or truncated file.
	let value: unknown;
	try {
		value = await res.json();
	} catch (cause) {
		if (isAbort(cause)) throw new FigureDataError("abort", `request for ${url} aborted`, { cause });
		throw new FigureDataError("shape", `${url} is not valid JSON`, { cause });
	}
	if (!matchesShape<unknown>(value, shape)) {
		throw new FigureDataError("shape", `${url} does not have schema ${shape.schema}`);
	}
	return value;
}

function start(url: string, shape: Shape): Entry {
	const controller = new AbortController();
	const entry: Entry = {
		promise: fetchChecked(url, shape, controller.signal),
		controller,
		subscribers: 0,
		settled: false,
	};
	const done = (): void => {
		entry.settled = true;
		// Why: only a success stays cached, so a Retry after an error makes a new request.
	};
	entry.promise.then(done, () => {
		done();
		if (cache.get(url) === entry) cache.delete(url);
	});
	cache.set(url, entry);
	return entry;
}

/**
 * Options of {@link loadFigureData}.
 *
 * Why: the signal ties the request to the island's lifetime (ClientRouter unmount).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Loading in the browser"
 */
export interface LoadOptions {
	/** The island's abort signal (aborted on unmount). */
	readonly signal?: AbortSignal;
}

/**
 * Loads a dataset file for an island: one shared request per URL per page, shape-checked
 * (`schema` equals `shape.schema` and every key of `shape.keys` is present), typed as `T`.
 * Rejects with a {@link FigureDataError}.
 *
 * Why: `T` is the dataset module's `<Name>Data` type; the unchecked step from the parsed body to
 * `T` is safe because the file was Zod-validated at sync and in CI (ADR 0054); callers share a
 * request and only the last abort cancels it, so scrolling away and back costs nothing.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 "Loading in the browser"
 */
export async function loadFigureData<T>(
	url: string,
	shape: Shape,
	opts: LoadOptions = {},
): Promise<T> {
	const { signal } = opts;
	if (signal?.aborted) throw new FigureDataError("abort", `load of ${url} aborted`);
	const entry = cache.get(url) ?? start(url, shape);
	entry.subscribers++;
	let onAbort: (() => void) | undefined;
	const aborted = new Promise<never>((_resolve, reject) => {
		onAbort = () => {
			entry.subscribers--;
			if (entry.subscribers === 0 && !entry.settled) {
				entry.controller.abort();
				if (cache.get(url) === entry) cache.delete(url);
			}
			reject(new FigureDataError("abort", `load of ${url} aborted`));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
	try {
		const value: unknown = await Promise.race([entry.promise, aborted]);
		// Why: the body was shape-checked before it was cached; this type predicate (no assertion)
		// is the one unchecked step from the parsed body to the dataset type `T` (ADR 0054).
		if (!matchesShape<T>(value, shape)) throw new FigureDataError("shape", `${url} changed shape`);
		return value;
	} finally {
		if (onAbort !== undefined) signal?.removeEventListener("abort", onAbort);
	}
}
