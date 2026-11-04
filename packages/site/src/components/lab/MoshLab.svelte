<script lang="ts">
	/**
	 * Controls + readouts for the `/lab/datamosh/` playground.
	 *
	 * One control per `MOSH_PARAMS` row, grouped. Changing a control mutates the live
	 * config the hover shell reads every frame and mirrors the non-default values
	 * into `m-*` URL params (`history.replaceState`). An "Effect" select mounts the
	 * mosh, the existing dither (timing calibration) or nothing; only one is ever
	 * mounted. Readouts refresh ~4x/s and are `aria-live="off"`.
	 *
	 * Why: the design report's open question is taste and the owner's real frame
	 * cost, so the page must make both easy to see; see ADR 0041. Mounted
	 * `client:only` because the initial values come from `location`.
	 *
	 * @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
	 * @see packages/site/src/lib/datamosh/config.ts
	 */
	import { onMount } from "svelte";
	import { mountCardMosh, type MoshFrameStats } from "../../lib/datamosh/card-mosh";
	import {
		DEFAULT_MOSH_CONFIG,
		decodeMoshConfig,
		encodeMoshConfig,
		MOSH_PARAMS,
		type MoshConfig,
		type MoshGroup,
		type MoshParam,
		setMoshParam,
	} from "../../lib/datamosh/config";
	import { mountCardDither } from "../../lib/dither/card-dither";

	type Effect = "mosh" | "dither" | "off";
	const EFFECTS: readonly Effect[] = ["mosh", "dither", "off"];
	const WINDOW = 120;
	const GRID = '[data-test="mosh-lab-grid"]';

	const config = $state<MoshConfig>(decodeMoshConfig(window.location.search));
	const initialEffect = EFFECTS.find(
		(candidate) => candidate === new URLSearchParams(window.location.search).get("fx"),
	);
	let effect = $state<Effect>(initialEffect ?? "mosh");
	let status = $state("");

	const groups: { name: MoshGroup; params: MoshParam[] }[] = [];
	for (const param of MOSH_PARAMS) {
		const group = groups.find((candidate) => candidate.name === param.group);
		if (group) group.params.push(param);
		else groups.push({ name: param.group, params: [param] });
	}

	/** Non-reactive frame collector; `readout` below is the ~4 Hz snapshot of it. */
	const ring = new Float32Array(WINDOW);
	let ringCount = 0;
	let ringPos = 0;
	let latest = { activeBlocks: 0, width: 0, height: 0, gif: "none" };

	function record(ms: number): void {
		ring[ringPos] = ms;
		ringPos = (ringPos + 1) % WINDOW;
		ringCount = Math.min(WINDOW, ringCount + 1);
	}

	function onMoshFrame(stats: MoshFrameStats): void {
		record(stats.kernelMs);
		latest = {
			activeBlocks: stats.activeBlocks,
			width: stats.width,
			height: stats.height,
			gif: stats.gif ?? "none",
		};
	}

	function resetRing(): void {
		ringCount = 0;
		ringPos = 0;
		latest = { activeBlocks: 0, width: 0, height: 0, gif: "none" };
	}

	let readout = $state({
		effect: "mosh",
		backend: "2d",
		size: "-",
		blocks: "-",
		p50: "-",
		p95: "-",
		frames: 0,
		gif: "-",
	});

	function percentile(sorted: Float32Array, q: number): number {
		return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;
	}

	function refreshReadout(): void {
		let backend = "-";
		if (effect === "mosh") backend = "2d";
		else if (effect === "dither") {
			backend =
				document.querySelector<HTMLElement>("canvas[data-dither-backend]")?.dataset[
					"ditherBackend"
				] ?? "(hover a card)";
		}
		const sorted = ring.slice(0, ringCount).sort();
		readout = {
			effect,
			backend,
			size: effect === "mosh" && latest.width ? `${latest.width} x ${latest.height}` : "-",
			blocks: effect === "mosh" && ringCount ? String(latest.activeBlocks) : "-",
			p50: ringCount ? `${percentile(sorted, 0.5).toFixed(2)} ms` : "-",
			p95: ringCount ? `${percentile(sorted, 0.95).toFixed(2)} ms` : "-",
			frames: ringCount,
			gif: effect === "mosh" ? latest.gif : "-",
		};
	}

	let capabilities = $state({
		imageDecoder: "checking",
		gifType: "checking",
		videoDecoder: "checking",
		vp8: "checking",
		cores: "-",
	});

	async function probeCapabilities(): Promise<void> {
		const hasDecoder = typeof ImageDecoder !== "undefined";
		const hasVideo = typeof VideoDecoder !== "undefined";
		let gifType = "n/a";
		let vp8 = "n/a";
		try {
			if (hasDecoder) gifType = String(await ImageDecoder.isTypeSupported("image/gif"));
		} catch (error) {
			gifType = `error: ${error instanceof Error ? error.message : String(error)}`;
		}
		try {
			if (hasVideo)
				vp8 = String((await VideoDecoder.isConfigSupported({ codec: "vp8" })).supported);
		} catch (error) {
			vp8 = `error: ${error instanceof Error ? error.message : String(error)}`;
		}
		capabilities = {
			imageDecoder: hasDecoder ? "available" : "missing",
			gifType,
			videoDecoder: hasVideo ? "available" : "missing",
			vp8,
			cores: String(navigator.hardwareConcurrency ?? "unknown"),
		};
	}

	function syncUrl(): void {
		const url = new URL(window.location.href);
		for (const key of [...url.searchParams.keys()]) {
			if (key.startsWith("m-")) url.searchParams.delete(key);
		}
		for (const [key, value] of new URLSearchParams(encodeMoshConfig($state.snapshot(config)))) {
			url.searchParams.set(key, value);
		}
		if (effect === "mosh") url.searchParams.delete("fx");
		else url.searchParams.set("fx", effect);
		// Why: keep Astro's ClientRouter state (scroll position) in history.state.
		history.replaceState(history.state, "", url);
	}

	function update(param: MoshParam, raw: string): void {
		setMoshParam(config, param, raw);
		syncUrl();
	}

	function reset(): void {
		Object.assign(config, DEFAULT_MOSH_CONFIG);
		syncUrl();
		status = "Reset to defaults";
	}

	async function copy(text: string, label: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			status = `${label} copied`;
		} catch {
			status = `Could not copy ${label.toLowerCase()} (clipboard unavailable)`;
		}
	}

	function copyJson(): Promise<void> {
		return copy(JSON.stringify($state.snapshot(config), null, 2), "JSON");
	}

	function copyUrl(): Promise<void> {
		const encoded = encodeMoshConfig($state.snapshot(config));
		return copy(`${window.location.origin}/?mosh${encoded ? `&${encoded}` : ""}`, "URL");
	}

	function onEffectChange(next: string): void {
		const chosen = EFFECTS.find((candidate) => candidate === next);
		if (!chosen) return;
		effect = chosen;
		syncUrl();
	}

	// Mount exactly one effect on the lab grid; the cleanup disposes it before the next mounts.
	$effect(() => {
		const chosen = effect;
		const grid = document.querySelector<HTMLElement>(GRID);
		resetRing();
		if (!grid || chosen === "off") return;
		return chosen === "mosh"
			? mountCardMosh(grid, { config, onFrame: onMoshFrame })
			: mountCardDither(grid, { onFrame: record });
	});

	onMount(() => {
		void probeCapabilities();
		refreshReadout();
		const timer = setInterval(refreshReadout, 250);
		return () => clearInterval(timer);
	});
