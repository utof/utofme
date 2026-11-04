/**
 * Figure design tokens: contrast table and the no-accent / no-hex rule for article components.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-2 (AC2.1, AC2.3)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio, parseHex, type Rgb } from "../../src/lib/contrast";

const css = readFileSync(join(import.meta.dirname, "../../src/styles/tokens.css"), "utf8");
// The light `:root` block: from the first `:root {` to the first line that is a lone `}`.
const rootStart = css.indexOf(":root {");
const light = css.slice(rootStart, css.indexOf("\n}\n", rootStart));

function token(name: string): string {
	const m = new RegExp(`${name}:\\s*([^;]+);`).exec(light);
	if (m?.[1] === undefined) throw new Error(`token ${name} missing from the light :root block`);
	return m[1].trim();
}
const rgb = (name: string): Rgb => parseHex(token(name));

const WHITE: Rgb = [255, 255, 255];
const SURFACE: Rgb = parseHex("#fafafa");

describe("parseHex", () => {
	it("parses 6- and 3-digit hex, case-insensitively", () => {
		expect(parseHex("#1f5fbf")).toEqual([31, 95, 191]);
		expect(parseHex("#FFF")).toEqual([255, 255, 255]);
	});
	it("throws on anything else", () => {
		expect(() => parseHex("blue")).toThrow();
	});
});

describe("figure tokens (AC2.1)", () => {
	const text = [
		"--color-ct",
		"--color-t",
		"--color-smoke",
		"--color-fire",
		"--color-pro",
		"--color-bot",
		"--color-outcome-kept",
		"--color-outcome-reverted",
		"--color-outcome-inconclusive",
		"--color-outcome-parked",
		"--color-outcome-infra",
	];
	it.each(text)("%s is at least 4.5:1 on #fff and #fafafa", (name) => {
		expect(contrastRatio(rgb(name), WHITE)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(rgb(name), SURFACE)).toBeGreaterThanOrEqual(4.5);
	});

	it("matches the spec table for CT and T", () => {
		expect(contrastRatio(rgb("--color-ct"), WHITE)).toBeCloseTo(6.09, 1);
		expect(contrastRatio(rgb("--color-t"), WHITE)).toBeCloseTo(5.05, 1);
	});

	it("--ci-band-alpha is 0.18 and each CT/T line is at least 3:1 against its band", () => {
		const alpha = Number(token("--ci-band-alpha"));
		expect(alpha).toBe(0.18);
		for (const name of ["--color-ct", "--color-t"]) {
			const band = compositeOver(rgb(name), alpha, WHITE);
			expect(contrastRatio(rgb(name), band)).toBeGreaterThanOrEqual(3);
		}
	});

	it("walls are at least 3:1 against the floor", () => {
		expect(token("--color-map-floor")).toBe("var(--color-bg)");
		expect(contrastRatio(rgb("--color-map-wall"), WHITE)).toBeGreaterThanOrEqual(3);
	});

	it("the smoke edge is at least 3:1 against the smoke fill composite", () => {
		const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(token("--color-smoke-fill"));
		expect(m).not.toBeNull();
		const fill: Rgb = [Number(m?.[1]), Number(m?.[2]), Number(m?.[3])];
		const composite = compositeOver(fill, Number(m?.[4]), WHITE);
		const ratio = contrastRatio(rgb("--color-smoke"), composite);
		expect(ratio).toBeGreaterThanOrEqual(3);
		expect(ratio).toBeCloseTo(3.01, 1);
	});

	it("marks (pro, bot, wall) clear 3:1 on the page background", () => {
		for (const name of ["--color-pro", "--color-bot", "--color-map-wall"]) {
			expect(contrastRatio(rgb(name), WHITE)).toBeGreaterThanOrEqual(3);
		}
	});
});

describe("article components do not hard-code colour (AC2.3)", () => {
	const dir = join(import.meta.dirname, "../../src/components/article");
	function walk(d: string): string[] {
		let entries: string[];
		try {
			entries = readdirSync(d);
		} catch {
			return [];
		}
		return entries.flatMap((e) => {
			const p = join(d, e);
			return statSync(p).isDirectory() ? walk(p) : [p];
		});
	}
	it("no --color-accent and no hex literal under src/components/article", () => {
		for (const file of walk(dir)) {
			const src = readFileSync(file, "utf8");
			expect({ file, accent: src.includes("--color-accent") }).toEqual({ file, accent: false });
			expect({
				file,
				hex: /#[0-9a-fA-F]{3,8}\b(?![-\w])/.test(src.replace(/&#\d+;/g, "")),
			}).toEqual({ file, hex: false });
		}
	});
});
