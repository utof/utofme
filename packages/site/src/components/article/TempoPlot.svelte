<script lang="ts">
	/**
	 * TempoPlot.svelte: the SVG of figure F4 (two histogram strips with quantile boxes), drawn
	 * identically by the SSR keyframe (`interactive={false}`, `role="img"`) and by the island.
	 *
	 * Why: one drawing for both states means hydration moves nothing; it holds no state and no
	 * effects, so it costs the page no JS when rendered on the server only.
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-8
	 */
	import type { TempoData } from "../../lib/article-data/tempo";
	import { markPath } from "../../lib/figure-marks";
	import { formatSeconds } from "../../lib/figure-scale";
	import {
		AGENT_BLOCKS,
		type AgentKey,
		axisTicks,
		barsPath,
		boxPath,
		type MetricKey,
		maxBinShare,
		metricInfo,
		PLOT,
		prosMedianText,
		xOf,
	} from "../../lib/figures/tempo";

	interface Props {
		data: TempoData;
		agent: AgentKey;
		metric: MetricKey;
		/** Whether the pros' strip is shown. */
		revealed: boolean;
		/** The guess in seconds (contact only). */
		guess: number | null;
		interactive: boolean;
		labelId: string;
		/** Printed count of pro maps ("224"), a fact formatted by the Block. */
		prosMaps: string;
		describedBy?: string | undefined;
	}
	const {
		data,
		agent,
		metric,
		revealed,
		guess,
		interactive,
		labelId,
		prosMaps,
		describedBy,
	}: Props = $props();

	const info = $derived(metricInfo(metric));
	const a = $derived(data.series[agent][metric]);
	const p = $derived(data.series.pros[metric]);
	const share = $derived(maxBinShare(revealed ? [a, p] : [a], data.binS, info.maxS));
	const block = $derived(AGENT_BLOCKS.find((b) => b.key === agent)?.block ?? 0);
	const aBox = $derived(boxPath(a.q, info.maxS, PLOT.agent));
	const pBox = $derived(boxPath(p.q, info.maxS, PLOT.pro));
	const ci = $derived(data.prosCi[metric]);
	const showGuess = $derived(metric === "contact" && interactive && guess !== null);
	const gx = $derived(xOf(guess ?? 0, info.maxS));
	const aLabel = $derived(`${formatSeconds(a.q[2])}`);
	const mid = (PLOT.x0 + PLOT.x1) / 2;
</script>

<svg
	class="tp-svg"
	viewBox="0 0 {PLOT.w} {PLOT.h}"
	role={interactive ? "group" : "img"}
	aria-labelledby={labelId}
	aria-describedby={describedBy}
