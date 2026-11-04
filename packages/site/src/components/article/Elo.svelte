<script lang="ts">
	/**
	 * Elo.svelte: the interactive island of figure F3 (Elo over training, with its uncertainty).
	 *
	 * An SVG line chart with a three-state map-set toggle (hand-made CS maps by default, generated
	 * test maps, compiled CS maps), 90 % bands where the data has an interval, a keyboard focus
	 * cursor (←/→, Home/End) that reads "Block 20: +78 Elo (90 % interval +76 to +80)", and
	 * focusable markers for the adopted changes that open a card with the deciding number and a
	 * link "In the notebook" (`#nb-<id>`). The SSR keyframe (the `children` snippet) shows until
	 * the data is ready and stays if it fails to load (note + Retry).
	 *
	 * Why: the figure's claim (+96, +94 to +98 at block 28) is already drawn by the keyframe; the
	 * island adds the other map sets and the exact readouts without a chart library (ADR 0053).
	 * Every resource it opens (fetch, media query, linked-number listeners) is registered with
	 * `registerLive` and released on unmount so ClientRouter round trips leak nothing (AC16.5). It
	 * has no animation, so Pause motion has nothing to stop.
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-7
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { EloData } from "../../lib/article-data/elo";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { rovingTabindex } from "../../lib/figure-keys";
	import { registerLive } from "../../lib/figure-live";
	import { linkFacts } from "../../lib/figure-link";
	import { markPath } from "../../lib/figure-marks";
	import {
		chartSvg,
		LAYOUTS,
		MAP_SETS,
		type MapSet,
		placeMarkers,
		plotPoints,
		pointLabel,
		READOUT_STYLE,
		scales,
	} from "../../lib/figures/elo-chart";

	interface Props {
		/** Hashed URL of the `elo` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, children }: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let svgEl: SVGSVGElement | undefined = $state();
	let data: EloData | null = $state(null);
	let failed = $state(false);
	let set: MapSet = $state("hand");
	let narrow = $state(false);
	/** Index of the focus cursor in the active set's points, or -1. */
	let cursor = $state(-1);
	let open: string | null = $state(null);
	let live = $state("");

	const layout = $derived(narrow ? LAYOUTS.narrow : LAYOUTS.wide);
	const sc = $derived(scales(layout));
	const points = $derived(data ? plotPoints(data, set) : []);
	const drawing = $derived(data ? chartSvg(data, set, layout) : "");
	const markers = $derived(data ? placeMarkers(data, points, sc) : []);
	const current = $derived(markers.find((m) => m.abId === open) ?? null);
	const cur = $derived(cursor >= 0 ? (points[cursor] ?? null) : null);
	const readout = $derived(cur ? pointLabel(cur) : "");

	function choose(next: MapSet): void {
		if (next === set) return;
		set = next;
		cursor = -1;
		open = null;
		const label = MAP_SETS.find((m) => m.id === next)?.label ?? next;
		live = `${label}: ${next === "compiled" ? "3 readouts" : next === "generated" ? "no intervals" : "10 points with 90 % intervals where they exist"}.`;
	}

	function move(e: KeyboardEvent): void {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
		e.preventDefault();
		// Why: rovingTabindex wraps and treats Up/Down as previous/next; map the horizontal keys onto it.
		const key = e.key === "ArrowLeft" ? "ArrowUp" : e.key === "ArrowRight" ? "ArrowDown" : e.key;
		cursor = rovingTabindex(points.length, Math.max(cursor, 0), key);
		live = readout;
	}

	function focusIn(): void {
		if (cursor < 0) cursor = points.length - 1;
		live = readout;
	}

	function toggle(id: string): void {
		open = open === id ? null : id;
		const m = markers.find((x) => x.abId === id);
		live = open && m ? `${m.title}: ${m.deciding}.` : "";
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
			const loaded = await loadFigureData<EloData>(src, shape, { signal: mine.signal });
			if (mine.signal.aborted) return;
			data = loaded;
		} catch (e) {
			if (e instanceof FigureDataError && e.kind === "abort") return;
			failed = true;
		} finally {
			release();
		}
	}

	onMount(() => {
		void load();
		let mq: MediaQueryList | null = null;
		let releaseMq: (() => void) | null = null;
		const onMq = (): void => {
			narrow = mq?.matches ?? false;
		};
		if (typeof matchMedia === "function") {
			mq = matchMedia("(max-width: 700px)");
			narrow = mq.matches;
			mq.addEventListener("change", onMq);
			releaseMq = registerLive();
		}
		return () => {
			controller?.abort();
			mq?.removeEventListener("change", onMq);
			releaseMq?.();
		};
	});

	// Linked numbers: hovering a prose number lights the marks with the same `data-fact`.
	$effect(() => {
		if (!data || !root) return;
		const release = registerLive();
		const off = linkFacts(root);
		return () => {
			off();
			release();
		};
	});

	function nearest(e: PointerEvent): void {
		const box = svgEl?.getBoundingClientRect();
		if (!box || box.width === 0) return;
		const x = ((e.clientX - box.left) / box.width) * layout.w;
		let best = 0;
		let dist = Number.POSITIVE_INFINITY;
		points.forEach((p, i) => {
			const d = Math.abs(sc.x(p.block) - x);
			if (d < dist) {
				dist = d;
				best = i;
			}
		});
		cursor = best;
	}
