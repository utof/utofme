/**
 * AC1.2 – AC1.4: the reducer, time and the belly.
 *
 * @see packages/specs/specs/11-pet.md § "Deliverables and acceptance" (P11-1)
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { newPet, parsePetState } from "../../src/lib/pet/schema";
import {
	BELLY_LETTERS,
	bellyNow,
	biteSize,
	bond,
	cleanName,
	DIGEST_MS,
	daysAway,
	favourite,
	growth,
	reduce,
	warmth,
} from "../../src/lib/pet/state";
import { actionArb, stateArb, timeArb } from "./pet-arbitraries";

const T0 = 1_795_000_000_000;
const DAY = 86_400_000;

describe("reduce: properties", () => {
	test.prop([stateArb, fc.array(fc.tuple(actionArb, timeArb, fc.double()), { maxLength: 12 })])(
		"any actions at any times leave a valid state: every stat in range, nothing NaN",
		(start, steps) => {
			let state = start;
			for (const [action, now, tz] of steps) {
				state = reduce(state, action, now, tz);
				expect(parsePetState(state)).not.toBeNull();
			}
		},
	);

	test.prop([stateArb, fc.array(fc.tuple(actionArb, timeArb), { maxLength: 12 })])(
		"time never goes backwards and no counter ever decreases",
		(start, steps) => {
			let state = start;
			for (const [action, now] of steps) {
				const next = reduce(state, action, now);
				expect(next.lastSeen).toBeGreaterThanOrEqual(state.lastSeen);
				expect(next.rev).toBeGreaterThanOrEqual(state.rev);
				expect(next.pats).toBeGreaterThanOrEqual(state.pats);
				expect(next.meals).toBeGreaterThanOrEqual(state.meals);
				expect(next.letters).toBeGreaterThanOrEqual(state.letters);
				expect(next.other).toBeGreaterThanOrEqual(state.other);
				expect(next.days).toBeGreaterThanOrEqual(state.days);
				expect(next.lastDay).toBeGreaterThanOrEqual(state.lastDay);
				expect(bond(next)).toBeGreaterThanOrEqual(bond(state));
				next.alphabet.forEach((n, i) => {
					expect(n).toBeGreaterThanOrEqual(state.alphabet[i] ?? 0);
				});
				state = next;
			}
		},
	);

	test.prop([stateArb, fc.integer({ min: 0, max: 10 * 366 * DAY })])(
		"absence costs nothing: after any gap only the belly, the clock and the day count differ",
		(state, gap) => {
			const back = reduce(state, { type: "touch" }, state.lastSeen + gap);
			expect({ ...back, rev: 0, lastSeen: 0, belly: 0, bellyAt: 0, days: 0, lastDay: 0 }).toEqual({
				...state,
				rev: 0,
				lastSeen: 0,
				belly: 0,
				bellyAt: 0,
				days: 0,
				lastDay: 0,
			});
			expect(back.days).toBeGreaterThanOrEqual(state.days);
			expect(back.days - state.days).toBeLessThanOrEqual(1);
			expect(bond(back)).toBe(bond(state));
			expect(growth(back)).toBe(growth(state));
			expect(back.belly).toBeGreaterThanOrEqual(0);
		},
	);

	test.prop([stateArb, fc.array(fc.string({ maxLength: 2 }), { maxLength: 30 }), timeArb])(
		"a bite never overfills and eats exactly biteSize letters",
		(state, letters, now) => {
			const at = Math.max(state.lastSeen, Number.isFinite(now) ? now : state.lastSeen);
			const expected = biteSize(reduce(state, { type: "touch" }, at), letters, at);
			const fed = reduce(state, { type: "feed", letters }, now);
			expect(fed.belly).toBeLessThanOrEqual(1);
			expect(fed.letters - state.letters).toBe(expected);
			expect(expected).toBeLessThanOrEqual(8);
			expect(fed.meals - state.meals).toBe(expected > 0 ? 1 : 0);
		},
	);
});

describe("reduce: examples", () => {
	const pet = newPet(T0, 4);

	it("a clock set back counts as no time passed", () => {
		const fed = reduce(pet, { type: "feed", letters: [..."abcdefgh"] }, T0);
		const earlier = reduce(fed, { type: "touch" }, T0 - 5 * DAY);
		expect(earlier.lastSeen).toBe(T0);
		expect(earlier.belly).toBe(fed.belly);
		expect(earlier.days).toBe(1);
	});

	it("pats add up; a negative or broken count adds nothing", () => {
		const a = reduce(pet, { type: "pat", count: 3 }, T0);
		const b = reduce(a, { type: "pat", count: -4 }, T0);
		const c = reduce(b, { type: "pat", count: Number.NaN }, T0);
		expect([a.pats, b.pats, c.pats]).toEqual([3, 3, 3]);
	});

	it("feeding fills the alphabet, the other bucket and the diet", () => {
		const fed = reduce(pet, { type: "feed", letters: ["N", "i", "b", "ж"] }, T0);
		expect(fed.alphabet[13]).toBe(1);
		expect(fed.alphabet[8]).toBe(1);
		expect(fed.alphabet[1]).toBe(1);
		expect(fed.other).toBe(1);
		expect(fed.letters).toBe(4);
		expect(fed.meals).toBe(1);
		expect(fed.diet).toEqual({ vowels: 1, consonants: 2 });
		expect(fed.belly).toBeCloseTo(4 / BELLY_LETTERS);
	});

	it("a new day counts once; the same day does not", () => {
		const later = reduce(pet, { type: "touch" }, T0 + 1000);
		const tomorrow = reduce(later, { type: "pat", count: 1 }, T0 + DAY);
		const weekOn = reduce(tomorrow, { type: "touch" }, T0 + 8 * DAY);
		expect([later.days, tomorrow.days, weekOn.days]).toEqual([1, 2, 3]);
	});

	it("rename cleans the name and ignores an empty one", () => {
		expect(reduce(pet, { type: "rename", name: "  Zorp \n the  3rd " }, T0).name).toBe(
			"Zorp the 3rd",
		);
		expect(reduce(pet, { type: "rename", name: " \u0000 " }, T0).name).toBe("Nib");
		expect(Array.from(cleanName("🪐".repeat(40)))).toHaveLength(16);
	});

	it("dock keeps the side and clamps the height", () => {
		expect(reduce(pet, { type: "dock", side: "left", y: 7 }, T0).dock).toEqual({
			side: "left",
			y: 1,
		});
		expect(reduce(pet, { type: "dock", side: "right", y: -1 }, T0).dock).toEqual({
			side: "right",
			y: 0,
		});
	});
});

describe("belly (AC1.4)", () => {
	const full = { ...newPet(T0, 1), belly: 1, bellyAt: T0 };

	it("goes from full to empty in exactly six hours", () => {
		expect(DIGEST_MS).toBe(6 * 3_600_000);
		expect(bellyNow(full, T0)).toBe(1);
		expect(bellyNow(full, T0 + DIGEST_MS / 2)).toBeCloseTo(0.5);
		expect(bellyNow(full, T0 + DIGEST_MS - 60_000)).toBeGreaterThan(0);
		expect(bellyNow(full, T0 + DIGEST_MS)).toBe(0);
		expect(bellyNow(full, T0 + 400 * DAY)).toBe(0);
	});

	it("a full belly refuses; fifteen minutes later one letter fits", () => {
		expect(biteSize(full, [..."abc"], T0)).toBe(0);
		expect(reduce(full, { type: "feed", letters: [..."abc"] }, T0).meals).toBe(0);
		expect(biteSize(full, [..."abc"], T0 + DIGEST_MS / BELLY_LETTERS)).toBe(1);
	});

	it("three bites of eight fill an empty belly", () => {
		let pet = newPet(T0, 1);
		const word = [..."abcdefghij"];
		for (let i = 0; i < 3; i++) pet = reduce(pet, { type: "feed", letters: word }, T0);
		expect(pet.letters).toBe(24);
		expect(pet.belly).toBeCloseTo(1);
		expect(biteSize(pet, word, T0)).toBe(0);
	});
});

describe("derived values", () => {
	test.prop([stateArb])("bond, growth and warmth stay in range", (state) => {
		expect(bond(state)).toBeGreaterThanOrEqual(0);
		expect(bond(state)).toBeLessThanOrEqual(1);
		expect(growth(state)).toBeGreaterThanOrEqual(0.84);
		expect(growth(state)).toBeLessThanOrEqual(1);
		expect(warmth(state)).toBeGreaterThanOrEqual(0);
		expect(warmth(state)).toBeLessThanOrEqual(1);
		expect(favourite(state)).toMatch(/^[a-z]$/);
	});

	it("warmth starts at prose level and one word only nudges it", () => {
		const pet = newPet(T0, 1);
		expect(warmth(pet)).toBeCloseTo(0.4);
		const fed = reduce(pet, { type: "feed", letters: [..."rhythm"] }, T0);
		expect(warmth(fed)).toBeLessThan(0.4);
		expect(warmth(fed)).toBeGreaterThan(0.2);
	});

	it("daysAway counts whole days and never goes negative", () => {
		const pet = newPet(T0, 1);
		expect(daysAway(pet, T0 + 3 * DAY + 5)).toBe(3);
		expect(daysAway(pet, T0 - 9 * DAY)).toBe(0);
	});
});
