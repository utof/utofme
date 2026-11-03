/**
 * Hover dither for the home masonry cards (one shared overlay canvas, two backends).
 *
 * Loaded lazily and ONLY when the `dither` flag is on (see `src/lib/flags.ts` and
 * the `<script>` in `src/pages/index.astro`), so the default page ships none of
 * this. While the pointer is over a card, a single shared canvas is moved on top
 * of that card's `<img>`, the image is sampled at dither-cell resolution, and an
 * ordered (Bayer) dither with few colour levels is blended in around the cursor
 * with a radius falloff and a short trail. GIFs are re-sampled every frame so they
 * keep animating under the effect.
 *
 * Backends (same CONFIG, same output; chosen once in `createBackend`):
 * - `webgl2` (preferred): fragment shader, image uploaded as a mipmapped texture.
 * - `2d` (fallback): CPU port of the same maths on a small offscreen canvas
 *   (`getImageData` -> threshold -> `putImageData` -> scaled up with smoothing off).
 *   Used when `getContext("webgl2")` returns null (no GPU / blocklisted driver /
 *   VM) or shader + texture setup fails.
 *
 * Dev override: `?dither=2d` forces the 2D backend (the flag itself still resolves
 * as "on" and persists via `resolveFlag`; the backend choice is per page load).
 * The active backend is exposed as `data-dither-backend` on the shared canvas.
 *
 * Everything that is not pixel maths (pointer tracking, trail, easing, reduced
 * motion, IntersectionObserver / visibility lifecycle, `astro:before-swap`
 * cleanup, canvas placement) lives once in `setup` and drives a `Backend`.
 *
 * Ported from the owner's pasted React reference: the Bayer threshold tables, the
 * pointer-trail falloff, reduced-motion handling and the IntersectionObserver /
 * visibility lifecycle. Unlike the reference (which dithers a procedural noise
 * field) the input here is the card's own media.
 *
 * Why one canvas: browsers cap live WebGL contexts at ~16; the grid has more
 * cards than that, so the canvas is re-parented to whichever card is hovered.
 *
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 * @see https://github.com/zavalit/bayer-dithering-webgl-demo
 * @see https://tommyato.com/labs/dithering
 */

/**
 * Tunables — edit these to taste. Everything the effect looks like lives here.
 */
const CONFIG: {
	/** Threshold matrix: "bayer8" (finest grain), "bayer4", or "bayer2" (coarsest). */
	mode: "bayer8" | "bayer4" | "bayer2";
	/** Size of one dither cell in CSS px (device px = this x devicePixelRatio, DPR capped at 2). */
	pixelSize: number;
	/** Colour levels per channel (2 = hard 1-bit-per-channel, 4 = soft retro). */
	levels: number;
	/** Max blend of the dithered image over the original at the cursor, 0..1. */
	strength: number;
	/** Falloff radius as a fraction of the media width. */
	radius: number;
	/** Trail persistence, 0 (none) .. 1 (long). */
	trail: number;
	/** Baseline dither across the WHOLE media while hovered, 0..1 (0 = only near the cursor). */
	ambient: number;
} = {
	mode: "bayer8",
	pixelSize: 2,
	levels: 4,
	strength: 0.75,
	radius: 0.5,
	trail: 0.5,
	ambient: 0,
};

const MODE_INDEX = { bayer8: 0, bayer4: 1, bayer2: 2 } satisfies Record<typeof CONFIG.mode, number>;
const MAX_TRAIL = 12;
const MAX_DPR = 2;
/** 2D backend only: cap on dither cells per frame; the cell grows when a card would exceed it. */
const MAX_CELLS_2D = 200_000;

// Bayer index matrices (row-major, values 0..side^2-1). Single source of truth: the GLSL
// tables below are generated from these and the 2D backend normalises them for the CPU path.
const BAYER8 = [
	0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52, 11, 59, 7, 55, 40, 24,
	36, 20, 43, 27, 39, 23, 2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29, 10, 58, 6,
	54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21,
] as const;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const BAYER2 = [0, 2, 3, 1] as const;

const MATRICES = {
	bayer8: { side: 8, values: BAYER8 },
	bayer4: { side: 4, values: BAYER4 },
	bayer2: { side: 2, values: BAYER2 },
} satisfies Record<typeof CONFIG.mode, { side: number; values: readonly number[] }>;

