import { describe, expect, it } from "vitest";
import { type FlagStorage, resolveFlag } from "../../src/lib/flags.ts";

function memoryStorage(initial: Record<string, string> = {}): FlagStorage & {
	data: Map<string, string>;
} {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => {
			data.set(k, v);
		},
		removeItem: (k) => {
			data.delete(k);
		},
	};
}

describe("resolveFlag", () => {
	it("is off with no param and nothing stored", () => {
		expect(resolveFlag("dither", "", memoryStorage())).toBe(false);
	});

	it("?dither turns it on and persists", () => {
		const s = memoryStorage();
		expect(resolveFlag("dither", "?dither", s)).toBe(true);
		expect(s.data.get("utofme:dither")).toBe("1");
	});

	it("?dither=1 turns it on and persists", () => {
		const s = memoryStorage();
		expect(resolveFlag("dither", "?dither=1", s)).toBe(true);
		expect(s.data.get("utofme:dither")).toBe("1");
	});

	it("persisted flag stays on without the param", () => {
		expect(resolveFlag("dither", "", memoryStorage({ "utofme:dither": "1" }))).toBe(true);
	});

	it("?dither=0 turns it off and clears the persisted value", () => {
		const s = memoryStorage({ "utofme:dither": "1" });
		expect(resolveFlag("dither", "?dither=0", s)).toBe(false);
		expect(s.data.has("utofme:dither")).toBe(false);
		expect(resolveFlag("dither", "", s)).toBe(false);
	});

	it("ignores unrelated params and other flags", () => {
		const s = memoryStorage({ "utofme:other": "1" });
		expect(resolveFlag("dither", "?type=code&other=1", s)).toBe(false);
	});

	it("works without storage (param only)", () => {
		expect(resolveFlag("dither", "?dither", null)).toBe(true);
		expect(resolveFlag("dither", "", null)).toBe(false);
	});

	it("survives a throwing storage", () => {
		const throwing: FlagStorage = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
			removeItem: () => {
				throw new Error("blocked");
			},
		};
		expect(resolveFlag("dither", "?dither", throwing)).toBe(true);
		expect(resolveFlag("dither", "?dither=0", throwing)).toBe(false);
		expect(resolveFlag("dither", "", throwing)).toBe(false);
	});
});
