<script lang="ts">
	/**
	 * Notebook.svelte: the interactive island of figure F7 (tried / kept / parked).
	 *
	 * A horizontal timeline of every dated notebook entry, one mark per entry (shape and colour by
	 * outcome) and one row per area, with filter chips for outcome and area, a card for the open
	 * entry (`#nb-<id>` opens it, which is how the Elo figure's markers link here), the ten starred
	 * entries as the default panel, and a Parked drawer whose data is fetched only when it first
	 * opens. Under 700 px the timeline becomes a filterable list, starred first, 20 more at a time.
	 * The SSR keyframe (the `children` snippet) shows until the data is ready and stays if it fails.
	 *
	 * Why: the default view already shows the caption's claim (the counts and the shape of the
	 * work); interaction only asks "which ones failed?" and "what exactly happened there?". The only
	 * motion is a short opacity fade that `motionState()` switches off; every resource is registered
	 * with `registerLive` and released on unmount (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-11
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet, tick } from "svelte";
	import type { NotebookData } from "../../lib/article-data/notebook";
	import type { NotebookParkedData } from "../../lib/article-data/notebook_parked";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { registerLive } from "../../lib/figure-live";
	import { MARKS, markPath } from "../../lib/figure-marks";
	import { motionState } from "../../lib/figure-motion.svelte";
	import {
		areaOrder,
		buildTimeline,
		cardId,
		countByOutcome,
		type Entry,
		type Filter,
		filterEntries,
		HIGHLIGHT_IDS,
		idFromHash,
		listPage,
		metricLine,
		moveFocus,
		OUTCOME_LABEL,
		OUTCOMES,
		type Outcome,
		PAGE,
		summary,
	} from "../../lib/figures/notebook";

	interface Props {
		/** Hashed URL of the `notebook` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Hashed URL of the `notebook_parked` data file (fetched when the drawer first opens). */
		parkedSrc: string;
		/** Schema id and top-level keys of the parked file. */
		parkedShape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** Number of parked ideas, for the drawer's label before it is opened. */
		parkedCount: number;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, parkedSrc, parkedShape, labelId, parkedCount, children }: Props = $props();

	let data: NotebookData | null = $state(null);
	let failed = $state(false);
	let outcomes: ReadonlySet<Outcome> = $state(new Set());
	let areas: ReadonlySet<string> = $state(new Set());
	let openId: string | null = $state(null);
	let focusId: string | null = $state(null);
	let narrow = $state(false);
	let shown = $state(PAGE);
	let calm = $state(false);
	let live = $state("");
	let parked: NotebookParkedData | null = $state(null);
	let parkedState: "idle" | "loading" | "error" = $state("idle");

	const entries = $derived(data?.entries ?? []);
	const filter: Filter = $derived({ outcomes, areas });
	const tl = $derived(buildTimeline(entries));
	const visible = $derived(filterEntries(entries, filter));
	const visibleIds = $derived(new Set(visible.map((e) => e.id)));
	const counts = $derived(countByOutcome(entries));
	const areaList = $derived(areaOrder(entries));
	const byId = $derived(new Map(entries.map((e) => [e.id, e])));
	const starred = new Set(HIGHLIGHT_IDS);
	const star = $derived(
		HIGHLIGHT_IDS.map((id) => byId.get(id)).filter((e): e is Entry => e !== undefined),
	);
	const page = $derived(listPage(entries, filter, shown));
	const open = $derived(openId ? (byId.get(openId) ?? null) : null);
	const tabId = $derived(focusId && visibleIds.has(focusId) ? focusId : (visible[0]?.id ?? null));
	const markEls: Record<string, SVGGElement | undefined> = $state({});
	let bottomEl: HTMLElement | undefined = $state();

	const markLabel = (e: Entry): string =>
		`${e.title}. ${OUTCOME_LABEL[e.outcome]}, ${e.area}, ${e.date}.${starred.has(e.id) ? " Starred." : ""}`;

	function toggleOutcome(o: Outcome): void {
		const next = new Set(outcomes);
		if (!next.delete(o)) next.add(o);
		outcomes = next;
		shown = PAGE;
		live = `${filterEntries(entries, { outcomes: next, areas }).length} entries shown.`;
	}
	function toggleArea(a: string): void {
		const next = new Set(areas);
		if (!next.delete(a)) next.add(a);
		areas = next;
		shown = PAGE;
		live = `${filterEntries(entries, { outcomes, areas: next }).length} entries shown.`;
	}

	function openEntry(id: string, from: "mark" | "list" | "hash" = "mark"): void {
		const e = byId.get(id);
		if (!e) return;
		if (!visibleIds.has(id)) {
			outcomes = new Set();
			areas = new Set();
		}
		const idx = listPage(
			entries,
			{ outcomes: new Set(), areas: new Set() },
			10_000,
		).items.findIndex((x) => x.id === id);
		if (idx >= shown) shown = Math.ceil((idx + 1) / PAGE) * PAGE;
		openId = id;
		focusId = id;
		live = `${e.title}. ${OUTCOME_LABEL[e.outcome]}. ${metricLine(e) ?? ""} ${e.summary}`;
		if (from === "hash") {
			void tick().then(() =>
				document.getElementById(cardId(id))?.scrollIntoView({ block: "center" }),
			);
		}
	}
	function closeCard(): void {
		const id = openId;
		openId = null;
		if (id) void tick().then(() => markEls[id]?.focus());
	}

	async function focusMark(id: string): Promise<void> {
		focusId = id;
		await tick();
		const el = markEls[id];
		el?.focus();
		el?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}
	function onMarkKey(ev: KeyboardEvent, id: string): void {
		if (ev.key === "Enter" || ev.key === " ") {
			ev.preventDefault();
			openEntry(id);
		} else if (ev.key === "Escape") {
			closeCard();
		} else {
			const next = moveFocus(tl, id, ev.key, visibleIds);
			if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(ev.key)) {
				ev.preventDefault();
				if (next !== id) void focusMark(next);
			}
		}
	}

	function onHash(): void {
		const id = idFromHash(location.hash, entries);
		if (id) openEntry(id, "hash");
	}

	// --- loading ------------------------------------------------------------------------------
	let controller: AbortController | null = null;
	let parkedController: AbortController | null = null;

	async function load(): Promise<void> {
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		failed = false;
		const release = registerLive();
		try {
			const loaded = await loadFigureData<NotebookData>(src, shape, { signal: mine.signal });
			if (mine.signal.aborted) return;
			data = loaded;
			await tick();
			onHash();
		} catch (e) {
			if (e instanceof FigureDataError && e.kind === "abort") return;
			failed = true;
		} finally {
			release();
		}
	}

	async function loadParked(): Promise<void> {
		parkedController?.abort();
		const mine = new AbortController();
		parkedController = mine;
		parkedState = "loading";
		const release = registerLive();
		try {
			const loaded = await loadFigureData<NotebookParkedData>(parkedSrc, parkedShape, {
				signal: mine.signal,
			});
			if (mine.signal.aborted) return;
			parked = loaded;
			parkedState = "idle";
		} catch (e) {
			if (e instanceof FigureDataError && e.kind === "abort") return;
			parkedState = "error";
		} finally {
			release();
		}
	}
	function onDrawer(ev: Event): void {
		const t = ev.currentTarget;
		if (t instanceof HTMLDetailsElement && t.open && !parked && parkedState !== "loading")
			void loadParked();
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
		window.addEventListener("hashchange", onHash);
		const releaseHash = registerLive();
		return () => {
			controller?.abort();
			parkedController?.abort();
			mq?.removeEventListener("change", onMq);
			window.removeEventListener("hashchange", onHash);
			releaseMq?.();
			releaseHash();
			stopMotion();
			motion.dispose();
		};
	});
