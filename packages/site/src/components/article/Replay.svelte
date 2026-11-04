<script lang="ts">
	/**
	 * Replay.svelte: interactive island of figure F1 (replay of a real round). Placeholder shell
	 * until the island lands; it already honours the island-root contract (`.fig-box` holding the
	 * SSR keyframe).
	 *
	 * Why: the Block needs a component to hydrate; the interactive view replaces this shell next.
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-5
	 */
	import type { Snippet } from "svelte";
	import type { Shape } from "../../lib/article-data/types";

	interface Props {
		/** Hashed URL of the `replay_mirage` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The pros' median first contact: seconds and its printed form. */
		pros: { s: number; text: string };
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { children }: Props = $props();
</script>

<div class="fig-box">{@render children?.()}</div>

<style>
	.fig-box {
		inline-size: 100%;
	}
</style>
