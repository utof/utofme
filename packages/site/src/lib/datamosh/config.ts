/**
 * Datamosh hover: the single source of truth for every tunable.
 *
 * `MOSH_PARAMS` is the parameter table (key, group, label, help, kind, range,
 * default) from the design report's slider table. Everything else is derived from
 * it: `DEFAULT_MOSH_CONFIG`, the URL codec (`m-<key>` query params, only values that
 * differ from the default) and the generated controls of the `/lab/datamosh/`
 * playground. Lengths are CSS px; the engine converts them to internal px.
 *
 * Why: the playground mutates one live config object that the hover shell reads
 * every frame, and the same object round-trips through URL params and JSON, so
 * there must be exactly one place that knows what a parameter is.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */

/** Every tunable of the datamosh hover effect (the report's slider table). */
export interface MoshConfig {
	/** Internal resolution relative to the card's CSS size. */
	scale: number;
	/** Macroblock edge in CSS px. */
	block: number;
	/** Pointer velocity (internal px / frame) to block vector multiplier. */
	gain: number;
	/** Pointer falloff radius as a fraction of the card width. */
	radius: number;
	/** Clamp on vector length, CSS px. */
	maxVector: number;
	/** Share of last frame's vector each block keeps. */
	decay: number;
	/** Random per-block vector inside the radius, CSS px. */
	jitter: number;
	/** Vector snap step (stepped smear), CSS px. */
	mvStep: number;
	/** Vector length below which a block freezes, CSS px. */
	skip: number;
	/** Share of blocks that read a neighbour's vector. */
	mismatch: number;
	/** Per-block refresh chance per frame inside the radius. */
	healIn: number;
	/** Per-block refresh chance per frame outside the radius. */
	healOut: number;
	/** Share of the live source mixed into dragged blocks. */
	leak: number;
	/** Frames between forced full refreshes (0 = off). */
	gop: number;
	/** Density of frozen "lost sector" rectangles. */
	lostRate: number;
	/** Delay after hover-enter before lost sectors start, ms. */
	lostDelayMs: number;
	/** Maximum high-contrast events per second (WCAG 2.3.1). */
	flashCap: number;
	/** Overlay presence ease-in, ms. */
	enterMs: number;
	/** Heal-to-clean time after the pointer leaves, ms. */
	recoverMs: number;
	/** Kernel rate cap. */
	fps: number;
	/** Feedback buffer contents on enter. */
	seed: "previous" | "self" | "none";
	/** Animated GIF frames: live `ImageDecoder` or frozen frame 0. */
	gifSource: "auto" | "frame0";
	/** DCT-stripe garnish strength in displaced blocks. */
	dct: number;
	/** Chroma-smear garnish strength in displaced blocks. */
	chroma: number;
	/** Debug: draw the block grid and vectors. */
	overlay: boolean;
}

/**
 * Playground section a parameter belongs to (report's table order).
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export type MoshGroup =
	| "Resolution"
	| "Motion"
	| "Refresh"
	| "Lost sectors"
	| "Timing"
	| "Seed"
	| "GIF"
	| "Garnish"
	| "Debug";

interface ParamBase {
	readonly key: keyof MoshConfig;
	readonly group: MoshGroup;
	readonly label: string;
	/** One-sentence explanation shown next to the control. */
	readonly help: string;
}

/**
 * Numeric slider parameter.
 *
 * Why: `min`/`max`/`step` drive both the `<input type=range>` attributes and the
 * clamp+snap applied when decoding URL params, so the two can never disagree.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface RangeParam extends ParamBase {
	readonly kind: "range";
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly default: number;
}

/**
 * String-choice parameter.
 *
 * Why: see {@link RangeParam}; `options` is the whole legal value set.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface EnumParam<T extends string = string> extends ParamBase {
	readonly kind: "enum";
	readonly options: readonly T[];
	readonly default: T;
}

/**
 * Checkbox parameter.
 *
 * Why: see {@link RangeParam}.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export interface BoolParam extends ParamBase {
	readonly kind: "bool";
	readonly default: boolean;
}

/**
 * One row of the parameter table.
 *
 * Why: a discriminated union on `kind` lets the playground render the right
 * control without casts.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export type MoshParam = RangeParam | EnumParam | BoolParam;

type SpecFor<K extends keyof MoshConfig> = (MoshConfig[K] extends number
	? RangeParam
	: MoshConfig[K] extends boolean
		? BoolParam
		: EnumParam<Extract<MoshConfig[K], string>>) & { readonly key: K };

/** One spec per config key: the mapped type makes a missing or mis-keyed row a type error. */
type SpecTable = { readonly [K in keyof MoshConfig]: SpecFor<K> };

