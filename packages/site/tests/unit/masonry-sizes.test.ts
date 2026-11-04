/**
 * Why: `MASONRY_COLUMN_SIZES` is a hand-derived CSS `sizes` string; this test evaluates it against a
 * model of the real layout (`--page-margin`, `--page-width`, `--masonry-gap` in tokens.css and the
 * column breakpoints in `src/pages/index.astro`) so a token change that desyncs it fails here.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
import { describe, expect, it } from "vitest";
import { MASONRY_COLUMN_SIZES } from "../../src/lib/masonry";

const GAP = 12;

/** Real rendered width of one masonry column at a viewport width (ignores the scrollbar). */
function columnWidth(vw: number): number {
	const margin = Math.min(Math.max(16, 0.1 * vw - 16), 192);
	const page = Math.min(vw - 2 * margin, 1340);
	const cols = vw >= 1100 ? 3 : vw >= 560 ? 2 : 1;
	return (page - GAP * (cols - 1)) / cols;
}

/** Evaluates one `sizes` length: `Npx`, `Nvw` or `calc(Avw + Bpx)`. */
function evalLength(len: string, vw: number): number {
	const calc = /^calc\(([\d.]+)vw \+ ([\d.]+)px\)$/.exec(len);
	if (calc) return (Number(calc[1]) * vw) / 100 + Number(calc[2]);
	const unit = /^([\d.]+)(px|vw)$/.exec(len);
	if (!unit) throw new Error(`cannot evaluate ${len}`);
	return unit[2] === "vw" ? (Number(unit[1]) * vw) / 100 : Number(unit[1]);
}

/** The slot width the browser would pick from `sizes` at a viewport width. */
function pickedSlot(sizes: string, vw: number): number {
	for (const part of sizes.split(/,\s*(?![^(]*\))/)) {
		const m = /^\(min-width:\s*(\d+)px\)\s+(.+)$/.exec(part.trim());
		if (!m) return evalLength(part.trim(), vw);
		if (vw >= Number(m[1])) return evalLength(m[2] ?? "", vw);
	}
	throw new Error("no default length");
}

describe("MASONRY_COLUMN_SIZES", () => {
	it.each([
		360, 393, 559, 560, 700, 900, 1099, 1100, 1280, 1440, 1634, 1635, 1920, 2560,
	])("at %i px it is never below the real column and at most ~10 % above", (vw) => {
		const real = columnWidth(vw);
		const slot = pickedSlot(MASONRY_COLUMN_SIZES, vw);
		// 100vw / 50vw defaults on small screens are deliberately looser (cheap upper bounds).
		const slack = vw < 1100 ? 1.3 : 1.1;
		expect(slot).toBeGreaterThanOrEqual(real - 1);
		expect(slot).toBeLessThanOrEqual(real * slack);
	});
	it("caps at the 1340 px page column (439 px per column) on wide screens", () => {
		expect(pickedSlot(MASONRY_COLUMN_SIZES, 1920)).toBe(439);
	});
});
