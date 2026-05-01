<script lang="ts">
	/**
	 * Ephemeral click counter on `/`. Increments localStorage
	 * `utofme:slash-clicks`. Badge fades 1.2 s after each click.
	 *
	 * Why: pure easter-egg delight; localStorage key ensures the count
	 * persists across reloads so repeat visitors see their tally.
	 * Synchronous init avoids a flash of "0" on reload when a prior count
	 * is already in storage.
	 *
	 * @see packages/specs/specs/07-atmosphere.md § T4
	 * @see packages/specs/adrs/0039-easter-eggs-in-house.md
	 */

	// Synchronous initialization — avoids $effect timing concerns in tests.
	// typeof check guards SSR (Astro renders the component server-side first).
	const initial =
		typeof localStorage !== "undefined"
			? Number(localStorage.getItem("utofme:slash-clicks") ?? 0)
			: 0;

	let n = $state(initial);
	let visible = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function bump() {
		n += 1;
		localStorage.setItem("utofme:slash-clicks", String(n));
		visible = true;
		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			visible = false;
		}, 1200);
	}
</script>

<button class="click-zone" onclick={bump} aria-label="Click counter">
	<span class:visible aria-live="polite">{n}</span>
</button>

<style>
	.click-zone {
		position: relative;
		padding: 1rem;
		border: 0;
		background: transparent;
		cursor: pointer;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		font-size: var(--font-size-1);
	}

	span {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 200ms;
		pointer-events: none;
		color: var(--color-accent);
		font-size: var(--font-size-4);
		font-weight: 600;
	}

	span.visible {
		opacity: 1;
	}
</style>
