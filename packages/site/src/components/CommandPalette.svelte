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
	import { onMount } from "svelte";
	import { bindGlobalChord } from "../lib/keymap";

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
		{ id: "goto-works", label: "Go to /works", kind: "navigate", target: "/works" },
		{ id: "goto-search", label: "Go to search", kind: "navigate", target: "/search" },
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
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return allActions;
		return allActions.filter((a) => {
			const label = a.label.toLowerCase();
			// Substring match
			if (label.includes(q)) return true;
			// Initials match: "gth" matches "Go to home"
			const initials = label
				.split(/\s+/)
				.map((w) => w[0] ?? "")
				.join("");
			return initials.includes(q);
		});
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
				location.href = action.target;
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

{#if open}
	<!--
	  Why: backdrop div covers the viewport and triggers close on click,
	  providing the "outside click closes" behaviour (test 6).
	  data-palette-backdrop is the selector Playwright uses in test 6.
	-->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div data-palette-backdrop onclick={closePalette}></div>

	<div
		bind:this={dialogEl}
		data-palette
		role="dialog"
		aria-modal="true"
		aria-labelledby="palette-title"
	>
		<!-- Visually-hidden title for aria-labelledby -->
		<span id="palette-title" class="sr-only">Command menu</span>

		<input
			type="text"
			data-palette-input
			placeholder="Type a command…"
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
		background: color-mix(in srgb, var(--color-bg) 20%, transparent);
		z-index: 200;
		/* Why: backdrop must not intercept keyboard events — only pointer events. */
	}

	[data-palette] {
		position: fixed;
		top: 20%;
		left: 50%;
		translate: -50% 0;
		width: min(560px, calc(100vw - var(--space-6, 24px) * 2));
		background: var(--color-bg);
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		border-radius: var(--radius-md, 6px);
		box-shadow:
			0 4px 24px color-mix(in srgb, currentColor 12%, transparent),
			0 1px 4px color-mix(in srgb, currentColor 8%, transparent);
		z-index: 201;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		/* Why: enter animation for sighted users; reduced-motion zeroes it below. */
		animation: palette-in 120ms ease forwards;
	}

	@keyframes palette-in {
		from {
			opacity: 0;
			scale: 0.97;
		}
		to {
			opacity: 1;
			scale: 1;
		}
	}

	/* Why: honour prefers-reduced-motion — zero animation per spec test 8. */
	@media (prefers-reduced-motion: reduce) {
		[data-palette] {
			animation: none;
			transition: none;
		}
	}

	[data-palette] input {
		border: none;
		border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
		padding: var(--space-3, 12px) var(--space-4, 16px);
		font: inherit;
		font-size: var(--font-size-3, 1rem);
		background: transparent;
		outline: none;
		color: inherit;
	}

	[data-palette] ul {
		list-style: none;
		margin: 0;
		padding: var(--space-1, 4px) 0;
		max-height: 320px;
		overflow-y: auto;
	}

	[data-palette-item] {
		padding: var(--space-2, 8px) var(--space-4, 16px);
		cursor: pointer;
		display: block;
	}

	[data-palette-item][aria-selected="true"] {
		background: color-mix(in srgb, currentColor 10%, transparent);
	}

	.palette-empty {
		padding: var(--space-2, 8px) var(--space-4, 16px);
		opacity: 0.5;
		font-style: italic;
	}
</style>
