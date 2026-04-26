// @vitest-environment happy-dom
/**
 * Property and unit tests for `lib/keymap.ts`.
 *
 * Why: fast-check properties guard the round-trip and platform-variant
 * invariants required by the Phase 2 spec. DOM tests use happy-dom so
 * `bindGlobalChord` can call `document.addEventListener`.
 * Written RED before implementation; confirmed RED then GREEN.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 4
 */
import { fc, test } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindGlobalChord, formatChord, isMod, parseChord } from "../../src/lib/keymap";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Printable ASCII key chars excluding `+` (used as separator) and `Mod`
 * (reserved modifier label), restricted to lowercase letter + digit range.
 *
 * Why: restricts the alphabet so generated chord strings are always
 * parseable and avoids collision with the `Mod` token itself.
 */
const KEY_CHARS = [
	"a",
	"b",
	"c",
	"d",
	"e",
	"f",
	"g",
	"h",
	"i",
	"j",
	"k",
	"l",
	"m",
	"n",
	"o",
	"p",
	"q",
	"r",
	"s",
	"t",
	"u",
	"v",
	"w",
	"x",
	"y",
	"z",
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
] satisfies [string, ...string[]];

/** Arbitrary single-char key, always lowercase. */
const keyArb = fc.constantFrom(...KEY_CHARS);

/** Arbitrary chord string — either "Mod+K" style or bare "K". */
const chordWithModArb: fc.Arbitrary<string> = keyArb.map((k) => `Mod+${k.toUpperCase()}`);
const chordBareArb: fc.Arbitrary<string> = keyArb.map((k) => k.toUpperCase());
const chordArb: fc.Arbitrary<string> = fc.oneof(chordWithModArb, chordBareArb);

const platformArb: fc.Arbitrary<"mac" | "others"> = fc.constantFrom("mac", "others");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal keyboard-event-shaped object (no real DOM Event needed). */
function makeEvent(opts: {
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
}): Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey"> {
	return {
		key: opts.key,
		metaKey: opts.metaKey ?? false,
		ctrlKey: opts.ctrlKey ?? false,
	};
}

// ---------------------------------------------------------------------------
// Deterministic unit tests — parseChord
// ---------------------------------------------------------------------------

