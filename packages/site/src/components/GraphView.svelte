<!--
  GraphView.svelte — force-directed canvas graph for /garden/graph/.

  Why: Obsidian-feel graph view of every published note. Nodes = notes,
  edges = wikilinks. Built on `force-graph` (vasturiano) — vanilla canvas +
  d3-force-3d under the hood (no React, no Three.js). The library chunk is
  dynamic-imported in `onMount` so the cost only lands on visitors who scroll
  the island into view (`client:visible`); combined with the
  `manualChunks` rule in astro.config.mjs that isolates force-graph +
  d3-force-3d into `dist/_astro/graph-vendor-*.js`, the bundle stays out of
  the global 420 KB site-js cap and inside the route's 180 KB ceiling.

  Design contract (Phase 5 Task 11):
    - JSON graph data is read from a server-rendered
      `<script type="application/json" id="garden-graph">` block (no fetch).
    - `prefers-reduced-motion`: cap simulation at 1 cooldown tick and
      immediately `pauseAnimation()` so layout freezes after one pass.
    - Tag-bucket colouring via a small deterministic hash (no extra dep).
    - Click → `window.location.assign("/garden/<slug>/")`.
    - Use the same Svelte 5 runes pattern as LinkPreview.svelte:
      `bind:this` writes into a `$state`-backed variable.

  Verified API surface (force-graph@1.51.4 — see packages/site/package.json:36):
    - default export: ForceGraph (constructor takes one HTMLElement)
    - chainable: graphData, nodeId, nodeLabel, nodeColor, linkSource,
      linkTarget, cooldownTicks, onNodeClick, pauseAnimation
    - confirmed against node_modules/force-graph/dist/force-graph.d.ts
      lines 49-55, 65-69, 129-130, 163-164, 171.

  @see packages/specs/specs/05-garden.md § Graph view
  @see packages/specs/plans/05-garden.md § Task 11
  @see https://github.com/vasturiano/force-graph
  @see https://svelte.dev/docs/svelte/bind#bind:this
  @see https://svelte.dev/docs/svelte/$state
-->
<script lang="ts">
	import { onMount } from "svelte";

	/**
	 * Shape of one node in `src/data/graph.json`.
	 * Why: typed locally because the JSON is inlined as a
	 * `<script type="application/json">` block and read at runtime via
	 * `JSON.parse` — there is no static import path.
	 * Mirrors the writer in scripts/build-garden-data.ts.
	 */
	interface Node {
		id: string;
		label: string;
		tags: string[];
	}

	/**
	 * Shape of one edge in `src/data/graph.json`.
	 * Why: same rationale as {@link Node} — runtime JSON parse only.
	 * `source`/`target` are slug strings matching `Node.id`.
	 */
	interface Edge {
		source: string;
		target: string;
	}

	/**
	 * Combined graph payload. force-graph's own data input requires `links`
	 * (not `edges`) per its README; we transform at construction time.
	 * Why: keeps our on-disk schema decoupled from the third-party shape
	 * (spec § Architecture line 60).
	 */
	interface Graph {
		nodes: Node[];
		edges: Edge[];
	}

	// Element ref captured via Svelte 5 `bind:this` writing into a $state-backed
	// variable. Same pattern as LinkPreview.svelte:50.
	// @see https://svelte.dev/docs/svelte/bind#bind:this
	let container: HTMLDivElement | undefined = $state();

	/**
	 * Eight muted hues used as tag-bucket colours.
	 * Why: small fixed palette + deterministic hash gives stable colours
	 * across builds and is cheap (no community-detection dep — the
	 * spec § Non-goals line 39 explicitly defers louvain).
	 */
	const PALETTE = ["#7a9", "#a87", "#79a", "#a97", "#9a7", "#897", "#79b", "#aa7"];

	/**
	 * Hash a tag string to a palette index.
	 * Why: djb2-style multiplicative hash; deterministic and avoids any
	 * runtime randomness so re-renders pick the same colour for the same tag.
	 * @param tag - first frontmatter tag of a note, or undefined for orphans
	 */
	function tagColour(tag: string | undefined): string {
		if (!tag) return "#888";
		let h = 0;
		for (const c of tag) h = (h * 31 + c.charCodeAt(0)) | 0;
		return PALETTE[Math.abs(h) % PALETTE.length] ?? "#888";
	}

	onMount(() => {
		void (async () => {
			if (!container) return;
			const node = document.getElementById("garden-graph");
			const raw = node?.textContent ?? '{"nodes":[],"edges":[]}';
			let graph: Graph;
			try {
				graph = JSON.parse(raw) as Graph;
			} catch {
				graph = { nodes: [], edges: [] };
			}
			// Dynamic import keeps the force-graph + d3-force-3d bundle in
			// the lazily-loaded graph-vendor chunk. astro.config.mjs:114-119
			// declares the manualChunks rule that names that chunk.
			const { default: ForceGraph } = await import("force-graph");
			const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			const fg = new ForceGraph<Node, Edge>(container)
				.graphData({ nodes: graph.nodes, links: graph.edges })
				.nodeId("id")
				.nodeLabel((n: Node) => n.label)
				.nodeColor((n: Node) => tagColour(n.tags[0]))
				.linkSource("source")
				.linkTarget("target")
				.cooldownTicks(reduced ? 1 : 120)
				.onNodeClick((n: Node) => {
					window.location.assign(`/garden/${n.id}/`);
				});
			if (reduced) fg.pauseAnimation();
		})();
	});
</script>

<div
	bind:this={container}
	class="graph"
	role="img"
	aria-label="Graph view of garden notes; full list available below"
></div>

<style>
	.graph {
		width: 100%;
		height: 60vh;
		min-height: 400px;
		background: var(--color-surface);
		border-radius: 6px;
	}
</style>
