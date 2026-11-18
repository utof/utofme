// Why: every object mesh must index only its own vertices and stay inside the
// canvas, for every named key and every generic shape, at any time.
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
import { fc, test as fcTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { GENERIC_SHAPE_COUNT, genericObject } from "../../src/lib/home/objects/generic";
import {
	box,
	cone,
	createMesh,
	cyl,
	ico,
	type Mesh,
	ring,
	torus,
} from "../../src/lib/home/objects/mesh";
import { NAMED_OBJECTS } from "../../src/lib/home/objects/named";
import { buildObject, isObjectKey, OBJECT_KEYS } from "../../src/lib/home/objects/registry";
import { popBounce, shadeMesh } from "../../src/lib/home/objects/render";
import { shouldDraw } from "../../src/lib/home/objects/stage";

function expectValid(mesh: Mesh): void {
	expect(mesh.vertices.length).toBeGreaterThan(0);
	expect(mesh.faces.length).toBeGreaterThan(0);
	for (const v of mesh.vertices) {
		expect(v).toHaveLength(3);
		for (const n of v) expect(Number.isFinite(n)).toBe(true);
	}
	for (const f of mesh.faces) {
		for (const i of [f.a, f.b, f.c]) {
			expect(Number.isInteger(i)).toBe(true);
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(mesh.vertices.length);
		}
		expect(new Set([f.a, f.b, f.c]).size).toBe(3);
		for (const ch of f.color) {
			expect(ch).toBeGreaterThanOrEqual(0);
			expect(ch).toBeLessThanOrEqual(255);
		}
	}
}

describe("primitives", () => {
	it("box: 8 vertices, 12 triangles, centred and sized", () => {
		const m = createMesh();
		box(m, 2, 4, 6, [1, 1, 1], [1, 2, 3]);
		expect(m.vertices).toHaveLength(8);
		expect(m.faces).toHaveLength(12);
		expectValid(m);
		const xs = m.vertices.map((v) => v[0]);
		const ys = m.vertices.map((v) => v[1]);
		const zs = m.vertices.map((v) => v[2]);
		expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 2]);
		expect([Math.min(...ys), Math.max(...ys)]).toEqual([-1, 3]);
		expect([Math.min(...zs), Math.max(...zs)]).toEqual([-2, 4]);
	});

	it("box: yaw turns about y and keeps the height", () => {
		const m = createMesh();
		box(m, 2, 2, 2, [0, 0, 0], [0, 0, 0], Math.PI / 4);
		expect(Math.max(...m.vertices.map((v) => v[0]))).toBeCloseTo(Math.SQRT2);
		expect(Math.max(...m.vertices.map((v) => v[1]))).toBe(1);
	});

	it("cone: sides and caps, cap colour applied", () => {
		const m = createMesh();
		cone(m, 1, 0, 2, 6, [0, 0, 0], [10, 10, 10], [20, 20, 20]);
		expectValid(m);
		expect(m.faces).toHaveLength(6 * 4);
		expect(m.faces.filter((f) => f.color[0] === 20)).toHaveLength(12);
	});

	it("cyl: radius holds top and bottom", () => {
		const m = createMesh();
		cyl(m, 0.5, 1, 8, [0, 0, 0], [1, 1, 1]);
		expectValid(m);
		for (const [x, , z] of m.vertices.slice(0, 16)) expect(Math.hypot(x, z)).toBeCloseTo(0.5);
	});

	it("ico: 12 vertices on the sphere, 20 faces", () => {
		const m = createMesh();
		ico(m, 0.7, [1, 2, 3], [1, 1, 1]);
		expect(m.vertices).toHaveLength(12);
		expect(m.faces).toHaveLength(20);
		expectValid(m);
		for (const [x, y, z] of m.vertices) expect(Math.hypot(x - 1, y - 2, z - 3)).toBeCloseTo(0.7, 3);
	});

	it("ring: flat at y when not tilted", () => {
		const m = createMesh();
		ring(m, 0.5, 1, 10, 0.3, [1, 1, 1]);
		expectValid(m);
		expect(m.faces).toHaveLength(20);
		for (const v of m.vertices) expect(v[1]).toBeCloseTo(0.3);
	});

	it("torus: alternating colours, within major + minor", () => {
		const m = createMesh();
		torus(m, 0.7, 0.3, 8, 5, [1, 1, 1], [2, 2, 2]);
		expectValid(m);
		expect(m.faces).toHaveLength(8 * 5 * 2);
		expect(new Set(m.faces.map((f) => f.color[0]))).toEqual(new Set([1, 2]));
		for (const [x, , z] of m.vertices) expect(Math.hypot(x, z)).toBeLessThanOrEqual(1.0001);
	});

	it("primitives append: indices are offset by the vertices already there", () => {
		const m = createMesh();
		box(m, 1, 1, 1, [0, 0, 0], [1, 1, 1]);
		ico(m, 1, [0, 0, 0], [2, 2, 2]);
		expectValid(m);
		const icoFaces = m.faces.filter((f) => f.color[0] === 2);
		expect(Math.min(...icoFaces.flatMap((f) => [f.a, f.b, f.c]))).toBe(8);
	});
});