/** Emit a GLSL `const float name[n] = float[n](v / n, ...)` table, one matrix row per line. */
function glslMatrix(name: string, side: number, values: readonly number[]): string {
	const total = side * side;
	const rows = Array.from({ length: side }, (_, y) =>
		values
			.slice(y * side, (y + 1) * side)
			.map((v) => `${v}.0 / ${total}.0`)
			.join(", "),
	);
	return `const float ${name}[${total}] = float[${total}](\n  ${rows.join(",\n  ")}\n);`;
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uMedia;
uniform vec2 uSize;
uniform float uCell;
uniform float uLod;
uniform int uMode;
uniform float uLevels;
uniform float uStrength;
uniform float uRadius;
uniform float uAmbient;
uniform float uFlat;
uniform vec3 uTrail[${MAX_TRAIL}];
uniform int uTrailCount;
out vec4 outColor;

${glslMatrix("bayer8", MATRICES.bayer8.side, MATRICES.bayer8.values)}

${glslMatrix("bayer4", MATRICES.bayer4.side, MATRICES.bayer4.values)}

${glslMatrix("bayer2", MATRICES.bayer2.side, MATRICES.bayer2.values)}

float threshold(vec2 cell) {
  if (uMode == 1) {
    ivec2 c = ivec2(mod(cell, 4.0));
    return bayer4[c.y * 4 + c.x];
  }
  if (uMode == 2) {
    ivec2 c = ivec2(mod(cell, 2.0));
    return bayer2[c.y * 2 + c.x];
  }
  ivec2 c = ivec2(mod(cell, 8.0));
  return bayer8[c.y * 8 + c.x];
}

void main() {
  // One sample per dither cell, taken at the cell centre (mip level chosen on the CPU
  // because uv is constant inside a cell, so screen-space derivatives would be zero).
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 uv = clamp((cell + 0.5) * uCell / uSize, 0.0, 1.0);
  vec3 c = textureLod(uMedia, uv, uLod).rgb;

  float steps = uLevels - 1.0;
  vec3 q = floor(c * steps + threshold(cell)) / steps;

  // Pointer mask: soft radius falloff around every live trail point (units: media widths).
  vec2 p = gl_FragCoord.xy / uSize.x;
  float touch = uFlat;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uTrailCount) break;
    vec3 point = uTrail[i];
    float reach = uRadius * mix(0.55, 1.0, point.z);
    touch = max(touch, point.z * (1.0 - smoothstep(0.0, reach, length(p - point.xy))));
  }
  float a = clamp(max(touch, uAmbient) * uStrength, 0.0, 1.0);
  outColor = vec4(q * a, a); // premultiplied alpha: blends over the <img> underneath
}`;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

interface TrailPoint {
	x: number;
	y: number;
	weight: number;
}

interface Target {
	card: Element;
	host: Element;
	img: HTMLImageElement;
	/** GIF: the media is re-sampled every frame so the animation keeps playing. */
	animated: boolean;
}

/** Overlay size in device px plus the dither cell size in device px. */
interface Geometry {
	width: number;
	height: number;
	cell: number;
}

/** Everything a backend needs to paint one frame. */
interface Frame extends Geometry {
	img: HTMLImageElement;
	/** `count` live (x, y, weight) triples; x/y in media widths, origin bottom-left. */
	trail: Float32Array;
	count: number;
	/** Reduced motion: dither the whole media flat instead of following the pointer. */
	flat: boolean;
}

/**
 * One rendering implementation behind the shared overlay canvas.
 *
 * Why: the pointer / trail / lifecycle logic is identical for WebGL2 and Canvas 2D, so
 * only the pixel work is abstracted (see `createWebglBackend` / `createCanvas2dBackend`).
 */
interface Backend {
	readonly name: "webgl2" | "2d";
	readonly canvas: HTMLCanvasElement;
	/** Make `img` the media to dither; false (after warning) when the browser refuses it. */
	upload(img: HTMLImageElement, geometry: Geometry): boolean;
	/** Paint one frame onto `canvas` (already sized to `frame.width` x `frame.height`). */
	render(frame: Frame): void;
	dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
	console.warn("[dither] shader compile failed:", gl.getShaderInfoLog(shader));
	gl.deleteShader(shader);
	return null;
}

function link(gl: WebGL2RenderingContext): WebGLProgram | null {
	const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
	const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
	const program = gl.createProgram();
	if (!vertex || !fragment || !program) return null;
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.bindAttribLocation(program, 0, "aPosition");
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
	console.warn("[dither] program link failed:", gl.getProgramInfoLog(program));
	gl.deleteProgram(program);
	return null;
}

/**
 * WebGL2 backend, or null when there is no context / the shader or texture setup fails.
 *
 * Why null instead of throwing: `createBackend` then falls back to Canvas 2D. A failed
 * canvas can't be reused for a `2d` context once `webgl2` was requested, so each backend
 * owns a fresh canvas.
 */
function createWebglBackend(): Backend | null {
	const canvas = document.createElement("canvas");
	const gl = canvas.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
	});
	if (!gl) return null;

	const fail = (reason: string, error?: unknown): null => {
		console.warn(`[dither] WebGL2 setup failed (${reason}); trying Canvas 2D`, error ?? "");
		gl.getExtension("WEBGL_lose_context")?.loseContext();
		return null;
	};

	try {
		const program = link(gl);
		if (!program) return fail("program");

		const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
		const uniforms = {
			media: loc("uMedia"),
			size: loc("uSize"),
			cell: loc("uCell"),
			lod: loc("uLod"),
			mode: loc("uMode"),
			levels: loc("uLevels"),
			strength: loc("uStrength"),
			radius: loc("uRadius"),
			ambient: loc("uAmbient"),
			flat: loc("uFlat"),
			trail: loc("uTrail"),
			trailCount: loc("uTrailCount"),
		};

		const buffer = gl.createBuffer();
		const vao = gl.createVertexArray();
		const texture = gl.createTexture();
		if (!buffer || !vao || !texture) return fail("buffers/texture");

		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		// Why: gl_FragCoord's origin is bottom-left, so flip the upload to share uv orientation.
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

		return {
			name: "webgl2",
			canvas,
			upload(img) {
				try {
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
					gl.generateMipmap(gl.TEXTURE_2D);
					return true;
				} catch (error) {
					// e.g. a tainted (cross-origin) image: give up quietly, the plain card stays.
					console.warn("[dither] texture upload failed:", error);
					return false;
				}
			},
			render(frame) {
				const cellsAcross = Math.max(1, frame.width / frame.cell);
				const lod = Math.max(0, Math.log2(Math.max(1, frame.img.naturalWidth) / cellsAcross));
				gl.viewport(0, 0, frame.width, frame.height);
				// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's gl.useProgram, not a React hook
				gl.useProgram(program);
				gl.bindVertexArray(vao);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.uniform1i(uniforms.media, 0);
				gl.uniform2f(uniforms.size, frame.width, frame.height);
				gl.uniform1f(uniforms.cell, frame.cell);
				gl.uniform1f(uniforms.lod, lod);
				gl.uniform1i(uniforms.mode, MODE_INDEX[CONFIG.mode]);
				gl.uniform1f(uniforms.levels, Math.max(2, CONFIG.levels));
				gl.uniform1f(uniforms.strength, CONFIG.strength);
				gl.uniform1f(uniforms.radius, CONFIG.radius);
				gl.uniform1f(uniforms.ambient, CONFIG.ambient);
				gl.uniform1f(uniforms.flat, frame.flat ? 1 : 0);
				gl.uniform3fv(uniforms.trail, frame.trail);
				gl.uniform1i(uniforms.trailCount, frame.count);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			},
			dispose() {
				gl.deleteTexture(texture);
				gl.deleteBuffer(buffer);
				gl.deleteVertexArray(vao);
				gl.deleteProgram(program);
				gl.getExtension("WEBGL_lose_context")?.loseContext();
			},
		};
	} catch (error) {
		return fail("exception", error);
	}
}

/**
 * Canvas 2D backend: the fragment shader's maths on the CPU, one pixel per dither cell.
 *
 * Per frame (GIF) or per bind / resize (static): the `<img>` is drawn into a small
 * offscreen canvas of `cols x rows` cells (browser-side high-quality downscale stands in
 * for the shader's mip level) and read back with `getImageData`. Each frame the cells get
 * the Bayer threshold + `levels` quantisation and an alpha equal to the cursor falloff
 * (`q`, `a` un-premultiplied == the shader's premultiplied `q * a`), are written with
 * `putImageData`, then scaled up onto the overlay with smoothing off.
 *
 * Work is bounded: at most `MAX_CELLS_2D` cells (the cell grows past that), and the
 * falloff only visits trail points that can reach the current row.
 */
function createCanvas2dBackend(): Backend | null {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	const work = document.createElement("canvas");
	const workCtx = work.getContext("2d", { willReadFrequently: true });
	if (!ctx || !workCtx) return null;

	// Normalised thresholds per matrix, built once (same values the GLSL tables hold).
	const thresholds = {
		bayer8: Float32Array.from(BAYER8, (v) => v / BAYER8.length),
		bayer4: Float32Array.from(BAYER4, (v) => v / BAYER4.length),
		bayer2: Float32Array.from(BAYER2, (v) => v / BAYER2.length),
	} satisfies Record<typeof CONFIG.mode, Float32Array>;

	let sampled: HTMLImageElement | null = null;
	let source = new Uint8ClampedArray(0);
	let output: ImageData | null = null;
	let cols = 0;
	let rows = 0;

	// Per-point scratch (media-width units, y up) and the per-row list of reachable points.
	const px = new Float32Array(MAX_TRAIL);
	const py = new Float32Array(MAX_TRAIL);
	const weight = new Float32Array(MAX_TRAIL);
	const reach = new Float32Array(MAX_TRAIL);
	const reach2 = new Float32Array(MAX_TRAIL);
	const active = new Uint8Array(MAX_TRAIL);
	const activeDy2 = new Float32Array(MAX_TRAIL);

	const gridFor = ({ width, height, cell }: Geometry): { cols: number; rows: number } => {
		let c = Math.max(1, Math.round(width / cell));
		let r = Math.max(1, Math.round(height / cell));
		const over = (c * r) / MAX_CELLS_2D;
		if (over > 1) {
			const shrink = Math.sqrt(over);
			c = Math.max(1, Math.floor(c / shrink));
			r = Math.max(1, Math.floor(r / shrink));
		}
		return { cols: c, rows: r };
	};

	const sample = (img: HTMLImageElement, geometry: Geometry): boolean => {
		const grid = gridFor(geometry);
		try {
			if (work.width !== grid.cols) work.width = grid.cols;
			if (work.height !== grid.rows) work.height = grid.rows;
			workCtx.imageSmoothingEnabled = true;
			workCtx.imageSmoothingQuality = "high";
			workCtx.clearRect(0, 0, grid.cols, grid.rows);
			workCtx.drawImage(img, 0, 0, grid.cols, grid.rows);
			source = workCtx.getImageData(0, 0, grid.cols, grid.rows).data;
		} catch (error) {
			// e.g. a tainted (cross-origin) image: getImageData throws a SecurityError.
			console.warn("[dither] image sampling failed:", error);
			sampled = null;
			return false;
		}
		if (grid.cols !== cols || grid.rows !== rows || !output) {
			output = new ImageData(grid.cols, grid.rows);
		}
		cols = grid.cols;
		rows = grid.rows;
		sampled = img;
		return true;
	};

	return {
		name: "2d",
		canvas,
		upload: sample,
		render(frame) {
			const grid = gridFor(frame);
			if (
				(sampled !== frame.img || grid.cols !== cols || grid.rows !== rows) &&
				!sample(frame.img, frame)
			) {
				return;
			}
			if (!output) return;

			const side = MATRICES[CONFIG.mode].side;
			const table = thresholds[CONFIG.mode];
			const mask = side - 1;
			const steps = Math.max(2, CONFIG.levels) - 1;
			const quant = steps / 255;
			const back = 255 / steps;
			const base = Math.max(frame.flat ? 1 : 0, CONFIG.ambient);
			const aspect = frame.height / frame.width;

			let points = 0;
			for (let i = 0; i < frame.count; i++) {
				const w = frame.trail[i * 3 + 2] ?? 0;
				const r = CONFIG.radius * (0.55 + 0.45 * w);
				px[points] = frame.trail[i * 3] ?? 0;
				py[points] = frame.trail[i * 3 + 1] ?? 0;
				weight[points] = w;
				reach[points] = r;
				reach2[points] = r * r;
				points++;
			}

			const out = output.data;
			out.fill(0);
			for (let ry = 0; ry < rows; ry++) {
				// Cell centre in media widths, origin bottom-left (the shader's gl_FragCoord / uSize.x).
				const y = ((rows - ry - 0.5) / rows) * aspect;
				let n = 0;
				for (let i = 0; i < points; i++) {
					const dy = y - (py[i] ?? 0);
					const dy2 = dy * dy;
					if (dy2 < (reach2[i] ?? 0)) {
						active[n] = i;
						activeDy2[n] = dy2;
						n++;
					}
				}
				if (n === 0 && base * CONFIG.strength <= 0) continue;

				// Bayer rows count from the bottom, like gl_FragCoord, so the pattern phase matches.
				const tableRow = ((rows - 1 - ry) & mask) * side;
				for (let cx = 0; cx < cols; cx++) {
					const x = (cx + 0.5) / cols;
					let touch = base;
					for (let k = 0; k < n; k++) {
						const i = active[k] ?? 0;
						const dx = x - (px[i] ?? 0);
						const d2 = dx * dx + (activeDy2[k] ?? 0);
						const reach2i = reach2[i] ?? 0;
						if (d2 >= reach2i) continue;
						// 1 - smoothstep(0, reach, d), times the point weight.
						const t = Math.sqrt(d2) / (reach[i] ?? 1);
						const falloff = (weight[i] ?? 0) * (1 - t * t * (3 - 2 * t));
						if (falloff > touch) touch = falloff;
					}
					const alpha = Math.round(clamp(touch * CONFIG.strength, 0, 1) * 255);
					if (alpha <= 0) continue;
					const o = (ry * cols + cx) * 4;
					const bias = table[tableRow + (cx & mask)] ?? 0;
					out[o] = Math.floor((source[o] ?? 0) * quant + bias) * back;
					out[o + 1] = Math.floor((source[o + 1] ?? 0) * quant + bias) * back;
					out[o + 2] = Math.floor((source[o + 2] ?? 0) * quant + bias) * back;
					out[o + 3] = alpha;
				}
			}

			workCtx.putImageData(output, 0, 0);
			// Why: resizing the canvas (done by the caller) resets context state, so set it per frame.
			ctx.imageSmoothingEnabled = false;
			ctx.globalCompositeOperation = "copy";
			ctx.drawImage(work, 0, 0, cols, rows, 0, 0, frame.width, frame.height);
		},
		dispose() {
			sampled = null;
			source = new Uint8ClampedArray(0);
			output = null;
			work.width = 0;
			work.height = 0;
		},
	};
}

/**
 * Pick the backend: WebGL2 when available, else Canvas 2D; `?dither=2d` forces 2D.
 *
 * Why: Chrome without a GPU (VMs, blocklisted drivers) returns null for
 * `getContext("webgl2")` and no longer falls back to SwiftShader, which used to make
 * the effect silently do nothing. The `?dither=2d` override exists so the fallback can
 * be exercised in headless browsers that do ship a software GL.
 */
function createBackend(): Backend | null {
	const force2d = new URLSearchParams(window.location.search).get("dither") === "2d";
	return (force2d ? null : createWebglBackend()) ?? createCanvas2dBackend();
}

const noop = (): void => {};

interface Mounted {
	grid: HTMLElement;
	dispose: () => void;
}

/** The currently mounted instance (module singleton; one grid at a time). */
let mounted: Mounted | null = null;

/**
 * Attach the hover dither to a masonry grid; returns an idempotent dispose fn.
 *
 * Does nothing (returns a no-op) without a fine pointer or when neither backend can
 * be created. Uses WebGL2 when it is available and compiles, otherwise a Canvas 2D
 * port of the same shader (`?dither=2d` forces that one). Mounting the same grid twice
 * is a no-op; mounting a new grid disposes the previous one. Also disposes itself on
 * Astro's `astro:before-swap` so view-transition navigations never leak GL resources.
 *
 * `options.onFrame` receives the wall time of each `render()` in ms; the datamosh
 * playground uses it to compare this effect's cost with the mosh kernel. Omitted,
 * behaviour is unchanged.
 *
 * Why: the effect is an opt-in experiment (flag `dither`); keeping it in one lazily
 * imported module makes "off" cost nothing.
 *
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
 */
export function mountCardDither(
	grid: HTMLElement,
	options: { onFrame?: (ms: number) => void } = {},
): () => void {
	if (mounted?.grid === grid) return mounted.dispose;
	mounted?.dispose();
	const teardown = setup(grid, options.onFrame);
	const dispose = (): void => {
		teardown();
		document.removeEventListener("astro:before-swap", dispose);
		if (mounted?.dispose === dispose) mounted = null;
	};
	mounted = { grid, dispose };
	document.addEventListener("astro:before-swap", dispose, { once: true });
	return dispose;
}

function setup(grid: HTMLElement, onFrame?: (ms: number) => void): () => void {
	if (!window.matchMedia("(pointer: fine)").matches) return noop;

	const backend = createBackend();
	if (!backend) return noop;
	const canvas = backend.canvas;

	canvas.setAttribute("aria-hidden", "true");
	canvas.setAttribute("data-dither-backend", backend.name);
	Object.assign(canvas.style, {
		position: "absolute",
		display: "none",
		pointerEvents: "none",
		zIndex: "1",
	});

	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const view = { cssW: 1, cssH: 1, cell: 1 };
	const pointer = { x: 0, y: 0, inside: false };
	const head = { x: 0, y: 0, set: false };
	const trail: TrailPoint[] = [];
	const trailData = new Float32Array(MAX_TRAIL * 3);
	let presence = 0;
	let target: Target | null = null;
	let visible = true;
	let broken = false;
	let raf = 0;
	let last = 0;
	let resizeObserver: ResizeObserver | null = null;
	let intersection: IntersectionObserver | null = null;

	/** Media-width-normalised coordinates, origin bottom-left (matches gl_FragCoord / width). */
	const toUnits = (px: number, py: number): [number, number] => [
		px / view.cssW,
		(view.cssH - py) / view.cssW,
	];

	const geometry = (): Geometry => ({
		width: canvas.width,
		height: canvas.height,
		cell: view.cell,
	});

	const upload = (img: HTMLImageElement): boolean => {
		const ok = backend.upload(img, geometry());
		if (!ok) broken = true;
		return ok;
	};

	const layout = (): void => {
		if (!target) return;
		const imgRect = target.img.getBoundingClientRect();
		const hostRect = target.host.getBoundingClientRect();
		const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		view.cssW = Math.max(1, imgRect.width);
		view.cssH = Math.max(1, imgRect.height);
		view.cell = Math.max(1, Math.round(CONFIG.pixelSize * ratio));
		const width = Math.max(1, Math.round(view.cssW * ratio));
		const height = Math.max(1, Math.round(view.cssH * ratio));
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		Object.assign(canvas.style, {
			left: `${imgRect.left - hostRect.left}px`,
			top: `${imgRect.top - hostRect.top}px`,
			width: `${view.cssW}px`,
			height: `${view.cssH}px`,
		});
	};

	const render = (): void => {
		if (!target) return;
		if (target.animated && !upload(target.img)) return;
		let count = 0;
		for (const point of trail) {
			if (count >= MAX_TRAIL) break;
			if (point.weight <= 0.01) continue;
			trailData.set([point.x, point.y, point.weight], count * 3);
			count++;
		}
		backend.render({
			...geometry(),
			img: target.img,
			trail: trailData,
			count,
			// Reduced motion: no pointer-following trail, a flat static dither while hovered.
			flat: reduceMotion && pointer.inside,
		});
	};

	const hide = (): void => {
		canvas.style.display = "none";
	};

	const frame = (now: number): void => {
		raf = 0;
		if (!target || broken || !visible || document.hidden) return;
		const dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
		last = now;

		if (reduceMotion) {
			presence = pointer.inside ? 1 : 0;
		} else {
			const engaged = pointer.inside;
			presence += ((engaged ? 1 : 0) - presence) * (1 - Math.exp(-dt / (engaged ? 0.12 : 0.18)));
			if (head.set) {
				const [tx, ty] = toUnits(pointer.x, pointer.y);
				const follow = 1 - Math.exp(-dt / 0.06);
				head.x += (tx - head.x) * follow;
				head.y += (ty - head.y) * follow;
				const decay = Math.exp(-dt / (0.08 + CONFIG.trail * 0.7));
				for (const point of trail) point.weight *= decay;
				const first = trail[0];
				if (!first || Math.hypot(first.x - head.x, first.y - head.y) > 0.012) {
					trail.unshift({ x: head.x, y: head.y, weight: presence });
				} else {
					first.x = head.x;
					first.y = head.y;
					first.weight = presence;
				}
				if (CONFIG.trail <= 0.001) trail.length = Math.min(trail.length, 1);
				while (trail.length > MAX_TRAIL || (trail.length > 1 && lastWeight(trail) < 0.01)) {
					trail.pop();
				}
			}
		}

		if (onFrame) {
			const started = performance.now();
			render();
			onFrame(performance.now() - started);
		} else {
			render();
		}

		const fading = !reduceMotion && (presence > 0.01 || trail.some((p) => p.weight > 0.01));
		const keepAnimating = target.animated && pointer.inside;
		if (fading || keepAnimating) {
			raf = requestAnimationFrame(frame);
		} else {
			last = 0;
			if (!pointer.inside) hide();
		}
	};

	const wake = (): void => {
		if (!raf && target && visible && !document.hidden && !broken) {
			raf = requestAnimationFrame(frame);
		}
	};

	const bind = (card: Element): boolean => {
		const img = card.querySelector("img");
		if (!img?.complete || img.naturalWidth === 0) return false;
		const host = card.closest("li") ?? card;
		target = {
			card,
			host,
			img,
			animated: /\.gif(?:$|\?)/i.test(img.currentSrc || img.src),
		};
		presence = 0;
		trail.length = 0;
		head.set = false;
		visible = true;
		host.appendChild(canvas);
		canvas.style.display = "block";
		layout();
		if (!upload(img)) {
			target = null;
			hide();
			return false;
		}
		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver(() => {
			layout();
			wake();
		});
		resizeObserver.observe(img);
		intersection?.disconnect();
		intersection = new IntersectionObserver((entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			if (visible) {
				last = 0;
				wake();
				return;
			}
			// Scrolled away: drop the overlay so a stale frame never reappears on return.
			pointer.inside = false;
			presence = 0;
			trail.length = 0;
			hide();
		});
		intersection.observe(img);
		return true;
	};

	const onMove = (event: PointerEvent): void => {
		if (event.pointerType === "touch" || broken) return;
		const hit = event.target instanceof Element ? event.target.closest(".card") : null;
		if (!hit || !grid.contains(hit)) {
			pointer.inside = false;
			wake();
			return;
		}
		if (target?.card !== hit && !bind(hit)) {
			pointer.inside = false;
			wake();
			return;
		}
		// Why: read the img rect, not the canvas — the canvas is display:none after a fade-out.
		const rect = (target?.img ?? canvas).getBoundingClientRect();
		pointer.x = event.clientX - rect.left;
		pointer.y = event.clientY - rect.top;
		pointer.inside = true;
		if (!head.set) {
			[head.x, head.y] = toUnits(pointer.x, pointer.y);
			head.set = true;
		}
		canvas.style.display = "block";
		wake();
	};

	const onLeave = (): void => {
		pointer.inside = false;
		wake();
	};

	grid.addEventListener("pointermove", onMove, { passive: true });
	grid.addEventListener("pointerleave", onLeave);
	const onVisibility = (): void => {
		last = 0;
		wake();
	};
	document.addEventListener("visibilitychange", onVisibility);

	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(raf);
		grid.removeEventListener("pointermove", onMove);
		grid.removeEventListener("pointerleave", onLeave);
		document.removeEventListener("visibilitychange", onVisibility);
		resizeObserver?.disconnect();
		intersection?.disconnect();
		canvas.remove();
		backend.dispose();
		target = null;
	};
}

function lastWeight(trail: readonly TrailPoint[]): number {
	return trail[trail.length - 1]?.weight ?? 0;
}