</script>

<section class="panel" aria-label="Datamosh controls" data-test="mosh-lab-panel">
	<div class="effect">
		<label for="mosh-effect">Effect</label>
		<select
			id="mosh-effect"
			value={effect}
			onchange={(event) => onEffectChange(event.currentTarget.value)}
		>
			{#each EFFECTS as option}
				<option value={option}>{option}</option>
			{/each}
		</select>
		<p class="help" id="mosh-effect-help">
			mosh is the new kernel; dither is the existing effect, for timing comparison; off leaves the
			plain cards.
		</p>
	</div>

	<div class="actions">
		<button type="button" onclick={reset}>Reset</button>
		<button type="button" onclick={copyJson}>Copy JSON</button>
		<button type="button" onclick={copyUrl}>Copy URL</button>
	</div>
	<p class="status" role="status">{status}</p>

	<dl class="readout" aria-live="off" data-test="mosh-readout">
		<div>
			<dt>Active effect</dt>
			<dd>{readout.effect}</dd>
		</div>
		<div>
			<dt>Backend</dt>
			<dd>{readout.backend}</dd>
		</div>
		<div>
			<dt>Internal size</dt>
			<dd>{readout.size}</dd>
		</div>
		<div>
			<dt>Active blocks</dt>
			<dd>{readout.blocks}</dd>
		</div>
		<div>
			<dt>Frame p50</dt>
			<dd>{readout.p50}</dd>
		</div>
		<div>
			<dt>Frame p95</dt>
			<dd>{readout.p95} <span class="dim">({readout.frames} frames)</span></dd>
		</div>
		<div>
			<dt>GIF source</dt>
			<dd>{readout.gif}</dd>
		</div>
		<div>
			<dt>ImageDecoder</dt>
			<dd>{capabilities.imageDecoder}</dd>
		</div>
		<div>
			<dt>ImageDecoder gif</dt>
			<dd>{capabilities.gifType}</dd>
		</div>
		<div>
			<dt>VideoDecoder</dt>
			<dd>{capabilities.videoDecoder}</dd>
		</div>
		<div>
			<dt>VP8 supported</dt>
			<dd>{capabilities.vp8}</dd>
		</div>
		<div>
			<dt>hardwareConcurrency</dt>
			<dd>{capabilities.cores}</dd>
		</div>
		<div>
			<dt>Backend (config)</dt>
			<dd>2d (only Canvas 2D is implemented)</dd>
		</div>
	</dl>

	{#each groups as group}
		<fieldset>
			<legend>{group.name}</legend>
			{#each group.params as param}
				<div class="control" data-test="mosh-control" data-param={param.key}>
					<label for={`mosh-${param.key}`}>{param.label}</label>
					{#if param.kind === "range"}
						<div class="row">
							<input
								id={`mosh-${param.key}`}
								type="range"
								min={param.min}
								max={param.max}
								step={param.step}
								value={config[param.key]}
								aria-describedby={`mosh-help-${param.key}`}
								oninput={(event) => update(param, event.currentTarget.value)}
							/>
							<output for={`mosh-${param.key}`}>{config[param.key]}</output>
						</div>
					{:else if param.kind === "enum"}
						<select
							id={`mosh-${param.key}`}
							value={config[param.key]}
							aria-describedby={`mosh-help-${param.key}`}
							onchange={(event) => update(param, event.currentTarget.value)}
						>
							{#each param.options as option}
								<option value={option}>{option}</option>
							{/each}
						</select>
					{:else}
						<input
							id={`mosh-${param.key}`}
							type="checkbox"
							checked={config[param.key] === true}
							aria-describedby={`mosh-help-${param.key}`}
							onchange={(event) => update(param, event.currentTarget.checked ? "1" : "0")}
						/>
					{/if}
					<p class="help" id={`mosh-help-${param.key}`}>{param.help}</p>
				</div>
			{/each}
		</fieldset>
	{/each}
</section>

<style>
	.panel {
		font-size: var(--font-size-2);
		display: grid;
		gap: var(--space-4);
		align-content: start;
	}

	/* Sticky beside the grid on wide screens; it scrolls on its own if taller than the viewport. */
	@media (min-width: 1000px) {
		.panel {
			position: sticky;
			top: var(--space-4);
			max-height: calc(100vh - 2 * var(--space-4));
			overflow-y: auto;
			padding-right: var(--space-2);
		}
	}

	/* Short viewports (phone landscape): a stuck panel taller than the screen hides its lower rows. */
	@media (max-height: 600px) {
		.panel {
			position: static;
			max-height: none;
			overflow: visible;
			padding-right: 0;
		}
	}

	fieldset {
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		display: grid;
		gap: var(--space-3);
	}

	legend {
		padding-inline: var(--space-1);
		font-weight: 600;
	}

	.control {
		display: grid;
		gap: var(--space-1);
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 4.5ch;
		gap: var(--space-2);
		align-items: center;
	}

	output {
		font-family: var(--font-mono);
		text-align: right;
	}

	.help {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-1);
		line-height: 1.35;
	}

	.effect {
		display: grid;
		gap: var(--space-1);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	button,
	select {
		font: inherit;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
	}

	button {
		cursor: pointer;
	}

	button:hover {
		border-color: var(--color-text-muted);
	}

	.status {
		margin: 0;
		min-height: 1.3em;
		color: var(--color-text-muted);
		font-size: var(--font-size-1);
	}

	.readout {
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		display: grid;
		gap: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--font-size-1);
	}

	.readout div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.readout dt {
		color: var(--color-text-muted);
	}

	.readout dd {
		margin: 0;
		text-align: right;
	}

	.dim {
		color: var(--color-text-muted);
	}

	/* Coarse pointers: 16 px controls (iOS zooms the page on focus below that) and roomy slider hit areas. */
	@media (pointer: coarse) {
		button,
		select,
		input {
			font-size: 16px;
		}
		input[type="range"] {
			min-height: 32px;
		}
	}
</style>
