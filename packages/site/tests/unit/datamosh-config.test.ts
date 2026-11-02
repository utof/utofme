/**
 * Unit + property tests for `lib/datamosh/config.ts`.
 *
 * Why: the config object is shared by URL params, the playground controls and the
 * hover shell, so the codec round-trip, the clamp+snap rules and the
 * "defaults come from the table" invariant are the contract worth pinning.
 *
 * @see packages/site/src/lib/datamosh/config.ts
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_MOSH_CONFIG,
	decodeMoshConfig,
	encodeMoshConfig,
	MOSH_PARAMS,
	type MoshConfig,
	type MoshParam,
	setMoshParam,
} from "../../src/lib/datamosh/config";

/** Number of decimals in `step`, to rebuild the snapped grid exactly like the module. */
function decimals(step: number): number {
	const text = String(step);
	const dot = text.indexOf(".");
	return dot === -1 ? 0 : text.length - dot - 1;
}

/** A value of `param` that is in range and on the step grid. */
function valueArb(param: MoshParam): fc.Arbitrary<number | string | boolean> {
	switch (param.kind) {
		case "range": {
			const steps = Math.round((param.max - param.min) / param.step);
			return fc
				.integer({ min: 0, max: steps })
				.map((i) => Number((param.min + i * param.step).toFixed(decimals(param.step))));
		}
		case "enum":
			return fc.constantFrom(...param.options);
		case "bool":
			return fc.boolean();
	}
}

/** Any in-range, step-snapped config. */
const configArb: fc.Arbitrary<MoshConfig> = fc
	.tuple(...MOSH_PARAMS.map((param) => valueArb(param)))
	.map((values) => {
		const config: MoshConfig = { ...DEFAULT_MOSH_CONFIG };
		MOSH_PARAMS.forEach((param, i) => {
			Object.assign(config, { [param.key]: values[i] });
		});
		return config;
	});

describe("MOSH_PARAMS", () => {
	it("has one row per config key, with the report's 25 parameters (no backend)", () => {
		const keys = MOSH_PARAMS.map((param) => param.key);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toHaveLength(25);
		expect(keys).not.toContain("backend");
		expect(Object.keys(DEFAULT_MOSH_CONFIG).sort()).toEqual([...keys].sort());
	});

	it("derives DEFAULT_MOSH_CONFIG from the table", () => {
		for (const param of MOSH_PARAMS) {
			expect(DEFAULT_MOSH_CONFIG[param.key]).toBe(param.default);
		}
	});

	it("keeps every default inside its own range and on its step grid", () => {
		for (const param of MOSH_PARAMS) {
			if (param.kind !== "range") continue;
			expect(param.default).toBeGreaterThanOrEqual(param.min);
			expect(param.default).toBeLessThanOrEqual(param.max);
			const k = (param.default - param.min) / param.step;
			expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
		}
	});

	it("documents every parameter", () => {
		for (const param of MOSH_PARAMS) {
			expect(param.label.length).toBeGreaterThan(0);
			expect(param.help.length).toBeGreaterThan(0);
		}
	});

	it("starts from the report's values", () => {
		expect(DEFAULT_MOSH_CONFIG).toMatchObject({
			scale: 0.5,
			block: 16,
			gain: 2,
			radius: 0.35,
			maxVector: 14,
			decay: 0.94,
			healOut: 0.02,
			lostDelayMs: 300,
			flashCap: 3,
			enterMs: 120,
			recoverMs: 370,
			fps: 60,
			seed: "previous",
			gifSource: "auto",
			overlay: false,
		});
	});
});

