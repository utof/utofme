/**
 * The pet's mood: a pure function of what happened recently on this page.
 *
 * Why: mood is never stored. A page starts with {@link restSession}, which is
 * asleep, so absence can only ever produce a sleeping pet; every livelier mood
 * needs an event from this visit.
 *
 * @see packages/specs/specs/11-pet.md § "The creature" (States)
 * @see packages/specs/adrs/0062-site-pet-design-rules.md
 */

/**
 * The states the creature has a pose for, liveliest first.
 *
 * Why: there is deliberately no sad, hungry or sulking member.
 *
 * @see packages/specs/specs/11-pet.md § "The creature" (States)
 */
export type Mood = "held" | "eating" | "patted" | "full" | "happy" | "curious" | "idle" | "asleep";

/**
 * What this page visit remembers (timestamps in ms; −∞ = never).
 *
 * Why: plain data, so the mood at any instant is testable without timers.
 *
 * @see packages/specs/specs/11-pet.md § "Wake"
 */
export interface Session {
	readonly awakeUntil: number;
	readonly held: boolean;
	readonly eatingUntil: number;
	readonly pattedUntil: number;
	readonly fullUntil: number;
	readonly happyUntil: number;
	/** The pointer is within the pet's personal space. */
	readonly pointerNear: boolean;
	/** The page has a selection with letters in it. */
	readonly selecting: boolean;
}

/**
 * How long the pet stays awake after the last attention, by day and at night.
 *
 * Why: long enough to play, short enough that a reader is left alone.
 *
 * @see packages/specs/specs/11-pet.md § "Wake"
 */
export const AWAKE_MS = { day: 45_000, night: 20_000 } as const;

/** "Until" value of something that has not happened: earlier than any clock. */
const NEVER = Number.NEGATIVE_INFINITY;
const PATTED_MS = 600;
const FULL_MS = 1500;
const HAPPY_MS = 2500;
const HAPPY_LONG_MS = 5000;

/**
 * The session of a page that has just loaded: asleep.
 *
 * Why: the only starting point, which is what makes "still until invited" hold.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (1)
 */
export function restSession(): Session {
	return {
		awakeUntil: NEVER,
		held: false,
		eatingUntil: NEVER,
		pattedUntil: NEVER,
		fullUntil: NEVER,
		happyUntil: NEVER,
		pointerNear: false,
		selecting: false,
	};
}

/**
 * The mood at `now`: the liveliest state whose condition holds.
 *
 * Why: one precedence list instead of flags scattered through the view.
 *
 * @see packages/specs/specs/11-pet.md § "The creature" (States)
 */
export function moodAt(session: Session, now: number): Mood {
	if (session.held) return "held";
	if (now < session.eatingUntil) return "eating";
	if (now < session.pattedUntil) return "patted";
	if (now < session.fullUntil) return "full";
	if (now < session.happyUntil) return "happy";
	if (now >= session.awakeUntil) return "asleep";
	return session.pointerNear || session.selecting ? "curious" : "idle";
}

/**
 * The next instant at which the mood can change without a new event (`Infinity` when asleep).
 *
 * Why: under paused motion there is no frame loop; the view sets one timer for this instant.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (7)
 */
export function nextChange(session: Session, now: number): number {
	let next = Number.POSITIVE_INFINITY;
	for (const t of [
		session.eatingUntil,
		session.pattedUntil,
		session.fullUntil,
		session.happyUntil,
		session.awakeUntil,
	]) {
		if (t > now && t < next) next = t;
	}
	return next;
}

/**
 * An event of this visit that changes the session.
 *
 * Why: every way to wake or cheer the pet is listed here, and each is a deliberate act.
 *
 * @see packages/specs/specs/11-pet.md § "Wake"
 */
export type SessionEvent =
	| { readonly type: "attend" }
	| { readonly type: "pat" }
	| { readonly type: "bite"; readonly letters: number; readonly special: boolean }
	| { readonly type: "refuse" }
	| { readonly type: "greet"; readonly long: boolean }
	| { readonly type: "hold"; readonly held: boolean }
	| { readonly type: "near"; readonly near: boolean }
	| { readonly type: "select"; readonly selecting: boolean }
	| { readonly type: "sleep" };

/**
 * Milliseconds the mouth works per letter of a bite.
 *
 * Why: the view times the flying letters with the same number.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export const CHEW_MS = 220;

/**
 * Applies an event at `now`. `night` shortens how long the pet stays awake.
 *
 * `near` and `select` never wake a sleeping pet; they only keep an awake one awake.
 *
 * Why: the rule "hovering never wakes it" lives in this function.
 *
 * @see packages/specs/specs/11-pet.md § "Wake"
 */
export function onEvent(
	session: Session,
	event: SessionEvent,
	now: number,
	night = false,
): Session {
	const stay = now + (night ? AWAKE_MS.night : AWAKE_MS.day);
	const awake = now < session.awakeUntil;
	switch (event.type) {
		case "attend":
			return { ...session, awakeUntil: stay };
		case "pat":
			return {
				...session,
				awakeUntil: stay,
				pattedUntil: now + PATTED_MS,
				happyUntil: now + PATTED_MS + HAPPY_MS,
			};
		case "bite": {
			const eatingUntil = now + Math.max(1, event.letters) * CHEW_MS + CHEW_MS;
			return {
				...session,
				awakeUntil: stay + (eatingUntil - now),
				eatingUntil,
				fullUntil: NEVER,
				happyUntil: eatingUntil + (event.special ? HAPPY_LONG_MS : HAPPY_MS),
			};
		}
		case "refuse":
			return { ...session, awakeUntil: stay, fullUntil: now + FULL_MS };
		case "greet":
			return {
				...session,
				awakeUntil: stay,
				happyUntil: now + (event.long ? HAPPY_LONG_MS : HAPPY_MS),
			};
		case "hold":
			return { ...session, awakeUntil: stay, held: event.held };
		case "near":
			return {
				...session,
				pointerNear: event.near,
				awakeUntil: awake && event.near ? stay : session.awakeUntil,
			};
		case "select":
			return { ...session, selecting: event.selecting };
		case "sleep":
			return { ...restSession(), selecting: session.selecting };
	}
}
