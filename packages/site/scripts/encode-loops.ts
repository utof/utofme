/**
 * Loop encode pipeline CLI.
 *
 *   bun run media:encode [<slug>...] [--all] [--force] [--dry-run] [--media-root <dir>] [--site-root <dir>]
 *   bun run check:media                      # = --check; needs neither ffmpeg nor a media root
 *
 * Reads recipes from `media/recipes/*.json`, builds a lossless FFV1 master per size in a temp dir,
 * encodes AV1 + H.264 MP4s, flash-lints the FINAL H.264 encode of each size, enforces size budgets and
 * writes hashed outputs to `public/loops/<slug>/`, the poster to `src/assets/loops/<slug>/poster.png`,
 * stills to `src/assets/works/<slug>/` and the manifest `src/data/loops.json`.
 *
 * Exit codes: 0 ok · 1 recipe/validation/usage error · 2 ffmpeg/ffprobe failure (or missing tool)
 * · 3 size budget · 4 flash lint · 5 `--check` mismatch.
 *
 * Why: outputs are committed, so builds and CI never need ffmpeg; this CLI is the only producer.
 * @see packages/specs/specs/09-project-view.md § P9-4
 * @see packages/specs/adrs/0044-video-loops-pipeline.md
 */

import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import {
	type LoopEntry,
	type LoopFlash,
	type LoopSize,
	type LoopSource,
	type LoopsManifest,
	loopsManifestSchema,
} from "../src/lib/loops/manifest";
import { analyzeFlashes, cellsFromGbrpf32 } from "./lib/flash-lint";
import {
	budgetVerdict,
	buildMasterGraph,
	type CodecName,
	cellsArgs,
	codecsFromProbe,
	diffManifestFiles,
	effectiveFps,
	encodeArgs,
	errMsg,
	type FileFact,
	gridFor,
	masterArgs,
	must,
	outputName,
	outputUrl,
	planPrune,
	type Recipe,
	recipeHash,
	recipeSchema,
	recipeSources,
	SIZE_SPECS,
	type SizeName,
	serializeManifest,
	sha8,
	totalDuration,
	type VideoProbe,
} from "./lib/loops-core";

/** An error that carries the CLI exit code. */
class CliError extends Error {
	constructor(
		readonly code: 1 | 2 | 3 | 4 | 5,
		message: string,
	) {
		super(message);
	}
}

interface Options {
	slugs: string[];
	all: boolean;
	force: boolean;
	dryRun: boolean;
	check: boolean;
	mediaRoot: string | undefined;
	siteRoot: string;
}

function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv): Options {
	const o: Options = {
		slugs: [],
		all: false,
		force: false,
		dryRun: false,
		check: false,
		mediaRoot: env.UTOFME_MEDIA_ROOT || undefined,
		siteRoot: resolve(import.meta.dirname, ".."),
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === undefined) break;
		if (a === "--all") o.all = true;
		else if (a === "--force") o.force = true;
		else if (a === "--dry-run") o.dryRun = true;
		else if (a === "--check") o.check = true;
		else if (a === "--media-root" || a === "--site-root") {
			const v = argv[++i];
			if (v === undefined) throw new CliError(1, `${a} needs a value`);
			if (a === "--media-root") o.mediaRoot = v;
			else o.siteRoot = resolve(v);
		} else if (a.startsWith("--")) throw new CliError(1, `unknown option ${a}`);
		else o.slugs.push(a);
	}
	return o;
}

function loadManifest(path: string): LoopsManifest {
	if (!existsSync(path)) return {};
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(path, "utf8"));
	} catch (e) {
		throw new CliError(1, `${path}: invalid JSON (${errMsg(e)})`);
	}
	const r = loopsManifestSchema.safeParse(json);
	if (!r.success) throw new CliError(1, `${path}: ${r.error.message}`);
	return r.data;
}

function listFilesRec(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...listFilesRec(p));
		else out.push(p);
	}
	return out;
}

function fileFact(path: string): FileFact {
	const buf = readFileSync(path);
	return { bytes: buf.length, sha8: sha8(buf) };
}

