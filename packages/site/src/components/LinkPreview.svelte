<!--
  LinkPreview.svelte — Obsidian-style hover preview for wikilinks.

  Why: hovering or focusing an `a.wikilink[data-target-slug]` (emitted by the
  wikilinks remark+rehype pipeline, see lib/wikilinks-remark.ts) reveals a
  small floating tooltip with the target note's title + summary/firstParagraph.

  Design contract (Phase 5 Task 10):
    - Delegated listeners on document.body (mouseover/mouseout/focusin/focusout)
      so the island scales to N links without per-link wiring. Spec mandates
      delegation; do not switch to per-link listeners.
    - Reads the inlined `<script type="application/json" id="note-previews">`
      block injected by _BaseLayout.astro — no network refetch.
    - Positions the card with @floating-ui/dom's computePosition + offset(8) +
      flip() + shift({ padding: 8 }). Middleware order is the floating-ui
      recommended sequence: flip first picks the side, shift then nudges
      along that final side. (Running shift before flip wastes the shift on
      the original side and can leave the floating element overflowing on
      the flipped side.) See https://floating-ui.com/docs/tutorial.
    - Honours `prefers-reduced-motion` by disabling the opacity transition.
    - role="tooltip" + aria-hidden toggles for screen-reader semantics.

  @see packages/specs/specs/05-garden.md § Hover link previews
  @see packages/specs/plans/05-garden.md § Task 10
  @see https://floating-ui.com/docs/computePosition
  @see https://svelte.dev/docs/svelte/bind#bind:this
  @see https://svelte.dev/docs/svelte/$state
-->
<script lang="ts">
	import { onMount, tick } from "svelte";
	import { computePosition, flip, offset, shift } from "@floating-ui/dom";

	/**
	 * Shape of one entry in `src/data/note-previews.json` (Task 7 output).
	 * Matches the build-garden-data.ts writer; keep in sync if that schema changes.
	 *
	 * Why: typed locally rather than imported because the JSON file is
	 * inlined into the page as a `<script type="application/json">` block
	 * and read at runtime via `JSON.parse` — there is no static import path.
	 */
	interface Preview {
		title: string;
		summary: string;
		firstParagraph: string;
	}

	// Element ref captured via Svelte 5 `bind:this` writing into a $state-backed
	// variable. This is the official rune-mode pattern.
	// @see https://svelte.dev/docs/svelte/bind#bind:this
	let card: HTMLDivElement | undefined = $state();
	let visible = $state(false);
	let title = $state("");
	let body = $state("");
	let previews: Record<string, Preview> = $state({});
	let reduced = $state(false);

	onMount(() => {
		const node = document.getElementById("note-previews");
		if (node?.textContent) {
			try {
				previews = JSON.parse(node.textContent) as Record<string, Preview>;
			} catch {
				previews = {};
			}
		}
		reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		function targetFromEvent(e: Event): HTMLAnchorElement | null {
			const t = e.target as Element | null;
			if (!t) return null;
			const a = t.closest("a.wikilink") as HTMLAnchorElement | null;
			return a && a.dataset["targetSlug"] ? a : null;
		}

		async function show(e: Event): Promise<void> {
			const a = targetFromEvent(e);
			if (!a || !card) return;
			const slug = a.dataset["targetSlug"] ?? "";
			const p = previews[slug];
			if (!p) return;
			title = p.title;
			body = p.summary || p.firstParagraph;
			visible = true;
			// Wait for Svelte to flush the DOM change so computePosition reads
			// the post-flip dimensions. tick() is the documented Svelte 5 way
			// to await scheduler flush; a bare microtask (Promise.resolve)
			// does not guarantee ordering against Svelte's flush microtask.
			// @see https://svelte.dev/docs/svelte/lifecycle-hooks#tick
			await tick();
			if (!card) return;
			const pos = await computePosition(a, card, {
				placement: "top",
				middleware: [offset(8), flip(), shift({ padding: 8 })],
			});
			card.style.left = `${pos.x}px`;
			card.style.top = `${pos.y}px`;
		}

		function hide(): void {
			visible = false;
		}

		function onKeydown(e: KeyboardEvent): void {
			if (e.key === "Escape") hide();
		}

		document.body.addEventListener("mouseover", show);
		document.body.addEventListener("mouseout", hide);
		document.body.addEventListener("focusin", show);
		document.body.addEventListener("focusout", hide);
		document.addEventListener("keydown", onKeydown);

		return () => {
			document.body.removeEventListener("mouseover", show);
			document.body.removeEventListener("mouseout", hide);
			document.body.removeEventListener("focusin", show);
			document.body.removeEventListener("focusout", hide);
			document.removeEventListener("keydown", onKeydown);
		};
	});
</script>

<div
	bind:this={card}
	class="link-preview"
	class:visible
	class:reduced
	role="tooltip"
	aria-hidden={!visible}
>
	<strong>{title}</strong>
	<p>{body}</p>
</div>

<style>
	.link-preview {
		position: absolute;
		left: 0;
		top: 0;
		max-width: 320px;
		background: var(--color-bg);
		border: 1px solid var(--color-surface);
		border-radius: 6px;
		padding: var(--space-2) var(--space-3);
		box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
		opacity: 0;
		pointer-events: none;
		transition: opacity 120ms ease-out;
		z-index: 100;
	}
	.link-preview.visible {
		opacity: 1;
	}
	.link-preview.reduced {
		transition: none;
	}
	.link-preview p {
		margin: var(--space-1) 0 0;
		font-size: var(--font-size-2);
		color: var(--color-text-muted);
	}
</style>
