/**
 * The pet's rules as a pure reducer: `reduce(state, action, now) → state`.
 *
 * Why: time is an argument and there is no DOM, so every rule ("nothing falls
 * because you were away", "time never runs backwards", "a bite never overfills")
 * is a property test. The view only dispatches actions and draws the result.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 * @see packages/specs/adrs/0062-site-pet-design-rules.md
 */
import { BITE_MAX, isVowelSlot, letterSlot } from "./letters";
import { dayNumber, NAME_MAX, type PetState } from "./schema";

/**
 * Letters that fill an empty belly.
 *
 * Why: three bites of {@link BITE_MAX}; then the pet refuses, which stops feeding from being a spam loop.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export const BELLY_LETTERS = 24;

/**
 * Milliseconds from a full belly to an empty one (15 minutes per letter).
 *
 * Why: short enough that a reader can feed it again within one visit.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export const DIGEST_MS = 6 * 60 * 60 * 1000;

/** Share of the old diet kept at each bite: the colour follows recent meals. */
const DIET_KEEP = 0.85;
const COUNT_MAX = Number.MAX_SAFE_INTEGER;
/** The latest instant a `Date` can hold; timestamps are clamped to it. */
const TIME_MAX = 8.64e15;

/**
 * Something the visitor did to the pet.
 *
 * Why: a closed set, so adding an interaction is adding a member here and a case in {@link reduce}.
 *
 * @see packages/site/src/lib/pet/README.md
 */
export type PetAction =
	| { readonly type: "touch" }
	| { readonly type: "pat"; readonly count: number }
	| { readonly type: "feed"; readonly letters: readonly string[] }
	| { readonly type: "rename"; readonly name: string }
	| { readonly type: "dock"; readonly side: "left" | "right"; readonly y: number };

function clamp01(x: number): number {
	return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function bump(n: number, by: number): number {
	return Math.min(COUNT_MAX, n + Math.max(0, Math.trunc(Number.isFinite(by) ? by : 0)));
}

/**
 * Fullness 0 … 1 at `now`.
 *
 * Why: derived from the stored value and its timestamp, so nothing ticks while
 * the page is closed. A clock set back counts as no time passed.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function bellyNow(state: PetState, now: number): number {
	const elapsed = Math.max(0, now - state.bellyAt);
	return clamp01(state.belly - elapsed / DIGEST_MS);
}

/**
 * How many of `letters` the pet will eat at `now`: at most a bite, at most what fits.
 *
 * Why: the view asks before animating, and {@link reduce} applies the same limit,
 * so the two cannot disagree. 0 means it refuses.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function biteSize(state: PetState, letters: readonly string[], now: number): number {
	const room = Math.floor((1 - bellyNow(state, now)) * BELLY_LETTERS + 1e-6);
	return Math.max(0, Math.min(letters.length, BITE_MAX, room));
}

/**
 * Bond 0 … 1: grows with pats and meals, never falls.
 *
 * Why: derived from the totals (not stored), so absence cannot lower it.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export function bond(state: PetState): number {
	return 1 - Math.exp(-(state.pats + 2 * state.meals) / 60);
}

/**
 * Body scale 0.84 … 1 from the total letters eaten.
 *
 * Why: it visibly grows over the first meals and then stops; never past full size.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export function growth(state: PetState): number {
	return 0.84 + 0.16 * (1 - Math.exp(-state.letters / 120));
}

/**
 * Share of vowels in the recent diet, 0 … 1, smoothed towards 0.4 (ordinary prose); 0.4 before the first meal.
 *
 * Why: the creature maps it onto its colour ramp.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export function warmth(state: PetState): number {
	// Why the 4-in-10 prior: one consonant-heavy word must not flip the colour; it drifts over a few meals.
	return clamp01((state.diet.vowels + 4) / (state.diet.vowels + state.diet.consonants + 10));
}

/**
 * The pet's favourite letter, `"a"` … `"z"`, fixed by its seed.
 *
 * Why: a small thing to discover; the panel hides it until it has been eaten once.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function favourite(state: PetState): string {
	return String.fromCharCode(97 + (state.seed % 26));
}

/**
 * Whole days between the last interaction and `now` (0 when `now` is earlier).
 *
 * Why: a long absence earns a longer greeting, and nothing else.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (5)
 */
export function daysAway(state: PetState, now: number): number {
	return Math.floor(Math.max(0, now - state.lastSeen) / 86_400_000);
}

/**
 * A name as it may be stored: control characters dropped, whitespace collapsed,
 * at most {@link NAME_MAX} code points. Empty when nothing is left.
 *
 * Why: the name is typed by the visitor and printed in labels.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export function cleanName(name: string): string {
	const flat = name.replace(/\p{C}/gu, "").replace(/\s+/g, " ").trim();
	return Array.from(flat).slice(0, NAME_MAX).join("").trim();
}

/**
 * Applies one action at time `now` and returns the next state.
 *
 * Every action counts as an interaction: it settles the belly to `now`, moves
 * `lastSeen` forward (never back) and counts a new day. No branch lowers a counter.
 *
 * Why: the single writer of {@link PetState}.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 */
export function reduce(
	state: PetState,
	action: PetAction,
	now: number,
	tzOffsetMinutes = 0,
): PetState {
	const at = Math.min(
		TIME_MAX,
		Math.max(state.lastSeen, Number.isFinite(now) ? now : state.lastSeen),
	);
	const day = dayNumber(at, tzOffsetMinutes);
	const newDay = Number.isSafeInteger(day) && day > state.lastDay;
	const base: PetState = {
		...state,
		rev: bump(state.rev, 1),
		lastSeen: at,
		belly: bellyNow(state, at),
		bellyAt: at,
		days: newDay ? bump(state.days, 1) : state.days,
		lastDay: newDay ? day : state.lastDay,
	};
	switch (action.type) {
		case "touch":
			return base;
		case "pat":
			return { ...base, pats: bump(base.pats, action.count) };
		case "feed": {
			const eaten = action.letters.slice(0, biteSize(base, action.letters, at));
			if (eaten.length === 0) return base;
			const alphabet = [...base.alphabet];
			let other = base.other;
			let vowels = base.diet.vowels * DIET_KEEP;
			let consonants = base.diet.consonants * DIET_KEEP;
			for (const ch of eaten) {
				const slot = letterSlot(ch);
				if (slot < 0) {
					other = bump(other, 1);
				} else {
					alphabet[slot] = bump(alphabet[slot] ?? 0, 1);
					if (isVowelSlot(slot)) vowels += 1;
					else consonants += 1;
				}
			}
			return {
				...base,
				meals: bump(base.meals, 1),
				letters: bump(base.letters, eaten.length),
				alphabet,
				other,
				diet: { vowels, consonants },
				belly: clamp01(base.belly + eaten.length / BELLY_LETTERS),
			};
		}
		case "rename": {
			const name = cleanName(action.name);
			return name ? { ...base, name } : base;
		}
		case "dock":
			return {
				...base,
				dock: { side: action.side === "left" ? "left" : "right", y: clamp01(action.y) },
			};
	}
}
