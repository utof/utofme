/**
 * What the pet eats: letters picked out of page text.
 *
 * Why: pure string functions (no DOM), so "the page's text is never changed" is
 * true by construction here: these only read strings and return new arrays.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */

/**
 * Most letters in one bite.
 *
 * Why: a bite should be a word, not a paragraph; it also bounds the animation.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export const BITE_MAX = 8;

const LETTER = /\p{L}/u;

/**
 * The first `max` letters of `text`, in order, as they are written.
 *
 * Why: digits, spaces and punctuation are not food; only `\p{L}` is.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape
 */
export function pickLetters(text: string, max: number = BITE_MAX): string[] {
	const out: string[] = [];
	for (const ch of text) {
		if (out.length >= max) break;
		if (LETTER.test(ch)) out.push(ch);
	}
	return out;
}

/**
 * Alphabet slot of a letter: 0 … 25 for a–z in either case, −1 for any other letter.
 *
 * Why: the collection has 26 cells; everything else shares one "other" count.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function letterSlot(ch: string): number {
	const code = ch.toLowerCase().charCodeAt(0);
	return ch.length === 1 && code >= 97 && code <= 122 ? code - 97 : -1;
}

/**
 * Whether an a–z slot is a vowel (a, e, i, o, u).
 *
 * Why: the vowel share of the diet sets the body colour.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
export function isVowelSlot(slot: number): boolean {
	return slot === 0 || slot === 4 || slot === 8 || slot === 14 || slot === 20;
}

/**
 * How many of the 26 letters have been eaten at least once.
 *
 * Why: the panel's "7 of 26" and the status line share it.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function collected(alphabet: readonly number[]): number {
	let n = 0;
	for (let i = 0; i < 26; i++) if ((alphabet[i] ?? 0) > 0) n++;
	return n;
}

/**
 * The index in `title` of the letter to nibble when nothing is selected: the
 * first letter not collected yet, else the letters in turn. −1 when the title
 * has no letter.
 *
 * Why: the keyboard and phone path to feeding; preferring new letters makes
 * every page title worth a visit.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function nibbleIndex(title: string, alphabet: readonly number[], turn: number): number {
	const spots: number[] = [];
	for (let i = 0; i < title.length; i++) {
		const ch = title.charAt(i);
		if (!LETTER.test(ch)) continue;
		const slot = letterSlot(ch);
		if (slot >= 0 && (alphabet[slot] ?? 0) === 0) return i;
		spots.push(i);
	}
	if (spots.length === 0) return -1;
	return spots[Math.abs(Math.trunc(turn)) % spots.length] ?? -1;
}