>
	<g class="tp-axis">
		<path d="M{PLOT.x0},{PLOT.axis}H{PLOT.x1}" />
		{#each axisTicks(info.maxS) as t (t)}
			<path d="M{xOf(t, info.maxS)},{PLOT.axis}v5" />
			<text x={xOf(t, info.maxS)} y={PLOT.axis + 20} text-anchor="middle">{t} s</text>
		{/each}
	</g>

	<text class="tp-name" x={PLOT.x0} y={PLOT.agent.label}>Agents, block {block}</text>
	<path class="tp-bars tp-bars--agent" d={barsPath(a, data.binS, info.maxS, share, PLOT.agent)} />
	<path class="tp-box tp-box--agent" d={aBox.whisker} />
	<path class="tp-box tp-box--agent" d={aBox.box} />
	<circle
		class="tp-dot tp-dot--agent"
		data-fact={agent === "b28" ? info.agentFact : undefined}
		cx={xOf(a.q[2], info.maxS)}
		cy={PLOT.agent.box}
		r="6"
	/>
	<text class="tp-val" x={xOf(a.q[2], info.maxS)} y={PLOT.agent.box + 26} text-anchor="middle"
		>median {aLabel}</text
	>
	{#if metric === "contact"}
		<path
			class="tp-bot"
			data-fact="tempo.bots.contact.median"
			d={markPath("bot", xOf(data.botsContact, info.maxS), PLOT.agent.box, 6)}
		/>
		<text class="tp-val" x={xOf(data.botsContact, info.maxS) + 12} y={PLOT.agent.box + 5}
			>bots, median only {formatSeconds(data.botsContact)}</text
		>
	{/if}

	<text class="tp-name" x={PLOT.x0} y={PLOT.pro.label}>Pros, {prosMaps} maps of 2026</text>
	{#if revealed}
		<path class="tp-bars tp-bars--pro" d={barsPath(p, data.binS, info.maxS, share, PLOT.pro)} />
		<path class="tp-box tp-box--pro" d={pBox.whisker} />
		<path class="tp-box tp-box--pro" d={pBox.box} />
		<path class="tp-ci" d="M{xOf(ci[1], info.maxS)},{PLOT.pro.box + 12}H{xOf(ci[2], info.maxS)}" />
		<path
			class="tp-dia"
			data-fact={info.proFact}
			d={markPath("pro", xOf(p.q[2], info.maxS), PLOT.pro.box, 8)}
		/>
		<text class="tp-val" x={xOf(p.q[2], info.maxS)} y={PLOT.pro.box + 32} text-anchor="middle"
			>median {prosMedianText(ci)}</text
		>
	{:else}
		<path class="tp-hidden" d="M{PLOT.x0},{PLOT.pro.top}H{PLOT.x1}V{PLOT.pro.base}H{PLOT.x0}z" />
		<text class="tp-val" x={mid} y={(PLOT.pro.top + PLOT.pro.base) / 2} text-anchor="middle"
			>Hidden until you reveal</text
		>
	{/if}

	{#if showGuess && guess !== null}
		<path class="tp-guess" d="M{gx},{PLOT.agent.top}V{PLOT.pro.base}" />
		<path class="tp-guess-handle" d="M{gx - 7},{PLOT.axis + 2}h14l-7,-9z" />
		<text
			class="tp-val tp-val--guess"
			x={gx}
			y={PLOT.pro.label - 4}
			text-anchor={guess > 30 ? "end" : "start"}
			dx={guess > 30 ? -6 : 6}>Your guess {formatSeconds(guess)}</text
		>
	{/if}
</svg>

<style>
	.tp-svg {
		display: block;
		inline-size: 100%;
		block-size: auto;
		overflow: visible;
		touch-action: pan-y;
	}
	text {
		font-family: var(--font-mono);
		font-size: 15px;
		fill: var(--color-text-body);
	}
	.tp-name {
		font-family: var(--font-sans, inherit);
		font-size: 17px;
		font-weight: 600;
		fill: var(--color-text);
	}
	.tp-val {
		fill: var(--color-text);
	}
	.tp-axis path {
		stroke: var(--color-border);
		stroke-width: 1;
		fill: none;
	}
	.tp-axis text {
		fill: var(--color-text-muted);
	}
	.tp-bars--agent {
		fill: var(--color-ct);
		fill-opacity: 0.8;
	}
	.tp-bars--pro {
		fill: var(--color-pro);
		fill-opacity: 0.75;
	}
	.tp-box {
		fill: none;
		stroke-width: 2;
	}
	.tp-box--agent {
		stroke: var(--color-ct);
	}
	.tp-box--pro {
		stroke: var(--color-pro);
	}
	.tp-dot--agent {
		fill: var(--color-ct);
	}
	.tp-dia {
		fill: var(--color-pro);
	}
	.tp-bot {
		fill: var(--color-bot);
	}
	.tp-ci {
		stroke: var(--color-pro);
		stroke-width: 4;
		fill: none;
	}
	.tp-hidden {
		fill: none;
		stroke: var(--color-border);
		stroke-width: 2;
		stroke-dasharray: 6 5;
	}
	.tp-guess {
		stroke: var(--color-text);
		stroke-width: 2;
		stroke-dasharray: 5 4;
		fill: none;
	}
	.tp-guess-handle {
		fill: var(--color-text);
	}
	.tp-svg :global([data-fact].is-linked) {
		stroke: var(--color-text);
		stroke-width: 3;
	}
</style>
