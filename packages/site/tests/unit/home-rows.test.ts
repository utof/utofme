// Why: rows are native <details>; this pins the fallback that keeps one open at a time.
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bindExclusiveRows, closeOthers } from "../../src/lib/home/rows";

function rows(): HTMLDetailsElement[] {
	return [...document.querySelectorAll<HTMLDetailsElement>("details")];
}

beforeEach(() => {
	document.body.innerHTML = `
		<details data-home-row id="a"><summary>A</summary></details>
		<details data-home-row id="b"><summary>B</summary></details>
		<details data-home-row id="c"><summary>C</summary></details>
		<details id="other"><summary>Not a row</summary></details>`;
});

describe("closeOthers", () => {
	it("closes every open row except the given one", () => {
		const [a, b, c] = rows();
		if (!a || !b || !c) throw new Error("fixture");
		a.open = true;
		b.open = true;
		c.open = true;
		closeOthers(b, [a, b, c]);
		expect([a.open, b.open, c.open]).toEqual([false, true, false]);
	});
});

describe("bindExclusiveRows", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});
	const open = (id: string): HTMLDetailsElement => {
		const el = document.getElementById(id);
		if (!(el instanceof HTMLDetailsElement)) throw new Error(id);
		el.open = true;
		el.dispatchEvent(new Event("toggle"));
		return el;
	};
	const openIds = (): string[] =>
		rows()
			.filter((d) => d.open)
			.map((d) => d.id);

	it("keeps one row open at a time", () => {
		dispose = bindExclusiveRows(document);
		open("a");
		expect(openIds()).toEqual(["a"]);
		open("c");
		expect(openIds()).toEqual(["c"]);
	});

	it("leaves other <details> alone, both ways", () => {
		dispose = bindExclusiveRows(document);
		open("other");
		open("a");
		expect(openIds()).toEqual(["a", "other"]);
		open("other");
		expect(openIds()).toEqual(["a", "other"]);
	});

	it("does nothing when a row closes", () => {
		dispose = bindExclusiveRows(document);
		const a = open("a");
		a.open = false;
		a.dispatchEvent(new Event("toggle"));
		expect(openIds()).toEqual([]);
	});

	it("the disposer removes the listener", () => {
		bindExclusiveRows(document)();
		open("a");
		open("b");
		expect(openIds()).toEqual(["a", "b"]);
	});
});