const SPECS = {
	scale: {
		key: "scale",
		group: "Resolution",
		label: "Scale",
		help: "Internal resolution relative to the card's CSS size. Lower is blockier and cheaper.",
		kind: "range",
		min: 0.25,
		max: 1,
		step: 0.05,
		default: 0.5,
	},
	block: {
		key: "block",
		group: "Resolution",
		label: "Block",
		help: "Macroblock edge in CSS px (8 to 32).",
		kind: "range",
		min: 8,
		max: 32,
		step: 4,
		default: 16,
	},
	gain: {
		key: "gain",
		group: "Motion",
		label: "Gain",
		help: "How strongly pointer velocity becomes a block vector.",
		kind: "range",
		min: 0,
		max: 4,
		step: 0.1,
		default: 2,
	},
	radius: {
		key: "radius",
		group: "Motion",
		label: "Radius",
		help: "Falloff radius around the pointer as a fraction of the card width.",
		kind: "range",
		min: 0.1,
		max: 0.8,
		step: 0.05,
		default: 0.35,
	},
	maxVector: {
		key: "maxVector",
		group: "Motion",
		label: "Max vector",
		help: "Longest allowed vector, CSS px.",
		kind: "range",
		min: 2,
		max: 32,
		step: 1,
		default: 14,
	},
	decay: {
		key: "decay",
		group: "Motion",
		label: "Decay",
		help: "How much of last frame's vector each block keeps.",
		kind: "range",
		min: 0.8,
		max: 0.99,
		step: 0.01,
		default: 0.94,
	},
	jitter: {
		key: "jitter",
		group: "Motion",
		label: "Jitter",
		help: "Random per-block vector inside the radius (Kino's diffusion), CSS px.",
		kind: "range",
		min: 0,
		max: 6,
		step: 0.5,
		default: 1,
	},
	mvStep: {
		key: "mvStep",
		group: "Motion",
		label: "Vector step",
		help: "Vectors snap to multiples of this, CSS px. Larger gives a more stepped smear.",
		kind: "range",
		min: 2,
		max: 8,
		step: 1,
		default: 2,
	},
	skip: {
		key: "skip",
		group: "Motion",
		label: "Skip",
		help: "Blocks with a vector shorter than this freeze in place, CSS px.",
		kind: "range",
		min: 0,
		max: 4,
		step: 0.25,
		default: 1,
	},
	mismatch: {
		key: "mismatch",
		group: "Motion",
		label: "Mismatch",
		help: "Share of blocks that read a neighbour's vector instead of their own.",
		kind: "range",
		min: 0,
		max: 0.3,
		step: 0.01,
		default: 0,
	},
	healIn: {
		key: "healIn",
		group: "Refresh",
		label: "Heal inside",
		help: "Per-frame chance a stale block refreshes from the source, inside the radius.",
		kind: "range",
		min: 0,
		max: 0.1,
		step: 0.005,
		default: 0,
	},
	healOut: {
		key: "healOut",
		group: "Refresh",
		label: "Heal outside",
		help: "Per-frame chance a stale block refreshes from the source, outside the radius.",
		kind: "range",
		min: 0,
		max: 0.2,
		step: 0.005,
		default: 0.02,
	},
	leak: {
		key: "leak",
		group: "Refresh",
		label: "Leak",
		help: "Share of the live source mixed into dragged blocks (the codec residual).",
		kind: "range",
		min: 0,
		max: 0.3,
		step: 0.01,
		default: 0,
	},
	gop: {
		key: "gop",
		group: "Refresh",
		label: "GOP",
		help: "Frames between forced full refreshes. 0 turns it off. Rate-limited by flash cap.",
		kind: "range",
		min: 0,
		max: 240,
		step: 5,
		default: 0,
	},
	lostRate: {
		key: "lostRate",
		group: "Lost sectors",
		label: "Lost rate",
		help: "Density of frozen rectangles that ignore vectors and healing.",
		kind: "range",
		min: 0,
		max: 0.3,
		step: 0.01,
		default: 0,
	},
	lostDelayMs: {
		key: "lostDelayMs",
		group: "Lost sectors",
		label: "Lost delay (ms)",
		help: "Time after hover-enter before lost sectors may appear.",
		kind: "range",
		min: 0,
		max: 1000,
		step: 50,
		default: 300,
	},
	flashCap: {
		key: "flashCap",
		group: "Lost sectors",
		label: "Flash cap (per s)",
		help: "Most high-contrast events (cut, lost sector toggle, full refresh) allowed per second. WCAG 2.3.1 allows 3.",
		kind: "range",
		min: 1,
		max: 3,
		step: 1,
		default: 3,
	},
	enterMs: {
		key: "enterMs",
		group: "Timing",
		label: "Enter (ms)",
		help: "Overlay presence ease-in on hover.",
		kind: "range",
		min: 50,
		max: 400,
		step: 10,
		default: 120,
	},
	recoverMs: {
		key: "recoverMs",
		group: "Timing",
		label: "Recover (ms)",
		help: "Time to heal back to the clean card after the pointer leaves.",
		kind: "range",
		min: 100,
		max: 800,
		step: 10,
		default: 370,
	},
	fps: {
		key: "fps",
		group: "Timing",
		label: "Kernel fps",
		help: "Kernel rate cap. 30 halves the cost.",
		kind: "range",
		min: 30,
		max: 60,
		step: 30,
		default: 60,
	},
	seed: {
		key: "seed",
		group: "Seed",
		label: "Seed",
		help: "What the feedback buffer holds on enter: the previously hovered card, the card itself, or nothing.",
		kind: "enum",
		options: ["previous", "self", "none"],
		default: "previous",
	},
	gifSource: {
		key: "gifSource",
		group: "GIF",
		label: "GIF source",
		help: "auto decodes real GIF frames with ImageDecoder; frame0 freezes on the first frame.",
		kind: "enum",
		options: ["auto", "frame0"],
		default: "auto",
	},
	dct: {
		key: "dct",
		group: "Garnish",
		label: "DCT stripes",
		help: "Cosine stripe noise on the luma of stale blocks.",
		kind: "range",
		min: 0,
		max: 1,
		step: 0.05,
		default: 0,
	},
	chroma: {
		key: "chroma",
		group: "Garnish",
		label: "Chroma smear",
		help: "Pull stale blocks' chroma toward the block average.",
		kind: "range",
		min: 0,
		max: 1,
		step: 0.05,
		default: 0,
	},
	overlay: {
		key: "overlay",
		group: "Debug",
		label: "Block overlay",
		help: "Draw the block grid and vectors on the effect.",
		kind: "bool",
		default: false,
	},
} satisfies SpecTable;