</script>

<div class="fig-box" bind:this={root}>
	{#if !data}
		{@render children?.()}
		{#if failed}
			<p class="el-fail">
				Interactive version failed to load.
				<button type="button" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{:else}
		<div class="el-bar" role="group" aria-label="Map set">
			<span class="el-lab">Maps</span>
			{#each MAP_SETS as m (m.id)}
				<button
					type="button"
					class="el-chip"
					aria-pressed={set === m.id}
					aria-label={m.label}
					onclick={() => choose(m.id)}
				>
					{m.label.split(" ")[0]}
				</button>
			{/each}
		</div>
		<div class="el-stage" style:aspect-ratio="{layout.w} / {layout.h}">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
			<svg
				bind:this={svgEl}
				class="el-chart"
				viewBox="0 0 {layout.w} {layout.h}"
				role="group"
				tabindex="0"
				aria-labelledby={labelId}
				aria-describedby="f3-live"
				aria-roledescription="line chart"
				onkeydown={move}
				onfocus={focusIn}
				onpointermove={nearest}
			>
				{@html drawing}
				{#if cur}
					<line
						x1={sc.x(cur.block)}
						x2={sc.x(cur.block)}
						y1={layout.top}
						y2={layout.h - layout.bottom}
						style="stroke:var(--color-focus);stroke-width:1.5;stroke-dasharray:3 3"
					/>
					<circle
						cx={sc.x(cur.block)}
						cy={sc.y(cur.v)}
						r="9"
						fill="none"
						style="stroke:var(--color-focus);stroke-width:2.5"
					/>
					<text x="116" y="14" style={READOUT_STYLE}>{readout}</text>
				{/if}
			</svg>
			{#each markers as m (m.abId)}
				<button
					type="button"
					class="el-mark"
					style:left="{(m.cx / layout.w) * 100}%"
					style:top="{(m.cy / layout.h) * 100}%"
					aria-expanded={open === m.abId}
					aria-controls="f3-card"
					aria-label="{m.title}: {m.deciding}"
					data-marker={m.abId}
					onclick={() => toggle(m.abId)}
				>
					<svg viewBox="-10 -10 20 20" aria-hidden="true">
						<path
							d={markPath("kept", 0, 0, 7)}
							style="fill:var(--color-outcome-kept);stroke:var(--color-bg);stroke-width:2"
						/>
					</svg>
				</button>
			{/each}
			{#if current}
				<div
					id="f3-card"
					class="el-card"
					role="group"
					aria-label={current.title}
					onkeydown={(e) => {
						if (e.key === "Escape") open = null;
					}}
				>
					<p class="el-card-h">{current.title}</p>
					<p>{current.what}</p>
					<p class="el-card-n">{current.deciding}</p>
					<p>
						<a href="#nb-{current.notebookId}">In the notebook</a>
						<button type="button" class="el-x" onclick={() => (open = null)}>Close</button>
					</p>
				</div>
			{/if}
		</div>
		<p id="f3-live" class="el-sr" aria-live="polite">{live}</p>
	{/if}
</div>

<style>
	.fig-box {
		position: relative;
		inline-size: 100%;
	}
	.el-bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-block-size: 44px;
		padding-inline: var(--space-2);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.el-chip {
		min-block-size: 32px;
		padding-inline: var(--space-3);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-pill);
		background: var(--color-bg);
		color: var(--color-text-body);
		font: inherit;
		cursor: pointer;
	}
	.el-chip[aria-pressed="true"] {
		border-color: var(--color-text);
		color: var(--color-text);
		font-weight: 600;
	}
	.el-chip:focus-visible,
	.el-mark:focus-visible,
	.el-chart:focus-visible,
	.el-card a:focus-visible,
	.el-x:focus-visible,
	.el-fail button:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.el-stage {
		position: relative;
		inline-size: 100%;
	}
	.el-chart {
		display: block;
		inline-size: 100%;
		block-size: 100%;
	}
	.el-mark {
		position: absolute;
		inline-size: 28px;
		block-size: 28px;
		padding: 0;
		translate: -50% -50%;
		border: 0;
		border-radius: 50%;
		background: transparent;
		cursor: pointer;
	}
	.el-mark svg {
		inline-size: 100%;
		block-size: 100%;
	}
	.el-card {
		position: absolute;
		inset-inline-end: 4%;
		inset-block-end: 26%;
		inline-size: min(17rem, 92%);
		padding: var(--space-3);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.el-card p {
		margin: 0 0 var(--space-2);
	}
	.el-card-h {
		font-weight: 600;
		color: var(--color-text);
	}
	.el-card-n {
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}
	.el-x {
		margin-inline-start: var(--space-3);
		min-block-size: 24px;
		font: inherit;
		cursor: pointer;
	}
	.el-fail {
		margin: var(--space-2);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.el-sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	/* Linked numbers (decorative): the matching mark grows. */
	.fig-box :global(.is-linked) {
		stroke-width: 4;
	}
</style>
