/**
 * fast-check arbitraries shared by the pet's unit tests.
 *
 * @see packages/specs/specs/11-pet.md § "Deliverables and acceptance" (P11-1)
 */
import fc from "fast-check";
import type { PetState } from "../../src/lib/pet/schema";
import type { PetAction } from "../../src/lib/pet/state";

const count = fc.integer({ min: 0, max: 1_000_000_000 });
const stamp = fc.integer({ min: 0, max: 4_000_000_000_000 });
const amount = fc.double({ min: 0, max: 1_000_000, noNaN: true });
const unit = fc.double({ min: 0, max: 1, noNaN: true });

/** Any state the schema accepts. */
export const stateArb: fc.Arbitrary<PetState> = fc.record({
	v: fc.constant(1 as const),
	rev: count,
	name: fc.string({ minLength: 1, maxLength: 16 }),
	seed: fc.integer({ min: 0, max: 2147483647 }),
	born: stamp,
	lastSeen: stamp,
	pats: count,
	meals: count,
	letters: count,
	alphabet: fc.array(count, { minLength: 26, maxLength: 26 }),
	other: count,
	diet: fc.record({ vowels: amount, consonants: amount }),
	belly: unit,
	bellyAt: stamp,
	days: fc.integer({ min: 1, max: 1_000_000 }),
	lastDay: fc.integer({ min: -1_000_000, max: 10_000_000 }),
	dock: fc.record({ side: fc.constantFrom("left" as const, "right" as const), y: unit }),
});

const anyNumber = fc.oneof(
	fc.double(),
	fc.integer(),
	fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0),
);

/** Any action, hostile values included (NaN, negatives, long strings). */
export const actionArb: fc.Arbitrary<PetAction> = fc.oneof(
	fc.constant<PetAction>({ type: "touch" }),
	anyNumber.map((n): PetAction => ({ type: "pat", count: n })),
	fc
		.array(fc.string({ maxLength: 3 }), { maxLength: 40 })
		.map((letters): PetAction => ({ type: "feed", letters })),
	fc.string({ maxLength: 60 }).map((name): PetAction => ({ type: "rename", name })),
	fc
		.tuple(fc.constantFrom("left" as const, "right" as const), anyNumber)
		.map(([side, y]): PetAction => ({ type: "dock", side, y })),
);

/** A timestamp, sane or not. */
export const timeArb: fc.Arbitrary<number> = fc.oneof(
	fc.integer({ min: 0, max: 4_000_000_000_000 }),
	anyNumber,
);