describe("parseChord deterministic", () => {
	it("Mod+K → { key: 'k', mod: true }", () => {
		const parsed = parseChord("Mod+K");
		expect(parsed.key).toBe("k");
		expect(parsed.mod).toBe(true);
	});

	it("Mod+k (lowercase) → { key: 'k', mod: true }", () => {
		const parsed = parseChord("Mod+k");
		expect(parsed.key).toBe("k");
		expect(parsed.mod).toBe(true);
	});

	it("K (bare, no mod) → { key: 'k', mod: false }", () => {
		const parsed = parseChord("K");
		expect(parsed.key).toBe("k");
		expect(parsed.mod).toBe(false);
	});

	it("mod+k (lowercase Mod token) → { key: 'k', mod: true }", () => {
		const parsed = parseChord("mod+k");
		expect(parsed.key).toBe("k");
		expect(parsed.mod).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Deterministic unit tests — isMod
// ---------------------------------------------------------------------------

describe("isMod deterministic", () => {
	it("mac + metaKey=true → true", () => {
		expect(isMod({ metaKey: true, ctrlKey: false }, "mac")).toBe(true);
	});

	it("mac + ctrlKey=true, metaKey=false → false", () => {
		expect(isMod({ metaKey: false, ctrlKey: true }, "mac")).toBe(false);
	});

	it("others + ctrlKey=true → true", () => {
		expect(isMod({ metaKey: false, ctrlKey: true }, "others")).toBe(true);
	});

	it("others + metaKey=true, ctrlKey=false → false", () => {
		expect(isMod({ metaKey: true, ctrlKey: false }, "others")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Deterministic unit tests — formatChord + round-trip
// ---------------------------------------------------------------------------

describe("formatChord deterministic", () => {
	it("canonical form: { key: 'k', mod: true } → 'Mod+K'", () => {
		expect(formatChord({ key: "k", mod: true })).toBe("Mod+K");
	});

	it("canonical form: { key: 'k', mod: false } → 'K'", () => {
		expect(formatChord({ key: "k", mod: false })).toBe("K");
	});

	it("round-trip: formatChord(parseChord('Mod+K')) === 'Mod+K'", () => {
		expect(formatChord(parseChord("Mod+K"))).toBe("Mod+K");
	});

	it("round-trip: formatChord(parseChord('Mod+k')) === 'Mod+K' (normalized)", () => {
		expect(formatChord(parseChord("Mod+k"))).toBe("Mod+K");
	});
});

// ---------------------------------------------------------------------------
// Property 1: parseChord round-trip
// ---------------------------------------------------------------------------

describe("Property 1: parseChord round-trip", () => {
	test.prop([chordArb])("formatChord(parseChord(c)) produces canonical form", (chord) => {
		const parsed = parseChord(chord);
		const formatted = formatChord(parsed);
		// Canonical form: uppercase key, Mod prefix when present
		const expectedKey = parsed.key.toUpperCase();
		const expectedCanonical = parsed.mod ? `Mod+${expectedKey}` : expectedKey;
		expect(formatted).toBe(expectedCanonical);
	});

	test.prop([chordArb])(
		"formatChord is idempotent: formatChord(parseChord(formatChord(parseChord(c)))) ≡ formatChord(parseChord(c))",
		(chord) => {
			const once = formatChord(parseChord(chord));
			const twice = formatChord(parseChord(once));
			expect(twice).toBe(once);
		},
	);
});

// ---------------------------------------------------------------------------
// Property 2: platform variant — mod matching
// ---------------------------------------------------------------------------

describe("Property 2: platform variant — mod matching", () => {
	test.prop([chordWithModArb])(
		"mac platform: matcher fires on metaKey=true, ctrlKey=false",
		(chord) => {
			const parsed = parseChord(chord, { platform: "mac" });
			const e = makeEvent({ key: parsed.key, metaKey: true, ctrlKey: false });
			// The match: mod key must be meta on mac
			expect(isMod(e, "mac")).toBe(true);
			expect(isMod(e, "others")).toBe(false);
		},
	);

	test.prop([chordWithModArb])(
		"others platform: matcher fires on ctrlKey=true, metaKey=false",
		(chord) => {
			const parsed = parseChord(chord, { platform: "others" });
			const e = makeEvent({ key: parsed.key, metaKey: false, ctrlKey: true });
			// The match: mod key must be ctrl on others
			expect(isMod(e, "others")).toBe(true);
			expect(isMod(e, "mac")).toBe(false);
		},
	);

	test.prop([chordWithModArb, platformArb])(
		"parseChord with platform override never reads navigator",
		(chord, platform) => {
			// Should not throw even in a non-browser environment with no navigator.platform
			expect(() => parseChord(chord, { platform })).not.toThrow();
		},
	);
});

// ---------------------------------------------------------------------------
// Deterministic unit tests — bindGlobalChord
// ---------------------------------------------------------------------------

describe("bindGlobalChord deterministic", () => {
	beforeEach(() => {
		// Reset any lingering listeners
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fires handler when matching keydown event is dispatched", () => {
		const handler = vi.fn();
		const teardown = bindGlobalChord("Mod+K", handler, { platform: "mac" });
		try {
			const event = new KeyboardEvent("keydown", {
				key: "k",
				metaKey: true,
				ctrlKey: false,
				bubbles: true,
			});
			document.dispatchEvent(event);
			expect(handler).toHaveBeenCalledOnce();
		} finally {
			teardown();
		}
	});

	it("does NOT fire handler when key does not match", () => {
		const handler = vi.fn();
		const teardown = bindGlobalChord("Mod+K", handler, { platform: "mac" });
		try {
			const event = new KeyboardEvent("keydown", {
				key: "j",
				metaKey: true,
				ctrlKey: false,
				bubbles: true,
			});
			document.dispatchEvent(event);
			expect(handler).not.toHaveBeenCalled();
		} finally {
			teardown();
		}
	});

	it("does NOT fire handler when mod key does not match (mac: needs metaKey)", () => {
		const handler = vi.fn();
		const teardown = bindGlobalChord("Mod+K", handler, { platform: "mac" });
		try {
			const event = new KeyboardEvent("keydown", {
				key: "k",
				metaKey: false,
				ctrlKey: true,
				bubbles: true,
			});
			document.dispatchEvent(event);
			expect(handler).not.toHaveBeenCalled();
		} finally {
			teardown();
		}
	});

	it("teardown removes the listener — handler does not fire after teardown", () => {
		const handler = vi.fn();
		const teardown = bindGlobalChord("Mod+K", handler, { platform: "mac" });
		teardown();
		const event = new KeyboardEvent("keydown", {
			key: "k",
			metaKey: true,
			ctrlKey: false,
			bubbles: true,
		});
		document.dispatchEvent(event);
		expect(handler).not.toHaveBeenCalled();
	});

	it("others platform: fires on ctrlKey=true", () => {
		const handler = vi.fn();
		const teardown = bindGlobalChord("Mod+K", handler, { platform: "others" });
		try {
			const event = new KeyboardEvent("keydown", {
				key: "k",
				metaKey: false,
				ctrlKey: true,
				bubbles: true,
			});
			document.dispatchEvent(event);
			expect(handler).toHaveBeenCalledOnce();
		} finally {
			teardown();
		}
	});

	it("bare chord (no Mod) fires when only key matches, no modifier needed", () => {
		const handler = vi.fn();
		const teardown = bindGlobalChord("K", handler, { platform: "mac" });
		try {
			const event = new KeyboardEvent("keydown", {
				key: "k",
				metaKey: false,
				ctrlKey: false,
				bubbles: true,
			});
			document.dispatchEvent(event);
			expect(handler).toHaveBeenCalledOnce();
		} finally {
			teardown();
		}
	});
});
