<script lang="ts">
	/**
	 * Tempo.svelte: the interactive island of figure F4 ("When does the first fight start?").
	 *
	 * Guess first: a slider (0–60 s, 0.8 s steps, also dragged on the plot) and "Reveal" or "Just
	 * show me"; the pros' strip stays hidden until then. After the reveal the agent-block and
	 * metric selects change what the strips show, and the sentences under them are computed from
	 * the series on screen. The reveal state lives in `sessionStorage`; "Guess again" clears it.
	 * The SSR keyframe (the `children` snippet) shows until the data is ready and stays if the
	 * load fails (note + Retry).
	 *
	 * Why: the claim (agents rush, pros take about twice as long) lands harder after a reader
	 * commits to a guess; nothing here animates, so reduced motion and "Pause motion" need no
	 * special case, and every resource it opens (fetch, link listeners) is registered with
	 * `registerLive` and released on unmount (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { TempoData } from "../../lib/article-data/tempo";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { linkFacts } from "../../lib/figure-link";
	import { registerLive } from "../../lib/figure-live";
	import { formatSeconds } from "../../lib/figure-scale";
	import {
		AGENT_BLOCKS,
		type AgentKey,
		earlySentence,
		GUESS,
		guessSentence,
		type MetricKey,
		METRICS,
		metricInfo,
		noneSentence,
		PLOT,
		prosMedianText,
		readReveal,
		snapGuess,
		stampText,
		writeReveal,
	} from "../../lib/figures/tempo";
	import TempoPlot from "./TempoPlot.svelte";

	interface Props {
		/** Hashed URL of the `tempo` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** Printed number of pro maps ("224"), a fact formatted by the Block. */
		prosMaps: string;
		/** Date of the agents' rerun, printed in the stamp. */
		rerunDate: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, prosMaps, rerunDate, children }: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let data: TempoData | null = $state(null);
	let failed = $state(false);
	let agent: AgentKey = $state("b28");
	let metric: MetricKey = $state("contact");
	let revealed = $state(false);
	let guessed = $state(true);
	let guess = $state(12);
	let live = $state("");

	const info = $derived(metricInfo(metric));
	const a = $derived(data ? data.series[agent][metric] : null);
	const p = $derived(data ? data.series.pros[metric] : null);
	const sentences = $derived.by(() => {
		if (!data || !a || !p || !revealed) return [];
		const out: string[] = [];
		if (metric === "contact") out.push(earlySentence(a, p));
		else
			out.push(
				`Median ${info.label.toLowerCase()}: agents ${formatSeconds(a.q[2])}, pros ${formatSeconds(p.q[2])}.`,
			);
		out.push(`The pros' median is ${prosMedianText(data.prosCi[metric])}.`);
		if (metric === "contact" && guessed) out.push(guessSentence(guess, p.q[2]));
		const none = metric === "plant" ? noneSentence(a, p) : null;
		if (none) out.push(none);
		return out;
	});
	const summary = $derived(
		a
			? revealed
				? `Agents' median ${info.label.toLowerCase()} is ${formatSeconds(a.q[2])}. ${sentences.join(" ")}`
				: `Agents' median ${info.label.toLowerCase()} is ${formatSeconds(a.q[2])}. The pros' strip is hidden until you reveal. Your guess: ${formatSeconds(guess)}.`
			: "",
	);

	const store = (): Storage | null => {
		try {
			return window.sessionStorage;
		} catch {
			return null;
		}
	};

	/** Why: a select's value is a string; narrow it without a cast, keeping the old value if unknown. */
	const asAgent = (v: string): AgentKey => AGENT_BLOCKS.find((b) => b.key === v)?.key ?? agent;
	const asMetric = (v: string): MetricKey => METRICS.find((m) => m.key === v)?.key ?? metric;

	function reveal(withGuess: boolean): void {
		revealed = true;
		guessed = withGuess;
		writeReveal(store(), { revealed: true, guess: withGuess ? guess : null });
		live = summary;
	}
	function again(): void {
		revealed = false;
		guessed = true;
		metric = "contact";
		writeReveal(store(), { revealed: false, guess });
		live = "Guess again: drag the marker or use the slider.";
	}

	// --- dragging the guess on the plot ------------------------------------------------------
	let dragStart: number | null = null;
	function guessAt(ev: PointerEvent, el: Element): number {
		const r = el.getBoundingClientRect();
		const vx = ((ev.clientX - r.left) / r.width) * PLOT.w;
		return snapGuess(((vx - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * GUESS.max);
	}
	function down(ev: PointerEvent): void {
		if (revealed || ev.button > 0) return;
		const el = ev.currentTarget;
		if (!(el instanceof Element)) return;
		dragStart = guess;
		el.setPointerCapture(ev.pointerId);
		guess = guessAt(ev, el);
	}
	function move(ev: PointerEvent): void {
		const el = ev.currentTarget;
		if (dragStart === null || !(el instanceof Element)) return;
		guess = guessAt(ev, el);
	}
	function up(): void {
		dragStart = null;
	}
	/** Why: arrows step one tick (0.8 s), Shift five; set explicitly so every browser agrees. */
	function slide(ev: KeyboardEvent): void {
		const dir =
			ev.key === "ArrowRight" || ev.key === "ArrowUp"
				? 1
				: ev.key === "ArrowLeft" || ev.key === "ArrowDown"
					? -1
					: 0;
		if (dir !== 0) guess = snapGuess(guess + dir * GUESS.step * (ev.shiftKey ? 5 : 1));
		else if (ev.key === "Home") guess = GUESS.min;
		else if (ev.key === "End") guess = GUESS.max;
		else return;
		ev.preventDefault();
	}
	function key(ev: KeyboardEvent): void {
		if (ev.key === "Escape" && dragStart !== null) {
			guess = dragStart;
			dragStart = null;
		}
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
			const loaded = await loadFigureData<TempoData>(src, shape, { signal: mine.signal });
			if (mine.signal.aborted) return;
			const saved = readReveal(store());
			revealed = saved.revealed;
			guessed = saved.guess !== null;
			if (saved.guess !== null) guess = saved.guess;
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
		const release = registerLive();
		const unlink = root ? linkFacts(root) : () => {};
		return () => {
			controller?.abort();
			unlink();
			release();
		};
	});
</script>

<div class="fig-box tp" bind:this={root}>
	{#if data && a && p}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="tp-plot"
			class:is-guessing={!revealed}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onkeydown={key}
		>
			<TempoPlot
				{data}
				{agent}
				{metric}
				{revealed}
				guess={revealed && !guessed ? null : guess}
				interactive={true}
				{labelId}
				{prosMaps}
				describedBy="tp-desc"
			/>
		</div>
		<div class="tp-foot">
			<div class="tp-row">
				<label>
					Agent checkpoint
					<select onchange={(e) => (agent = asAgent(e.currentTarget.value))}>
						{#each AGENT_BLOCKS as b (b.key)}
							<option value={b.key} selected={b.key === agent}>Block {b.block}</option>
						{/each}
					</select>
				</label>
				{#if revealed}
					<label>
						Metric
						<select onchange={(e) => (metric = asMetric(e.currentTarget.value))}>
							{#each METRICS as m (m.key)}
								<option value={m.key} selected={m.key === metric}>{m.label}</option>
							{/each}
						</select>
					</label>
					<button type="button" onclick={again}>Guess again</button>
				{/if}
			</div>
			{#if !revealed}
				<div class="tp-guess">
					<label for="tp-guess">Your guess: when do pros make first contact?</label>
					<div class="tp-slide">
						<input
							id="tp-guess"
							type="range"
							min={GUESS.min}
							max={GUESS.max}
							step={GUESS.step}
							value={guess}
							oninput={(e) => (guess = snapGuess(e.currentTarget.valueAsNumber))}
							onkeydown={slide}
							aria-valuetext={formatSeconds(guess)}
						/>
						<output for="tp-guess">{formatSeconds(guess)}</output>
					</div>
				</div>
				<div class="tp-row">
					<button type="button" class="tp-primary" onclick={() => reveal(true)}>Reveal</button>
					<button type="button" onclick={() => reveal(false)}>Just show me</button>
				</div>
			{:else}
				{#each sentences as line}
					<p class="tp-sentence">{line}</p>
				{/each}
			{/if}
			<p class="tp-stamp" data-stamp>{stampText(data, agent, rerunDate, prosMaps)}</p>
			<p id="tp-desc" class="tp-sr">{summary}</p>
			<p class="tp-sr" aria-live="polite">{live}</p>
		</div>
	{:else}
		{@render children?.()}
		{#if failed}
			<div class="tp-fail" role="status">
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
	.tp-plot.is-guessing {
		cursor: ew-resize;
	}
	/* Mirrors TempoKeyframe.astro's .tp-foot: same reserved height, so hydration moves nothing. */
	.tp-foot {
		min-block-size: var(--tp-foot, 14rem);
		padding: var(--space-3) var(--space-2) 0;
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	@media (min-width: 701px) {
		.tp-foot {
			min-block-size: var(--tp-foot, 11rem);
		}
	}
	.tp-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2) var(--space-3);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		color: var(--color-text);
	}
	.tp-guess {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.tp-slide {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	input[type="range"] {
		flex: 1 1 auto;
		min-inline-size: 0;
		min-block-size: 44px;
		accent-color: var(--color-text);
	}
	output {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		min-inline-size: 5ch;
		color: var(--color-text);
	}
	select,
	button {
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
	.tp-primary {
		background: var(--color-text);
		color: var(--color-bg);
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.tp-sentence {
		margin: 0;
	}
	.tp-stamp {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--font-size-1);
		color: var(--color-text-muted);
		overflow-wrap: anywhere;
	}
	.tp-sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		margin: 0;
	}
	.tp-fail {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-2);
		font-size: var(--font-size-ui);
	}
</style>
