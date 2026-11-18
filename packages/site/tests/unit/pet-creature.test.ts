/**
 * AC2.1: the creature's mesh is finite and stays on its canvas in every pose.
 *
 * @see packages/specs/specs/11-pet.md § "The creature"
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { createMesh } from "../../src/lib/home/objects/mesh";
import { shadeMesh } from "../../src/lib/home/objects/render";
import {
	bodyColor,
	buildCreature,
	CANVAS_PX,
	MOUTH_AT,
	type PoseInput,
	poseFor,
} from "../../src/lib/pet/creature";
import type { Mood } from "../../src/lib/pet/mood";

const MOODS: readonly Mood[] = [
	"held",
	"eating",
	"patted",
	"full",
	"happy",
	"curious",
	"idle",
	"asleep",
];
const inputArb: fc.Arbitrary<PoseInput> = fc.record({
	t: fc.double({ min: 0, max: 1000, noNaN: true }),
	gazeX: fc.double({ min: -1, max: 1, noNaN: true }),
	gazeY: fc.double({ min: -1, max: 1, noNaN: true }),
	selecting: fc.boolean(),
	scale: fc.double({ min: 0.84, max: 1, noNaN: true }),
	warmth: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe("creature", () => {
	test.prop([fc.constantFrom(...MOODS), inputArb, fc.constantFrom(-0.3, 0, 0.3)])(
		"every pose is a finite mesh drawn inside the canvas",
		(mood, input, yaw) => {
			const mesh = createMesh();
			buildCreature(mesh, poseFor(mood, input));
			expect(mesh.faces.length).toBeGreaterThan(40);
			// Why min/max and one assertion each: thousands of `expect` calls per run are slow.
			expect(mesh.vertices.every((vertex) => vertex.every((n) => Number.isFinite(n)))).toBe(true);
			const points = shadeMesh(mesh, { yaw, pop: 0 }, CANVAS_PX, CANVAS_PX).flatMap(
				(f) => f.points,
			);
			expect(points.length).toBe(mesh.faces.length * 6);
			expect(Math.min(...points)).toBeGreaterThanOrEqual(0);
			expect(Math.max(...points)).toBeLessThanOrEqual(CANVAS_PX);
		},
	);

	it("each mood has its own pose", () => {
		const input: PoseInput = {
			t: 0,
			gazeX: 0.5,
			gazeY: 0.5,
			selecting: false,
			scale: 1,
			warmth: 0.4,
		};
		const poses = MOODS.map((mood) => JSON.stringify(poseFor(mood, input)));
		expect(new Set(poses).size).toBe(MOODS.length);
	});

	it("asleep is the same figure at any time: nothing to animate", () => {
		const at = (t: number) =>
			poseFor("asleep", { t, gazeX: 1, gazeY: -1, selecting: true, scale: 1, warmth: 0.4 });
		expect(at(0)).toEqual(at(123.4));
		expect(at(0).lids).toBe(1);
	});

	it("the body colour runs teal → mint → gold → pink and clamps at the ends", () => {
		expect(bodyColor(0)).toEqual([79, 154, 148]);
		expect(bodyColor(0.4)).toEqual([127, 196, 160]);
		expect(bodyColor(0.56)).toEqual([214, 169, 58]);
		expect(bodyColor(1)).toEqual([224, 160, 168]);
		expect(bodyColor(Number.NaN)).toEqual([79, 154, 148]);
		const mid = bodyColor(0.3);
		expect(mid[0]).toBeGreaterThan(79);
		expect(mid[0]).toBeLessThan(127);
	});

	it("the mouth target is inside the canvas", () => {
		expect(MOUTH_AT.x).toBeGreaterThan(0);
		expect(MOUTH_AT.x).toBeLessThan(1);
		expect(MOUTH_AT.y).toBeGreaterThan(0.4);
		expect(MOUTH_AT.y).toBeLessThan(1);
	});
});
