/**
 * AC1.5: pat vs. plain click vs. drag.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	type Box,
	GESTURE,
	GESTURE_IDLE,
	type GestureInput,
	type GestureOutput,
	gestureStep,
	zoneAt,
} from "../../src/lib/pet/gesture";

const BOX: Box = { x: 100, y: 200, w: 96, h: 96 };
const HEAD = { x: 148, y: 215 };
const BODY = { x: 148, y: 280 };

function run(inputs: readonly GestureInput[]): GestureOutput[] {
	let state = GESTURE_IDLE;
	const out: GestureOutput[] = [];
	for (const input of inputs) {
		const step = gestureStep(state, input, BOX);
		state = step.state;
		out.push(...step.out);
	}
	return out;
}
const pats = (out: readonly GestureOutput[]): number =>
	out.reduce((n, o) => n + (o.kind === "pat" ? o.count : 0), 0);
const kinds = (out: readonly GestureOutput[]): string[] => out.map((o) => o.kind);

describe("zoneAt", () => {
	it("the top 46 % and 8 px above it are the head; the rest is the body", () => {
		expect(zoneAt(148, 200, BOX)).toBe("head");
		expect(zoneAt(148, 193, BOX)).toBe("head");
		expect(zoneAt(148, 191, BOX)).toBe("outside");
		expect(zoneAt(148, 200 + 96 * 0.46 - 1, BOX)).toBe("head");
		expect(zoneAt(148, 200 + 96 * 0.46 + 1, BOX)).toBe("body");
		expect(zoneAt(148, 297, BOX)).toBe("outside");
		expect(zoneAt(99, 250, BOX)).toBe("outside");
		expect(zoneAt(197, 250, BOX)).toBe("outside");
	});
});

describe("gestureStep", () => {
	it("a click on the head is exactly one pat", () => {
		const out = run([
			{ type: "down", ...HEAD },
			{ type: "up", ...HEAD },
		]);
		expect(kinds(out)).toEqual(["pat"]);
		expect(pats(out)).toBe(1);
	});

	it("a click on the body is a poke and no pat", () => {
		const out = run([
			{ type: "down", ...BODY },
			{ type: "move", x: BODY.x + 3, y: BODY.y + 2 },
			{ type: "up", x: BODY.x + 3, y: BODY.y + 2 },
		]);
		expect(kinds(out)).toEqual(["poke"]);
	});

	test.prop([fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 9 })])(
		"stroking the head d px back and forth gives 1 + floor(d / 18) pats",
		(distance, stride) => {
			const inputs: GestureInput[] = [{ type: "down", ...HEAD }];
			let x = HEAD.x;
			let direction = 1;
			let travelled = 0;
			while (travelled < distance) {
				const step = Math.min(stride, distance - travelled);
				if (x + direction * step > BOX.x + BOX.w - 4 || x + direction * step < BOX.x + 4) {
					direction = -direction;
				}
				x += direction * step;
				travelled += step;
				inputs.push({ type: "move", x, y: HEAD.y });
			}
			inputs.push({ type: "up", x, y: HEAD.y });
			const out = run(inputs);
			expect(pats(out)).toBe(1 + Math.floor(distance / GESTURE.strokePx));
			expect(kinds(out).every((k) => k === "pat")).toBe(true);
		},
	);

	it("a body press that moves more than 8 px is a carry: no pat, no poke", () => {
		const out = run([
			{ type: "down", ...BODY },
			{ type: "move", x: BODY.x - 5, y: BODY.y },
			{ type: "move", x: BODY.x - 40, y: BODY.y - 60 },
			{ type: "move", x: BODY.x - 300, y: BODY.y - 100 },
			{ type: "up", x: BODY.x - 300, y: BODY.y - 100 },
		]);
		expect(kinds(out)).toEqual(["carry-start", "carry-move", "carry-move", "carry-end"]);
		expect(pats(out)).toBe(0);
		const moved = out.reduce((sum, o) => sum + (o.kind === "carry-move" ? o.dx : 0), 0);
		expect(moved).toBe(-295);
	});

	it("a head press that leaves the box by more than 24 px becomes a carry and stops patting", () => {
		const out = run([
			{ type: "down", ...HEAD },
			{ type: "move", x: HEAD.x, y: BOX.y - 20 },
			{ type: "move", x: HEAD.x, y: BOX.y - 30 },
			{ type: "move", x: HEAD.x + 200, y: BOX.y - 30 },
			{ type: "up", x: HEAD.x + 200, y: BOX.y - 30 },
		]);
		expect(kinds(out)).toEqual([
			"pat",
			"pat",
			"carry-start",
			"carry-move",
			"carry-move",
			"carry-end",
		]);
		expect(pats(out)).toBe(2);
	});

	it("a cancelled press yields nothing more; a cancelled carry ends", () => {
		expect(
			kinds(
				run([
					{ type: "down", ...BODY },
					{ type: "cancel", ...BODY },
				]),
			),
		).toEqual([]);
		expect(
			kinds(
				run([
					{ type: "down", ...BODY },
					{ type: "move", x: BODY.x + 50, y: BODY.y },
					{ type: "cancel", x: BODY.x + 50, y: BODY.y },
				]),
			),
		).toEqual(["carry-start", "carry-move", "carry-end"]);
	});

	it("a press outside the pet, and moves without a press, do nothing", () => {
		expect(
			run([
				{ type: "down", x: 10, y: 10 },
				{ type: "move", x: 150, y: 220 },
			]),
		).toEqual([]);
		expect(
			run([
				{ type: "move", ...HEAD },
				{ type: "up", ...HEAD },
			]),
		).toEqual([]);
	});

	test.prop([
		fc.array(
			fc.record({
				type: fc.constantFrom("down" as const, "move" as const, "up" as const, "cancel" as const),
				x: fc.integer({ min: 0, max: 400 }),
				y: fc.integer({ min: 0, max: 500 }),
			}),
			{ maxLength: 40 },
		),
	])("any event sequence: carries are bracketed and nothing pats during one", (inputs) => {
		let carrying = false;
		for (const out of run(inputs)) {
			if (out.kind === "carry-start") {
				expect(carrying).toBe(false);
				carrying = true;
			} else if (out.kind === "carry-end") {
				expect(carrying).toBe(true);
				carrying = false;
			} else if (out.kind === "carry-move") {
				expect(carrying).toBe(true);
			} else {
				expect(carrying).toBe(false);
			}
		}
	});
});
