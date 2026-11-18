/**
 * AC1.1: the pet's state schema.
 *
 * @see packages/specs/specs/11-pet.md § "Deliverables and acceptance" (P11-1)
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import {
	dayNumber,
	newPet,
	type PetState,
	PetStateSchema,
	parsePetState,
} from "../../src/lib/pet/schema";
import { stateArb } from "./pet-arbitraries";

/** One field of a valid state pushed out of range. */
const corruptions: readonly ((s: PetState) => unknown)[] = [
	(s) => ({ ...s, v: 2 }),
	(s) => ({ ...s, rev: -1 }),
	(s) => ({ ...s, rev: 1.5 }),
	(s) => ({ ...s, name: "" }),
	(s) => ({ ...s, name: "x".repeat(33) }),
	(s) => ({ ...s, seed: -1 }),
	(s) => ({ ...s, seed: 2147483648 }),
	(s) => ({ ...s, born: -1 }),
	(s) => ({ ...s, lastSeen: Number.NaN }),
	(s) => ({ ...s, pats: -1 }),
	(s) => ({ ...s, meals: "3" }),
	(s) => ({ ...s, letters: Number.POSITIVE_INFINITY }),
	(s) => ({ ...s, alphabet: s.alphabet.slice(1) }),
	(s) => ({ ...s, alphabet: [...s.alphabet.slice(1), -1] }),
	(s) => ({ ...s, other: null }),
	(s) => ({ ...s, diet: { vowels: -1, consonants: 0 } }),
	(s) => ({ ...s, diet: { vowels: 0 } }),
	(s) => ({ ...s, belly: 1.01 }),
	(s) => ({ ...s, belly: -0.01 }),
	(s) => ({ ...s, bellyAt: 9e15 }),
	(s) => ({ ...s, days: 0 }),
	(s) => ({ ...s, lastDay: 0.5 }),
	(s) => ({ ...s, dock: { side: "top", y: 0 } }),
	(s) => ({ ...s, dock: { side: "left", y: 2 } }),
	(s) => ({ ...s, extra: 1 }),
	(s) => ({ ...s, dock: { ...s.dock, extra: 1 } }),
	(s) => {
		const { name: _dropped, ...rest } = s;
		return rest;
	},
];

describe("PetStateSchema", () => {
	test.prop([stateArb])("every generated valid state parses, unchanged", (state) => {
		const result = z.safeParse(PetStateSchema, state);
		expect(result.success).toBe(true);
		expect(parsePetState(state)).toEqual(state);
		expect(z.parse(PetStateSchema, state)).toEqual(state);
	});

	test.prop([stateArb, fc.integer({ min: 0, max: corruptions.length - 1 })])(
		"one field out of range fails safeParse, and parse throws",
		(state, i) => {
			const corrupt = corruptions[i]?.(state);
			expect(z.safeParse(PetStateSchema, corrupt).success).toBe(false);
			expect(parsePetState(corrupt)).toBeNull();
			expect(() => z.parse(PetStateSchema, corrupt)).toThrow();
		},
	);

	test.prop([fc.anything()])("safeParse never throws; parse agrees with it", (value) => {
		const result = z.safeParse(PetStateSchema, value);
		if (result.success) expect(z.parse(PetStateSchema, value)).toEqual(result.data);
		else expect(() => z.parse(PetStateSchema, value)).toThrow();
	});

	it("survives a JSON round trip", () => {
		const state = newPet(1_795_000_000_000, 12345, -180);
		expect(parsePetState(JSON.parse(JSON.stringify(state)))).toEqual(state);
	});
});

describe("newPet", () => {
	test.prop([fc.double(), fc.double(), fc.double()])("is valid for any inputs", (now, seed, tz) => {
		expect(parsePetState(newPet(now, seed, tz))).not.toBeNull();
	});

	it("starts empty, on the right, at the bottom", () => {
		const pet = newPet(1000, 7);
		expect(pet).toMatchObject({ pats: 0, meals: 0, letters: 0, belly: 0, days: 1, born: 1000 });
		expect(pet.dock).toEqual({ side: "right", y: 1 });
		expect(pet.alphabet).toHaveLength(26);
	});
});

describe("dayNumber", () => {
	it("counts local days: the offset moves midnight", () => {
		const utcMidnight = 20_000 * 86_400_000;
		expect(dayNumber(utcMidnight, 0)).toBe(20_000);
		expect(dayNumber(utcMidnight - 1, 0)).toBe(19_999);
		// UTC+3 (offset −180): 21:00 UTC is already the next local day.
		expect(dayNumber(utcMidnight - 3 * 3_600_000, -180)).toBe(20_000);
	});
});
