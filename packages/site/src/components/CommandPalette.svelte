<!--
  CommandPalette — Svelte 5 (runes) ⌘K command palette island.

  Why: self-contained keyboard-driven command palette; mounted on / in Task 9
  and moved into _BaseLayout.astro in Task 10. Uses bindGlobalChord for the
  Mod+K toggle so the shortcut works on both Mac (⌘K) and others (Ctrl+K).

  Focus trap: rolls its own Tab/Shift+Tab trap (no library) by computing the
  next/prev focusable child within the dialog and calling .focus() on it.

  Readiness flag: sets document.documentElement.dataset.paletteReady = "true"
  on mount — survives ClientRouter <body> swaps because <html> attrs persist.

  @see packages/specs/plans/02-interactivity.md § Task 9
-->
<script lang="ts">
	import { navigate } from "astro:transitions/client";
	import { onMount } from "svelte";
	import { bindGlobalChord } from "../lib/keymap";
	import { isMotionPaused } from "../lib/motion";
	import { type PaletteLink, matchesLabel } from "../lib/palette";

	/** Build-time work / note / lab destinations (see PaletteMount.astro). */
	let { links = [] }: { links?: PaletteLink[] } = $props();

	// ---------------------------------------------------------------------------
	// Types
	// ---------------------------------------------------------------------------

	/**
	 * A command palette action entry.
	 *
	 * Why: separating navigate vs action lets the palette decide whether
	 * Enter triggers a same-tab navigation or calls a custom run function,
	 * and whether Mod+Enter opens a new tab.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 9
	 */
	interface Action {
		id: string;
		label: string;
		kind: "navigate" | "action";
		target?: string;
		run?: () => void;
	}

	// ---------------------------------------------------------------------------
	// Phase 2 stub action set
	// ---------------------------------------------------------------------------

	/** Focusable selector used by the focus-trap and keyboard navigation. */
	const FOCUSABLE = 'a, button, input, [tabindex]:not([tabindex="-1"])';

	/** Phase 2 stub — navigate actions + copy-URL. Theme toggle deferred to Phase 6. */
	const allActions: Action[] = [
		{ id: "goto-home", label: "Go to home", kind: "navigate", target: "/" },
		{ id: "goto-search", label: "Go to search", kind: "navigate", target: "/search/" },
		{ id: "goto-now", label: "Go to /now/", kind: "navigate", target: "/now/" },
		{ id: "goto-uses", label: "Go to /uses/", kind: "navigate", target: "/uses/" },
		{ id: "goto-colophon", label: "Go to /colophon/", kind: "navigate", target: "/colophon/" },
		{ id: "goto-tops", label: "Go to /tops/", kind: "navigate", target: "/tops/" },
		{ id: "goto-stats", label: "Go to /stats/", kind: "navigate", target: "/stats/" },
		{
			id: "copy-url",
			label: "Copy current URL",
			kind: "action",
			run: () => {
				void navigator.clipboard.writeText(location.href);
			},
		},
	];

	// ---------------------------------------------------------------------------
	// State (Svelte 5 runes)
	// ---------------------------------------------------------------------------

	let open = $state(false);
	/** Rendered flag: stays true for the exit fade after `open` turns false (M3-13). */
	let shown = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	/** Exit duration in ms; must match `--palette-out` in the style block. */
	const EXIT_MS = 120;
	let query = $state("");
	let selectedIndex = $state(0);

	/** Dialog DOM reference for focus-trap computation. */
	let dialogEl = $state<HTMLElement | null>(null);

	/**
	 * Fuzzy-filtered subset of allActions.
	 *
	 * Why: substring + initials match in ~15 LOC — no fuse.js dep.
	 * Scoring: exact substring scores 2; initials match scores 1.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 9
	 */
	const everything = $derived<Action[]>([
		...allActions,
		...links.map((l): Action => ({ id: l.id, label: l.label, kind: "navigate", target: l.target })),
	]);
	const filtered = $derived.by(() => {
		// Empty query: only the short command list, not every project.
		if (!query.trim()) return allActions;
		return everything.filter((a) => matchesLabel(a.label, query));
	});

	// Reset selection whenever the filtered list changes
	$effect(() => {
		void filtered;
		selectedIndex = 0;
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/**
	 * Open the palette and focus the search input.
	 *
	 * Why: splitting open-logic into a named function makes the ⌘K handler and
	 * any future programmatic-open path share one implementation.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 9
	 */
	function openPalette(): void {
		clearTimeout(closeTimer);
		shown = true;
		open = true;
		query = "";
		selectedIndex = 0;
	}

	/**
	 * Close the palette and reset query state.
	 *
	 * Why: centralised close keeps open/query/selectedIndex in sync and ensures
	 * the live region announcement is cleared.
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 9
	 */
	function closePalette(): void {
		open = false;
		query = "";
		clearTimeout(closeTimer);
		const instant =
			isMotionPaused() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (instant) shown = false;
		else closeTimer = setTimeout(() => (shown = false), EXIT_MS);
	}

	/**
	 * Activate the action at the current selectedIndex.
	 * When `newTab` is true, opens navigate targets in a new tab.
	 *
	 * Why: Mod+Enter → new tab, plain Enter → same-tab navigate (or run).
	 *
	 * @see packages/specs/plans/02-interactivity.md § Task 9
	 */
	function activate(newTab = false): void {
		const action = filtered[selectedIndex];
		if (!action) return;
		closePalette();
		if (action.kind === "navigate" && action.target) {
			if (newTab) {
				window.open(action.target, "_blank");
			} else {
				void navigate(action.target);
			}
		} else if (action.kind === "action" && action.run) {
			action.run();
		}
	}

	/**
	 * Focus-trap keydown handler: Tab / Shift+Tab cycle through focusable
	 * children of the dialog; other keys are handled separately.
	 *
	 * Why: rolling our own trap avoids a new dep and is ~20 LOC — well within
	 * the spec budget. Focusable selector mirrors the WAI-ARIA dialog pattern.
	 *
	 * @see https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
	 * @see packages/specs/plans/02-interactivity.md § Task 9
	 */
	function handleKeydown(e: KeyboardEvent): void {
		if (!open) return;

		if (e.key === "Escape") {
			e.preventDefault();
			closePalette();
			return;
		}

		if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % Math.max(1, filtered.length);
			return;
		}

		if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedIndex =
				(selectedIndex - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length);
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
			const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
			activate(modKey);
			return;
		}

		if (e.key === "Tab") {
			if (!dialogEl) return;
			const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(el) => !el.hasAttribute("disabled") && el.getAttribute("tabindex") !== "-1",
			);
			if (focusable.length === 0) return;
			e.preventDefault();
			const current = document.activeElement as HTMLElement | null;
			const idx = current ? focusable.indexOf(current) : -1;
			if (e.shiftKey) {
				const prev = focusable[(idx - 1 + focusable.length) % focusable.length];
				prev?.focus();
			} else {
				const next = focusable[(idx + 1) % focusable.length];
				next?.focus();
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------------

	onMount(() => {
		// Canonical readiness primitive — survives ClientRouter <body> swaps.
		// Why: dataset on <html> persists across Astro ClientRouter navigations
		// (Task 12) because <html> is not replaced during body swaps.
		// @see packages/specs/plans/02-interactivity.md § Task 9
		document.documentElement.dataset["paletteReady"] = "true";

		const teardown = bindGlobalChord("Mod+K", () => {
			if (open) {
				closePalette();
			} else {
				openPalette();
			}
		});

		document.addEventListener("keydown", handleKeydown);

		return () => {
			clearTimeout(closeTimer);
			teardown();
			document.removeEventListener("keydown", handleKeydown);
		};
	});

	// Auto-focus search input when palette opens
	$effect(() => {
		if (open && dialogEl) {
			const input = dialogEl.querySelector<HTMLInputElement>("input");
			// Use setTimeout to let the DOM settle after Svelte's reactive update
			setTimeout(() => input?.focus(), 0);
		}
	});
</script>

<!--
  Why: aria-live="polite" announces "Command menu open" to screen readers when
  the palette opens. Separate from the dialog to avoid interfering with dialog
  focus management.
-->
<div aria-live="polite" aria-atomic="true" class="sr-only">
	{#if open}Command menu open{/if}
</div>

{#if shown}
	<!--
	  Why: backdrop div covers the viewport and triggers close on click,
	  providing the "outside click closes" behaviour (test 6).
	  data-palette-backdrop is the selector Playwright uses in test 6.
	-->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div data-palette-backdrop class:closing={!open} onclick={closePalette}></div>

	<div
		bind:this={dialogEl}
		data-palette
		class:closing={!open}
		role="dialog"
		aria-modal="true"
		aria-labelledby="palette-title"
	>
		<!-- Visually-hidden title for aria-labelledby -->
		<span id="palette-title" class="sr-only">Command menu</span>

		<input
			type="text"
			data-palette-input
			placeholder="Type a command or project…"
			bind:value={query}
			autocomplete="off"
			spellcheck={false}
			aria-label="Search commands"
			aria-autocomplete="list"
			aria-controls="palette-listbox"
			aria-activedescendant={filtered[selectedIndex]
				? `palette-item-${filtered[selectedIndex].id}`
				: undefined}
		/>

		<ul id="palette-listbox" role="listbox" aria-label="Commands">
			{#each filtered as action, i (action.id)}
				<li
					id="palette-item-{action.id}"
					data-palette-item
					role="option"
					aria-selected={i === selectedIndex}
					tabindex="-1"
					onmouseenter={() => {
						selectedIndex = i;
					}}
					onclick={() => {
						selectedIndex = i;
						activate();
					}}
				>
					{action.label}
				</li>
			{:else}
				<li class="palette-empty" aria-disabled="true">No commands match</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	[data-palette-backdrop] {
		position: fixed;
		inset: 0;
		/* v21: the page dims to 60 % behind a 4 px blur (the only blur in the system). */
		background: rgb(255 255 255 / 0.4);
		backdrop-filter: blur(4px);
		z-index: 200;
		/* Why: the dim + blur fade in with the panel instead of popping (M3-13). */
		animation: palette-fade-in var(--motion-base, 220ms) var(--ease-out, ease) both;
	}

	[data-palette-backdrop].closing,
	[data-palette].closing {
		pointer-events: none;
	}

	[data-palette-backdrop].closing {
		animation: palette-fade-out 120ms ease-in forwards;
	}

	[data-palette].closing {
		animation: palette-out 120ms ease-in forwards;
	}

	@keyframes palette-fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes palette-fade-out {
		to {
			opacity: 0;
		}
	}

	@keyframes palette-out {
		to {
			opacity: 0;
			scale: 0.98;
		}
	}

	[data-palette] {
		position: fixed;
		top: 20%;
		left: 50%;
		translate: -50% 0;
		width: min(520px, calc(100vw - var(--space-6, 24px) * 2));
		background: var(--color-bg);
		/* v21: one of the three elevated surfaces — 10 px radius, --shadow-lg. */
		border: 0;
		border-radius: var(--radius-lg, 10px);
		box-shadow: var(--shadow-lg);
		z-index: 201;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		/* Why: enter animation for sighted users; reduced-motion zeroes it below. */
		/* v21's single playful moment: 220 ms, scale 0.96 -> 1. */
		animation: palette-in var(--motion-base, 220ms) var(--ease-out, ease) forwards;
	}

	@keyframes palette-in {
		from {
			opacity: 0;
			scale: 0.96;
		}
		to {
			opacity: 1;
			scale: 1;
		}
	}

	/* Why: honour prefers-reduced-motion — zero animation per spec test 8. */
	@media (prefers-reduced-motion: reduce) {
		[data-palette],
		[data-palette-backdrop] {
			animation: none !important;
			transition: none;
		}
	}

	:global(html[data-motion="paused"]) [data-palette],
	:global(html[data-motion="paused"]) [data-palette-backdrop] {
		animation: none !important;
	}

	[data-palette] input {
		border: none;
		border-bottom: 1px solid var(--color-border);
		padding: 10px 14px;
		font: inherit;
		font-size: 15px;
		background: transparent;
		outline: none;
		box-shadow: none;
		color: inherit;
	}

	[data-palette] input::placeholder {
		color: var(--color-text-faint);
	}

	[data-palette] ul {
		list-style: none;
		margin: 0;
		padding: 6px;
		max-height: 320px;
		overflow-y: auto;
	}

	[data-palette-item] {
		padding: 8px 12px;
		border-radius: var(--radius-sm, 4px);
		font-size: var(--font-size-2, 0.875rem);
		cursor: pointer;
		display: block;
	}

	[data-palette-item][aria-selected="true"] {
		background: var(--color-surface-hover);
	}

	.palette-empty {
		padding: 8px 12px;
		font-size: var(--font-size-2, 0.875rem);
		color: var(--color-text-muted);
	}
</style>
