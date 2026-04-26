<!--
  FilterBar — Svelte 5 (runes) client island for the works-grid filter.

  Why: encapsulates URL-driven filter state so the filter chips, sort dropdown,
  and reset button read from / write to the URL via url-state helpers, keeping
  the full grid server-rendered (Phase 1 behaviour) with JS-progressive
  enhancement: the inline is:inline script on the page handles DOM toggling
  while FilterBar handles user interaction and URL writes.

  Visibility: rendered with `hidden` on the wrapping element; the `hidden`
  attribute is removed only inside onMount so the bar is invisible when JS is
  disabled (no noscript rule needed).

  @see packages/specs/plans/02-interactivity.md § Task 5
-->
<script lang="ts">
	import { onMount } from "svelte";
	import { readState, writeState, subscribe } from "../lib/url-state";
	import type { FilterState } from "../lib/url-state";

	// Why: top-level runes; `$state` initialised after mount to avoid SSR
	// access of `window`. During SSR Astro renders the component to HTML without
	// executing client-only logic; the `hidden` attribute on the wrapper prevents
	// FOUC.
	let state = $state<FilterState>({ tags: [], sort: "date" });
	let mounted = $state(false);

	/** All five work types in display order. */
	const ALL_TYPES: NonNullable<FilterState["type"]>[] = [
		"code",
		"video",
		"music",
		"math",
		"writing",
	];

	/**
	 * Tags available in the current dataset, derived from the DOM so they stay in
	 * sync with what the server rendered without an extra data prop.
	 *
	 * Why: reading from DOM data-attrs avoids threading tag lists through Astro
	 * props and keeps FilterBar self-contained.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 5
	 */
	const allTags = $derived.by(() => {
		if (!mounted) return [] as string[];
		const cards = document.querySelectorAll<HTMLElement>("[data-test='works-grid'] [data-tags]");
		const tagSet = new Set<string>();
		for (const card of cards) {
			const raw = card.dataset["tags"] ?? "";
			if (raw) {
				for (const t of raw.split(",")) {
					if (t) tagSet.add(t);
				}
			}
		}
		return [...tagSet].sort();
	});

	onMount(() => {
		state = readState();
		mounted = true;

		const unsub = subscribe((s) => {
			state = s;
		});

		return unsub;
	});

	function selectType(type: NonNullable<FilterState["type"]>): void {
		// Why: toggling — clicking the active type deselects it (omits from URL).
		const next: FilterState =
			state.type === type ? { tags: state.tags, sort: state.sort } : { ...state, type };
		state = next;
		writeState(next);
		document.dispatchEvent(new CustomEvent("works:filter", { detail: next }));
	}

	function toggleTag(tag: string): void {
		const has = state.tags.includes(tag);
		const next: FilterState = {
			...state,
			tags: has ? state.tags.filter((t) => t !== tag) : [...state.tags, tag],
		};
		state = next;
		writeState(next);
		document.dispatchEvent(new CustomEvent("works:filter", { detail: next }));
	}

	function setSort(sort: FilterState["sort"]): void {
		const next: FilterState = { ...state, sort };
		state = next;
		writeState(next);
		document.dispatchEvent(new CustomEvent("works:filter", { detail: next }));
	}

	function reset(): void {
		const next: FilterState = { tags: [], sort: "date" };
		state = next;
		// Why: writeState merges with URL state so calling it with no `type` key
		// would preserve the current type. Instead, clear the URL entirely via
		// replaceState and dispatch the synthetic event that `subscribe` listens to.
		// This matches writeState's internal behaviour for the "all defaults" case.
		history.replaceState(null, "", location.pathname);
		window.dispatchEvent(new CustomEvent("urlstate:change"));
		document.dispatchEvent(new CustomEvent("works:filter", { detail: next }));
	}
</script>

<!--
  Why: `hidden` is removed by onMount (Svelte lifecycle runs after DOM is ready
  on the client). On the server the attribute stays, hiding the bar when JS is
  off without requiring a <noscript> style rule.
-->
<div data-filter-bar role="toolbar" aria-label="filter" hidden={!mounted || undefined}>
	<div class="type-chips" role="group" aria-label="Filter by type">
		{#each ALL_TYPES as type}
			<button
				type="button"
				data-type={type}
				aria-pressed={state.type === type}
				onclick={() => selectType(type)}
			>
				{type}
			</button>
		{/each}
	</div>

	{#if allTags.length > 0}
		<div class="tag-chips" role="group" aria-label="Filter by tag">
			{#each allTags as tag}
				<button
					type="button"
					data-tag={tag}
					aria-pressed={state.tags.includes(tag)}
					onclick={() => toggleTag(tag)}
				>
					{tag}
				</button>
			{/each}
		</div>
	{/if}

	<div class="sort-row">
		<label for="works-sort">Sort</label>
		<select
			id="works-sort"
			value={state.sort}
			onchange={(e) => setSort((e.currentTarget as HTMLSelectElement).value as FilterState["sort"])}
		>
			<option value="date">Date</option>
			<option value="title">Title</option>
		</select>
	</div>

	<button type="button" data-reset onclick={reset}> Reset </button>
</div>

<style>
	[data-filter-bar] {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		padding-block: var(--space-3);
	}

	[data-filter-bar][hidden] {
		display: none;
	}

	.type-chips,
	.tag-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.sort-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	button {
		padding: var(--space-1) var(--space-2);
		border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
		border-radius: var(--radius-md, 4px);
		background: transparent;
		cursor: pointer;
		font: inherit;
	}

	button[aria-pressed="true"] {
		background: color-mix(in srgb, currentColor 15%, transparent);
	}
</style>
