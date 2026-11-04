<script lang="ts">
	/**
	 * RollMap.svelte: the interactive island of figure F10 (roll a map).
	 *
	 * Twelve precomputed maps from each of three map generators (v1, v2, v3). "New seed" shows the
	 * next map ("map 4 of 12"), a three-way toggle switches the generator (the map number is kept),
	 * a strip of twelve thumbnails jumps to any map, and "Compare with Mirage" puts the real map
	 * beside the generated one. A note under the strip says what the generator added and how many
	 * key layout metrics its maps miss the real range on. The SSR keyframe (the `children` snippet)
	 * shows until both data files are ready and stays, with a note and Retry, if the generated maps
	 * fail to load; a missing Mirage only disables Compare.
	 *
	 * Why: the figure's claim (v3 maps look closer to the real ones) is easiest to believe after
	 * rolling a few; no generator runs in the browser (data only), and every resource the island
	 * opens (the two fetches) is registered with `registerLive` so ClientRouter round trips leak
	 * nothing (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-14
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { MapsCsData } from "../../lib/article-data/maps_cs";
	import type { MapsGeneratedData } from "../../lib/article-data/maps_generated";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { registerLive } from "../../lib/figure-live";
	import { centroid } from "../../lib/figures/square-paths";
	import {
		DEFAULT_GENERATOR,
		GENERATORS,
		generatorMaps,
		likenessLine,
		type MapShapes,
		mapShapes,
		nextIndex,
		realLikenessLine,
		seedLabel,
	} from "../../lib/figures/roll-map";
	import "./RollMap.css";

	interface Props {
		/** Hashed URL of the `maps_generated` data file. */
		src: string;
		/** Schema id and top-level keys of `maps_generated`. */
		shape: Shape;
		/** Hashed URL of the `maps_cs` data file (the Mirage comparison; shared with figure F2). */
		compareSrc: string;
		/** Schema id and top-level keys of `maps_cs`. */
		compareShape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, compareSrc, compareShape, labelId, children }: Props = $props();

	const MIRAGE = "de_mirage";
	let data: MapsGeneratedData | null = $state.raw(null);
	let cs: MapsCsData | null = $state.raw(null);
	let failed = $state(false);
	let gen: string = $state(DEFAULT_GENERATOR);
	let index = $state(0);
	let compare = $state(false);
	let live = $state("");

	const bank = $derived(data ? generatorMaps(data, gen) : []);
	const count = $derived(bank.length);
	const rows = $derived(bank[index] ?? bank[0] ?? null);
	const shapes = $derived(rows ? mapShapes(rows) : null);
	const thumbs = $derived(bank.map((r) => mapShapes(r)));
	const mirageRows = $derived(cs?.maps.find((m) => m.name === MIRAGE)?.rows ?? null);
	const mirage = $derived(mirageRows ? mapShapes(mirageRows) : null);
	const blurb = $derived(GENERATORS.find((g) => g.id === gen)?.blurb ?? "");
	const label = $derived(seedLabel(index, count));

	// --- loading ------------------------------------------------------------------------------
	let controller: AbortController | null = null;

	async function load(): Promise<void> {
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		failed = false;
		const release = registerLive();
		try {
			const [generated, mirageData] = await Promise.all([
				loadFigureData<MapsGeneratedData>(src, shape, { signal: mine.signal }),
				// Why: a missing Mirage must not take the figure down; Compare is just disabled.
				loadFigureData<MapsCsData>(compareSrc, compareShape, { signal: mine.signal }).catch(
					(e: unknown) => {
						if (e instanceof FigureDataError && e.kind === "abort") throw e;
						return null;
					},
				),
			]);
			if (mine.signal.aborted) return;
			cs = mirageData;
			data = generated;
		} catch (e) {
			if (e instanceof FigureDataError && e.kind === "abort") return;
			failed = true;
		} finally {
			release();
		}
	}

	onMount(() => {
		void load();
		return () => controller?.abort();
	});

	function announce(prefix: string): void {
		live = `${prefix} Generator ${gen}, ${seedLabel(index, count)}.`;
	}

	function roll(): void {
		index = nextIndex(index, count);
		announce("New seed.");
	}

	function pick(i: number): void {
		index = i;
		announce("");
	}

	function setGen(id: string): void {
		gen = id;
		announce("");
	}

	function toggleCompare(on: boolean): void {
		compare = on;
		live = on ? "Comparing with Mirage." : "Comparison off.";
	}
