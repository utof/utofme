<script lang="ts">
	/**
	 * EloSentence.svelte: the reactive Elo sentence (F13), inline in a paragraph:
	 * "an agent rated +96 higher wins 63 % of rounds". SSR renders the plain sentence; after
	 * hydration the first number is a slider (`role="slider"`, arrows ±1, Shift ±10, Home/End,
	 * horizontal pointer drag) and the percentage follows `formatPercent(winProbability(d), 0)`.
	 *
	 * Why: Elo is a statement about odds; dragging the number makes the logistic curve felt. The
	 * root is a `<span>`, a real box inside the paragraph, so `client:visible` observes it; the
	 * island opens no resource beyond its own listeners (nothing to register or release).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15 (F13)
	 */
	import { onMount } from "svelte";
	import { winProbability } from "../../lib/elo";
	import { formatPercent, formatSigned } from "../../lib/figure-scale";

	interface Props {
		/** The starting difference, in Elo (the block-28 gain). */
		initial: number;
	}
	const { initial }: Props = $props();

	const MIN = -400;
	const MAX = 400;
	/** Pixels of horizontal drag per Elo point. */
	const PX_PER_ELO = 2;

	// Why: the prop only seeds the state; the reader owns the value afterwards.
	// svelte-ignore state_referenced_locally
	let d = $state(initial);
	let armed = $state(false);
	let dragging: { x: number; d: number } | null = $state(null);

	const text = $derived(formatSigned(d, 0));
	const pct = $derived(formatPercent(winProbability(d), 0));

	const clamp = (v: number): number => Math.min(MAX, Math.max(MIN, Math.round(v)));

	onMount(() => {
		armed = true;
	});

	function key(e: KeyboardEvent): void {
		const step = e.shiftKey ? 10 : 1;
		switch (e.key) {
			case "ArrowRight":
			case "ArrowUp":
				d = clamp(d + step);
				break;
			case "ArrowLeft":
			case "ArrowDown":
				d = clamp(d - step);
				break;
			case "Home":
				d = MIN;
				break;
			case "End":
				d = MAX;
				break;
			default:
				return;
		}
		e.preventDefault();
	}

	function down(e: PointerEvent): void {
		dragging = { x: e.clientX, d };
		if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent): void {
		if (dragging) d = clamp(dragging.d + (e.clientX - dragging.x) / PX_PER_ELO);
	}
	function up(): void {
		dragging = null;
	}
</script>

<span class="es"
	>an agent rated
	{#if armed}<span
			class="es-n"
			role="slider"
			tabindex="0"
			aria-label="Elo difference"
			aria-valuemin={MIN}
			aria-valuemax={MAX}
			aria-valuenow={d}
			aria-valuetext="{text} Elo"
			aria-orientation="horizontal"
			onkeydown={key}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}>{text}</span
		>{:else}<strong>{text}</strong>{/if}
	higher wins <strong>{pct}</strong> of rounds</span
>

<style>
	.es-n {
		font-weight: 700;
		color: var(--color-text);
		border-block-end: 2px dotted var(--color-text-muted);
		cursor: ew-resize;
		touch-action: none;
		user-select: none;
		font-variant-numeric: tabular-nums;
		padding-inline: 2px;
	}
	.es-n:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
		border-radius: var(--radius-xs);
	}
	strong {
		font-variant-numeric: tabular-nums;
	}
</style>
