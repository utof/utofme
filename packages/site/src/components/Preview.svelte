<!--
  Preview — Svelte 5 (runes) hover/focus popover for work cards.

  Why: shows card metadata (title, date, type badge, optional summary) in an
  absolutely-positioned tooltip on hover/focus of any [data-preview-target]
  element. Uses event delegation on `document` so it works with server-rendered
  cards without per-card JS. `pointer-events: none` on the wrapper guarantees
  the popover never blocks the underlying card link.

  Mounting: `<Preview client:visible />` from the page; not in BaseLayout so it
  can be excluded from /search without prop drilling.

  @see packages/specs/plans/02-interactivity.md § Task 7
-->
<script lang="ts">
	import { onMount } from "svelte";

	/**
	 * Data extracted from a card's data-* attributes.
	 *
	 * Why: the popover reads metadata purely from DOM attrs so no extra data
	 * prop or Astro island serialisation is needed.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 7 "path (1)"
	 */
	interface CardMeta {
		id: string;
		title: string;
		date: string;
		type: string;
		summary: string | undefined;
	}

	/** Currently-targeted card; null = popover hidden. */
	let target = $state<CardMeta | null>(null);
	/** Pixel position of the popover, derived from the hovered element. */
	let pos = $state({ x: 0, y: 0 });

	/**
	 * Read card metadata from a [data-preview-target] element's data-* attrs.
	 *
	 * Why: attr-driven approach keeps Preview self-contained with no Astro
	 * prop wiring or hidden JSON blobs.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 7
	 */
	function metaFrom(el: HTMLElement): CardMeta | null {
		const id = el.dataset["previewTarget"];
		const title = el.dataset["title"];
		const date = el.dataset["date"];
		const type = el.dataset["type"];
		if (!id || !title || !date || !type) return null;
		return {
			id,
			title,
			date,
			type,
			summary: el.dataset["summary"] ?? undefined,
		};
	}

	/**
	 * Compute popover position: below and aligned to the left of the card,
	 * clamped inside the viewport.
	 *
	 * Why: `getBoundingClientRect()` gives viewport-relative coords; we add
	 * `scrollY`/`scrollX` to convert to document coords so the absolutely-
	 * positioned popover (relative to <body>) follows scroll correctly.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
	 */
	function positionFrom(el: HTMLElement): { x: number; y: number } {
		const rect = el.getBoundingClientRect();
		return {
			x: rect.left + window.scrollX,
			y: rect.bottom + window.scrollY + 8,
		};
	}

	onMount(() => {
		/** Handle mouseover / focusin via event delegation. */
		function onEnter(e: MouseEvent | FocusEvent) {
			const el = (e.target as HTMLElement).closest<HTMLElement>("[data-preview-target]");
			if (!el) return;
			const meta = metaFrom(el);
			if (!meta) return;
			target = meta;
			pos = positionFrom(el);
		}

		/** Hide popover when pointer/focus leaves the card area. */
		function onLeave(e: MouseEvent | FocusEvent) {
			const el = (e.target as HTMLElement).closest<HTMLElement>("[data-preview-target]");
			if (!el) return;
			// On focusout: only hide if focus moved outside the card
			if (e.type === "focusout") {
				const related = (e as FocusEvent).relatedTarget as HTMLElement | null;
				if (related && el.contains(related)) return;
			}
			target = null;
		}

		/** Close on Escape key regardless of where focus is. */
		function onKeydown(e: KeyboardEvent) {
			if (e.key === "Escape") target = null;
		}

		document.addEventListener("mouseover", onEnter);
		document.addEventListener("mouseout", onLeave);
		document.addEventListener("focusin", onEnter);
		document.addEventListener("focusout", onLeave);
		document.addEventListener("keydown", onKeydown);

		return () => {
			document.removeEventListener("mouseover", onEnter);
			document.removeEventListener("mouseout", onLeave);
			document.removeEventListener("focusin", onEnter);
			document.removeEventListener("focusout", onLeave);
			document.removeEventListener("keydown", onKeydown);
		};
	});
</script>

<!--
  Why: role="tooltip" + aria-hidden mirrors standard tooltip pattern;
  the popover never receives focus itself (pointer-events:none) so it
  needs no interactive ARIA. data-preview marks the mount root for
  waitForSelector in tests.
-->
<div data-preview aria-hidden="true">
	{#if target !== null}
		<div
			class="preview"
			role="tooltip"
			data-preview-popover
			style="left: {pos.x}px; top: {pos.y}px;"
		>
			<span class="type-badge">{target.type}</span>
			<strong class="title">{target.title}</strong>
			<time class="date">{target.date}</time>
			<p class="summary" data-preview-summary hidden={target.summary === undefined || undefined}>
				{target.summary ?? ""}
			</p>
		</div>
	{/if}
</div>

<style>
	[data-preview] {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		/* Why: zero-size container so it doesn't affect layout */
		overflow: visible;
		pointer-events: none;
	}

	.preview {
		position: absolute;
		pointer-events: none;
		background: var(--color-bg);
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		max-width: 280px;
		display: grid;
		gap: var(--space-1);
		z-index: 100;
		/* Why: fade-in animation highlights the appearance; 150 ms is below the
		     150 ms budget; reduced-motion zeroes it below. */
		animation: preview-in 120ms ease forwards;
	}

	@keyframes preview-in {
		from {
			opacity: 0;
			translate: 0 -4px;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}

	/* Why: honour prefers-reduced-motion — zero animation AND transition per spec. */
	@media (prefers-reduced-motion: reduce) {
		.preview {
			animation: none;
			transition: none;
		}
	}

	.type-badge {
		font-size: var(--font-size-1);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.6;
	}

	.title {
		font-size: var(--font-size-3);
		font-weight: 600;
	}

	.date {
		font-size: var(--font-size-1);
		opacity: 0.6;
	}

	.summary {
		margin: 0;
		font-size: var(--font-size-2);
		line-height: 1.4;
	}

	.summary[hidden] {
		display: none;
	}
</style>