describe("encodeMoshConfig / decodeMoshConfig", () => {
	it("encodes the default config to the empty string", () => {
		expect(encodeMoshConfig(DEFAULT_MOSH_CONFIG)).toBe("");
	});

	it("emits only non-default values, prefixed m-", () => {
		const text = encodeMoshConfig({
			...DEFAULT_MOSH_CONFIG,
			block: 8,
			seed: "self",
			overlay: true,
		});
		expect(Object.fromEntries(new URLSearchParams(text))).toEqual({
			"m-block": "8",
			"m-seed": "self",
			"m-overlay": "1",
		});
	});

	it("decodes an empty or unrelated query to the defaults", () => {
		expect(decodeMoshConfig("")).toEqual(DEFAULT_MOSH_CONFIG);
		expect(decodeMoshConfig("?mosh&type=code&block=8")).toEqual(DEFAULT_MOSH_CONFIG);
	});

	it("accepts a leading ? and ignores non-m- params", () => {
		expect(decodeMoshConfig("?mosh&m-block=8&dither=2d").block).toBe(8);
	});

	it("clamps numbers to the range", () => {
		const config = decodeMoshConfig("m-block=999&m-scale=-3&m-flashCap=50");
		expect(config.block).toBe(32);
		expect(config.scale).toBe(0.25);
		expect(config.flashCap).toBe(3);
	});

	it("snaps numbers to the step grid", () => {
		const config = decodeMoshConfig("m-block=13&m-gain=1.26&m-radius=0.123&m-fps=46");
		expect(config.block).toBe(12);
		expect(config.gain).toBe(1.3);
		expect(config.radius).toBe(0.1);
		expect(config.fps).toBe(60);
	});

	it("ignores unknown keys, bad numbers, empty values and unlisted enum options", () => {
		const config = decodeMoshConfig(
			"m-nope=1&m-block=abc&m-gain=&m-decay=NaN&m-radius=Infinity&m-seed=sideways&m-gifSource=gif&m-overlay=maybe",
		);
		expect(config).toEqual(DEFAULT_MOSH_CONFIG);
	});

	it("reads booleans as 1/true/0/false", () => {
		expect(decodeMoshConfig("m-overlay=1").overlay).toBe(true);
		expect(decodeMoshConfig("m-overlay=true").overlay).toBe(true);
		expect(decodeMoshConfig("m-overlay=0").overlay).toBe(false);
		expect(decodeMoshConfig("m-overlay=false").overlay).toBe(false);
	});

	it("accepts every enum option", () => {
		expect(decodeMoshConfig("m-seed=none").seed).toBe("none");
		expect(decodeMoshConfig("m-seed=self").seed).toBe("self");
		expect(decodeMoshConfig("m-gifSource=frame0").gifSource).toBe("frame0");
	});

	test.prop([configArb])("round-trips: decode(encode(c)) deep-equals c", (config) => {
		expect(decodeMoshConfig(encodeMoshConfig(config))).toEqual(config);
	});

	test.prop([configArb])("decode is idempotent over its own output", (config) => {
		const once = decodeMoshConfig(encodeMoshConfig(config));
		expect(decodeMoshConfig(encodeMoshConfig(once))).toEqual(once);
	});

	test.prop([fc.string({ maxLength: 120 })])(
		"never throws and always yields an in-range config for arbitrary query text",
		(search) => {
			const config = decodeMoshConfig(search);
			for (const param of MOSH_PARAMS) {
				const value = config[param.key];
				if (param.kind === "range") {
					expect(value).toBeGreaterThanOrEqual(param.min);
					expect(value).toBeLessThanOrEqual(param.max);
				}
			}
		},
	);

	test.prop([
		fc.constantFrom(...MOSH_PARAMS.filter((p) => p.kind === "range")),
		fc.double({ min: -1e6, max: 1e6, noNaN: true }),
	])("clamps and snaps any finite number for any range param", (param, value) => {
		const config = decodeMoshConfig(`m-${param.key}=${value}`);
		const got = config[param.key];
		expect(got).toBeGreaterThanOrEqual(param.kind === "range" ? param.min : 0);
		expect(got).toBeLessThanOrEqual(param.kind === "range" ? param.max : 0);
	});
});

describe("setMoshParam", () => {
	const find = (key: keyof MoshConfig): MoshParam => {
		const param = MOSH_PARAMS.find((candidate) => candidate.key === key);
		if (!param) throw new Error(`no param ${key}`);
		return param;
	};

	it("mutates the given object in place, clamping and snapping ranges", () => {
		const config: MoshConfig = { ...DEFAULT_MOSH_CONFIG };
		setMoshParam(config, find("block"), "13");
		setMoshParam(config, find("gain"), "99");
		expect(config.block).toBe(12);
		expect(config.gain).toBe(4);
	});

	it("sets enums only to listed options and booleans from 1/true", () => {
		const config: MoshConfig = { ...DEFAULT_MOSH_CONFIG };
		setMoshParam(config, find("seed"), "self");
		setMoshParam(config, find("gifSource"), "nonsense");
		setMoshParam(config, find("overlay"), "1");
		expect(config.seed).toBe("self");
		expect(config.gifSource).toBe("auto");
		expect(config.overlay).toBe(true);
		setMoshParam(config, find("overlay"), "0");
		expect(config.overlay).toBe(false);
	});

	it("ignores empty and non-numeric range input", () => {
		const config: MoshConfig = { ...DEFAULT_MOSH_CONFIG };
		setMoshParam(config, find("scale"), "");
		setMoshParam(config, find("scale"), "wide");
		expect(config.scale).toBe(DEFAULT_MOSH_CONFIG.scale);
	});
});
