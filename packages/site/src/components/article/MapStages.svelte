<script lang="ts">
	/**
	 * MapStages.svelte: the interactive island of figure F5 (from a CS2 map to 28×28, stages 2 to 5).
	 *
	 * A map board that morphs, square by square, through the four steps of the project's
	 * radar-to-grid translator: floor fraction per square, majority vote, corridor pass, final grid.
	 * A "Stage" slider (four stops) and a strip of four thumbnails under it move between steps; a
	 * map selector switches between the five maps (Mirage first). The stage name and its counted
	 * value sit in a live region. The SSR keyframe (the `children` snippet) shows until the data is
	 * ready and stays, with a note and Retry, if it fails to load.
	 *
	 * Why: the figure's claim ("four steps turn a floor plan into the grid") is something the
	 * reader should be able to slide through; the morph is a per-square opacity cross-fade (instant
	 * under Pause motion), and every resource the island opens (fetch, resize-free) is registered
	 * with `registerLive` so ClientRouter round trips leak nothing (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-9
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { MapStagesData } from "../../lib/article-data/map_stages";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { registerLive } from "../../lib/figure-live";
	import { motionState } from "../../lib/figure-motion.svelte";
	import { formatNumber } from "../../lib/figure-scale";
	import {
		closedTiles,
		DEFAULT_MAP,
		mapTitle,
		reopenedTiles,
		STAGES,
		stageCount,
		stageLayers,
		stageSummary,
		wallness,
	} from "../../lib/figures/map-stages";
	import { centroid } from "../../lib/figures/square-paths";
	import { parseRows, siteRects, spawnTiles } from "../../lib/grid";
	import "./MapStages.css";

	interface Props {
		/** Hashed URL of the `map_stages` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, children }: Props = $props();

	// Why: `motionState()` reads `document`, which does not exist while the island renders on the
	// server; it is created on mount and disposed with the island.
	let motion: ReturnType<typeof motionState> | null = $state.raw(null);
	let data: MapStagesData | null = $state.raw(null);
	let failed = $state(false);
	let mapName = $state(DEFAULT_MAP);
	let stage = $state(3);
	let live = $state("");

	const current = $derived(data?.maps.find((m) => m.name === mapName) ?? data?.maps[0] ?? null);
	const opacities = $derived(current ? wallness(current, stage) : []);
	const summary = $derived(current ? stageSummary(current, stage) : "");
	const grid = $derived(current ? parseRows(current.stages.final) : null);
	const sites = $derived(
		grid ? (["a", "b"] as const).flatMap((k) => siteRects(grid, k).map((r) => ({ k, r }))) : [],
	);
	const spawns = $derived(grid ? { ct: spawnTiles(grid, "ct"), t: spawnTiles(grid, "t") } : null);
	const reopened = $derived(current ? reopenedTiles(current) : []);
	const closed = $derived(current ? closedTiles(current) : []);

	function announce(): void {
		if (current)
			live = `${mapTitle(current.name)}. Step ${stage + 1} of ${STAGES.length}. ${summary}`;
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
			const loaded = await loadFigureData<MapStagesData>(src, shape, { signal: mine.signal });
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
		const m = motionState();
		motion = m;
		void load();
		return () => {
			controller?.abort();
			m.dispose();
			motion = null;
		};
	});

	function go(i: number): void {
		stage = i;
		announce();
	}
</script>

<div class="fig-box ms-box" data-still={motion?.paused ? "" : undefined}>
	{#if data && current}
		<div class="ms ms--live">
			<svg
				class="ms-svg ms-board"
				viewBox="0 0 28 28"
				role="img"
				aria-label={`${mapTitle(current.name)}. ${summary}`}
			>
				<g class="ms-extra" opacity={stage === 3 ? 1 : 0}>
					{#each sites as { k, r } (k)}
						<rect
							class="ms-site"
							x={r.c0}
							y={r.r0}
							width={r.c1 - r.c0 + 1}
							height={r.r1 - r.r0 + 1}
							opacity="0.9"
						/>
					{/each}
				</g>
				{#each opacities as v, i (i)}
					<rect
						class="ms-cell"
						x={i % 28}
						y={Math.floor(i / 28)}
						width="1"
						height="1"
						opacity={v}
					/>
				{/each}
				<g class="ms-extra" opacity={stage === 3 ? 1 : 0} aria-hidden="true">
					{#each sites as { k, r } (k)}
						<text class="ms-letter" x={(r.c0 + r.c1 + 1) / 2} y={(r.r0 + r.r1 + 1) / 2}
							>{k.toUpperCase()}</text
						>
					{/each}
					{#if spawns}
						{#each spawns.ct as [r, c] (`${r},${c}`)}
							<rect class="ms-spawn-ct" x={c} y={r} width="1" height="1" />
						{/each}
						{#each spawns.t as [r, c] (`${r},${c}`)}
							<rect class="ms-spawn-t" x={c} y={r} width="1" height="1" />
						{/each}
						<text class="ms-tag ms-tag--ct" x={centroid(spawns.ct)[0]} y={centroid(spawns.ct)[1]}
							>CT</text
						>
						<text class="ms-tag ms-tag--t" x={centroid(spawns.t)[0]} y={centroid(spawns.t)[1]}
							>T</text
						>
					{/if}
				</g>
				<g class="ms-extra" opacity={stage === 2 ? 1 : 0} aria-hidden="true">
					{#each reopened as [r, c] (`${r},${c}`)}
						<circle class="ms-ring" cx={c + 0.5} cy={r + 0.5} r="0.42" />
					{/each}
				</g>
				<g class="ms-extra" opacity={stage === 3 ? 1 : 0} aria-hidden="true">
					{#each closed as [r, c] (`${r},${c}`)}
						<path
							class="ms-x"
							d={`M${c + 0.2} ${r + 0.2}l0.6 0.6M${c + 0.8} ${r + 0.2}l-0.6 0.6`}
						/>
					{/each}
				</g>
			</svg>
			<div class="ms-side" role="group" aria-labelledby={labelId}>
				<label class="ms-pick">
					Map
					<select
						class="ms-select"
						value={mapName}
						onchange={(e) => {
							mapName = e.currentTarget.value;
							announce();
						}}
					>
						{#each data.maps as m (m.name)}
							<option value={m.name}>{mapTitle(m.name)}</option>
						{/each}
					</select>
				</label>
				<p class="ms-readout">{summary}</p>
				<input
					class="ms-range"
					type="range"
					min="0"
					max={STAGES.length - 1}
					step="1"
					value={stage}
					aria-label="Stage"
					aria-valuetext={summary}
					oninput={(e) => {
						stage = Number(e.currentTarget.value);
					}}
					onchange={announce}
				/>
				<ul class="ms-strip">
					{#each STAGES as s, i (s.id)}
						<li>
							<button
								class="ms-stop"
								type="button"
								aria-label={stageSummary(current, i)}
								aria-current={stage === i ? "true" : undefined}
								onclick={() => go(i)}
							>
								<svg class="ms-svg" viewBox="0 0 28 28" aria-hidden="true">
									{#each stageLayers(current, i) as l (l.opacity)}
										<path class="ms-wall" opacity={l.opacity} d={l.d} />
									{/each}
								</svg>
								<span class="ms-t">{s.title}</span>
								<span class="ms-n">{formatNumber(stageCount(current, i), 0)}</span>
							</button>
						</li>
					{/each}
				</ul>
				<p class="ms-hint">Slide, or press a step, to watch the floor plan become the grid.</p>
			</div>
		</div>
	{:else}
		{@render children?.()}
		{#if failed}
			<p class="ms-fail">
				Interactive version failed to load.
				<button class="ms-btn" type="button" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{/if}
	<p class="ms-live" aria-live="polite">{live}</p>
</div>
