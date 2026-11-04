<script lang="ts">
	/**
	 * Noise.svelte: the interactive island of figure F9 (same experiment, twice).
	 *
	 * A dot plot of null (A/A) Elo differences beside the adopted effects, on one axis, with the
	 * tournament's 90 % noise band for a chosen number of rounds per pair (a slider, 1,000 to
	 * 8,000), and the sentence "With k seeds, an effect smaller than ±N Elo is noise" driven by a
	 * seed count (1 to 4) and a design toggle (same seed / independent seeds). The SSR keyframe
	 * (the `children` snippet) shows until the data is ready and stays if it fails to load.
	 *
	 * Why: the figure's claim (±9.3 with two independent seeds) is already the default view; the
	 * controls let the reader see why: fewer rounds widen the band, fewer seeds raise the bar. The
	 * island has no animation; its only resources (fetch, the media query) are registered with
	 * `registerLive` and released on unmount (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-13
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { NoiseData } from "../../lib/article-data/noise";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { registerLive } from "../../lib/figure-live";
	import { formatNumber } from "../../lib/figure-scale";
	import {
		bandHalf,
		DEFAULT_STATE,
		type Design,
		NOISE_LAYOUTS,
		noiseSvg,
		RANGES,
		sentence,
		summary,
	} from "../../lib/figures/noise";

	interface Props {
		/** Hashed URL of the `noise` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, children }: Props = $props();

	let data: NoiseData | null = $state(null);
	let failed = $state(false);
	let rounds = $state(DEFAULT_STATE.rounds);
	let seeds = $state(DEFAULT_STATE.seeds);
	let design: Design = $state(DEFAULT_STATE.design);
	let narrow = $state(false);
	let live = $state("");

	const state = $derived({ rounds, seeds, design });
	const layout = $derived(narrow ? NOISE_LAYOUTS.narrow : NOISE_LAYOUTS.wide);
	const sent = $derived(data ? sentence(data.rules, state) : null);
	const drawing = $derived(data ? noiseSvg(data, state, layout) : "");
	const label = $derived(data ? summary(data, state) : "");

	function announce(): void {
		if (data && sent) live = `${sent.text} Tournament band ±${formatNumber(bandHalf(rounds), 1)}.`;
	}

	function setRounds(e: Event): void {
		const t = e.currentTarget;
		if (t instanceof HTMLInputElement) rounds = Number(t.value);
		announce();
	}

	function setSeeds(e: Event): void {
		const t = e.currentTarget;
		if (t instanceof HTMLSelectElement) seeds = Number(t.value);
		announce();
	}

	function setDesign(d: Design): void {
		design = d;
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
			const loaded = await loadFigureData<NoiseData>(src, shape, { signal: mine.signal });
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
</script>

<div class="fig-box">
	{#if !data}
		{@render children?.()}
		{#if failed}
			<p class="nz-fail">
				Interactive version failed to load.
				<button type="button" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{:else}
		<div class="nz-controls">
			<label class="nz-ctl">
				<span>Rounds per pair: <b>{formatNumber(rounds, 0)}</b></span>
				<input
					type="range"
					min={RANGES.roundsMin}
					max={RANGES.roundsMax}
					step={RANGES.roundsStep}
					value={rounds}
					oninput={setRounds}
					aria-label="Rounds per pair"
					aria-valuetext="{formatNumber(rounds, 0)} rounds per pair"
				/>
			</label>
			<label class="nz-ctl">
				<span>Seeds:</span>
				<select value={String(seeds)} onchange={setSeeds} aria-label="Seeds">
					{#each Array.from({ length: RANGES.seedsMax - RANGES.seedsMin + 1 }, (_, i) => i + RANGES.seedsMin) as k (k)}
						<option value={String(k)} selected={k === seeds}>{k}</option>
					{/each}
				</select>
			</label>
			<div class="nz-ctl" role="group" aria-label="Design">
				<button
					type="button"
					class="nz-chip"
					aria-pressed={design === "same_seed"}
					onclick={() => setDesign("same_seed")}>Same seed</button
				>
				<button
					type="button"
					class="nz-chip"
					aria-pressed={design === "indep_seed"}
					onclick={() => setDesign("indep_seed")}>Independent seeds</button
				>
			</div>
		</div>
		{#if sent}
			<p class="nz-sentence">
				With <b>{sent.seeds}</b>, an effect smaller than <b>{sent.n}</b> Elo is noise.
			</p>
		{/if}
		<div class="nz-stage">
			<svg
				class="nz-svg"
				viewBox="0 0 {layout.w} {layout.h}"
				role="img"
				aria-labelledby={labelId}
				aria-describedby="f9-desc"
			>
				{@html drawing}
			</svg>
		</div>
		<p id="f9-desc" class="nz-sr">{label}</p>
		<p class="nz-sr" aria-live="polite">{live}</p>
	{/if}
</div>

<style>
	.fig-box {
		position: relative;
		inline-size: 100%;
	}
	.nz-controls {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: center;
		gap: var(--space-2);
		block-size: 5.5rem;
		padding-inline: var(--space-2);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.nz-ctl {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-inline-size: 0;
	}
	.nz-ctl input[type="range"] {
		inline-size: 100%;
		min-block-size: 24px;
		/* Why: Chromium's default 2 px range margin pushed the slider past the column (AC1.7). */
		margin-inline: 0;
	}
	.nz-ctl select {
		min-block-size: 32px;
		font: inherit;
	}
	.nz-ctl[role="group"] {
		flex-direction: row;
		flex-wrap: wrap;
	}
	.nz-chip {
		min-block-size: 32px;
		padding-inline: var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-pill);
		background: var(--color-bg);
		color: var(--color-text-body);
		font: inherit;
		cursor: pointer;
	}
	.nz-chip[aria-pressed="true"] {
		border-color: var(--color-text);
		color: var(--color-text);
		font-weight: 600;
	}
	.nz-chip:focus-visible,
	.nz-ctl input:focus-visible,
	.nz-ctl select:focus-visible,
	.nz-fail button:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.nz-sentence {
		margin: 0;
		padding: var(--space-2);
		min-block-size: 3.25rem;
		font-size: var(--font-size-3);
		color: var(--color-text);
	}
	.nz-svg {
		display: block;
		inline-size: 100%;
		block-size: auto;
	}
	.nz-fail {
		margin: var(--space-2);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.nz-sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (max-width: 700px) {
		.nz-controls {
			grid-template-columns: minmax(0, 1fr);
			block-size: 9.5rem;
		}
	}
</style>