/** `--check`: verify manifest ↔ files. No ffmpeg, no media root. */
function runCheck(o: Options): number {
	const manifest = loadManifest(join(o.siteRoot, "src/data/loops.json"));
	const pub = join(o.siteRoot, "public");
	const files = new Map<string, FileFact>();
	for (const f of listFilesRec(join(pub, "loops"))) {
		const rel = relative(pub, f).split("\\").join("/");
		files.set(`/${rel}`, fileFact(f));
	}
	const posters = new Set<string>();
	for (const e of Object.values(manifest))
		if (existsSync(join(o.siteRoot, e.posterPath))) posters.add(e.posterPath);
	const problems = diffManifestFiles(manifest, files, posters);
	if (problems.length === 0) {
		console.log(`check:media ok (${Object.keys(manifest).length} loop(s), ${files.size} file(s))`);
		return 0;
	}
	for (const p of problems) console.error(`check:media ${p.kind}: ${p.path} — ${p.detail}`);
	console.error(`check:media FAILED: ${problems.length} problem(s)`);
	return 5;
}

function loadRecipes(dir: string): Map<string, Recipe> {
	const out = new Map<string, Recipe>();
	if (!existsSync(dir)) return out;
	for (const f of readdirSync(dir)
		.filter((n) => n.endsWith(".json"))
		.sort()) {
		let json: unknown;
		try {
			json = JSON.parse(readFileSync(join(dir, f), "utf8"));
		} catch (e) {
			throw new CliError(1, `${f}: invalid JSON (${errMsg(e)})`);
		}
		const r = recipeSchema.safeParse(json);
		if (!r.success) throw new CliError(1, `${f}: ${r.error.message}`);
		if (out.has(r.data.slug)) throw new CliError(1, `${f}: duplicate slug ${r.data.slug}`);
		out.set(r.data.slug, r.data);
	}
	return out;
}

function run(cmd: string, args: readonly string[]): SpawnSyncReturns<Buffer> {
	const r = spawnSync(cmd, args, { maxBuffer: 1 << 30 });
	if (r.error) throw new CliError(2, `${cmd}: ${r.error.message}`);
	if (r.status !== 0)
		throw new CliError(2, `${cmd} exited ${r.status}: ${r.stderr.toString().trim().slice(-800)}`);
	return r;
}

function assertTools(): void {
	for (const t of ["ffmpeg", "ffprobe"]) {
		const r = spawnSync(t, ["-version"]);
		if (r.error || r.status !== 0) throw new CliError(2, `${t} not found on PATH`);
	}
	const f = spawnSync("ffmpeg", ["-hide_banner", "-filters"]);
	const out = f.stdout?.toString() ?? "";
	if (!/\bzscale\b/.test(out))
		throw new CliError(
			2,
			"ffmpeg has no `zscale` filter (needs --enable-libzimg); the flash lint cannot run. Install a full ffmpeg build.",
		);
	const e = spawnSync("ffmpeg", ["-hide_banner", "-encoders"]).stdout?.toString() ?? "";
	for (const enc of ["libsvtav1", "libx264", "ffv1"])
		if (!new RegExp(`\\b${enc}\\b`).test(e)) throw new CliError(2, `ffmpeg lacks encoder ${enc}`);
}

interface ProbeOut {
	probe: VideoProbe;
	frames: number;
}

function probe(file: string): ProbeOut {
	const r = run("ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=codec_name,profile,level,width,height,pix_fmt,nb_frames",
		"-of",
		"json",
		file,
	]);
	const s = (
		JSON.parse(r.stdout.toString()) as { streams: (VideoProbe & { nb_frames?: string })[] }
	).streams[0];
	if (!s) throw new CliError(2, `ffprobe: no video stream in ${file}`);
	return { probe: s, frames: Number(s.nb_frames ?? "0") };
}

interface BuiltSize {
	width: number;
	height: number;
	/** tmp file, final name, type, bytes in codec order av1, h264 */
	files: { tmp: string; name: string; type: string; bytes: number; codec: CodecName }[];
	maxEvents: number;
	maxRate: number;
	status: "pass" | "warn";
	master: string;
}

function hash8File(path: string): string {
	return sha8(readFileSync(path));
}

