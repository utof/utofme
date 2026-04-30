// @vitest-environment node
// Why: Astro Container API tests must run in node environment (Astro 6 dropped
// happy-dom/jsdom support for .astro rendering). Inline-script execution tests
// use a minimal hand-built fake window (no external DOM library) to avoid the
// type conflict between happy-dom's Document and lib.dom.d.ts Document.
// See: https://docs.astro.build/en/guides/upgrade-to/v6/#vitest-client-environment-support

/**
 * Unit tests for SoundToggle.astro.
 *
 * Split into two describe groups:
 * 1. Container API render tests — assert static HTML shape (aria-pressed,
 *    aria-label, SVG, script content).
 * 2. Inline-script behaviour tests — extract the IIFE from the rendered HTML,
 *    run it inside a minimal hand-built fake window with mocked AudioContext /
 *    fetch, then assert behaviour (localStorage round-trip, lazy AudioContext
 *    creation).
 *
 * Why hand-built fake window: importing happy-dom's Window brings in a Document
 * type that conflicts with lib.dom.d.ts Document on `readyState`, collapsing the
 * intersection to `never` and failing `type-coverage --at-least 100 --strict`.
 * A bespoke minimal object with exactly the APIs the IIFE uses keeps the type
 * graph clean and the test surface minimal.
 *
 * @see packages/specs/specs/07-atmosphere.md § T2
 * @see packages/specs/plans/07-atmosphere.md § T2 TDD red cases
 */

import { loadRenderers } from "astro:container";
import { getContainerRenderer as getSvelteRenderer } from "@astrojs/svelte";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SoundToggle from "../../src/components/SoundToggle.astro";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render SoundToggle via Astro Container and return the raw HTML string. */
async function renderSoundToggle(): Promise<string> {
	const renderers = await loadRenderers([getSvelteRenderer()]);
	const container = await AstroContainer.create({ renderers });
	return container.renderToString(SoundToggle);
}

/**
 * Extract the inline-script body from rendered SoundToggle HTML.
 *
 * Why: `is:inline` scripts are emitted as literal `<script>` tags by Astro —
 * unlike bundled islands, they are not hashed or deferred. The regex matches
 * the script tag that contains the localStorage key used by SoundToggle.
 */
function extractInlineScript(html: string): string {
	const matches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
	for (const m of matches) {
		if (m[1]?.includes("utofme:sound")) return m[1];
	}
	return "";
}

// ---------------------------------------------------------------------------
// AudioContext mock — shared across inline-script tests
// ---------------------------------------------------------------------------

/** Shape of a constructed AudioContext mock used in this test file. */
type MockAudioCtxInstance = {
	createBufferSource: ReturnType<typeof vi.fn>;
	decodeAudioData: ReturnType<typeof vi.fn>;
	destination: Record<string, never>;
	resume: ReturnType<typeof vi.fn>;
};

const mockBufferSource = {
	buffer: null as null,
	connect: vi.fn(),
	start: vi.fn(),
};

const mockAudioCtxInstance: MockAudioCtxInstance = {
	createBufferSource: vi.fn().mockReturnValue(mockBufferSource),
	decodeAudioData: vi.fn().mockResolvedValue(null),
	destination: {} as Record<string, never>,
	resume: vi.fn(),
};

// Must use `function` (not arrow) so `new audioCtxCtor()` works — the IIFE
// calls `new (window.AudioContext || window.webkitAudioContext)()`.
function AudioContextMock(this: unknown) {
	return mockAudioCtxInstance;
}
const audioCtxCtor = vi.fn().mockImplementation(AudioContextMock);

