/**
 * AC1.9: the home/out switch and who gets a pet by default.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (8, 10)
 */
import { describe, expect, it } from "vitest";
import { petWanted } from "../../src/components/pet/boot";
import { type FlagStorage, resolveSwitch, writeSwitch } from "../../src/lib/flags";

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
const broken: FlagStorage = {
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

describe("resolveSwitch", () => {
	it("is default with no param and nothing stored", () => {
		expect(resolveSwitch("pet", "", memoryStorage())).toBe("default");
		expect(resolveSwitch("pet", "?other=1", null)).toBe("default");
	});

	it("?pet=0 switches off and persists 0", () => {
		const s = memoryStorage({ "utofme:pet": "1" });
		expect(resolveSwitch("pet", "?pet=0", s)).toBe("off");
		expect(s.data.get("utofme:pet")).toBe("0");
	});

	it("?pet=1 and bare ?pet switch on and persist 1", () => {
		const s = memoryStorage({ "utofme:pet": "0" });
		expect(resolveSwitch("pet", "?pet=1", s)).toBe("on");
		expect(s.data.get("utofme:pet")).toBe("1");
		expect(resolveSwitch("pet", "?x=2&pet", memoryStorage())).toBe("on");
	});

	it("without a param the stored answer decides", () => {
		expect(resolveSwitch("pet", "", memoryStorage({ "utofme:pet": "0" }))).toBe("off");
		expect(resolveSwitch("pet", "", memoryStorage({ "utofme:pet": "1" }))).toBe("on");
		expect(resolveSwitch("pet", "", memoryStorage({ "utofme:pet": "maybe" }))).toBe("default");
	});

	it("storage that throws does not throw; the param still applies", () => {
		expect(resolveSwitch("pet", "", broken)).toBe("default");
		expect(resolveSwitch("pet", "?pet=0", broken)).toBe("off");
		expect(resolveSwitch("pet", "?pet=1", broken)).toBe("on");
		expect(() => writeSwitch("pet", true, broken)).not.toThrow();
	});

	it("writeSwitch stores what resolveSwitch reads", () => {
		const s = memoryStorage();
		writeSwitch("pet", false, s);
		expect(resolveSwitch("pet", "", s)).toBe("off");
		writeSwitch("pet", true, s);
		expect(resolveSwitch("pet", "", s)).toBe("on");
	});
});

describe("petWanted", () => {
	it("people get the pet unless they sent it home", () => {
		expect(petWanted("default", false)).toBe(true);
		expect(petWanted("on", false)).toBe(true);
		expect(petWanted("off", false)).toBe(false);
	});

	it("automated browsers get it only when asked", () => {
		expect(petWanted("default", true)).toBe(false);
		expect(petWanted("on", true)).toBe(true);
		expect(petWanted("off", true)).toBe(false);
	});
});