function buildSize(r: Recipe, size: SizeName, mediaRoot: string, tmp: string): BuiltSize {
	const spec = SIZE_SPECS[size];
	const fps = effectiveFps(r);
	const master = join(tmp, `${size}.master.mkv`);
	run(
		"ffmpeg",
		masterArgs(
			buildMasterGraph(r, size, (p) => join(mediaRoot, p)),
			master,
		),
	);
	const files: BuiltSize["files"] = [];
	const expectedFrames = Math.round(totalDuration(r) * fps);
	for (const codec of ["av1", "h264"] as const) {
		const out = join(tmp, `${size}.${codec}.mp4`);
		run("ffmpeg", encodeArgs(r.kind, size, codec, master, out));
		const { probe: p, frames } = probe(out);
		if (p.width !== spec.width || p.height !== spec.height)
			throw new CliError(
				2,
				`${size}/${codec}: got ${p.width}x${p.height}, expected ${spec.width}x${spec.height}`,
			);
		if (frames !== 0 && frames !== expectedFrames)
			throw new CliError(2, `${size}/${codec}: ${frames} frames, expected ${expectedFrames}`);
		const type = codecsFromProbe(p);
		files.push({
			tmp: out,
			name: outputName(size, hash8File(out), codec),
			type,
			bytes: statSync(out).size,
			codec,
		});
	}
	// Flash lint on the FINAL H.264 encode (what viewers see), not the master.
	const h264 = must(
		files.find((f) => f.codec === "h264"),
		"h264 encode",
	);
	const { gridW, gridH } = gridFor(size);
	const raw = run("ffmpeg", cellsArgs(h264.tmp, gridW, gridH)).stdout;
	const floats = new Float32Array(
		raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength - (raw.byteLength % 4)),
	);
	const { lum, red } = cellsFromGbrpf32(floats, gridW, gridH);
	if (lum.length !== expectedFrames)
		throw new CliError(
			2,
			`${size}: flash lint decoded ${lum.length} frames, expected ${expectedFrames}`,
		);
	const res = analyzeFlashes({
		width: spec.width,
		height: spec.height,
		gridW,
		gridH,
		fps,
		lum,
		red,
		renderWidthCss: spec.renderWidthCss,
	});
	for (const reason of res.reasons) console.warn(`  flash ${res.status} (${size}): ${reason}`);
	if (res.status === "fail")
		throw new CliError(
			4,
			`${r.slug}/${size}: flash lint failed — re-cut or shrink the flashing area`,
		);
	return {
		width: spec.width,
		height: spec.height,
		files,
		maxEvents: res.maxEventsPerWindow,
		maxRate: res.maxPerSecond,
		status: res.status,
		master,
	};
}

function encodeSlug(
	r: Recipe,
	o: Options,
	mediaRoot: string,
	manifest: LoopsManifest,
): "skipped" | "done" {
	const sources = recipeSources(r);
	const sourceHashes = sources.map((s) => {
		const p = join(mediaRoot, s);
		if (!existsSync(p)) throw new CliError(1, `${r.slug}: source not found under media root: ${s}`);
		return hash8File(p);
	});
	const hash = recipeHash(r, sourceHashes);
	const publicDir = join(o.siteRoot, "public/loops", r.slug);
	const existing = manifest[r.slug];
	if (existing && existing.recipe === hash && !o.force) {
		const urls = [existing.card, existing.banner].flatMap(
			(s) => s?.sources.map((x) => x.url) ?? [],
		);
		if (urls.every((u) => existsSync(join(o.siteRoot, "public", u)))) {
			console.log(`${r.slug}: up to date (recipe ${hash}); use --force to re-encode`);
			return "skipped";
		}
	}
	if (o.dryRun) {
		console.log(`${r.slug}: would encode (recipe ${hash}) sizes=${r.sizes.join(",")}`);
		for (const size of r.sizes) {
			console.log(
				`  ffmpeg ${masterArgs(
					buildMasterGraph(r, size, (p) => join(mediaRoot, p)),
					`<tmp>/${size}.master.mkv`,
				).join(" ")}`,
			);
			for (const codec of ["av1", "h264"] as const)
				console.log(
					`  ffmpeg ${encodeArgs(r.kind, size, codec, `<tmp>/${size}.master.mkv`, `<tmp>/${size}.${codec}.mp4`).join(" ")}`,
				);
		}
		return "skipped";
	}
	const tmp = mkdtempSync(join(tmpdir(), `loops-${r.slug}-`));
	try {
		const built = new Map<SizeName, BuiltSize>();
		for (const size of r.sizes) {
			console.log(`${r.slug}: encoding ${size}…`);
			built.set(size, buildSize(r, size, mediaRoot, tmp));
		}
		// Budgets (all sizes) before anything is written.
		let overBudget = false;
		for (const [size, b] of built)
			for (const f of b.files) {
				const v = budgetVerdict(size, f.bytes);
				const kb = (f.bytes / 1024).toFixed(1);
				if (v === "fail") {
					overBudget = true;
					console.error(`  budget FAIL ${size}/${f.codec}: ${kb} KB`);
				} else if (v === "warn") console.warn(`  budget warn ${size}/${f.codec}: ${kb} KB`);
				else console.log(`  ${size}/${f.codec}: ${kb} KB`);
			}
		if (overBudget) throw new CliError(3, `${r.slug}: size budget exceeded`);

		// Write outputs.
		mkdirSync(publicDir, { recursive: true });
		const keep = new Set<string>();
		for (const b of built.values())
			for (const f of b.files) {
				copyFileSync(f.tmp, join(publicDir, f.name));
				keep.add(f.name);
			}
		const posterRel = `src/assets/loops/${r.slug}/poster.png`;
		const cardB = must(built.get("card"), "card build");
		const cardMaster = cardB.master;
		mkdirSync(dirname(join(o.siteRoot, posterRel)), { recursive: true });
		run("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-ss",
			String(r.poster.at),
			"-i",
			cardMaster,
			"-frames:v",
			"1",
			join(o.siteRoot, posterRel),
		]);
		for (const st of r.stills ?? []) {
			const outFile = join(o.siteRoot, "src/assets/works", r.slug, `${st.out}.png`);
			mkdirSync(dirname(outFile), { recursive: true });
			const vf = st.crop ? ["-vf", `crop=${st.crop.w}:${st.crop.h}:${st.crop.x}:${st.crop.y}`] : [];
			run("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-i",
				join(mediaRoot, st.src),
				...vf,
				"-frames:v",
				"1",
				outFile,
			]);
		}
		const toSize = (b: BuiltSize): LoopSize => ({
			width: b.width,
			height: b.height,
			sources: b.files.map(
				(f): LoopSource => ({ url: outputUrl(r.slug, f.name), type: f.type, bytes: f.bytes }),
			),
		});
		const bannerB = built.get("banner");
		const flash: LoopFlash = {
			maxEventsPerWindow: Math.max(cardB.maxEvents, bannerB?.maxEvents ?? 0),
			maxPerSecond: Math.round(Math.max(cardB.maxRate, bannerB?.maxRate ?? 0) * 100) / 100,
			renderWidthCss: {
				card: SIZE_SPECS.card.renderWidthCss,
				banner: bannerB ? SIZE_SPECS.banner.renderWidthCss : null,
			},
			status: cardB.status === "warn" || bannerB?.status === "warn" ? "warn" : "pass",
		};
		const entry: LoopEntry = {
			recipe: hash,
			durationS: totalDuration(r),
			fps: effectiveFps(r),
			aspect: "16:9",
			card: toSize(cardB),
			banner: bannerB ? toSize(bannerB) : null,
			posterPath: posterRel,
			flash,
		};
		manifest[r.slug] = entry;
		// Prune superseded hashed files of this slug (exact-name pattern only).
		for (const f of planPrune(readdirSync(publicDir), keep)) {
			unlinkSync(join(publicDir, f));
			console.log(`  pruned ${f}`);
		}
		console.log(`${r.slug}: done (recipe ${hash})`);
		return "done";
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

