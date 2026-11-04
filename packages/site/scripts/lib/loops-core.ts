/**
 * Pure core of the loop encode pipeline (`scripts/encode-loops.ts`): recipe schema,
 * filtergraph / ffmpeg argument builders, codecs-string derivation, file naming,
 * size budgets, prune planning, manifest ↔ files diffing and manifest serialisation.
 * Nothing here spawns a process or touches the disk, so it is unit-testable without ffmpeg.
 *
 * Why: the CLI is thin glue; every decision that can be wrong (golden filtergraph, codecs
 * string, budgets, orphan detection) lives here where tests pin it.
 * @see packages/specs/specs/09-project-view.md § P9-4
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */

import { createHash } from "node:crypto";
import { z } from "astro/zod";
import {
	type CardAspect,
	cardAspectSchema,
	type LoopsManifest,
	loopKindSchema,
} from "../../src/lib/loops/manifest";

/** Rendition names. */
export type SizeName = "card" | "banner";

/** Output codec names as used in file names. */
export type CodecName = "av1" | "h264";

/**
 * Per-size encode settings and flash-lint geometry.
 * Card/gallery is 1024x576 by default (720x405 has an odd height; neither encoder accepts it), banner 1920x1080.
 * The card `width`/`height` here are the default 16:9 frame only: a recipe with a `cardAspect` encodes the
 * card at `CARD_FRAMES[cardAspect]`, so read sizes through {@link frameFor}, never from this table.
 * `av1Crf` / `x264Crf` apply to montage and transcode loops; `slideshowAv1Crf` / `slideshowX264Crf`
 * to slideshows (UI screenshots: thin text and hard edges show quantisation first, so they get a lower CRF).
 * `renderWidthCss` is the largest CSS width the size may be rendered at (the lint's field scale).
 * `cellPx` is the flash-lint cell edge in video px (appendix §3.1); banner 12 px at 1920 wide is the same
 * 8 CSS px cell (160x90 grid) the 1280 encode used. The card's 16/3 px at 1024 wide is 6.25 CSS px at the
 * card's 1200 CSS px, the same 192x108 grid the 768x432 card had ({@link gridFor} rounds it per frame).
 * Why: values come from the spec's encode table with the review's 768x432 override; the banner was raised
 * from 1280x720 to 1920x1080 (and the CRFs and budgets with it) because the owner found it too soft on
 * DPR-2 screens (ADR 0044 addendum). The card went from 768x432 to 1024x576 for the same reason at two
 * masonry columns (addendum 4): level 3.1 because 1024x576 is above level 3.0's 414,720 px, and the
 * 270 / 540 KB budgets are the old 150 / 300 KB times the 16/9 area ratio.
 * @see packages/specs/specs/09-project-view.md § P9-4
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export const SIZE_SPECS = {
	card: {
		width: 1024,
		height: 576,
		av1Crf: 38,
		x264Crf: 26,
		slideshowAv1Crf: 38,
		slideshowX264Crf: 26,
		x264Level: "3.1",
		renderWidthCss: 1200,
		cellPx: 16 / 3,
		failBytes: 540 * 1024,
		warnBytes: 270 * 1024,
	},
	banner: {
		width: 1920,
		height: 1080,
		av1Crf: 30,
		x264Crf: 22,
		slideshowAv1Crf: 28,
		slideshowX264Crf: 20,
		x264Level: "4.0",
		renderWidthCss: 1280,
		cellPx: 12,
		failBytes: 2.5 * 1024 * 1024,
		warnBytes: 1.5 * 1024 * 1024,
	},
} as const satisfies Record<SizeName, unknown>;

/** A frame size in px. */
export interface Frame {
	readonly width: number;
	readonly height: number;
}