</script>

{#snippet card(e: Entry)}
	<article class="nb-card" id={cardId(e.id)} aria-labelledby="{cardId(e.id)}-t">
		<p class="nb-card-title" id="{cardId(e.id)}-t">
			{#if starred.has(e.id)}<span class="nb-star" aria-label="Starred">★</span>{/if}
			{e.title}
		</p>
		<p class="nb-card-meta">
			{OUTCOME_LABEL[e.outcome]} · {e.area} · {e.date} · {e.id}
		</p>
		{#if metricLine(e)}<p class="nb-card-metric">{metricLine(e)}</p>{/if}
		<p>{e.summary}</p>
		<button type="button" class="nb-btn" onclick={closeCard}>
			{narrow ? "Close" : "Back to the ten starred entries"}
		</button>
	</article>
{/snippet}

<div class="fig-box" class:calm>
	{#if !data}
		{@render children?.()}
		{#if failed}
			<p class="nb-fail">
				Interactive version failed to load.
				<button type="button" class="nb-retry nb-btn" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{:else}
		<ul class="nb-legend">
			{#each OUTCOMES as o (o)}
				<li style="--c:var({MARKS[o].token})">
					<svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true">
						<path
							d={markPath(o, 0, 0, 5)}
							fill={MARKS[o].filled ? "var(--c)" : "none"}
							stroke="var(--c)"
							stroke-width="1.6"
						/>
					</svg>
					{OUTCOME_LABEL[o]} <b>{counts[o]}</b>
				</li>
			{/each}
			<li class="nb-legend-star">
				<svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true">
					<circle r="6" fill="none" stroke="currentColor" stroke-width="1.6"></circle>
				</svg>
				starred <b>{HIGHLIGHT_IDS.length}</b>
			</li>
		</ul>
		<div class="nb-chips" role="group" aria-label="Filters">
			<p class="nb-chip-label">Outcome</p>
			{#each OUTCOMES as o (o)}
				<button
					type="button"
					class="nb-chip"
					aria-pressed={outcomes.has(o)}
					data-outcome={o}
					onclick={() => toggleOutcome(o)}>{OUTCOME_LABEL[o]}</button
				>
			{/each}
			<p class="nb-chip-label">Area</p>
			{#each areaList as a (a)}
				<button
					type="button"
					class="nb-chip"
					aria-pressed={areas.has(a)}
					data-area={a}
					onclick={() => toggleArea(a)}>{a}</button
				>
			{/each}
		</div>
		{#if !narrow}
			<div class="nb-stage">
				<svg
					class="nb-svg"
					viewBox="0 0 {tl.w} {tl.h + 26}"
					role="group"
					aria-labelledby={labelId}
					aria-describedby="f7-desc"
				>
					{#each tl.rows as r (r.area)}
						<line class="nb-rowline" x1={tl.left} x2={tl.w} y1={r.top + r.h} y2={r.top + r.h} />
						<text class="nb-rowlabel" x={tl.left - 8} y={r.top + r.h / 2 + 4} text-anchor="end">
							{r.area}
						</text>
					{/each}
					{#each tl.ticks as t (t.label)}
						<text class="nb-tick" x={t.x} y={tl.h + 16} text-anchor="middle">{t.label}</text>
					{/each}
					{#each tl.rows as r (r.area)}
						{#each r.marks as m (m.id)}
							{@const e = byId.get(m.id)}
							{#if e && visibleIds.has(m.id)}
								<g
									class="nb-mark nb-{e.outcome}"
									class:open={openId === m.id}
									style="--c:var({MARKS[e.outcome].token})"
									role="button"
									tabindex={tabId === m.id ? 0 : -1}
									aria-label={markLabel(e)}
									aria-expanded={openId === m.id}
									aria-controls={cardId(m.id)}
									data-mark={m.id}
									bind:this={markEls[m.id]}
									onclick={() => openEntry(m.id)}
									onfocus={() => (focusId = m.id)}
									onkeydown={(ev) => onMarkKey(ev, m.id)}
								>
									<circle class="nb-halo" cx={m.x} cy={m.y} r="8" />
									{#if starred.has(m.id)}<circle class="nb-ring" cx={m.x} cy={m.y} r="6.5" />{/if}
									<path
										d={markPath(e.outcome, m.x, m.y, 4)}
										fill={MARKS[e.outcome].filled ? "var(--c)" : "none"}
										stroke="var(--c)"
										stroke-width="1.5"
									/>
								</g>
							{/if}
						{/each}
					{/each}
				</svg>
			</div>
		{/if}
		<div class="nb-bottom" bind:this={bottomEl}>
			{#if narrow}
				<p class="nb-hl-title">
					{page.items.length} of {visible.length} entries, starred first
				</p>
				<ul class="nb-hl-list nb-list">
					{#each page.items as e (e.id)}
						<li>
							<button
								type="button"
								class="nb-item"
								aria-expanded={openId === e.id}
								onclick={() => (openId === e.id ? closeCard() : openEntry(e.id, "list"))}
							>
								<span class="nb-star" aria-hidden="true">{starred.has(e.id) ? "★" : "·"}</span>
								<span class="nb-hl-item">
									{e.title}
									<small>{e.date} · {OUTCOME_LABEL[e.outcome]} · {e.area}</small>
								</span>
							</button>
							{#if openId === e.id}{@render card(e)}{/if}
						</li>
					{/each}
				</ul>
				{#if page.remaining > 0}
					<button type="button" class="nb-btn" onclick={() => (shown += PAGE)}>Show 20 more</button>
				{/if}
			{:else if open}
				{@render card(open)}
			{:else}
				<p class="nb-hl-title">The ten entries that carry the story</p>
				<ol class="nb-hl-list">
					{#each star as e (e.id)}
						<li>
							<button type="button" class="nb-item" onclick={() => openEntry(e.id, "list")}>
								<span class="nb-star" aria-hidden="true">★</span>
								<span class="nb-hl-item">
									{e.title}
									<small
										>{e.date} · {OUTCOME_LABEL[e.outcome]}{metricLine(e)
											? ` · ${metricLine(e)}`
											: ""}</small
									>
								</span>
							</button>
						</li>
					{/each}
				</ol>
				<p class="nb-hl-more">
					{visible.length === entries.length
						? `${entries.length - star.length} more entries are marks on the timeline.`
						: `${visible.length} of ${entries.length} entries shown.`}
				</p>
			{/if}
		</div>
		<details class="nb-drawer" ontoggle={onDrawer}>
			<summary>Parked and ruled out: {parkedCount} ideas</summary>
			{#if parkedState === "loading"}
				<p class="nb-fail">Loading…</p>
			{:else if parkedState === "error"}
				<p class="nb-fail">
					Could not load the parked ideas.
					<button type="button" class="nb-retry nb-btn" onclick={() => void loadParked()}
						>Retry</button
					>
				</p>
			{:else if parked}
				<ul class="nb-pk">
					{#each parked.parked as p (p.id)}
						<li>
							<strong>{p.title}</strong>
							<span class="nb-card-meta">
								· {p.kind === "parked" ? "parked" : "ruled out"} · {p.area}</span
							>
							<br />{p.why}
							<br /><em>Reopen if:</em>
							{p.reopenIf}
						</li>
					{/each}
				</ul>
			{/if}
		</details>
		<p id="f7-desc" class="nb-sr">{summary(entries, visible.length)}</p>
		<p class="nb-sr" aria-live="polite">{live}</p>
	{/if}
</div>

<style>
	.fig-box {
		position: relative;
		inline-size: 100%;
	}
</style>