function main(argv: readonly string[], env: NodeJS.ProcessEnv): number {
	const o = parseArgs(argv, env);
	if (o.check) return runCheck(o);
	const recipes = loadRecipes(join(o.siteRoot, "media/recipes"));
	const slugs = o.all ? [...recipes.keys()] : o.slugs;
	if (slugs.length === 0) throw new CliError(1, "give one or more slugs or --all");
	for (const s of slugs) if (!recipes.has(s)) throw new CliError(1, `no recipe with slug ${s}`);
	if (!o.mediaRoot)
		throw new CliError(1, "media root required: --media-root <dir> or UTOFME_MEDIA_ROOT");
	const mediaRoot = resolve(o.mediaRoot);
	if (!existsSync(mediaRoot)) throw new CliError(1, "media root does not exist");
	if (!o.dryRun) assertTools();
	const manifestPath = join(o.siteRoot, "src/data/loops.json");
	const manifest = loadManifest(manifestPath);
	// Why: save after every finished slug, so a later slug failing (e.g. flash lint) doesn't
	// leave earlier slugs' files on disk without manifest entries (they'd read as orphans).
	for (const s of slugs)
		if (encodeSlug(must(recipes.get(s), `recipe ${s}`), o, mediaRoot, manifest) === "done") {
			loopsManifestSchema.parse(manifest);
			mkdirSync(dirname(manifestPath), { recursive: true });
			writeFileSync(manifestPath, serializeManifest(manifest));
		}
	// Pruning only removes names matching the strict output pattern inside re-encoded slug dirs;
	// orphan directories of removed slugs are reported by --check and removed by hand.
	return 0;
}

try {
	process.exit(main(process.argv.slice(2), process.env));
} catch (e) {
	if (e instanceof CliError) {
		console.error(`media: ${e.message}`);
		process.exit(e.code);
	}
	throw e;
}
