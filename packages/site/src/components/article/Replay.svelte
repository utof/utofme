<script lang="ts">
	/**
	 * Replay.svelte: the interactive island of figure F1 (replay of one real round on Mirage).
	 *
	 * A canvas board (`role="img"`, device-pixel-ratio aware, walls cached offscreen per size) with
	 * its controls outside it: play/pause, a "Time" scrub bar with event-marker buttons and the
	 * pros' dashed first-contact marker, a speed select, a "See as" radio group (fog and ghosts),
	 * an "Events" list synced to the scrub position and a status line announced on pause or scrub
	 * end only. The SSR keyframe (the `children` snippet) shows until the data is ready and stays
	 * if it fails to load (note + Retry). Autoplay runs once, at 1×, when at least half of the
	 * figure is in view and motion is allowed; any interaction cancels it for good.
	 *
	 * Why: the figure's claim (first contact at 7.2 s, what each side could see) must be
	 * explorable without a chart library (ADR 0053); every resource it opens (fetch, observers,
	 * the animation loop) is registered with `registerLive` and released on unmount so ClientRouter
	 * round trips leak nothing (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet, untrack } from "svelte";
	import type { ReplayMirageData } from "../../lib/article-data/replay_mirage";
	import type { Shape } from "../../lib/article-data/types";
	import { markPath } from "../../lib/figure-marks";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { registerLive } from "../../lib/figure-live";
	import { motionState } from "../../lib/figure-motion.svelte";
	import { formatSeconds } from "../../lib/figure-scale";
	import {
		buildFog,
		fogSummary,
		initialPlayback,
		markers,
		type MarkerKind,
		type Playback,
		type PlaybackAction,
		poseAt,
		reducePlayback,
		SPEEDS,
		type Speed,
		scrubFraction,
		smokeLanding,
		statusLine,
		type View,
		visiblePairs,
	} from "../../lib/figures/replay";
	import { parseRows, siteRects, ticksToSeconds, wallPath } from "../../lib/grid";

	interface Props {
		/** Hashed URL of the `replay_mirage` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The pros' median first contact: seconds and its printed form. */
		pros: { s: number; text: string };
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, pros, children }: Props = $props();

	// Why: `motionState()` reads `document`, which does not exist while the island renders on the
	// server; it is created on mount and disposed with the island.
	let motion: ReturnType<typeof motionState> | null = $state.raw(null);
	let root: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let board: HTMLDivElement | undefined = $state();

	let data: ReplayMirageData | null = $state(null);
	let failed = $state(false);
	let pb: Playback = $state({ pos: 0, playing: false, speed: 1, autoplay: "armed" });
	let view: View = $state("all");
	let live = $state("");
	let boardPx = $state(0);

	const playing = $derived(pb.playing);
	const nTicks = $derived(data?.nTicks ?? 1);
	/** The whole tick shown by the slider, the status and the fog. */
	const tick = $derived(Math.min(Math.max(Math.round(pb.pos), 0), nTicks - 1));
	const fog = $derived(data ? buildFog(data) : null);
	const events = $derived(data ? markers(data) : []);
	const statusText = $derived(
		data
			? [statusLine(data, tick), fog ? fogSummary(data, fog, view, tick) : ""]
					.filter(Boolean)
					.join(" · ")
			: "",
	);
	const currentEvent = $derived.by(() => {
		let at = -1;
		events.forEach((m, i) => {
			if (m.tick <= tick) at = i;
		});
		return at;
	});
	/** Events that share a tick share one button (their hit areas would overlap otherwise). */
	const markerGroups = $derived.by(() => {
		const groups: { tick: number; items: typeof events }[] = [];
		for (const m of events) {
			const g = groups.at(-1);
			if (g && g.tick === m.tick) g.items.push(m);
			else groups.push({ tick: m.tick, items: [m] });
		}
		return groups;
	});
	const prosFraction = $derived(scrubFraction(pros.s / ticksToSeconds(1), nTicks));

	function dispatch(a: PlaybackAction): void {
		const was = pb.playing;
		pb = reducePlayback(pb, a, nTicks);
		if (was && !pb.playing) announce();
	}

	/** Why: the live region speaks on pause or scrub end only, never once per playback tick. */
	function announce(): void {
		live = statusText;
	}

	function seek(to: number): void {
		dispatch({ type: "seek", pos: to });
		announce();
	}

	// --- loading ------------------------------------------------------------------------------
	let controller: AbortController | null = null;

	async function load(): Promise<void> {
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		failed = false;
		const release = registerLive();
		try {
			const loaded = await loadFigureData<ReplayMirageData>(src, shape, { signal: mine.signal });
			if (mine.signal.aborted) return;
			data = loaded;
			pb = initialPlayback(loaded);
			live = "";
		} catch (e) {
			if (e instanceof FigureDataError && e.kind === "abort") return;
			failed = true;
		} finally {
			release();
		}
	}

	onMount(() => {
		const m = motionState();
		motion = m;
		void load();
		return () => {
			controller?.abort();
			m.dispose();
			motion = null;
		};
	});

	// --- Pause motion -------------------------------------------------------------------------
	$effect(() => {
		// Why: `dispatch` reads `pb`; untracked, so only a change of `motion.paused` re-runs this.
		if (motion?.paused) untrack(() => dispatch({ type: "motion", paused: true }));
	});

	// --- autoplay trigger: at least half in view ----------------------------------------------
	$effect(() => {
		if (!data || !root || typeof IntersectionObserver === "undefined") return;
		const release = registerLive();
		const io = new IntersectionObserver(
			(entries) => {
				const last = entries.at(-1);
				if (last)
					dispatch({
						type: "visible",
						ratio: last.intersectionRatio,
						paused: motion?.paused ?? false,
					});
			},
			{ threshold: [0, 0.5] },
		);
		io.observe(root);
		return () => {
			io.disconnect();
			release();
		};
	});

	// --- the playback clock -------------------------------------------------------------------
	$effect(() => {
		if (!playing) return;
		const release = registerLive();
		let raf = 0;
		let last = -1;
		const step = (now: number): void => {
			// Why: cap the step so a background tab cannot jump the replay ahead.
			if (last >= 0) dispatch({ type: "frame", dtMs: Math.min(Math.max(now - last, 0), 100) });
			last = now;
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(raf);
			release();
		};
	});

	// --- board size ---------------------------------------------------------------------------
	$effect(() => {
		if (!board) return;
		const measure = (): void => {
			boardPx = Math.round(board?.getBoundingClientRect().width ?? 0);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const release = registerLive();
		const ro = new ResizeObserver(measure);
		ro.observe(board);
		return () => {
			ro.disconnect();
			release();
		};
	});

	// --- drawing ------------------------------------------------------------------------------
	interface Tokens {
		ct: string;
		t: string;
		wall: string;
		floor: string;
		site: string;
		smoke: string;
		smokeFill: string;
		fire: string;
		text: string;
		muted: string;
	}
	let tokens: Tokens | null = null;
	let wallsCache: { key: string; canvas: HTMLCanvasElement } | null = null;
	const landings = new Map<string, [number, number] | null>();

	function readTokens(el: Element): Tokens {
		const css = getComputedStyle(el);
		const get = (name: string): string => css.getPropertyValue(name).trim() || "CanvasText";
		return {
			ct: get("--color-ct"),
			t: get("--color-t"),
			wall: get("--color-map-wall"),
			floor: get("--color-map-floor"),
			site: get("--color-map-site"),
			smoke: get("--color-smoke"),
			smokeFill: get("--color-smoke-fill"),
			fire: get("--color-fire"),
			text: get("--color-text"),
			muted: get("--color-text-muted"),
		};
	}

	function wallsFor(d: ReplayMirageData, px: number, dpr: number): HTMLCanvasElement | null {
		const key = `${px}@${dpr}`;
		if (wallsCache?.key === key) return wallsCache.canvas;
		const off = document.createElement("canvas");
		off.width = off.height = Math.round(px * dpr);
		const ctx = off.getContext("2d");
		if (!ctx || !tokens) return null;
		ctx.scale(dpr, dpr);
		ctx.fillStyle = tokens.wall;
		ctx.fill(new Path2D(wallPath(parseRows(d.map.rows), px / 28)));
		wallsCache = { key, canvas: off };
		return off;
	}

	function draw(
		d: ReplayMirageData,
		f: NonNullable<typeof fog>,
		pos: number,
		v: View,
		px: number,
	): void {
		const cv = canvas;
		const ctx = cv?.getContext("2d");
		if (!cv || !ctx || px <= 0) return;
		tokens ??= readTokens(cv);
		const tk = tokens;
		const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
		const size = Math.round(px * dpr);
		if (cv.width !== size) {
			cv.width = cv.height = size;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const cell = px / 28;
		const at = Math.min(Math.max(Math.floor(pos), 0), d.nTicks - 1);
		const map = parseRows(d.map.rows);

		ctx.clearRect(0, 0, px, px);
		ctx.fillStyle = tk.floor;
		ctx.fillRect(0, 0, px, px);
		// Sites: boxed, lettered.
		ctx.fillStyle = tk.site;
		ctx.font = `600 ${Math.max(10, cell * 0.9)}px sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (const k of ["a", "b"] as const) {
			for (const r of siteRects(map, k)) {
				const x = r.c0 * cell;
				const y = r.r0 * cell;
				const w = (r.c1 - r.c0 + 1) * cell;
				const h = (r.r1 - r.r0 + 1) * cell;
				ctx.fillStyle = tk.site;
				ctx.fillRect(x, y, w, h);
				ctx.fillStyle = tk.muted;
				ctx.fillText(k.toUpperCase(), x + w / 2, y + h / 2);
			}
		}
		const walls = wallsFor(d, px, dpr);
		if (walls) ctx.drawImage(walls, 0, 0, px, px);

		// Smoke (solid disc, dashed edge) and fire (hatched tiles).
		const smoke = d.smoke[at] ?? [];
		if (smoke.length > 0) {
			const sig = smoke.join(",");
			if (!landings.has(sig)) landings.set(sig, smokeLanding(d.map.rows, smoke));
			const l = landings.get(sig);
			if (l) {
				ctx.beginPath();
				ctx.arc((l[1] + 0.5) * cell, (l[0] + 0.5) * cell, 2 * cell, 0, Math.PI * 2);
				ctx.fillStyle = tk.smokeFill;
				ctx.fill();
				ctx.setLineDash([cell * 0.4, cell * 0.25]);
				ctx.strokeStyle = tk.smoke;
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}
		const fire = d.fire[at] ?? [];
		if (fire.length > 0) {
			ctx.strokeStyle = tk.fire;
			ctx.lineWidth = 1.3;
			for (const i of fire) {
				const x = (i % 28) * cell;
				const y = Math.floor(i / 28) * cell;
				ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
				ctx.beginPath();
				for (let k = 0; k <= cell * 2; k += cell / 3) {
					ctx.moveTo(x + Math.min(k, cell), y + Math.max(k - cell, 0));
					ctx.lineTo(x + Math.max(k - cell, 0), y + Math.min(k, cell));
				}
				ctx.stroke();
			}
		}

		const place = (pid: number) => {
			const p = poseAt(d, pid, pos);
			return { x: (p.c + 0.5) * cell, y: (p.r + 0.5) * cell, angle: p.angle };
		};
		const team = v === "all" ? null : f[v][at];

		// Sightlines.
		ctx.strokeStyle = tk.text;
		ctx.lineWidth = 1.2;
		ctx.setLineDash([cell * 0.3, cell * 0.2]);
		for (const [a, b] of visiblePairs(d, v, at)) {
			const pa = place(a);
			const pb2 = place(b);
			ctx.beginPath();
			ctx.moveTo(pa.x, pa.y);
			ctx.lineTo(pb2.x, pb2.y);
			ctx.stroke();
		}
		ctx.setLineDash([]);

		// Ghosts: hollow marks at half opacity where an enemy was last seen.
		for (const g of team?.ghosts ?? []) {
			const side = d.players[g.pid]?.side === "T" ? "t" : "ct";
			ctx.globalAlpha = 0.5;
			ctx.strokeStyle = side === "t" ? tk.t : tk.ct;
			ctx.lineWidth = 1.6;
			ctx.stroke(new Path2D(markPath(side, (g.c + 0.5) * cell, (g.r + 0.5) * cell, cell * 0.42)));
			ctx.globalAlpha = 1;
		}

		// Players: circle = defender, triangle = attacker; the short line is where they look.
		d.players.forEach((p, pid) => {
			if (p.alive[at] !== 1) return;
			if (team && !team.visible[pid]) return;
			const pl = place(pid);
			const key = p.side === "T" ? "t" : "ct";
			const color = p.side === "T" ? tk.t : tk.ct;
			ctx.fillStyle = color;
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.6;
			ctx.fill(new Path2D(markPath(key, pl.x, pl.y, cell * 0.42)));
			const a = (pl.angle * Math.PI) / 180;
			ctx.beginPath();
			ctx.moveTo(pl.x, pl.y);
			ctx.lineTo(pl.x + Math.sin(a) * cell * 0.95, pl.y - Math.cos(a) * cell * 0.95);
			ctx.stroke();
			if ((p.blind[at] ?? 0) > 0) {
				// Flash blindness is a ring, never a white frame.
				ctx.beginPath();
				ctx.arc(pl.x, pl.y, cell * 0.7, 0, Math.PI * 2);
				ctx.stroke();
			}
		});
	}

	$effect(() => {
		const d = data;
		const f = fog;
		if (!d || !f) return;
		// Why: motion paused means tick-stepped drawing; otherwise 60 fps interpolation.
		const pos = motion?.paused ? Math.round(pb.pos) : pb.pos;
		draw(d, f, pos, view, boardPx);
	});

	// --- controls -----------------------------------------------------------------------------
	const VIEWS: readonly { value: View; label: string }[] = [
		{ value: "all", label: "All" },
		{ value: "T", label: "Attackers" },
		{ value: "CT", label: "Defenders" },
	];

	function setView(v: View): void {
		view = v;
		dispatch({ type: "interact" });
		announce();
	}

	function togglePlay(): void {
		dispatch({ type: pb.playing ? "pause" : "play" });
		if (!pb.playing) announce();
	}

	function jumpEvent(dir: 1 | -1): void {
		const next =
			dir === 1
				? events.find((m) => m.tick > tick)
				: [...events].reverse().find((m) => m.tick < tick);
		if (next) seek(next.tick);
	}

	function onKeydown(e: KeyboardEvent): void {
		const target = e.target;
		if (!data || !(target instanceof HTMLElement)) return;
		if (target instanceof HTMLSelectElement) return;
		if (target instanceof HTMLInputElement && target.type === "radio") return;
		const onButton = target instanceof HTMLButtonElement;
		const step = e.shiftKey ? 5 : 1;
		switch (e.key) {
			case " ":
				if (onButton) return; // a button keeps its native Space activation
				e.preventDefault();
				togglePlay();
				return;
			case "ArrowLeft":
				e.preventDefault();
				seek(tick - step);
				return;
			case "ArrowRight":
				e.preventDefault();
				seek(tick + step);
				return;
			case "Home":
				e.preventDefault();
				seek(0);
				return;
			case "End":
				e.preventDefault();
				seek(nTicks - 1);
				return;
			case "[":
				e.preventDefault();
				jumpEvent(-1);
				return;
			case "]":
				e.preventDefault();
				jumpEvent(1);
				return;
		}
	}

	const GLYPH: Readonly<Record<MarkerKind, string>> = {
		contact: "◆",
		kill: "×",
		smoke: "●",
		fire: "▲",
		plant: "■",
		defuse: "▼",
		end: "⚑",
	};
</script>

<div class="fig-box" bind:this={root}>
	{#if data}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="rp-grid"
			role="group"
			aria-labelledby={labelId}
			aria-describedby="rp-live"
			onkeydown={onKeydown}
		>
			<div class="rp-board" bind:this={board}>
				<!-- Why: the spec gives the canvas role="img" (its controls sit outside it); Svelte only knows the HTML default. -->
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas
					bind:this={canvas}
					role="img"
					aria-label={`Replay of one Mirage round. ${statusText}`}
					style="inline-size:100%;block-size:100%"
				></canvas>
			</div>

			<div class="rp-side">
				<p class="rp-status" aria-hidden="true">{statusText}</p>
				<fieldset class="rp-see">
					<legend>See as</legend>
					{#each VIEWS as v (v.value)}
						<label
							><input
								type="radio"
								name="rp-view"
								value={v.value}
								checked={view === v.value}
								onchange={() => setView(v.value)}
							/>
							{v.label}</label
						>
					{/each}
				</fieldset>
				<label class="rp-speed-row">
					Speed
					<select
						class="rp-speed"
						value={String(pb.speed)}
						onchange={(e) =>
							dispatch({ type: "speed", speed: Number(e.currentTarget.value) as Speed })}
					>
						{#each SPEEDS as s (s)}
							<option value={String(s)}>{s}×</option>
						{/each}
					</select>
				</label>
				<!-- Why: the list scrolls inside the reserved box, so it must be reachable by keyboard. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ol class="rp-events" aria-label="Events" tabindex="0">
					{#each events as m, i (m.id)}
						<li
							class:rp-past={i <= currentEvent}
							aria-current={i === currentEvent ? "step" : undefined}
						>
							<span class="rp-time">{formatSeconds(ticksToSeconds(m.tick))}</span>
							{m.label}
						</li>
					{/each}
				</ol>
			</div>

			<div class="rp-bar">
				<button type="button" class="rp-play" onclick={togglePlay}
					>{pb.playing ? "Pause" : "Play"}</button
				>
				<div class="rp-scrub">
					<div
						class="rp-pros"
						style={`left:${(prosFraction * 100).toFixed(1)}%`}
						aria-hidden="true"
					></div>
					<span
						class="rp-pros-label"
						style={`left:${(prosFraction * 100).toFixed(1)}%`}
						aria-hidden="true">Pros' median first contact, about {pros.text}</span
					>
					<!-- Why: one mark per 0.8 s (a tick); decorative, so hidden from assistive tech. -->
					<div class="rp-ticks" style={`--ticks:${nTicks - 1}`} aria-hidden="true"></div>
					<input
						type="range"
						min="0"
						max={nTicks - 1}
						step="1"
						value={tick}
						aria-label="Time"
						aria-valuetext={formatSeconds(ticksToSeconds(tick))}
						title={`tick ${tick}`}
						oninput={(e) => dispatch({ type: "seek", pos: Number(e.currentTarget.value) })}
						onchange={announce}
					/>
					<div class="rp-markers">
						{#each markerGroups as g (g.tick)}
							<button
								type="button"
								class="rp-marker"
								data-kind={g.items[0]?.kind}
								style={`left:${(scrubFraction(g.tick, nTicks) * 100).toFixed(2)}%`}
								aria-label={`${formatSeconds(ticksToSeconds(g.tick))}: ${g.items.map((m) => m.label).join("; ")}`}
								title={`tick ${g.tick}`}
								onclick={() => seek(g.tick)}
								><span aria-hidden="true">{GLYPH[g.items[0]?.kind ?? "contact"]}</span></button
							>
						{/each}
					</div>
				</div>
				<output class="rp-clock">{formatSeconds(ticksToSeconds(tick))}</output>
			</div>
		</div>
		<p id="rp-live" class="rp-live" aria-live="polite">{live}</p>
	{:else}
		{@render children?.()}
		{#if failed}
			<div class="rp-fail" role="status">
				<span>Interactive version failed to load.</span>
				<button type="button" onclick={() => void load()}>Retry</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.fig-box {
		position: relative;
		inline-size: 100%;
	}
	/* Mirrors ReplayKeyframe.astro's .rp-grid: same tracks, so hydration moves nothing. */
	.rp-grid {
		display: grid;
		inline-size: 100%;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto 56px 17rem;
		grid-template-areas: "board" "bar" "side";
	}
	@media (min-width: 701px) {
		.rp-grid {
			grid-template-columns: minmax(0, 1fr) 16rem;
			grid-template-rows: auto 56px;
			grid-template-areas: "board side" "bar bar";
		}
	}
	.rp-board {
		grid-area: board;
		aspect-ratio: 1;
		min-inline-size: 0;
	}
	canvas {
		display: block;
	}
	.rp-side {
		grid-area: side;
		min-block-size: 0;
		overflow: auto;
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.rp-see {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		margin: 0;
		padding: 0;
		border: 0;
	}
	.rp-see legend {
		padding: 0;
		margin-block-end: var(--space-1);
		font-weight: 600;
		color: var(--color-text);
	}
	.rp-see label,
	.rp-speed-row {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: 24px;
	}
	.rp-events {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
		flex: 1 1 auto;
		min-block-size: 0;
	}
	/* Why: future events read in the muted text colour (4.81:1 on the surface), never through
	   opacity, which would drop them under 4.5:1. */
	.rp-events li {
		padding-block: 2px;
		color: var(--color-text-muted);
	}
	.rp-events li.rp-past {
		color: var(--color-text-body);
	}
	.rp-events li[aria-current="step"] {
		font-weight: 600;
		color: var(--color-text);
	}
	.rp-time {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
	}
	.rp-bar {
		grid-area: bar;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-inline: var(--space-2);
		min-inline-size: 0;
	}
	.rp-play {
		min-inline-size: 44px;
		min-block-size: 44px;
		padding-inline: var(--space-3);
		font: inherit;
		font-size: var(--font-size-ui);
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.rp-play:focus-visible,
	.rp-marker:focus-visible,
	.rp-fail button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.rp-scrub {
		position: relative;
		flex: 1 1 auto;
		min-inline-size: 0;
		block-size: 100%;
	}
	.rp-scrub input[type="range"] {
		position: absolute;
		inset-inline: 0;
		inset-block-end: 2px;
		inline-size: 100%;
		margin: 0;
		block-size: 18px;
	}
	.rp-ticks {
		position: absolute;
		/* The native thumb is about 16 px wide, so the track starts 8 px in. */
		inset-inline: 8px;
		inset-block-end: 6px;
		block-size: 10px;
		background-image: linear-gradient(to right, var(--color-border) 1px, transparent 1px);
		background-size: calc(100% / var(--ticks)) 100%;
		background-repeat: repeat-x;
		border-inline-end: 1px solid var(--color-border);
		pointer-events: none;
	}
	.rp-pros {
		position: absolute;
		inset-block: 12px 2px;
		border-inline-start: 2px dashed var(--color-text);
		pointer-events: none;
	}
	.rp-pros-label {
		position: absolute;
		inset-block-start: 0;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: var(--font-size-1);
		line-height: 1;
		color: var(--color-text);
		pointer-events: none;
	}
	.rp-markers {
		position: absolute;
		inset-inline: 0;
		inset-block-start: 12px;
		block-size: 0;
	}
	.rp-marker {
		position: absolute;
		inline-size: 24px;
		block-size: 24px;
		padding: 0;
		transform: translate(-50%, 0);
		font-size: 11px;
		line-height: 1;
		color: var(--color-text);
		background: transparent;
		border: 0;
		cursor: pointer;
	}
	.rp-marker[data-kind="kill"] {
		color: var(--color-outcome-reverted);
	}
	.rp-clock {
		min-inline-size: 5ch;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: var(--font-size-ui);
		color: var(--color-text);
		text-align: end;
	}
	.rp-status {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--font-size-1);
		line-height: 1.35;
		color: var(--color-text-body);
	}
	.rp-live {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.rp-fail {
		position: absolute;
		inset-inline: 0;
		inset-block-end: 0;
		block-size: 56px;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-inline: var(--space-3);
		font-size: var(--font-size-ui);
		color: var(--color-text);
		background: var(--color-surface);
		border-block-start: 1px solid var(--color-border);
	}
	.rp-fail button {
		min-block-size: 44px;
		padding-inline: var(--space-3);
		font: inherit;
		color: var(--color-text);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
	}
</style>
