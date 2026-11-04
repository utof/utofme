<script lang="ts">
	/**
	 * FreePeek.svelte: the interactive island of figure F8 ("The free peek").
	 *
	 * A one-dimensional corridor with a holder and a peeker. "Step out" and "Step back" (or the
	 * arrow keys on the focused corridor, or dragging the peeker) advance one 0.8 s tick; the
	 * board shows where the holder's shot lands. "Snap fire" re-resolves the same moves under the
	 * snap rule and swaps the readout; "Real CS" refines the timeline to the real tick rate. The
	 * SSR strip (the `children` snippet) shows until hydration; there is no data to fetch.
	 *
	 * Why: the claim (a one-tick peek is free because the shot lands on the tile the peeker just
	 * left) is felt faster by doing it than by reading it. The rules are pure (`free-peek.ts`),
	 * nothing animates (state changes are instant, so reduced motion and "Pause motion" need no
	 * special case) and the only resource it opens is registered with `registerLive` and released
	 * on unmount (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-12
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import { formatNumber } from "../../lib/figure-scale";
	import { registerLive } from "../../lib/figure-live";
	import { linkFacts } from "../../lib/figure-link";
	import {
		type Action,
		canStep,
		checksPerTick,
		DEFAULT_ACTIONS,
		describeTick,
		realWindowMs,
		run,
		TILES,
		tickSeconds,
	} from "../../lib/figures/free-peek";
	import FreePeekBoard from "./FreePeekBoard.svelte";

	interface Props {
		/** Formatted one-tick hit rate without snap fire ("17 %"), fact `peek.hit.nosnap`. */
		hitNoSnap: string;
		/** Formatted one-tick hit rate with snap fire ("57 %"), fact `peek.hit.snap`. */
		hitSnap: string;
		/** Server ticks per second of real Counter-Strike (fact `cs2.tickrate`), if cited. */
		tickrate?: number | undefined;
		/** The SSR strip. */
		children?: Snippet;
	}
	const { hitNoSnap, hitSnap, tickrate, children }: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let ready = $state(false);
	let actions: Action[] = $state([...DEFAULT_ACTIONS]);
	let snap = $state(false);
	let real = $state(false);
	let live = $state("");

	const result = $derived(run(actions, snap));
	const last = $derived(result.ticks.at(-1) ?? null);
	const shown = $derived(result.ticks.slice(-6));
	const canOut = $derived(canStep(result.peeker, "out"));
	const canBack = $derived(canStep(result.peeker, "back"));

	function take(a: Action): void {
		if (!canStep(result.peeker, a)) return;
		actions = [...actions, a];
		const t = run(actions, snap).ticks.at(-1);
		live = t ? describeTick(t) : "";
	}
	function reset(): void {
		actions = [];
		live = "Reset: the peeker is behind the corner.";
	}
	function toggleSnap(): void {
		snap = !snap;
		live = snap
			? `Snap fire on: hit ${hitSnap} of the time, was ${hitNoSnap}.`
			: `Snap fire off: hit ${hitNoSnap} of the time.`;
	}
	function toggleReal(): void {
		real = !real;
	}
	function keydown(ev: KeyboardEvent): void {
		if (ev.key === "ArrowRight") take("out");
		else if (ev.key === "ArrowLeft") take("back");
		else return;
		ev.preventDefault();
	}

	// --- dragging the peeker along the corridor: one step (one tick) per tile crossed ----------
	let dragging = false;
	function tileAt(ev: PointerEvent, el: Element): number {
		const r = el.getBoundingClientRect();
		return Math.min(Math.max(Math.floor(((ev.clientX - r.left) / r.width) * TILES), 0), TILES - 1);
	}
	function follow(ev: PointerEvent): void {
		const el = ev.currentTarget;
		if (!dragging || !(el instanceof Element)) return;
		const target = tileAt(ev, el);
		for (let guard = 0; guard < TILES; guard++) {
			const at = run(actions, snap).peeker;
			if (target > at && canStep(at, "out")) take("out");
			else if (target < at && canStep(at, "back")) take("back");
			else break;
		}
	}
	function down(ev: PointerEvent): void {
		const el = ev.currentTarget;
		if (ev.button > 0 || !(el instanceof Element)) return;
		dragging = true;
		el.setPointerCapture(ev.pointerId);
		follow(ev);
	}
	function up(): void {
		dragging = false;
	}

	const windowMs = $derived(tickrate ? formatNumber(realWindowMs(tickrate), 1) : null);
	const checks = $derived(tickrate ? checksPerTick(tickrate) : 0);

	onMount(() => {
		ready = true;
		const release = registerLive();
		const unlink = root ? linkFacts(root) : () => {};
		return () => {
			unlink();
			release();
		};
	});
