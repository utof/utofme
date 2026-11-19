/**
 * The pet's persisted state: one versioned, strictly validated object.
 *
 * Why: the state comes back from the visitor's browser (or, later, a server), so
 * it is parsed on every load; a blob that does not match is a new pet, never a
 * crash. `zod/mini` keeps the validator at a few KB in the lazy pet chunk.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 * @see https://zod.dev/packages/mini
 */
import * as z from "zod/mini";

/**
 * Version written into every saved state.
 *
 * Why: the store migrates older versions up to this one and never overwrites a newer one.
 *
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 */
export const STATE_VERSION = 1;

/**
 * Longest pet name, in code points.
 *
 * Why: the name is printed in a 96 px wide label and in aria-labels.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export const NAME_MAX = 16;

const count = z.int().check(z.minimum(0));
const stamp = z.number().check(z.minimum(0), z.maximum(8.64e15));
const amount = z.number().check(z.minimum(0), z.maximum(1e9));
const unit = z.number().check(z.minimum(0), z.maximum(1));

/**
 * Schema of the saved state, version {@link STATE_VERSION}. Unknown keys are rejected.
 *
 * Why: strict, so a blob written by different code is recognised as foreign.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 */
export const PetStateSchema = z.strictObject({
	v: z.literal(STATE_VERSION),
	/** Bumps on every change; the higher one wins between tabs. */
	rev: count,
	name: z.string().check(z.minLength(1), z.maxLength(NAME_MAX * 2)),
	/** Fixes the favourite letter. */
	seed: z.int().check(z.minimum(0), z.maximum(2147483647)),
	/** First touch, ms since the epoch. */
	born: stamp,
	/** Last interaction; never decreases. */
	lastSeen: stamp,
	pats: count,
	meals: count,
	/** Total letters eaten. */
	letters: count,
	/** Letters eaten, a … z. */
	alphabet: z.array(count).check(z.length(26)),
	/** Letters eaten outside a–z. */
	other: count,
	/** Decaying counts of recent vowels and consonants: the body colour. */
	diet: z.strictObject({ vowels: amount, consonants: amount }),
	/** Fullness 0 … 1 as of `bellyAt`. */
	belly: unit,
	bellyAt: stamp,
	/** Days with at least one interaction. */
	days: z.int().check(z.minimum(1)),
	/** Local day number of the last interaction. */
	lastDay: z.int(),
	dock: z.strictObject({ side: z.enum(["left", "right"]), y: unit }),
});

/**
 * The pet's saved state.
 *
 * Why: inferred from the schema so the two cannot drift.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 */
export type PetState = Readonly<z.infer<typeof PetStateSchema>>;

/**
 * Validates an unknown value as a {@link PetState}; `null` when it is not one.
 *
 * Why: the one place the rest of the code turns untrusted data into state.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 */
export function parsePetState(raw: unknown): PetState | null {
	const result = z.safeParse(PetStateSchema, raw);
	return result.success ? result.data : null;
}

/**
 * Local day number of a timestamp: days since the epoch in the visitor's zone.
 *
 * Why: "days together" counts calendar days where the visitor is, and the zone
 * offset is passed in so the function stays pure. `tzOffsetMinutes` is
 * `Date.prototype.getTimezoneOffset()` (minutes behind UTC).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
 */
export function dayNumber(now: number, tzOffsetMinutes: number): number {
	return Math.floor((now - tzOffsetMinutes * 60_000) / 86_400_000);
}

/**
 * A pet at its first touch.
 *
 * Why: nothing is stored before the visitor touches the pet, so "new" is built
 * here, from the moment and a random seed.
 *
 * @see packages/specs/specs/11-pet.md § "Privacy"
 */
export function newPet(now: number, seed: number, tzOffsetMinutes = 0): PetState {
	const at = Number.isFinite(now) ? Math.min(8.64e15, Math.max(0, now)) : 0;
	const day = dayNumber(at, tzOffsetMinutes);
	return {
		v: STATE_VERSION,
		rev: 0,
		name: "Nib",
		seed: Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 2147483648 : 0,
		born: at,
		lastSeen: at,
		pats: 0,
		meals: 0,
		letters: 0,
		alphabet: new Array<number>(26).fill(0),
		other: 0,
		diet: { vowels: 0, consonants: 0 },
		belly: 0,
		bellyAt: at,
		days: 1,
		lastDay: Number.isSafeInteger(day) ? day : dayNumber(at, 0),
		dock: { side: "right", y: 1 },
	};
}
