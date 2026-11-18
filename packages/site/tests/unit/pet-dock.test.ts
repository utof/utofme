/**
 * AC1.7: where the pet rests.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2, 3)
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	choosePeek,
	type DockInput,
	dockBox,
	dockTop,
	dropDock,
	INSET,
	OBSTACLES,
	PEEKS,
	visibleBox,
} from "../../src/lib/pet/dock";

const wide: DockInput = { viewportW: 1360, viewportH: 800, size: 96, side: "right", y: 1 };

describe("dockBox / visibleBox", () => {
	it("out: inset from the edge, at the bottom", () => {
		expect(dockBox(wide, 96)).toEqual({
			x: 1360 - 96 - INSET.side,
			y: 800 - 96 - INSET.bottom,
			w: 96,
			h: 96,
		});
		expect(dockBox({ ...wide, side: "left" }, 96).x).toBe(INSET.side);
	});

	it("tucked: only the asked width is inside the viewport", () => {
		expect(visibleBox(wide, 28)).toMatchObject({ x: 1360 - 28, w: 28 });
		expect(visibleBox({ ...wide, side: "left" }, 16)).toMatchObject({ x: 0, w: 16 });
		expect(dockBox({ ...wide, side: "left" }, 16).x).toBe(16 - 96);
	});

	it("y = 0 clears the header; y = 1 sits at the bottom", () => {
		expect(dockTop({ ...wide, y: 0 })).toBe(INSET.top);
		expect(dockTop({ ...wide, y: 1 })).toBe(800 - 96 - INSET.bottom);
	});

	test.prop([
		fc.integer({ min: 200, max: 4000 }),
		fc.integer({ min: 100, max: 3000 }),
		fc.constantFrom(72, 96),
		fc.constantFrom("left" as const, "right" as const),
		fc.oneof(fc.double(), fc.constant(Number.NaN)),
		fc.constantFrom(96, 72, ...PEEKS),
	])(
		"the visible box is always inside the viewport",
		(viewportW, viewportH, size, side, y, peek) => {
			const input: DockInput = { viewportW, viewportH, size, side, y };
			const box = visibleBox(input, Math.min(peek, size));
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(viewportW);
			expect(box.y).toBeGreaterThanOrEqual(0);
			if (viewportH >= size + INSET.bottom) expect(box.y + box.h).toBeLessThanOrEqual(viewportH);
			expect(box.w).toBeLessThanOrEqual(size);
		},
	);
});

describe("choosePeek", () => {
	it("is fully out when there is room", () => {
		expect(choosePeek(96, () => true)).toBe(96);
	});

	it("is the widest free sliver otherwise", () => {
		expect(choosePeek(96, (v) => v <= 44)).toBe(40);
		expect(choosePeek(96, (v) => v <= 16)).toBe(16);
		expect(choosePeek(72, (v) => v <= 30)).toBe(28);
	});

	it("falls back to the narrowest when nothing is free", () => {
		expect(choosePeek(96, () => false)).toBe(10);
	});

	test.prop([fc.integer({ min: 0, max: 120 }), fc.constantFrom(72, 96)])(
		"never picks a width wider than the free gutter (down to the 10 px floor)",
		(gutter, size) => {
			const chosen = choosePeek(size, (v) => v <= gutter);
			expect(chosen).toBeLessThanOrEqual(Math.max(10, gutter));
			const wider = [size, ...PEEKS].filter((v) => v > chosen && v <= size);
			expect(wider.every((v) => v > gutter)).toBe(true);
		},
	);
});

describe("dropDock", () => {
	it("snaps to the nearer side", () => {
		expect(dropDock(300, 400, 1360, 800, 96).side).toBe("left");
		expect(dropDock(900, 400, 1360, 800, 96).side).toBe("right");
	});

	it("keeps the height, clamped", () => {
		const top = dockTop({ ...wide, y: 0.5 });
		expect(dropDock(1300, top + 48, 1360, 800, 96).y).toBeCloseTo(0.5);
		expect(dropDock(1300, -500, 1360, 800, 96).y).toBe(0);
		expect(dropDock(1300, 5000, 1360, 800, 96).y).toBe(1);
	});
});

describe("OBSTACLES", () => {
	it("is a valid selector that covers links, buttons, form fields and media", () => {
		document.body.innerHTML =
			'<a href="#">a</a><button>b</button><input><img alt=""><video></video><div class="plain"></div>';
		expect(document.querySelectorAll(OBSTACLES)).toHaveLength(5);
		expect(document.querySelector(".plain")?.matches(OBSTACLES)).toBe(false);
	});
});
