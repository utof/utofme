/**
 * Mood: what wakes the pet, and that absence only ever means sleep (AC1.3).
 *
 * @see packages/specs/specs/11-pet.md § "The creature" (States), § "Wake"
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	AWAKE_MS,
	CHEW_MS,
	type Mood,
	moodAt,
	nextChange,
	onEvent,
	restSession,
	type SessionEvent,
} from "../../src/lib/pet/mood";

const NOW = 1_795_000_000_000;
const passive: fc.Arbitrary<SessionEvent> = fc.oneof(
	fc.boolean().map((near): SessionEvent => ({ type: "near", near })),
	fc.boolean().map((selecting): SessionEvent => ({ type: "select", selecting })),
	fc.constant<SessionEvent>({ type: "sleep" }),
);
const active: fc.Arbitrary<SessionEvent> = fc.oneof(
	fc.constant<SessionEvent>({ type: "attend" }),
	fc.constant<SessionEvent>({ type: "pat" }),
	fc.constant<SessionEvent>({ type: "refuse" }),
	fc.boolean().map((long): SessionEvent => ({ type: "greet", long })),
	fc
		.tuple(fc.integer({ min: 1, max: 8 }), fc.boolean())
		.map(([letters, special]): SessionEvent => ({ type: "bite", letters, special })),
);

describe("mood", () => {
	test.prop([fc.double({ noNaN: true })])("a fresh page is asleep at any time", (now) => {
		expect(moodAt(restSession(), now)).toBe("asleep");
	});

	test.prop([
		fc.array(fc.tuple(passive, fc.integer({ min: 0, max: 3_600_000 })), { maxLength: 30 }),
	])("hovering, selecting and time alone never wake it", (events) => {
		let session = restSession();
		let now = NOW;
		for (const [event, wait] of events) {
			now += wait;
			session = onEvent(session, event, now);
			expect(moodAt(session, now)).toBe("asleep");
		}
	});

	test.prop([
		fc.array(fc.tuple(fc.oneof(active, passive), fc.integer({ min: 0, max: 5000 })), {
			maxLength: 20,
		}),
		fc.boolean(),
	])("whatever happened, it is asleep again once it is left alone", (events, night) => {
		let session = restSession();
		let now = NOW;
		for (const [event, wait] of events) {
			now += wait;
			session = onEvent(session, event, now, night);
		}
		session = onEvent(session, { type: "near", near: false }, now, night);
		expect(moodAt(session, now + AWAKE_MS.day + 20_000)).toBe("asleep");
		expect(nextChange(session, now + AWAKE_MS.day + 20_000)).toBe(Number.POSITIVE_INFINITY);
	});

	it("a pat: patted, then happy, then idle, then asleep", () => {
		const s = onEvent(restSession(), { type: "pat" }, NOW);
		const at = (ms: number): Mood => moodAt(s, NOW + ms);
		expect([at(0), at(599), at(700), at(3000), at(3200), at(44_999), at(45_000)]).toEqual([
			"patted",
			"patted",
			"happy",
			"happy",
			"idle",
			"idle",
			"asleep",
		]);
	});

	it("a bite: eating one chew per letter, then happy; a special bite is happy for longer", () => {
		const plain = onEvent(restSession(), { type: "bite", letters: 3, special: false }, NOW);
		const special = onEvent(restSession(), { type: "bite", letters: 3, special: true }, NOW);
		const chewing = 4 * CHEW_MS;
		expect(moodAt(plain, NOW + chewing - 1)).toBe("eating");
		expect(moodAt(plain, NOW + chewing + 1)).toBe("happy");
		expect(moodAt(plain, NOW + chewing + 2600)).toBe("idle");
		expect(moodAt(special, NOW + chewing + 2600)).toBe("happy");
	});

	it("refusing shows full; being held wins over everything", () => {
		const full = onEvent(restSession(), { type: "refuse" }, NOW);
		expect(moodAt(full, NOW + 100)).toBe("full");
		expect(moodAt(full, NOW + 1600)).toBe("idle");
		const held = onEvent(onEvent(full, { type: "pat" }, NOW), { type: "hold", held: true }, NOW);
		expect(moodAt(held, NOW + 10)).toBe("held");
		expect(moodAt(onEvent(held, { type: "hold", held: false }, NOW), NOW + 10)).toBe("patted");
	});

	it("awake: a near pointer or a selection makes it curious and keeps it awake", () => {
		const awake = onEvent(restSession(), { type: "attend" }, NOW);
		expect(moodAt(awake, NOW + 1)).toBe("idle");
		const near = onEvent(awake, { type: "near", near: true }, NOW + 40_000);
		expect(moodAt(near, NOW + 46_000)).toBe("curious");
		const selecting = onEvent(awake, { type: "select", selecting: true }, NOW + 10);
		expect(moodAt(selecting, NOW + 20)).toBe("curious");
		expect(moodAt(selecting, NOW + 45_001)).toBe("asleep");
	});

	it("at night it dozes off sooner", () => {
		const day = onEvent(restSession(), { type: "attend" }, NOW, false);
		const night = onEvent(restSession(), { type: "attend" }, NOW, true);
		expect(moodAt(day, NOW + 30_000)).toBe("idle");
		expect(moodAt(night, NOW + 30_000)).toBe("asleep");
	});

	it("nextChange is the earliest coming boundary", () => {
		const s = onEvent(restSession(), { type: "pat" }, NOW);
		expect(nextChange(s, NOW)).toBe(NOW + 600);
		expect(nextChange(s, NOW + 600)).toBe(NOW + 3100);
		expect(nextChange(s, NOW + 3100)).toBe(NOW + 45_000);
	});

	it("sleep resets the visit but remembers that text is selected", () => {
		const s = onEvent(
			onEvent(restSession(), { type: "select", selecting: true }, NOW),
			{ type: "pat" },
			NOW,
		);
		const slept = onEvent(s, { type: "sleep" }, NOW + 5);
		expect(moodAt(slept, NOW + 6)).toBe("asleep");
		expect(slept.selecting).toBe(true);
	});
});