describe("registry", () => {
	it("lists exactly the named objects", () => {
		expect([...OBJECT_KEYS].sort()).toEqual(Object.keys(NAMED_OBJECTS).sort());
		expect(OBJECT_KEYS).toEqual(
			expect.arrayContaining(["tactical", "eeg", "enth", "throat", "gravity", "linsae", "maxwell"]),
		);
	});

	it("isObjectKey", () => {
		expect(isObjectKey("eeg")).toBe(true);
		expect(isObjectKey("nope")).toBe(false);
		expect(isObjectKey("toString")).toBe(false);
	});

	it.each(Object.keys(NAMED_OBJECTS))("%s builds a valid mesh at several times", (key) => {
		for (const t of [0, 0.37, 1.9, 1234.5]) expectValid(buildObject(key, 1, t));
	});

	it("named objects differ from each other", () => {
		const sizes = OBJECT_KEYS.map((k) => {
			const m = buildObject(k, 1, 0);
			return `${m.vertices.length}/${m.faces.length}/${m.faces[0]?.color.join(",")}`;
		});
		expect(new Set(sizes).size).toBe(OBJECT_KEYS.length);
	});

	it("falls back to the generic object for a missing or unknown key", () => {
		expect(buildObject(undefined, 12, 0)).toEqual(buildObject("no-such-object", 12, 0));
		expectValid(buildObject(undefined, 12, 0));
	});

	it("every generic shape is valid", () => {
		expect(GENERIC_SHAPE_COUNT).toBe(8);
		const seen = new Set<number>();
		for (let seed = 1; seed <= GENERIC_SHAPE_COUNT; seed++) {
			const m = createMesh();
			genericObject(seed)(m, 0.5);
			expectValid(m);
			seen.add(m.vertices.length * 1000 + m.faces.length);
		}
		expect(seen.size).toBe(GENERIC_SHAPE_COUNT);
	});

	fcTest.prop([fc.integer(), fc.double({ min: 0, max: 1e4, noNaN: true })], { numRuns: 40 })(
		"generic object is valid and deterministic for any seed and time",
		(seed, t) => {
			const mesh = buildObject(undefined, seed, t);
			expectValid(mesh);
			expect(buildObject(undefined, seed, t)).toEqual(mesh);
		},
	);
});

describe("shadeMesh", () => {
	const pose = { yaw: 0.4, pop: 0 };

	it("returns one shaded face per triangle, far to near", () => {
		const mesh = buildObject("gravity", 1, 0);
		const faces = shadeMesh(mesh, pose, 54, 54);
		expect(faces).toHaveLength(mesh.faces.length);
		for (let i = 1; i < faces.length; i++) {
			expect(faces[i - 1]?.depth ?? 0).toBeGreaterThanOrEqual(faces[i]?.depth ?? 0);
		}
	});

	it("emits integer pixels and rgb() fills", () => {
		for (const f of shadeMesh(buildObject("linsae", 1, 0), pose, 32, 32)) {
			for (const p of f.points) expect(Number.isInteger(p)).toBe(true);
			expect(f.fill).toMatch(/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/);
		}
	});

	it("never brightens a colour and quantises the shade", () => {
		const m = createMesh();
		box(m, 1, 1, 1, [0, 0, 0], [200, 100, 50]);
		const reds = new Set(
			shadeMesh(m, pose, 40, 40).map((f) => Number(/^rgb\((\d+)/.exec(f.fill)?.[1])),
		);
		for (const r of reds) {
			expect(r).toBeLessThanOrEqual(200);
			expect(r).toBeGreaterThanOrEqual(80);
			expect((r / 200) * 5).toBeCloseTo(Math.round((r / 200) * 5), 5);
		}
	});

	it.each([...OBJECT_KEYS])("%s stays inside a 32 px canvas while it turns", (key) => {
		for (let step = 0; step < 12; step++) {
			const faces = shadeMesh(
				buildObject(key, 1, step * 0.3),
				{ yaw: step * 0.55, pop: 0 },
				32,
				32,
			);
			for (const f of faces) {
				for (const p of f.points) {
					expect(p).toBeGreaterThanOrEqual(-2);
					expect(p).toBeLessThanOrEqual(34);
				}
			}
		}
	});

	it("skips faces that point outside the vertex list", () => {
		const mesh: Mesh = { vertices: [[0, 0, 0]], faces: [{ a: 0, b: 1, c: 2, color: [1, 1, 1] }] };
		expect(shadeMesh(mesh, pose, 10, 10)).toEqual([]);
	});

	it("popBounce is 0 at rest and bounded by pop", () => {
		expect(popBounce(0)).toBe(0);
		expect(popBounce(-1)).toBe(0);
		for (const p of [0.1, 0.5, 1]) {
			expect(popBounce(p)).toBeGreaterThanOrEqual(0);
			expect(popBounce(p)).toBeLessThanOrEqual(p);
		}
	});
});

describe("shouldDraw", () => {
	it("draws lively and never-drawn canvases every tick", () => {
		expect(shouldDraw(1, 0, true, true)).toBe(true);
		expect(shouldDraw(1, 0, false, false)).toBe(true);
	});

	it("draws a resting canvas once every five ticks, staggered by index", () => {
		const ticks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
		expect(ticks.filter((t) => shouldDraw(t, 0, false, true))).toEqual([0, 5]);
		expect(ticks.filter((t) => shouldDraw(t, 2, false, true))).toEqual([3, 8]);
	});
});