/**
 * Card rendition frame per aspect: about 1024x576's pixel area (589,824 px, within ±5 %), exact ratio,
 * even sides.
 * Why: a non-16:9 tile keeps the media's natural shape (ADR 0044 addendum 2) without growing the card
 * files; the byte budgets (270 / 540 KB) were set for ~590 k px. These are the addendum 2 frames
 * (about 332 k px) scaled by 4/3 on each side (addendum 4), so a tile of about 650 CSS px at two masonry
 * columns is no longer upscaled on DPR 2. 4:5 is 680x850 and 16:10 is 976x610: not multiples of the lint's
 * cell, which {@link gridFor} rounds.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export const CARD_FRAMES = {
	"1:1": { width: 768, height: 768 },
	"4:5": { width: 680, height: 850 },
	"3:4": { width: 672, height: 896 },
	"4:3": { width: 896, height: 672 },
	"3:2": { width: 924, height: 616 },
	"16:10": { width: 976, height: 610 },
	"16:9": { width: 1024, height: 576 },
} as const satisfies Record<CardAspect, Frame>;

/**
 * Bump when the encoder settings, filtergraph or colour tagging change, so the recipe hash
 * changes and every loop is re-encoded.
 * Why: the manifest `recipe` hash must cover the settings, not just the recipe JSON.
 * History: 3 = banner 1920x1080, lower CRFs, poster cut from the banner master (ADR 0044 addendum);
 * 4 = card frames x 4/3 on each side, card H.264 level 3.1 (ADR 0044 addendum 4).
 */
export const ENCODER_VERSION = 4;

/** A relative path under the media root: no absolute path, no `..`, no backslash, no drive letter. */
const relPath = z
	.string()
	.min(1)
	.refine(
		(p) =>
			!p.startsWith("/") &&
			!p.includes("\\") &&
			!/^[A-Za-z]:/.test(p) &&
			!p.split("/").includes(".."),
		"path must be relative to --media-root (no absolute path, no '..')",
	);

const cropSchema = z.strictObject({
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	w: z.number().int().positive(),
	h: z.number().int().positive(),
});

const fitSchema = z.enum(["cover", "contain"]);

const shotSchema = z.strictObject({
	src: relPath,
	start: z.number().nonnegative().optional(),
	duration: z.number().min(1).max(10),
	fit: fitSchema,
	crop: cropSchema.optional(),
	cardCrop: cropSchema.optional(),
});

const slideSchema = z.strictObject({
	src: relPath,
	hold: z.number().min(0.8).max(2),
	fit: fitSchema,
	cardCrop: cropSchema.optional(),
});

