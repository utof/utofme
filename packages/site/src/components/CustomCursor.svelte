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
	/** True after the first pointer move; until then the ring would sit at (0,0). The SSR markup stays invisible (never hydrates on coarse pointers). */
	let ready = $state(false);

	$effect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (mq.matches) return; // no rAF scheduled at all

		const onMove = (e: PointerEvent) => {
			target.x = e.clientX;
			target.y = e.clientY;
			if (!ready) {
				pos.x = target.x;
				pos.y = target.y;
				ready = true;
			}
			wake();
		};
		window.addEventListener("pointermove", onMove, { passive: true });

		// Why: time-based lerp (≈60 ms time constant) so the trail is the same at 30, 60
		// and 120 Hz, and the loop sleeps once the ring has caught up (M3-16).
		let last = 0;
		const tick = (now: number) => {
			const dt = last ? Math.min(now - last, 100) : 16;
			last = now;
			const k = 1 - Math.exp(-dt / 60);
			// Why: mutate the $state proxies in place — no per-frame object allocation (#92).
			pos.x += (target.x - pos.x) * k;
			pos.y += (target.y - pos.y) * k;
			if (Math.hypot(target.x - pos.x, target.y - pos.y) < 0.1) {
				pos.x = target.x;
				pos.y = target.y;
				raf = undefined;
				last = 0;
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		const wake = () => {
			if (raf === undefined) raf = requestAnimationFrame(tick);
		};

		return () => {
			window.removeEventListener("pointermove", onMove);
			if (raf !== undefined) cancelAnimationFrame(raf);
		};
	});
</script>

<div
	data-cursor
	data-ready={ready ? "" : undefined}
	style:transform="translate3d({pos.x}px, {pos.y}px, 0)"
	aria-hidden="true"
></div>

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
		/* Why: SSR markup exists on touch devices where the island never hydrates (client:media). */
		display: none;
	}
	[data-cursor][data-ready] {
		display: block;
	}
</style>
