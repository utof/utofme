import { describe, expect, test } from "vitest";
import { crossesInk, type InkGrid, moveAxis } from "../../src/lib/not-found-collision";

const grid: InkGrid = {
	columns: 5,
	rows: 5,
	cells: Uint8Array.from([
		0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0,
	]),
	tileSize: 0.875,
	left: 1,
	top: 1,
	right: 3.875,
	bottom: 3.875,
};

describe("404 contacts", () => {
	test("a fast swipe crosses a tile even when both endpoints are clear", () => {
		expect(crossesInk(grid, { x: -2, y: 2.5 }, { x: 6, y: 2.5 })).toBe(true);
	});

	test("the hole, outer padding, and gutters are clear", () => {
		expect(crossesInk(grid, { x: 2.1, y: 2.1 }, { x: 2.7, y: 2.7 })).toBe(false);
		expect(crossesInk(grid, { x: 0.3, y: 0.1 }, { x: 0.9, y: 4.9 })).toBe(false);
		expect(crossesInk(grid, { x: 0, y: 1.95 }, { x: 5, y: 1.95 })).toBe(false);
	});

	test("movement from inside a digit cannot kick it on exit", () => {
		expect(crossesInk(grid, { x: 1.3, y: 2.5 }, { x: 6, y: 2.5 })).toBe(false);
	});

	test("a wall reverses momentum only when the painted edge reaches it", () => {
		const overhang = moveAxis(-4, -100, 0.025, -8, 800);
		expect(overhang.position).toBe(-6.5);
		expect(overhang.velocity).toBeLessThan(0);
		const rebound = moveAxis(overhang.position, overhang.velocity, 0.025, -8, 800);
		expect(rebound.position).toBe(-8);
		expect(rebound.velocity).toBeGreaterThan(0);
		expect(moveAxis(799, 200, 0.025, -8, 800).velocity).toBeLessThan(0);
	});
});
