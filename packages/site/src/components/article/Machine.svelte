<script lang="ts">
	/**
	 * Machine.svelte: the interactive island of figure F6 (the machine, as boxes you can poke).
	 *
	 * The architecture diagram with the training loop (stage 4) highlighted. Hovering or focusing a
	 * box shows its blurb with "Receives: …" and "Sends: …"; an arrow shows its flow sentence;
	 * Next and Previous step through the nine stages of one training block (no autoplay). Arrow keys
	 * move between connected boxes, Enter pins a readout, Escape releases it. The SSR keyframe (the
	 * `children` snippet) shows until the data is ready and stays if it fails to load.
	 *
	 * Why: the figure's claim (one block, end to end) is already the default view; interaction only
	 * asks "what is this?" and "what happens next?". Nothing animates beyond a short opacity fade,
	 * which `motionState()` switches off, and every resource is registered with `registerLive` and
	 * released on unmount (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet, tick } from "svelte";
	import type { ArchitectureData } from "../../lib/article-data/architecture";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { registerLive } from "../../lib/figure-live";
	import { motionState } from "../../lib/figure-motion.svelte";
	import {
		arrowGeom,
		DEFAULT_STAGE,
		edgeId,
		edgeName,
		groupBoxes,
		layoutFor,
		neighbourInDirection,
		readingOrder,
		readout,
		type Selection,
		STAGES,
		stageIndex,
		summary,
		wrapLabel,
	} from "../../lib/figures/machine";

	interface Props {
		/** Hashed URL of the `architecture` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, children }: Props = $props();

	let data: ArchitectureData | null = $state(null);
	let failed = $state(false);
	let stage = $state(DEFAULT_STAGE);
	let hover: Selection | null = $state(null);
	let focused: Selection | null = $state(null);
	let pinned: Selection | null = $state(null);
	let narrow = $state(false);
	let calm = $state(false);
	let live = $state("");

	const layout = $derived(data ? layoutFor(data, narrow ? "narrow" : "wide") : null);
	const sel = $derived(hover ?? focused ?? pinned);
	const out = $derived(data ? readout(data, sel, stage) : null);
	const onNodes = $derived(new Set(STAGES[stage]?.nodes));
	const onEdges = $derived(new Set(STAGES[stage]?.edges));
	const order = $derived(data ? readingOrder(data) : []);
	const reverse = $derived(new Set(data ? data.edges.map((e) => `${e.to}>${e.from}`) : []));
	const arrows = $derived(
		data && layout
			? data.edges.map((e) => ({
					e,
					id: edgeId(e),
					g: arrowGeom(layout, e, reverse.has(edgeId(e))),
				}))
			: [],
	);
	const groups = $derived(data && layout && !narrow ? groupBoxes(data, layout) : []);
	const nodeEls: Record<string, SVGGElement | undefined> = $state({});

	const isSel = (kind: Selection["kind"], id: string): boolean =>
		sel?.kind === kind && sel.id === id;

	function announce(): void {
		if (!data) return;
		const r = readout(data, sel, stage);
		live = [r.title, r.text, r.receives, r.sends].filter(Boolean).join(". ");
	}

	function go(delta: number): void {
		stage = stageIndex(stage + delta);
		hover = null;
		focused = null;
		pinned = null;
		announce();
	}

	function onFocus(s: Selection): void {
		focused = s;
		announce();
	}
	function onBlur(s: Selection): void {
		if (focused?.kind === s.kind && focused.id === s.id) focused = null;
	}
	function toggle(s: Selection): void {
		pinned = pinned?.kind === s.kind && pinned.id === s.id ? null : s;
	}

	async function focusNode(id: string): Promise<void> {
		await tick();
		nodeEls[id]?.focus();
	}

	function onNodeKey(e: KeyboardEvent, id: string): void {
		if (!data || !layout) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggle({ kind: "node", id });
		} else if (e.key === "Escape") {
			pinned = null;
		} else {
			const next = neighbourInDirection(data, layout, id, e.key);
			if (next) {
				e.preventDefault();
				void focusNode(next);
			}
		}
	}

	function onEdgeKey(e: KeyboardEvent, from: string, to: string, id: string): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggle({ kind: "edge", id });
		} else if (e.key === "Escape") {
			pinned = null;
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			void focusNode(from);
		} else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			void focusNode(to);
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
			const loaded = await loadFigureData<ArchitectureData>(src, shape, { signal: mine.signal });
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
		const motion = motionState();
		const stopMotion = $effect.root(() => {
			$effect(() => {
				calm = motion.paused;
			});
		});
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
			stopMotion();
			motion.dispose();
		};
	});
</script>

<div class="fig-box" class:calm>
	{#if !data || !layout || !out}
		{@render children?.()}
		{#if failed}
			<p class="mc-fail">
				Interactive version failed to load.
				<button type="button" class="mc-retry mc-btn" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{:else}
		<div class="mc-stage">
			<svg
				class="mc-svg"
				viewBox="0 0 {layout.w} {layout.h}"
				role="group"
				aria-labelledby={labelId}
				aria-describedby="f6-desc"
			>
				{#each groups as g (g.id)}
					<g class="mc-group">
						<rect x={g.x} y={g.y} width={g.w} height={g.h} rx="10" />
						<text x={g.x + 8} y={g.y + 14}>{g.label}</text>
					</g>
				{/each}
				{#each order as id (id)}
					{@const n = data.nodes.find((x) => x.id === id)}
					{@const p = layout.pos[id]}
					{#if n && p}
						{@const lines = wrapLabel(n.label, narrow ? 19 : 21)}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<g
							class="mc-node"
							class:on={onNodes.has(id)}
							class:dim={!onNodes.has(id)}
							class:sel={isSel("node", id)}
							role="button"
							tabindex="0"
							aria-label={n.label}
							aria-pressed={pinned?.kind === "node" && pinned.id === id}
							data-node={id}
							bind:this={nodeEls[id]}
							onpointerenter={() => (hover = { kind: "node", id })}
							onpointerleave={() => (hover = null)}
							onfocus={() => onFocus({ kind: "node", id })}
							onblur={() => onBlur({ kind: "node", id })}
							onclick={() => toggle({ kind: "node", id })}
							onkeydown={(e) => onNodeKey(e, id)}
						>
							<rect
								x={p.x - layout.boxW / 2}
								y={p.y - layout.boxH / 2}
								width={layout.boxW}
								height={layout.boxH}
								rx="8"
							/>
							{#each lines as line, i (i)}
								<text x={p.x} y={p.y + (i - (lines.length - 1) / 2) * 15 + 4} text-anchor="middle">
									{line}
								</text>
							{/each}
						</g>
					{/if}
				{/each}
				{#each arrows as { e, id, g } (id)}
					{#if g}
						<g
							class="mc-edge"
							class:on={onEdges.has(id)}
							class:dim={!onEdges.has(id)}
							class:sel={isSel("edge", id)}
							role="button"
							tabindex="0"
							aria-label={edgeName(data, e)}
							aria-pressed={pinned?.kind === "edge" && pinned.id === id}
							data-edge={id}
							onpointerenter={() => (hover = { kind: "edge", id })}
							onpointerleave={() => (hover = null)}
							onfocus={() => onFocus({ kind: "edge", id })}
							onblur={() => onBlur({ kind: "edge", id })}
							onclick={() => toggle({ kind: "edge", id })}
							onkeydown={(ev) => onEdgeKey(ev, e.from, e.to, id)}
						>
							<path d={g.d} fill="none" />
							<path class="mc-hit" d={g.d} fill="none" />
							<path
								class="mc-head"
								d="M0 0L-9 -4.5L-9 4.5Z"
								transform="translate({g.tip.x.toFixed(1)} {g.tip.y.toFixed(1)}) rotate({(
									(g.angle * 180) /
									Math.PI
								).toFixed(1)})"
							/>
						</g>
					{/if}
				{/each}
			</svg>
		</div>
		<div class="mc-nav" role="group" aria-label="Follow one training block">
			<button type="button" class="mc-btn" disabled={stage === 0} onclick={() => go(-1)}>
				Previous
			</button>
			<span class="mc-count" data-stage-count>{stage + 1} / {STAGES.length}</span>
			<button
				type="button"
				class="mc-btn"
				disabled={stage === STAGES.length - 1}
				onclick={() => go(1)}
			>
				Next
			</button>
		</div>
		<div class="mc-readout" data-readout>
			<p class="mc-title">{out.title}</p>
			<p class="mc-text">{out.text}</p>
			{#if out.receives}<p class="mc-line">{out.receives}</p>{/if}
			{#if out.sends}<p class="mc-line">{out.sends}</p>{/if}
		</div>
		<p id="f6-desc" class="mc-sr">{summary(data, stage)}</p>
		<p class="mc-sr" aria-live="polite">{live}</p>
	{/if}
</div>

<style>
	.fig-box {
		position: relative;
		inline-size: 100%;
	}
</style>
