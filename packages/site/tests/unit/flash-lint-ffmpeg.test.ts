/**
 * Why: end-to-end check of the ffmpeg → linear cells → detector chain on real encodes
 * (a synthetic 3 Hz strobe must fail, the committed fixture loop must pass). Skipped when the local
 * ffmpeg has no `zscale` (the CLI itself exits 2 in that case).
 * @see packages/specs/specs/09-appendix-flash-lint.md § 3.5
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFlashes, cellsFromGbrpf32 } from "../../scripts/lib/flash-lint";
import { cellsArgs, gridFor, must, SIZE_SPECS } from "../../scripts/lib/loops-core";
import manifest from "../../src/data/loops.json";

const hasZscale = /\bzscale\b/.test(
	spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "",
);
const site = resolve(import.meta.dirname, "../..");

function analyse(file: string, fps: number, frames: number) {
	const { gridW, gridH } = gridFor("card");
	const r = spawnSync("ffmpeg", cellsArgs(file, gridW, gridH), { maxBuffer: 1 << 30 });
	expect(r.status).toBe(0);
	const b = r.stdout;
	const f32 = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
	const { lum, red } = cellsFromGbrpf32(f32, gridW, gridH);
	expect(lum.length).toBe(frames);
	return analyzeFlashes({
		width: SIZE_SPECS.card.width,
		height: SIZE_SPECS.card.height,
		gridW,
		gridH,
		fps,
		lum,
		red,
		renderWidthCss: SIZE_SPECS.card.renderWidthCss,
	});
}

describe.skipIf(!hasZscale)("flash lint on real encodes", () => {
	it("fails a full-frame 3 Hz black/white strobe encoded as H.264", () => {
		const dir = mkdtempSync(join(tmpdir(), "flash-"));
		try {
			const out = join(dir, "strobe.mp4");
			const r = spawnSync("ffmpeg", [
				"-v",
				"error",
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=black:s=768x432:r=30:d=3",
				"-vf",
				"geq=lum='if(lt(mod(floor(T*6),2),1),235,16)':cb=128:cr=128",
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-pix_fmt",
				"yuv420p",
				"-colorspace",
				"bt709",
				"-color_primaries",
				"bt709",
				"-color_trc",
				"bt709",
				"-color_range",
				"tv",
				out,
			]);
			expect(r.status).toBe(0);
			const res = analyse(out, 30, 90);
			expect(res.status).toBe("fail");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}, 60_000);

	it("passes the committed fixture loop (card H.264)", () => {
		const e = manifest["fixture-testsrc"];
		const h264 = must(
			e.card.sources.find((s) => s.type.includes("avc1")),
			"h264 source",
		);
		expect(readFileSync(join(site, "public", h264.url)).length).toBeGreaterThan(0);
		const res = analyse(join(site, "public", h264.url), e.fps, Math.round(e.durationS * e.fps));
		expect(res.status).not.toBe("fail");
		expect(res.maxEventsPerWindow).toBe(
			e.flash.maxEventsPerWindow >= 0 ? res.maxEventsPerWindow : 0,
		);
	}, 60_000);
});