</script>

{#snippet drawn(s: MapShapes, tags: boolean)}
	{#each s.sites as { r } (r.r0 * 28 + r.c0)}
		<rect class="rm-site" x={r.c0} y={r.r0} width={r.c1 - r.c0 + 1} height={r.r1 - r.r0 + 1} />
	{/each}
	<path class="rm-wall" d={s.walls} />
	{#if tags}
		{#each s.ct as [r, c] (`${r},${c}`)}
			<rect class="rm-spawn-ct" x={c} y={r} width="1" height="1" />
		{/each}
		{#each s.t as [r, c] (`${r},${c}`)}
			<rect class="rm-spawn-t" x={c} y={r} width="1" height="1" />
		{/each}
		{#each s.sites as { k, r } (k)}
			<text class="rm-letter" aria-hidden="true" x={(r.c0 + r.c1 + 1) / 2} y={(r.r0 + r.r1 + 1) / 2}
				>{k.toUpperCase()}</text
			>
		{/each}
		<text class="rm-tag rm-tag--ct" aria-hidden="true" x={centroid(s.ct)[0]} y={centroid(s.ct)[1]}
			>CT</text
		>
		<text class="rm-tag rm-tag--t" aria-hidden="true" x={centroid(s.t)[0]} y={centroid(s.t)[1]}
			>T</text
		>
	{/if}
{/snippet}

<div class="fig-box rm-box">
	{#if data && shapes}
		<div class="rm" role="group" aria-labelledby={labelId}>
			<div class="rm-bar">
				<div class="rm-gens" role="radiogroup" aria-label="Generator">
					{#each GENERATORS as g (g.id)}
						<label class="rm-gen">
							<input
								type="radio"
								name="rm-gen"
								value={g.id}
								checked={gen === g.id}
								onchange={() => setGen(g.id)}
							/>
							<span>{g.label}</span>
						</label>
					{/each}
				</div>
				<button class="rm-btn" type="button" onclick={roll}>New seed</button>
				<p class="rm-label">Generator {gen} · {label}</p>
				<label class="rm-check">
					<input
						type="checkbox"
						checked={compare}
						disabled={!mirage}
						onchange={(e) => toggleCompare(e.currentTarget.checked)}
					/>
					Compare with Mirage
				</label>
			</div>
			<div class="rm-boards" style:--rm-cols={compare && mirage ? 2 : 1}>
				<figure class="rm-fig">
					<p class="rm-cap">Generated · {gen} · {label}</p>
					<svg
						class="rm-board"
						viewBox="0 0 28 28"
						role="img"
						aria-label={`Generator ${gen}, ${label}: a 28 by 28 grid with two bomb sites and two spawns.`}
					>
						{@render drawn(shapes, true)}
					</svg>
				</figure>
				{#if compare && mirage}
					<figure class="rm-fig">
						<p class="rm-cap">Mirage · hand-made</p>
						<svg
							class="rm-board"
							viewBox="0 0 28 28"
							role="img"
							aria-label="Mirage, drawn by hand, for comparison: a 28 by 28 grid with two bomb sites and two spawns."
						>
							{@render drawn(mirage, true)}
						</svg>
					</figure>
				{/if}
			</div>
			<div class="rm-strip-wrap">
				<ul class="rm-strip">
					{#each thumbs as t, i (i)}
						<li>
							<button
								class="rm-thumb"
								type="button"
								aria-label={`Map ${i + 1} of ${count}`}
								aria-current={i === index ? "true" : undefined}
								onclick={() => pick(i)}
							>
								<svg viewBox="0 0 28 28" aria-hidden="true">
									{@render drawn(t, false)}
								</svg>
							</button>
						</li>
					{/each}
				</ul>
			</div>
			<div class="rm-note">
				<p>{blurb}</p>
				<p>{likenessLine(data, gen)} {realLikenessLine(data)}</p>
			</div>
		</div>
	{:else}
		{@render children?.()}
		{#if failed}
			<p class="rm-fail">
				Interactive version failed to load.
				<button class="rm-btn" type="button" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{/if}
	<p class="rm-live" aria-live="polite">{live}</p>
</div>
