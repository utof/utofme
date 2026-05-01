<script lang="ts">
	/**
	 * Lerped pointer-following cursor.
	 *
	 * Why: aesthetic-only enhancement; gated to fine-pointer devices via
	 * Astro's `client:media` directive at the call site. Within the
	 * component, `prefers-reduced-motion` short-circuits the rAF loop
	 * (CSS Media Queries Level 5).
	 *
	 * @see packages/specs/specs/07-atmosphere.md § T1
	 * @see packages/specs/adrs/0036-custom-cursor-island.md
	 */
	let target = $state({ x: 0, y: 0 });
	let pos = $state({ x: 0, y: 0 });
	let raf: number | undefined;

	$effect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (mq.matches) return; // no rAF scheduled at all

		const onMove = (e: PointerEvent) => {
			target = { x: e.clientX, y: e.clientY };
		};
		window.addEventListener("pointermove", onMove, { passive: true });

		const tick = () => {
			pos = { x: pos.x + (target.x - pos.x) * 0.18, y: pos.y + (target.y - pos.y) * 0.18 };
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);

		return () => {
			window.removeEventListener("pointermove", onMove);
			if (raf) cancelAnimationFrame(raf);
		};
	});
</script>

<div data-cursor style:transform="translate3d({pos.x}px, {pos.y}px, 0)" aria-hidden="true"></div>

<style>
	[data-cursor] {
		position: fixed;
		inset: 0 auto auto 0;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 1px solid var(--accent, currentColor);
		pointer-events: none;
		will-change: transform;
		z-index: 9999;
		mix-blend-mode: difference;
	}
</style>
