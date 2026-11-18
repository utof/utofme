/**
 * AC1.6: picking letters out of page text.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	BITE_MAX,
	collected,
	isVowelSlot,
	letterSlot,
	nibbleIndex,
	pickLetters,
} from "../../src/lib/pet/letters";

describe("pickLetters", () => {
	it("takes the first eight letters, in order, as written", () => {
		expect(pickLetters("Stronger, Not More Human")).toEqual([..."Stronger"]);
		expect(pickLetters("28×28 board!")).toEqual([..."board"]);
		expect(pickLetters("  ")).toEqual([]);
		expect(pickLetters("Привет, мир")).toEqual([..."Приветми"]);
		expect(pickLetters("abc", 2)).toEqual(["a", "b"]);
	});

	test.prop([fc.string({ unit: "grapheme", maxLength: 80 })])(
		"returns at most a bite of letters that occur in the text, in order",
		(text) => {
			const copy = `${text}`;
			const letters = pickLetters(text);
			expect(text).toBe(copy);
			expect(letters.length).toBeLessThanOrEqual(BITE_MAX);
			let from = 0;
			for (const letter of letters) {
				expect(letter).toMatch(/^\p{L}$/u);
				const at = text.indexOf(letter, from);
				expect(at).toBeGreaterThanOrEqual(from);
				from = at + letter.length;
			}
		},
	);
});

describe("letterSlot", () => {
	it("maps a–z in either case to 0 … 25 and everything else to −1", () => {
		expect(letterSlot("a")).toBe(0);
		expect(letterSlot("Z")).toBe(25);
		expect(letterSlot("é")).toBe(-1);
		expect(letterSlot("ж")).toBe(-1);
		expect(letterSlot("ab")).toBe(-1);
		expect(letterSlot("")).toBe(-1);
	});

	it("knows the five vowels", () => {
		const vowels = [..."abcdefghijklmnopqrstuvwxyz"].filter((ch) => isVowelSlot(letterSlot(ch)));
		expect(vowels.join("")).toBe("aeiou");
	});
});

describe("collected / nibbleIndex", () => {
	const none = new Array<number>(26).fill(0);
	const all = new Array<number>(26).fill(1);

	it("counts letters eaten at least once", () => {
		expect(collected(none)).toBe(0);
		expect(collected(all)).toBe(26);
		expect(collected(none.map((_, i) => (i % 2 ? 3 : 0)))).toBe(13);
	});

	it("prefers the first letter not collected yet", () => {
		expect(nibbleIndex("utofme", none, 0)).toBe(0);
		const hasU = none.map((_, i) => (i === 20 ? 1 : 0));
		expect(nibbleIndex("utofme", hasU, 0)).toBe(1);
		expect(nibbleIndex("  28 Boards", none, 5)).toBe(5);
	});

	it("takes the letters in turn once all are collected, and −1 without letters", () => {
		expect(nibbleIndex("a-b c", all, 0)).toBe(0);
		expect(nibbleIndex("a-b c", all, 1)).toBe(2);
		expect(nibbleIndex("a-b c", all, 2)).toBe(4);
		expect(nibbleIndex("a-b c", all, 3)).toBe(0);
		expect(nibbleIndex("2026 — 11", none, 0)).toBe(-1);
		expect(nibbleIndex("", none, 0)).toBe(-1);
	});

	test.prop([
		fc.string({ maxLength: 40 }),
		fc.array(fc.nat(3), { minLength: 26, maxLength: 26 }),
		fc.nat(),
	])("always points at a letter of the title, or −1", (title, alphabet, turn) => {
		const index = nibbleIndex(title, alphabet, turn);
		if (index === -1) expect(pickLetters(title, 1)).toEqual([]);
		else expect(title.charAt(index)).toMatch(/\p{L}/u);
	});
});
