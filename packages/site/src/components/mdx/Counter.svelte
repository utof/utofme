<!--
  Counter — Svelte 5 (runes) island for MDX demos.

  Why: Phase 3 demonstrates Svelte 5 islands inside MDX. State isolation
       via $props.id() ensures multiple instances on one page don't share
       state: each island gets its own unique id from the rune.

  @see packages/specs/plans/03-content-pipeline.md § Task 9
-->
<script lang="ts">
	/**
	 * Props accepted by Counter.
	 *
	 * Why: `id` is optional — when omitted, `$props.id()` provides a unique
	 * per-instance identifier so multiple counters on the same page remain
	 * isolated. Explicit `id` overrides the generated one (fallback path).
	 *
	 * @see packages/specs/plans/03-content-pipeline.md § Task 9
	 */
	interface Props {
		id?: string;
	}

	const uid = $props.id();
	let { id = uid }: Props = $props();
	let count = $state(0);
</script>

<button type="button" data-counter-id={id} onclick={() => (count += 1)}>
	count {id}: {count}
</button>