beforeEach(() => {
	audioCtxCtor.mockClear();
	mockAudioCtxInstance.createBufferSource.mockClear();
	mockAudioCtxInstance.decodeAudioData.mockClear();
	mockAudioCtxInstance.resume.mockClear();
	mockBufferSource.connect.mockClear();
	mockBufferSource.start.mockClear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Minimal fake button (used by the inline-script tests)
// ---------------------------------------------------------------------------

/** Minimal element shape needed by the SoundToggle IIFE. */
type FakeButton = {
	setAttribute: (k: string, v: string) => void;
	getAttribute: (k: string) => string | null;
	click: () => void;
	/** Internal attribute store — tests read this to assert state changes. */
	_attrs: Map<string, string>;
	onclick: (() => void) | null;
};

function makeFakeButton(): FakeButton {
	const attrs = new Map<string, string>([
		["data-sound-toggle", ""],
		["aria-pressed", "false"],
		["aria-label", "Toggle UI sounds"],
	]);
	let onclick: (() => void) | null = null;
	return {
		_attrs: attrs,
		setAttribute(k: string, v: string) {
			attrs.set(k, v);
		},
		getAttribute(k: string): string | null {
			return attrs.get(k) ?? null;
		},
		get onclick() {
			return onclick;
		},
		set onclick(fn: (() => void) | null) {
			onclick = fn;
		},
		click() {
			onclick?.();
		},
	};
}

// ---------------------------------------------------------------------------
// Minimal fake localStorage (Map-backed, no browser dependency)
// ---------------------------------------------------------------------------

function makeFakeStorage(): Storage {
	const store = new Map<string, string>();
	return {
		getItem(k: string) {
			return store.get(k) ?? null;
		},
		setItem(k: string, v: string) {
			store.set(k, v);
		},
		removeItem(k: string) {
			store.delete(k);
		},
		clear() {
			store.clear();
		},
		get length() {
			return store.size;
		},
		key(n: number) {
			return [...store.keys()][n] ?? null;
		},
	} satisfies Storage;
}

// ---------------------------------------------------------------------------
// Group 1: Container API render assertions (static HTML shape)
// ---------------------------------------------------------------------------

describe("SoundToggle server render", () => {
	it("aria-pressed defaults to false when localStorage unset", async () => {
		const html = await renderSoundToggle();
		// The server-rendered button must start with aria-pressed="false".
		expect(html).toContain('aria-pressed="false"');
	});

	it("renders data-sound-toggle selector", async () => {
		const html = await renderSoundToggle();
		expect(html).toContain("data-sound-toggle");
	});

	it("renders aria-label for accessibility", async () => {
		const html = await renderSoundToggle();
		expect(html).toContain("aria-label=");
		expect(html).toContain("Toggle UI sounds");
	});

	it("renders an SVG icon with aria-hidden", async () => {
		const html = await renderSoundToggle();
		expect(html).toContain("<svg");
		expect(html).toContain('aria-hidden="true"');
	});

	it("includes inline script with sound-toggle behaviour", async () => {
		const html = await renderSoundToggle();
		expect(html).toContain("utofme:sound");
	});
});

// ---------------------------------------------------------------------------
// Group 2: Inline-script behaviour (IIFE execution with fake window)
// ---------------------------------------------------------------------------

/**
 * Execute the SoundToggle inline script in a controlled fake-window context.
 *
 * Why: the inline IIFE reads `localStorage` and queries `[data-sound-toggle]`
 * at execution time. Using a hand-built fake instead of a DOM library keeps
 * the type graph clean (no happy-dom / JSDOM type conflicts) and the test
 * surface minimal.
 */
async function runInlineScript(opts: { soundOn?: boolean } = {}): Promise<{
	storage: Storage;
	btn: FakeButton;
}> {
	const html = await renderSoundToggle();
	const scriptBody = extractInlineScript(html);

	const storage = makeFakeStorage();
	if (opts.soundOn) storage.setItem("utofme:sound", "on");

	const btn = makeFakeButton();

	// Minimal document stub: querySelector returns the fake button when the
	// IIFE queries `[data-sound-toggle]`. addEventListener is a no-op because
	// the pointerover / keydown listeners are exercised at a higher level (e2e).
	const fakeDocument = {
		querySelector(sel: string) {
			return sel === "[data-sound-toggle]" ? btn : null;
		},
		addEventListener(_: string, __: unknown) {
			/* no-op in unit tests */
		},
	};

	// Minimal window stub: only exposes the globals the IIFE actually reads.
	const fakeWindow = {
		AudioContext: audioCtxCtor,
		webkitAudioContext: undefined as undefined,
		addEventListener(_: string, __: unknown, ___?: unknown) {
			/* no-op — keydown listener exercised in e2e */
		},
	};

	// Audio canPlayType → empty string (mp3 fallback path)
	const FakeAudio = class {
		canPlayType(_mime: string) {
			return "";
		}
	};

	const fakeFetch = vi.fn().mockResolvedValue({
		arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
	});

	// Execute the IIFE with explicit parameter bindings so it reads from our
	// controlled fakes rather than any global scope.
	// Function constructor is intentional here: we need to inject the sandboxed
	// globals as parameters without polluting the test's own global scope.
	const fn = new Function(
		"window",
		"document",
		"localStorage",
		"AudioContext",
		"fetch",
		"Audio",
		scriptBody,
	);

	fn(fakeWindow, fakeDocument, storage, audioCtxCtor, fakeFetch, FakeAudio);

	return { storage, btn };
}

describe("SoundToggle inline script", () => {
	it("toggling persists to localStorage", async () => {
		const { storage, btn } = await runInlineScript();

		btn.click();

		expect(storage.getItem("utofme:sound")).toBe("on");
	});

	it("aria-pressed flips to true on first click", async () => {
		const { btn } = await runInlineScript();

		btn.click();

		expect(btn.getAttribute("aria-pressed")).toBe("true");
	});

	it("AudioContext is not created until first opt-in", async () => {
		audioCtxCtor.mockClear();
		const { btn } = await runInlineScript();

		// Before click: AudioContext ctor must not have been called
		expect(audioCtxCtor).not.toHaveBeenCalled();

		// After click (opt-in): ctor called exactly once
		btn.click();

		expect(audioCtxCtor).toHaveBeenCalledTimes(1);
	});

	it("subsequent toggle off does not destroy AudioContext", async () => {
		audioCtxCtor.mockClear();
		const { btn } = await runInlineScript();

		// First click: opt in → context created
		btn.click();
		expect(audioCtxCtor).toHaveBeenCalledTimes(1);

		// Second click: opt out → context NOT re-created and NOT closed
		btn.click();

		// Still exactly one construction (context is reused, not recreated)
		expect(audioCtxCtor).toHaveBeenCalledTimes(1);
		// resume() should NOT have been called.
		// The script doesn't call close() — if it did, the mock would throw since
		// mockAudioCtxInstance has no close() method.
		expect(mockAudioCtxInstance.resume).not.toHaveBeenCalled();
	});
});