/**
 * The parameter table, in playground order.
 *
 * Why: the one list the defaults, the URL codec and the generated controls are all
 * derived from (the report's 26-row table minus `backend`: only Canvas 2D exists).
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export const MOSH_PARAMS: readonly MoshParam[] = Object.values(SPECS);

/** Query-param prefix: config key `block` lives at `?m-block=8`. */
const PARAM_PREFIX = "m-";

/** Decimal places of `step`, so snapped values stay free of float noise (0.35, not 0.35000000000000003). */
function decimalsOf(step: number): number {
	const text = String(step);
	const dot = text.indexOf(".");
	return dot === -1 ? 0 : text.length - dot - 1;
}

/** Clamp to `[min, max]` and snap to `min + k * step`. */
function snapRange(param: RangeParam, value: number): number {
	const clamped = Math.min(param.max, Math.max(param.min, value));
	const snapped = param.min + Math.round((clamped - param.min) / param.step) * param.step;
	const fixed = Number(snapped.toFixed(decimalsOf(param.step)));
	return Math.min(param.max, Math.max(param.min, fixed));
}

function parseRange(param: RangeParam, raw: string | null): number {
	if (raw === null || raw.trim() === "") return param.default;
	const value = Number(raw);
	return Number.isFinite(value) ? snapRange(param, value) : param.default;
}

function parseEnum<T extends string>(param: EnumParam<T>, raw: string | null): T {
	return param.options.find((option) => option === raw) ?? param.default;
}

function parseBool(param: BoolParam, raw: string | null): boolean {
	if (raw === "1" || raw === "true") return true;
	if (raw === "0" || raw === "false") return false;
	return param.default;
}

