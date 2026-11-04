<script lang="ts">
	/**
	 * AgentsVsPros.svelte: the interactive island of figure F11 (agents vs pros, side by side).
	 *
	 * Eleven dumbbell rows, sorted by relative gap by default; a toggle returns to the data's
	 * order; a row opens (click, Enter, Space) to show its definition, intervals and public
	 * source label. The SSR keyframe (the `children` snippet) shows until the data is ready and
	 * stays if the load fails (note + Retry).
	 *
	 * Why: the sort and the definitions are what turn a table into an argument: the biggest
	 * disagreements come first, and every row says what it counts. Nothing animates, so reduced
	 * motion and "Pause motion" need no special case; the fetch and the link listeners are
	 * registered with `registerLive` and released on unmount (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-15
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { AgentsVsProsData } from "../../lib/article-data/agents_vs_pros";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { linkFacts } from "../../lib/figure-link";
	import { registerLive } from "../../lib/figure-live";
	import { orderRows } from "../../lib/figures/agents-vs-pros";
	import AvpChart from "./AvpChart.svelte";

	interface Props {
		/** Hashed URL of the `agents_vs_pros` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Printed number of pro maps ("224"), a fact formatted by the Block. */
		prosMaps: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, prosMaps, children }: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let data: AgentsVsProsData | null = $state(null);
	let failed = $state(false);
	let byGap = $state(true);
	let open: string | null = $state(null);
	let live = $state("");

	const rows = $derived(data ? orderRows(data.rows, byGap ? "gap" : "data") : []);

	function toggleSort(): void {
		byGap = !byGap;
		live = byGap ? "Sorted by relative gap, largest first." : "Rows in the order of the data.";
	}
	function toggleRow(id: string): void {
		open = open === id ? null : id;
	}

	let controller: AbortController | null = null;
	async function load(): Promise<void> {
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		failed = false;
		const release = registerLive();
		try {
			const loaded = await loadFigureData<AgentsVsProsData>(src, shape, { signal: mine.signal });
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
		const release = registerLive();
		const unlink = root ? linkFacts(root) : () => {};
		return () => {
			controller?.abort();
			unlink();
			release();
		};
	});
</script>

<div class="fig-box" bind:this={root}>
	{#if data}
		<AvpChart {rows} interactive={true} {open} onToggle={toggleRow} {prosMaps}>
			{#snippet bar()}
				<button type="button" class="av-sort" aria-pressed={byGap} onclick={toggleSort}>
					Sort by gap
				</button>
			{/snippet}
		</AvpChart>
		<p class="av-sr" aria-live="polite">{live}</p>
	{:else}
		{@render children?.()}
		{#if failed}
			<div class="av-fail" role="status">
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
	.av-sort,
	.av-fail button {
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
	.av-sort[aria-pressed="true"] {
		background: var(--color-text);
		color: var(--color-bg);
	}
	.av-sort:focus-visible,
	.av-fail button:focus-visible {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
	.av-sr {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		margin: 0;
	}
	.av-fail {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-2);
		font-size: var(--font-size-ui);
	}
</style>
