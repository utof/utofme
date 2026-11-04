<script lang="ts">
	/**
	 * FreePeekBoard.svelte: the corridor of figure F8 as one SVG (eight tiles, the holder, the
	 * peeker, its ghost on the tile it just left and the shots of the last tick). Drawn
	 * identically by the SSR strip panels and by the island.
	 *
	 * Why: one drawing for both states means hydration moves nothing, and the strip's four panels
	 * and the live board cannot drift apart; it holds no state.
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
	 */
	import { markPath } from "../../lib/figure-marks";
	import {
		AIM,
		HOLDER,
		inAim,
		TILES,
		type TickRecord,
		VISIBLE_FROM,
	} from "../../lib/figures/free-peek";

	interface Props {
		/** Tile the peeker stands on (0-based). */
		peeker: number;
		/** The tick whose ghost is drawn, if any. */
		last: TickRecord | null;
		/** Ticks whose shots are drawn (the last two in the island; the sixth tick only in panel 3). */
		recent?: readonly TickRecord[];
		/** Draw the holder's aim as already turned onto this tile (strip panel 2). */
		aimAt?: number | null;
		/** Hide the shots (strip panels 1 and 2). */
		hideShots?: boolean;
	}
	const { peeker, last, recent = [], aimAt = null, hideShots = false }: Props = $props();

	const W = 40;
	const H = 96;
	const rowY = 28;
	const cx = (tile: number): number => tile * W + W / 2;
	const cy = rowY + 20;
	const shots = $derived(hideShots ? [] : recent.flatMap((t) => t.shots));
</script>

<svg class="fp-svg" viewBox="0 0 {TILES * W} {H}" aria-hidden="true">
	{#each Array.from({ length: TILES }, (_, i) => i) as tile (tile)}
		<rect
			class="fp-tile"
			class:fp-tile--hidden={tile < VISIBLE_FROM}
			x={tile * W + 1}
			y={rowY}
			width={W - 2}
			height="40"
		/>
		<text class="fp-num" x={cx(tile)} y={rowY + 56} text-anchor="middle">{tile + 1}</text>
	{/each}
	<path
		class="fp-aim"
		d="M{AIM[0] * W + 2},{rowY - 6}V{rowY - 12}H{(AIM[1] + 1) * W - 2}V{rowY - 6}"
	/>
	<text class="fp-lab" x={((AIM[0] + AIM[1] + 1) / 2) * W} y={rowY - 16} text-anchor="middle"
		>aimed</text
	>
	<text class="fp-lab" x={(VISIBLE_FROM * W) / 2} y={rowY - 16} text-anchor="middle"
		>behind the corner</text
	>

	{#if aimAt !== null}
		<path class="fp-tracer" d="M{cx(HOLDER)},{cy}H{cx(aimAt)}" />
	{/if}
	{#each shots as s, i (i)}
		<path class="fp-tracer" d="M{cx(HOLDER)},{cy + (s.kind === 'snap' ? -9 : 9)}H{cx(s.tile)}" />
		{#if s.hit}
			<path class="fp-hit" d="M{s.tile * W + 3},{rowY + 3}h{W - 6}v34h{-(W - 6)}z" />
		{:else}
			<path class="fp-miss-box" d="M{s.tile * W + 3},{rowY + 3}h{W - 6}v34h{-(W - 6)}z" />
			<path class="fp-miss" d="M{cx(s.tile) - 6},{cy - 6}l12,12m0,-12l-12,12" />
		{/if}
	{/each}

	{#if last && last.from !== peeker}
		<path class="fp-ghost" d={markPath("t", cx(last.from), cy, 11)} />
	{/if}
	<circle class="fp-holder" cx={cx(HOLDER)} {cy} r="11" />
	<path class="fp-peeker" d={markPath("t", cx(peeker), cy, 11)} />
	<text class="fp-lab" x={cx(HOLDER)} y={rowY + 56} text-anchor="middle" dy="14">holder</text>
	<text class="fp-lab" x={cx(peeker)} y={rowY + 56} text-anchor="middle" dy="14">peeker</text>
	{#if inAim(peeker) && !hideShots}
		<title>in the holder's aim</title>
	{/if}
</svg>

<style>
	.fp-svg {
		display: block;
		inline-size: 100%;
		block-size: auto;
		overflow: visible;
	}
	text {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--color-text-muted);
	}
	.fp-lab {
		fill: var(--color-text-body);
	}
	.fp-tile {
		fill: var(--color-map-floor);
		stroke: var(--color-border);
	}
	.fp-tile--hidden {
		fill: var(--color-map-site);
	}
	.fp-aim {
		fill: none;
		stroke: var(--color-ct);
		stroke-width: 1.5;
	}
	.fp-holder {
		fill: var(--color-ct);
	}
	.fp-peeker {
		fill: var(--color-t);
	}
	.fp-ghost {
		fill: none;
		stroke: var(--color-t);
		stroke-width: 1.5;
		stroke-dasharray: 3 2;
	}
	.fp-tracer {
		fill: none;
		stroke: var(--color-text);
		stroke-width: 1.25;
		stroke-dasharray: 4 3;
	}
	.fp-miss {
		fill: none;
		stroke: var(--color-outcome-reverted);
		stroke-width: 2.5;
	}
	.fp-miss-box {
		fill: none;
		stroke: var(--color-outcome-reverted);
		stroke-width: 1.5;
		stroke-dasharray: 3 2;
	}
	.fp-hit {
		fill: none;
		stroke: var(--color-outcome-reverted);
		stroke-width: 3;
	}
</style>