</script>

<div class="fig-box fp" bind:this={root}>
	{#if ready}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="fp-board"
			role="group"
			aria-label="Corridor: the holder on the right, the peeker stepping out from the left. Arrow keys step."
			tabindex="0"
			onkeydown={keydown}
			onpointerdown={down}
			onpointermove={follow}
			onpointerup={up}
			onpointercancel={up}
		>
			<FreePeekBoard peeker={result.peeker} {last} recent={result.ticks.slice(-2)} />
		</div>
		<div class="fp-row">
			<button type="button" onclick={() => take("out")} disabled={!canOut}>Step out</button>
			<button type="button" onclick={() => take("back")} disabled={!canBack}>Step back</button>
			<button type="button" onclick={reset}>Reset</button>
			<button type="button" aria-pressed={snap} onclick={toggleSnap}>Snap fire</button>
			<button type="button" aria-pressed={real} onclick={toggleReal}>Real CS</button>
		</div>
		<p class="fp-read">
			{#if snap}
				Hit <strong data-fact="peek.hit.snap">{hitSnap}</strong> of the time (was
				<span data-fact="peek.hit.nosnap">{hitNoSnap}</span>).
			{:else}
				A one-tick peek is hit <strong data-fact="peek.hit.nosnap">{hitNoSnap}</strong> of the time.
			{/if}
		</p>
		<svg class="fp-time" viewBox="0 0 320 34" aria-hidden="true">
			<path class="fp-axis" d="M0,12H320" />
			{#each shown as t, i (t.n)}
				{@const w = 320 / 6}
				{@const x0 = i * w}
				<path class="fp-edge" d="M{x0},4v16" />
				{#if real && checks > 0}
					<path
						class="fp-fine"
						d={Array.from({ length: checks }, (_, k) => `M${x0 + (k * w) / checks},8v8`).join("")}
					/>
				{/if}
				<text x={x0 + w / 2} y="32" text-anchor="middle">{tickSeconds(t.n)} s</text>
			{/each}
		</svg>
		<p class="fp-note">
			{#if real && windowMs}
				Real Counter-Strike runs {tickrate} ticks a second: one check every {windowMs} ms, {checks}
				of them inside each tick drawn above. It does not wait 0.8 s to look.
			{:else if real}
				Real Counter-Strike checks many times per tick, so it does not wait 0.8 s to look.
			{:else}
				Each mark is one 0.8 s tick, the game's clock.
			{/if}
		</p>
		<ol class="fp-log">
			{#each shown as t (t.n)}
				<li>{describeTick(t)}</li>
			{/each}
		</ol>
		<p class="fp-sr" aria-live="polite">{live}</p>
	{:else}
		{@render children?.()}
	{/if}
</div>

<style>
	.fig-box {
		position: relative;
		inline-size: 100%;
		/* Mirrors FreePeekKeyframe.astro's .fp-strip: same fixed height, so hydration moves nothing. */
		block-size: var(--fp-h, 40rem);
		padding: var(--space-2);
		font-size: var(--font-size-ui);
		color: var(--color-text-body);
		overflow: hidden;
	}
	@media (min-width: 701px) {
		.fig-box {
			block-size: var(--fp-h, 28rem);
		}
	}
	.fp-board {
		touch-action: pan-y;
		cursor: ew-resize;
	}
	.fp-board:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.fp-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-block: var(--space-2);
	}
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
	button:disabled {
		color: var(--color-text-muted);
		cursor: default;
	}
	button[aria-pressed="true"] {
		background: var(--color-text);
		color: var(--color-bg);
	}
	button:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.fp-read {
		margin: 0 0 var(--space-2);
		color: var(--color-text);
	}
	.fp-time {
		display: block;
		inline-size: 100%;
		block-size: auto;
	}
	.fp-time text {
		font-family: var(--font-mono);
		font-size: 9px;
		fill: var(--color-text-muted);
	}
	.fp-axis,
	.fp-edge {
		stroke: var(--color-border);
		fill: none;
	}
	.fp-fine {
		stroke: var(--color-text-muted);
		stroke-width: 0.5;
		fill: none;
	}
	.fp-note {
		margin: var(--space-1) 0;
		font-size: var(--font-size-1);
		color: var(--color-text-muted);
	}
	.fp-log {
		margin: 0;
		padding-inline-start: var(--space-4);
		font-size: var(--font-size-1);
	}
	.fp-sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		margin: 0;
	}
	[data-fact].is-linked {
		text-decoration: underline;
	}
</style>