const stillSchema = z.strictObject({
	src: relPath,
	crop: cropSchema.optional(),
	out: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const isIntegerFrames = (seconds: number, fps: number): boolean => {
	const frames = seconds * fps;
	return Math.abs(frames - Math.round(frames)) < 1e-6;
};

/**
 * Recipe: how one loop is built from sources under the media root.
 * Montage shots are 1.0–2.0 s (hard cuts); a transcode is a single shot (up to 10 s);
 * a slideshow holds each slide 0.8–2.0 s. `duration × fps` / `hold × fps` must be integers.
 * `aspect` is the master (banner) aspect, always 16:9. `cardAspect` (default 16:9) is the card/gallery
 * rendition's aspect, so the home tile keeps the media's natural shape; a shot or slide's `cardCrop`
 * (source px) replaces its `crop` on the card master only, so the banner keeps its framing.
 * Why: Zod-validated so a bad recipe exits 1 before ffmpeg runs; paths are relative so no
 * local absolute path is ever committed.
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export const recipeSchema = z
	.strictObject({
		slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
		kind: loopKindSchema,
		aspect: z.literal("16:9"),
		cardAspect: cardAspectSchema.optional(),
		fps: z.number().positive().optional(),
		sizes: z
			.array(z.enum(["card", "banner"]))
			.min(1)
			.refine((s) => new Set(s).size === s.length, "sizes must be unique")
			.refine((s) => s.includes("card"), "sizes must include 'card'"),
		shots: z.array(shotSchema).optional(),
		slides: z.array(slideSchema).optional(),
		poster: z.strictObject({ at: z.number().nonnegative() }),
		stills: z.array(stillSchema).optional(),
	})
	.superRefine((r, ctx) => {
		const fps = effectiveFps(r);
		if (r.kind === "slideshow") {
			if (!r.slides || r.slides.length < 1)
				ctx.addIssue({ code: "custom", message: "slideshow needs slides[]", path: ["slides"] });
			if (r.shots)
				ctx.addIssue({ code: "custom", message: "slideshow takes no shots[]", path: ["shots"] });
			for (const [i, s] of (r.slides ?? []).entries())
				if (!isIntegerFrames(s.hold, fps))
					ctx.addIssue({
						code: "custom",
						message: `hold × fps (${s.hold} × ${fps}) must be an integer`,
						path: ["slides", i, "hold"],
					});
		} else {
			if (!r.shots || r.shots.length < 1)
				ctx.addIssue({ code: "custom", message: `${r.kind} needs shots[]`, path: ["shots"] });
			if (r.slides)
				ctx.addIssue({ code: "custom", message: `${r.kind} takes no slides[]`, path: ["slides"] });
			if (r.kind === "transcode" && (r.shots?.length ?? 0) !== 1)
				ctx.addIssue({
					code: "custom",
					message: "transcode takes exactly one shot",
					path: ["shots"],
				});
			for (const [i, s] of (r.shots ?? []).entries()) {
				if (r.kind === "montage" && s.duration > 2)
					ctx.addIssue({
						code: "custom",
						message: "montage shots are 1.0–2.0 s",
						path: ["shots", i, "duration"],
					});
				if (!isIntegerFrames(s.duration, fps))
					ctx.addIssue({
						code: "custom",
						message: `duration × fps (${s.duration} × ${fps}) must be an integer`,
						path: ["shots", i, "duration"],
					});
			}
		}
		if (r.poster.at >= totalDuration(r))
			ctx.addIssue({
				code: "custom",
				message: "poster.at must be inside the loop",
				path: ["poster", "at"],
			});
	});

/** A validated recipe. @see recipeSchema */
export type Recipe = z.infer<typeof recipeSchema>;

/**
 * Effective frame rate: explicit `fps`, else 10 for slideshows and 30 otherwise.
 * Why: spec § P9-4 (slideshow 10 fps so hold × fps is an integer).
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export function effectiveFps(r: Pick<Recipe, "kind" | "fps">): number {
	return r.fps ?? (r.kind === "slideshow" ? 10 : 30);
}

/**
 * Total loop duration in seconds (sum of shot durations or slide holds).
 * Why: stored in the manifest and used to validate the probed duration.
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export function totalDuration(r: Pick<Recipe, "kind" | "shots" | "slides">): number {
	const items: readonly { duration?: number; hold?: number }[] =
		r.kind === "slideshow" ? (r.slides ?? []) : (r.shots ?? []);
	return items.reduce((a, it) => a + (it.duration ?? it.hold ?? 0), 0);
}

/** Every source path a recipe reads (loop inputs and stills), in recipe order. */
export function recipeSources(r: Recipe): string[] {
	const loop =
		r.kind === "slideshow" ? (r.slides ?? []).map((s) => s.src) : (r.shots ?? []).map((s) => s.src);
	return [...loop, ...(r.stills ?? []).map((s) => s.src)];
}

/**
 * Frame size of a rendition: the banner is always 1920x1080; the card follows the recipe's `cardAspect`
 * (16:9 when absent).
 * Why: the one place that knows the card is not always 1024x576, so master, probe check, lint grid and
 * manifest all agree.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function frameFor(r: Pick<Recipe, "cardAspect">, size: SizeName): Frame {
	if (size === "banner")
		return { width: SIZE_SPECS.banner.width, height: SIZE_SPECS.banner.height };
	return CARD_FRAMES[r.cardAspect ?? "16:9"];
}

/**
 * The CSS render width the flash lint assumes for a rendition (`FlashInput.renderWidthCss`, recorded in the manifest).
 * Banner: the table's 1280. Card: the frame's width × 1200 / 1024, i.e. the lint keeps the 16:9 card's worst-case
 * magnification of 1.171875 CSS px per video px for every aspect (a 768 px square is assumed at 900 CSS px).
 * Why: the 1200 was a magnification cap, not a layout width; applying it as a width to a square or portrait
 * frame would assume a 1200 CSS px tall tile no layout can show (home columns are at most ~650 px wide) and
 * make the same footage fail merely for being square. Equal magnification gives a framing the same verdict
 * as the 16:9 card would get for the same pixels (ADR 0044 addendum 2). The card frames grew by 4/3 on each
 * side with this table's width (addendum 4), so the assumed CSS widths per aspect stayed (900 for the
 * square, 1200 for 16:9): the lint field and area are the same fractions of the frame as before, and a
 * sharper encode does not change a verdict.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function renderWidthCssFor(size: SizeName, frame: Frame): number {
	const s = SIZE_SPECS[size];
	if (size === "banner") return s.renderWidthCss;
	return Math.round((frame.width * s.renderWidthCss) / s.width);
}

/**
 * Whether the card needs its own poster (`card-poster.png`): the recipe has a banner (whose master the
 * main poster is cut from) and the card is framed differently, by aspect or by a `cardCrop`.
 * Why: a poster of another framing than the video would jump when the video fades in over it.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function wantsCardPoster(
	r: Pick<Recipe, "cardAspect" | "sizes" | "kind" | "shots" | "slides">,
): boolean {
	if (!r.sizes.includes("banner")) return false;
	if ((r.cardAspect ?? "16:9") !== "16:9") return true;
	const items: readonly { cardCrop?: unknown }[] =
		r.kind === "slideshow" ? (r.slides ?? []) : (r.shots ?? []);
	return items.some((it) => it.cardCrop !== undefined);
}

/** A JSON value. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json | undefined };

/** JSON with recursively sorted object keys (stable hashing / diffs). */
export function canonicalJson(value: Json): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: Json): Json {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") {
		const out: { [k: string]: Json } = {};
		for (const [k, v] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
			if (v !== undefined) out[k] = sortKeys(v);
		return out;
	}
	return value;
}

/**
 * Returns `v`, or throws when it is `undefined`.
 * Why: replaces `as` assertions (type-coverage `--strict` forbids them) with a checked narrowing.
 * @see CLAUDE.md
 */
export function must<T>(v: T | undefined, what: string): T {
	if (v === undefined) throw new Error(`internal: missing ${what}`);
	return v;
}

/** Message of an unknown thrown value. */
export function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/**
 * First 8 hex chars of the sha256 of the given bytes or string.
 * Why: the content hash embedded in output file names (cache-busting + integrity check).
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export function sha8(data: string | Uint8Array): string {
	return createHash("sha256").update(data).digest("hex").slice(0, 8);
}

/**
 * Hash of everything that determines the encode result: the canonical recipe, the encoder
 * version and the sha256 of every source file (in recipe order).
 * Why: an unchanged hash means the encode can be skipped.
 * @see packages/specs/specs/09-project-view.md § P9-4 ("Skip")
 */
export function recipeHash(r: Recipe, sourceHashes: readonly string[]): string {
	return sha8(`${canonicalJson(r)}|v${ENCODER_VERSION}|${sourceHashes.join(",")}`);
}

/** The color tagging flags we pass to every encode (and the master) so decoders do not guess. */
const COLOR_TAGS = [
	"-colorspace",
	"bt709",
	"-color_primaries",
	"bt709",
	"-color_trc",
	"bt709",
	"-color_range",
	"tv",
] as const;

/** Result of {@link buildMasterGraph}. */
export interface MasterGraph {
	/** Per-input ffmpeg args (`-ss/-t/-i` or `-loop/-framerate/-t/-i`), flattened, with paths as given. */
	readonly inputArgs: string[];
	/** The `-filter_complex` string; the final stream is labelled `[v]`. */
	readonly filterComplex: string;
}

/**
 * Builds the master filtergraph: each input is normalised
 * (`fps → [crop] → scale (increase|decrease) → crop|pad → setsar=1 → BT.709 tv yuv420p`) and the inputs are
 * joined with `concat=n=N:v=1:a=0`: hard cuts, no xfade, no audio.
 * `resolve` maps a recipe-relative path to the path handed to ffmpeg.
 * Why: golden-tested so filtergraph changes are deliberate.
 * @see https://ffmpeg.org/ffmpeg-filters.html#concat
 */
/** Still-image sources: looped for the shot's duration instead of trimmed. */
const STILL_EXT = /\.(png|jpe?g|webp)$/i;

export function buildMasterGraph(
	r: Recipe,
	size: SizeName,
	resolve: (p: string) => string = (p) => p,
): MasterGraph {
	const { width: w, height: h } = frameFor(r, size);
	const fps = effectiveFps(r);
	const inputArgs: string[] = [];
	const chains: string[] = [];
	const items =
		r.kind === "slideshow"
			? (r.slides ?? []).map((s) => ({
					src: s.src,
					fit: s.fit,
					crop: size === "card" ? s.cardCrop : undefined,
					len: s.hold,
					start: 0,
				}))
			: (r.shots ?? []).map((s) => ({
					src: s.src,
					fit: s.fit,
					crop: size === "card" ? (s.cardCrop ?? s.crop) : s.crop,
					len: s.duration,
					start: s.start ?? 0,
				}));
	for (const [i, it] of items.entries()) {
		if (r.kind === "slideshow")
			inputArgs.push(
				"-loop",
				"1",
				"-framerate",
				String(fps),
				"-t",
				String(it.len),
				"-i",
				resolve(it.src),
			);
		else if (STILL_EXT.test(it.src))
			inputArgs.push(
				"-loop",
				"1",
				"-framerate",
				String(fps),
				"-t",
				String(it.len),
				"-i",
				resolve(it.src),
			);
		// Why: input seeking (`-ss/-t` before `-i`) drops frames on GIFs; normalise the rate
		// first, then cut with `trim`, so every shot yields exactly len × fps frames.
		else inputArgs.push("-i", resolve(it.src));
		const parts = [`fps=${fps}`];
		if (r.kind !== "slideshow" && !STILL_EXT.test(it.src))
			parts.push(`trim=start=${it.start}:duration=${it.len}`, "setpts=PTS-STARTPTS");
		if (it.crop) parts.push(`crop=${it.crop.w}:${it.crop.h}:${it.crop.x}:${it.crop.y}`);
		if (it.fit === "cover")
			parts.push(`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`);
		else
			parts.push(
				`scale=${w}:${h}:force_original_aspect_ratio=decrease`,
				`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
			);
		parts.push("setsar=1", "scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p");
		chains.push(`[${i}:v]${parts.join(",")}[v${i}]`);
	}
	const labels = items.map((_, i) => `[v${i}]`).join("");
	chains.push(`${labels}concat=n=${items.length}:v=1:a=0[v]`);
	return { inputArgs, filterComplex: chains.join(";") };
}

/**
 * ffmpeg args that render the master (FFV1, lossless, BT.709 tagged) from {@link buildMasterGraph}.
 * Why: the master is only an intermediate in a temp dir; encodes read from it so each size scales sources once.
 * @see https://ffmpeg.org/ffmpeg-codecs.html#FFV1
 */
export function masterArgs(g: MasterGraph, outFile: string): string[] {
	return [
		"-v",
		"error",
		"-y",
		...g.inputArgs,
		"-filter_complex",
		g.filterComplex,
		"-map",
		"[v]",
		"-an",
		"-c:v",
		"ffv1",
		"-level",
		"3",
		"-pix_fmt",
		"yuv420p",
		...COLOR_TAGS,
		outFile,
	];
}

/**
 * The CRF for one encode: slideshows use the lower `slideshow*Crf`, everything else the plain `*Crf`.
 * Why: UI-screenshot slideshows show quantisation (ringing around text) long before footage does.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function crfFor(kind: Recipe["kind"], size: SizeName, codec: CodecName): number {
	const s = SIZE_SPECS[size];
	if (codec === "av1") return kind === "slideshow" ? s.slideshowAv1Crf : s.av1Crf;
	return kind === "slideshow" ? s.slideshowX264Crf : s.x264Crf;
}

/**
 * ffmpeg args for one lossy encode from the master.
 * AV1: `libsvtav1 -preset 4 -crf <crfFor>`; H.264: `libx264 -preset veryslow -crf <crfFor> -profile:v high
 * -level:v <3.1 card | 4.0 banner>` (+`-tune stillimage` for slideshows).
 * All: `-an -pix_fmt yuv420p -movflags +faststart`.
 * Why: values from the spec's encode table (banner raised to 1080p, see ADR 0044 addendum); colour tagged explicitly.
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export function encodeArgs(
	kind: Recipe["kind"],
	size: SizeName,
	codec: CodecName,
	input: string,
	output: string,
): string[] {
	const s = SIZE_SPECS[size];
	const crf = String(crfFor(kind, size, codec));
	const video =
		codec === "av1"
			? ["-c:v", "libsvtav1", "-preset", "4", "-crf", crf]
			: [
					"-c:v",
					"libx264",
					"-preset",
					"veryslow",
					"-crf",
					crf,
					"-profile:v",
					"high",
					"-level:v",
					s.x264Level,
					...(kind === "slideshow" ? ["-tune", "stillimage"] : []),
				];
	return [
		"-v",
		"error",
		"-y",
		"-i",
		input,
		"-an",
		...video,
		"-pix_fmt",
		"yuv420p",
		...COLOR_TAGS,
		"-movflags",
		"+faststart",
		output,
	];
}

/** The subset of `ffprobe -show_streams` we use. */
export interface VideoProbe {
	readonly codec_name: string;
	readonly profile?: string;
	readonly level?: number;
	readonly width: number;
	readonly height: number;
	readonly pix_fmt?: string;
}

/**
 * Derives the `<source type>` value from an ffprobe result (measured, not assumed):
 * H.264 High@3.0 → `avc1.64001E`, @3.1 → `avc1.64001F`, @4.0 → `avc1.640028`;
 * AV1 Main, `seq_level_idx` n, 8-bit → `av01.0.<nn>M.08` (card 1024x576 → `04`, banner 1920x1080 → `08`).
 * Throws on anything else (unexpected profile, bit depth).
 * Why: wrong codecs strings make browsers skip a source, so they come from the real file.
 * @see https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/codecs_parameter
 */
export function codecsFromProbe(p: VideoProbe): string {
	if (p.level === undefined) throw new Error("probe has no level");
	if (p.codec_name === "h264") {
		const profileByte: Record<string, string> = {
			Baseline: "42",
			"Constrained Baseline": "42",
			Main: "4D",
			High: "64",
		};
		const pb = profileByte[p.profile ?? ""];
		if (!pb) throw new Error(`unsupported H.264 profile: ${p.profile}`);
		const lvl = p.level.toString(16).toUpperCase().padStart(2, "0");
		return `video/mp4; codecs="avc1.${pb}00${lvl}"`;
	}
	if (p.codec_name === "av1") {
		if (p.profile !== "Main") throw new Error(`unsupported AV1 profile: ${p.profile}`);
		if (p.pix_fmt !== undefined && p.pix_fmt !== "yuv420p")
			throw new Error(`not 8-bit 4:2:0: ${p.pix_fmt}`);
		return `video/mp4; codecs="av01.0.${String(p.level).padStart(2, "0")}M.08"`;
	}
	throw new Error(`unsupported codec: ${p.codec_name}`);
}

/** `card.1a2b3c4d.av1.mp4`. */
export function outputName(size: SizeName, hash: string, codec: CodecName): string {
	return `${size}.${hash}.${codec}.mp4`;
}

/** Strict pattern of files this pipeline writes into `public/loops/<slug>/`. */
export const OUTPUT_NAME_RE = /^(?:card|banner)\.[0-9a-f]{8}\.(?:av1|h264)\.mp4$/;

/** Site-absolute URL of an output. */
export function outputUrl(slug: string, name: string): string {
	return `/loops/${slug}/${name}`;
}

/** Budget verdict for an encoded file. */
export type BudgetVerdict = "ok" | "warn" | "fail";

/**
 * Encode-time size budget: card/gallery fail > 540 KB, warn > 270 KB; banner (1080p) fail > 2.5 MB,
 * warn > 1.5 MB (KB = 1024 bytes).
 * Why: loops ship in the home page's critical path; the budget keeps them small. The banner limits were
 * raised from 1 MB / 600 KB with the move to 1920x1080 (ADR 0044 addendum), the card limits from 300 / 150 KB
 * with the 4/3 frames (about 1.78x the area, addendum 4); `route-budgets.config.ts` R6 matches.
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export function budgetVerdict(size: SizeName, bytes: number): BudgetVerdict {
	const s = SIZE_SPECS[size];
	if (bytes > s.failBytes) return "fail";
	if (bytes > s.warnBytes) return "warn";
	return "ok";
}

/**
 * Prune planning: files in a slug directory that match the output pattern but are not in `keep`.
 * Files that do not match the pattern are never listed.
 * Why: re-encoding changes hashed names; superseded files must not linger as orphans.
 * @see packages/specs/specs/09-project-view.md § P9-4 ("Superseded hashed files")
 */
export function planPrune(existing: readonly string[], keep: ReadonlySet<string>): string[] {
	return existing.filter((f) => OUTPUT_NAME_RE.test(f) && !keep.has(f)).sort();
}

/** A problem found by {@link diffManifestFiles}. */
export interface CheckProblem {
	readonly kind: "missing" | "bytes" | "hash" | "orphan" | "poster-missing";
	readonly path: string;
	readonly detail: string;
}

/** What is on disk under `public/` for one loop file. */
export interface FileFact {
	readonly bytes: number;
	readonly sha8: string;
}

/**
 * Compares the manifest with the files on disk. `files` is keyed by site-absolute URL
 * (`/loops/<slug>/<name>`); `posters` holds the existing `posterPath`s and `cardPosterPath`s.
 * Reports missing files, byte-size mismatches, file-name hash ≠ content hash, orphans and missing posters.
 * Why: `check:media` guarantees the committed tree is self-consistent without needing ffmpeg.
 * @see packages/specs/specs/09-project-view.md § P9-4 (`--check`, exit 5)
 */
export function diffManifestFiles(
	manifest: LoopsManifest,
	files: ReadonlyMap<string, FileFact>,
	posters: ReadonlySet<string>,
): CheckProblem[] {
	const problems: CheckProblem[] = [];
	const referenced = new Set<string>();
	for (const slug of Object.keys(manifest).sort()) {
		const entry = manifest[slug];
		if (!entry) continue;
		if (!posters.has(entry.posterPath))
			problems.push({
				kind: "poster-missing",
				path: entry.posterPath,
				detail: `poster of ${slug}`,
			});
		if (entry.cardPosterPath !== undefined && !posters.has(entry.cardPosterPath))
			problems.push({
				kind: "poster-missing",
				path: entry.cardPosterPath,
				detail: `card poster of ${slug}`,
			});
		for (const size of [entry.card, entry.banner]) {
			if (!size) continue;
			for (const src of size.sources) {
				referenced.add(src.url);
				const fact = files.get(src.url);
				if (!fact) {
					problems.push({
						kind: "missing",
						path: src.url,
						detail: "listed in loops.json, not on disk",
					});
					continue;
				}
				if (fact.bytes !== src.bytes)
					problems.push({
						kind: "bytes",
						path: src.url,
						detail: `manifest ${src.bytes} bytes, disk ${fact.bytes}`,
					});
				const nameHash = src.url.split(".").at(-3);
				if (nameHash !== fact.sha8)
					problems.push({
						kind: "hash",
						path: src.url,
						detail: `file name says ${nameHash}, content sha256 starts ${fact.sha8}`,
					});
			}
		}
	}
	for (const url of [...files.keys()].sort())
		if (!referenced.has(url))
			problems.push({ kind: "orphan", path: url, detail: "on disk, not listed in loops.json" });
	return problems;
}

/**
 * Serialises the manifest with recursively sorted keys, tab-indented, trailing newline
 * (Biome-compatible, stable diffs).
 * Why: spec § P9-4 requires sorted keys.
 * @see packages/specs/specs/09-project-view.md § P9-4
 */
export function serializeManifest(m: LoopsManifest): string {
	return `${JSON.stringify(sortKeys(m), null, "\t")}\n`;
}

/**
 * ffmpeg args that decode a finished MP4 into linear-light float cells (planar G,B,R `gbrpf32le`,
 * `gridW × gridH` per frame) for the flash lint — the validated command from the appendix §3.5.
 * Why: ffmpeg does the colour math (BT.709 tv → sRGB → linear) and area-averaging in linear light.
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3.5
 */
export function cellsArgs(file: string, gridW: number, gridH: number): string[] {
	return [
		"-v",
		"error",
		"-i",
		file,
		"-fps_mode",
		"passthrough",
		"-vf",
		"scale=in_range=tv:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24," +
			"zscale=rin=full:r=full:min=709:m=709:tin=iec61966-2-1:t=linear:npl=100," +
			`format=gbrpf32le,scale=${gridW}:${gridH}:flags=area`,
		"-f",
		"rawvideo",
		"-pix_fmt",
		"gbrpf32le",
		"-",
	];
}

/**
 * Flash-lint grid for a size: about `cellPx`-px cells over `frame` (default: the size's default frame),
 * the cell count rounded to a whole number per side.
 * Why: a non-16:9 card has fewer or more cells per side. The card cell is 16/3 px (the 768x432 card's
 * 6.25 CSS px cell at the new scale), which divides the 16:9 and 1:1 frames exactly (192x108, 144x144) and
 * the others to within half a cell; the lint reads the true cell size from `width / gridW`.
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */
export function gridFor(
	size: SizeName,
	frame: Frame = SIZE_SPECS[size],
): { gridW: number; gridH: number } {
	const s = SIZE_SPECS[size];
	return { gridW: Math.round(frame.width / s.cellPx), gridH: Math.round(frame.height / s.cellPx) };
}
