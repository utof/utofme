<script lang="ts">
	/**
	 * AvpChart.svelte: the dumbbell rows of figure F11, drawn identically by the SSR keyframe
	 * (static `div` heads) and by the island (`button` heads that open a definition).
	 *
	 * Why: one drawing for both states means hydration moves nothing; it holds no state, so it
	 * costs the page no JS when rendered on the server only.
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
	 */
	import type { Snippet } from "svelte";
	import { markPath } from "../../lib/figure-marks";
	import {
		type AvpRow,
		formatValue,
		intervalText,
		ROW_DEFS,
		rowSummary,
		sourceOf,
		stampOf,
		TRACK,
		trackX,
	} from "../../lib/figures/agents-vs-pros";

	interface Props {
		rows: AvpRow[];
		/** Heads are buttons that call `onToggle` when true. */
		interactive: boolean;
		/** Id of the open row, if any. */
		open?: string | null;
		onToggle?: (id: string) => void;
		/** Printed number of pro maps ("224"). */
		prosMaps: string;
		/** The row of controls above the list. */
		bar?: Snippet;
	}
	const { rows, interactive, open = null, onToggle, prosMaps, bar }: Props = $props();
	const cy = TRACK.h / 2;
</script>

{#snippet head(row: AvpRow)}
	<span class="av-name">{ROW_DEFS[row.id].label}</span>
	<span class="av-stamp" data-stamp>{stampOf(row)}</span>
	<svg
		class="av-track"
		viewBox="0 0 {TRACK.w} {TRACK.h}"
		preserveAspectRatio="xMinYMid meet"
		aria-hidden="true"
	>
		<path class="av-axis" d="M{TRACK.pad},{cy}H{TRACK.w - TRACK.pad}" />
		{#each ["agent", "pro"] as const as side (side)}
			{#if row[side].length === 3}
				<path
					class="av-ci av-ci--{side}"
					d="M{trackX(row, row[side][1])},{cy + (side === 'agent' ? -7 : 7)}H{trackX(
						row,
						row[side][2],
					)}"
				/>
			{/if}
		{/each}
		<circle
			class="av-agent"
			data-fact={ROW_DEFS[row.id].facts?.agent}
			cx={trackX(row, row.agent[0])}
			{cy}
			r="6.5"
		/>
		<path
			class="av-pro"
			data-fact={ROW_DEFS[row.id].facts?.pro}
			d={markPath("pro", trackX(row, row.pro[0]), cy, 8.5)}
		/>
	</svg>
	<span class="av-vals">
		<span>Agent {formatValue(row, row.agent[0])}</span>
		<span>Pros {formatValue(row, row.pro[0])}</span>
	</span>
{/snippet}

<div class="av">
	<div class="av-top">
		<p class="av-legend">
			<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"
				><circle class="av-agent" cx="7" cy="7" r="5" /></svg
			>
			Agent
			<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"
				><path class="av-pro" d={markPath("pro", 7, 7, 6.5)} /></svg
			>
			Pros. Bars are 95 % intervals; the 5v5 rows have none (their rates move about ±0.02–0.03 between
			runs).
		</p>
		{@render bar?.()}
	</div>
	<ul class="av-list">
		{#each rows as row (row.id)}
			<li class="av-row" data-row={row.id}>
				{#if interactive}
					<button
						type="button"
						class="av-head"
						aria-expanded={open === row.id}
						aria-controls="av-detail-{row.id}"
						aria-label={rowSummary(row)}
						onclick={() => onToggle?.(row.id)}
					>
						{@render head(row)}
					</button>
				{:else}
					<div class="av-head">{@render head(row)}</div>
				{/if}
				{#if interactive && open === row.id}
					<div id="av-detail-{row.id}" class="av-detail">
						<p>{ROW_DEFS[row.id].definition}</p>
						<p>
							Agent: {intervalText(row, "agent")}. Pros: {intervalText(row, "pro")}. Source: {sourceOf(
								row,
								prosMaps,
							)}.
						</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.av {
		inline-size: 100%;
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
	}
	.av-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2);
		min-block-size: 5.5rem;
	}
	.av-legend {
		margin: 0;
		flex: 1 1 18rem;
		font-size: var(--font-size-1);
		color: var(--color-text-muted);
	}
	.av-legend svg {
		vertical-align: middle;
	}
	.av-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.av-row {
		border-block-start: 1px solid var(--color-border);
	}
	.av-head {
		box-sizing: border-box;
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: "name vals" "stamp vals" "track track";
		align-items: center;
		gap: 0 var(--space-3);
		inline-size: 100%;
		min-block-size: 5.25rem;
		padding: var(--space-2);
		font: inherit;
		text-align: start;
		color: inherit;
		background: none;
		border: 0;
	}
	button.av-head {
		cursor: pointer;
	}
	button.av-head:hover {
		background: var(--color-surface);
	}
	button.av-head:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	@media (min-width: 701px) {
		.av-head {
			grid-template-columns: minmax(10rem, 15rem) 1fr 11rem;
			grid-template-areas: "name track vals" "stamp track vals";
			min-block-size: 3.5rem;
		}
	}
	.av-name {
		grid-area: name;
		color: var(--color-text);
		font-weight: 600;
	}
	.av-stamp {
		grid-area: stamp;
		font-family: var(--font-mono);
		font-size: var(--font-size-1);
		color: var(--color-text-muted);
	}
	.av-track {
		grid-area: track;
		inline-size: 100%;
		block-size: 32px;
	}
	.av-vals {
		grid-area: vals;
		display: flex;
		flex-direction: column;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}
	.av-axis {
		stroke: var(--color-border);
		stroke-width: 1;
		fill: none;
	}
	.av-ci {
		stroke-width: 4;
		fill: none;
	}
	.av-ci--agent {
		stroke: var(--color-ct);
	}
	.av-ci--pro {
		stroke: var(--color-pro);
	}
	.av-agent {
		fill: var(--color-ct);
	}
	.av-pro {
		fill: var(--color-pro);
	}
	.av :global([data-fact].is-linked) {
		stroke: var(--color-text);
		stroke-width: 2.5;
	}
	.av-detail {
		padding: 0 var(--space-3) var(--space-3);
	}
	.av-detail p {
		margin: 0 0 var(--space-1);
	}
</style>