/** How `build` turns one table row into a value; swapped between defaults and URL decoding. */
interface Reader {
	range(param: RangeParam): number;
	choice<T extends string>(param: EnumParam<T>): T;
	flag(param: BoolParam): boolean;
}

/**
 * Assemble a full config by asking `read` for each key.
 *
 * Why: the only place that spells out every key, so both the defaults and the
 * decoder are type-checked for completeness without any cast.
 */
function build(read: Reader): MoshConfig {
	return {
		scale: read.range(SPECS.scale),
		block: read.range(SPECS.block),
		gain: read.range(SPECS.gain),
		radius: read.range(SPECS.radius),
		maxVector: read.range(SPECS.maxVector),
		decay: read.range(SPECS.decay),
		jitter: read.range(SPECS.jitter),
		mvStep: read.range(SPECS.mvStep),
		skip: read.range(SPECS.skip),
		mismatch: read.range(SPECS.mismatch),
		healIn: read.range(SPECS.healIn),
		healOut: read.range(SPECS.healOut),
		leak: read.range(SPECS.leak),
		gop: read.range(SPECS.gop),
		lostRate: read.range(SPECS.lostRate),
		lostDelayMs: read.range(SPECS.lostDelayMs),
		flashCap: read.range(SPECS.flashCap),
		enterMs: read.range(SPECS.enterMs),
		recoverMs: read.range(SPECS.recoverMs),
		fps: read.range(SPECS.fps),
		seed: read.choice(SPECS.seed),
		gifSource: read.choice(SPECS.gifSource),
		dct: read.range(SPECS.dct),
		chroma: read.range(SPECS.chroma),
		overlay: read.flag(SPECS.overlay),
	};
}

/**
 * The default config, derived from {@link MOSH_PARAMS} (no duplicated literals).
 *
 * Why: the design report's start values; the playground's Reset restores them.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export const DEFAULT_MOSH_CONFIG: Readonly<MoshConfig> = build({
	range: (param) => param.default,
	choice: (param) => param.default,
	flag: (param) => param.default,
});

/**
 * Serialise a config to `m-<key>=<value>` query params, non-default values only.
 *
 * Why: keeps shared playground URLs short and means an unchanged config encodes to
 * the empty string. Numbers print via `String`, booleans as `1`/`0`.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function encodeMoshConfig(config: MoshConfig): string {
	const params = new URLSearchParams();
	for (const param of MOSH_PARAMS) {
		const value = config[param.key];
		if (value === param.default) continue;
		params.set(
			`${PARAM_PREFIX}${param.key}`,
			typeof value === "boolean" ? (value ? "1" : "0") : String(value),
		);
	}
	return params.toString();
}

/**
 * Parse `m-<key>` params from a query string over the defaults.
 *
 * Numbers are clamped to range and snapped to `step`; unknown keys, bad numbers and
 * values outside an enum are ignored. `decode(encode(c))` equals `c` for any
 * in-range, step-snapped `c`.
 *
 * Why: URLs are user-editable, so nothing read from one may reach the engine
 * unvalidated.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function decodeMoshConfig(search: string): MoshConfig {
	const params = new URLSearchParams(search);
	const raw = (param: MoshParam): string | null => params.get(`${PARAM_PREFIX}${param.key}`);
	return build({
		range: (param) => parseRange(param, raw(param)),
		choice: (param) => parseEnum(param, raw(param)),
		flag: (param) => parseBool(param, raw(param)),
	});
}

/**
 * Apply one control's raw string value to a live config, in place.
 *
 * Range values are clamped and snapped, enum values must be a listed option,
 * booleans are `1`/`true`; anything else leaves the config untouched.
 *
 * Why: the playground feeds `<input>` strings straight in, and the shell reads the
 * same object every frame, so mutation (not replacement) is the contract.
 *
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function setMoshParam(config: MoshConfig, param: MoshParam, raw: string): void {
	switch (param.kind) {
		case "range": {
			const value = Number(raw);
			if (raw.trim() !== "" && Number.isFinite(value)) {
				Object.assign(config, { [param.key]: snapRange(param, value) });
			}
			return;
		}
		case "enum": {
			const option = param.options.find((candidate) => candidate === raw);
			if (option !== undefined) Object.assign(config, { [param.key]: option });
			return;
		}
		case "bool":
			Object.assign(config, { [param.key]: raw === "1" || raw === "true" });
	}
}
