<script lang="ts">
	/**
	 * SmokeSight.svelte: the interactive island of figure F2 (place a smoke, watch the sightlines
	 * change).
	 *
	 * A Mirage board with five CT and five T tokens and up to three smoke discs. Drag any token
	 * or smoke (pointer events, snapping to tiles), or focus it and use the arrow keys; the
	 * enemy sightlines are recomputed with `sight.ts` on every change and redrawn, with a counter
	 * ("Enemy sightlines: 3 (was 11 with no smoke)"). The ghost smoke marks the suggested drop;
	 * "Show sampled points" draws the tiles the rule tests. The SSR keyframe (the `children`
	 * snippet) shows until the data is ready and stays, with a note and Retry, if it fails to load.
	 *
	 * Why: the figure's claim (one smoke changes the whole fight) must be explorable, and every
	 * drag must have a keyboard path (common contract); every resource it opens (fetch, resize
	 * observer, drag capture) is registered with `registerLive` and released on unmount so
	 * ClientRouter round trips leak nothing (AC16.5).
	 *
	 * @see packages/specs/specs/10-tactical-arena-article.md § P10-6
	 * @see packages/specs/adrs/0053-hand-rolled-figures.md
	 */
	import { onMount, type Snippet } from "svelte";
	import type { MapsCsData } from "../../lib/article-data/maps_cs";
	import type { Shape } from "../../lib/article-data/types";
	import { FigureDataError, loadFigureData } from "../../lib/figure-data";
	import { arrowDelta } from "../../lib/figure-keys";
	import { registerLive } from "../../lib/figure-live";
	import { markPath } from "../../lib/figure-marks";
	import { motionState } from "../../lib/figure-motion.svelte";
	import {
		addSmoke,
		type Board,
		dotPath,
		dotsFor,
		facingText,
		lineSegments,
		MAP_NAME,
		MAX_SMOKES,
		moveSmoke,
		moveToken,
		placeSmoke,
		placeToken,
		readoutText,
		removeSmoke,
		sightlines,
		smokeSet,
		startBoard,
		SUGGESTED_SMOKE,
		tileText,
		tilesPath,
		tokenLabel,
		turnToken,
		whoSees,
	} from "../../lib/figures/smoke-sight";
	import { parseRows, siteRects, spawnTiles, wallPath } from "../../lib/grid";
	import { SIGHT, type Tile } from "../../lib/sight";
	import "./SmokeSight.css";

	interface Props {
		/** Hashed URL of the `maps_cs` data file. */
		src: string;
		/** Schema id and top-level keys for the load-time shape check. */
		shape: Shape;
		/** Id of the figure caption (`aria-labelledby`). */
		labelId: string;
		/** The SSR keyframe. */
		children?: Snippet;
	}
	const { src, shape, labelId, children }: Props = $props();

	// Why: `motionState()` reads `document`, which does not exist while the island renders on the
	// server; it is created on mount and disposed with the island.
	let motion: ReturnType<typeof motionState> | null = $state.raw(null);
	let data: MapsCsData | null = $state.raw(null);
	let failed = $state(false);
	let board: Board = $state.raw(startBoard());
	let showDots = $state(false);
	let live = $state("");
	let svg: SVGSVGElement | undefined = $state();
	let addButton: HTMLButtonElement | undefined = $state();
	let boardPx = $state(0);
	let dragging: { kind: "token" | "smoke"; index: number } | null = $state.raw(null);
	let origin: Board | null = null;
	let capturedId = -1;

	const map = $derived.by(() => {
		const m = data?.maps.find((x) => x.name === MAP_NAME);
		return m ? parseRows(m.rows) : null;
	});
	const lines = $derived(map ? sightlines(map, board.tokens, board.smokes) : []);
	const baseLines = $derived(
		map && board.smokes.length > 0 ? sightlines(map, board.tokens, []) : lines,
	);
	const counts = $derived({ count: lines.length, base: baseLines.length });
	const segs = $derived(lineSegments(lines, board.tokens));
	const cuts = $derived(
		board.smokes.length === 0
			? []
			: lineSegments(baseLines, board.tokens).filter(
					(s) => !lines.some((l) => l.from === s.from && l.to === s.to),
				),
	);
	const covered = $derived(map ? tilesPath(map.w, [...smokeSet(map, board.smokes)]) : "");
	const walls = $derived(map ? wallPath(map, 1) : "");
	const sites = $derived(
		map ? (["a", "b"] as const).flatMap((k) => siteRects(map, k).map((r) => ({ k, r }))) : [],
	);
	const spawns = $derived(
		map
			? {
					t: tilesPath(
						map.w,
						spawnTiles(map, "t").map(([r, c]) => r * map.w + c),
					),
					ct: tilesPath(
						map.w,
						spawnTiles(map, "ct").map(([r, c]) => r * map.w + c),
					),
				}
			: { t: "", ct: "" },
	);
	const dotData = $derived.by(() => {
		if (!showDots || !map) return null;
		const out = { ct: [] as Tile[], t: [] as Tile[], blocked: [] as Tile[], crosses: [] as Tile[] };
		for (const d of dotsFor(map, board)) {
			const side = board.tokens[d.from]?.side ?? "ct";
			if (d.seen) {
				out[side].push(...d.samples);
				continue;
			}
			const stop = d.samples.findIndex(([r, c]) => d.blockedAt?.[0] === r && d.blockedAt[1] === c);
			out.blocked.push(...d.samples.slice(0, stop < 0 ? undefined : stop));
			if (d.blockedAt) out.crosses.push(d.blockedAt);
		}
		return out;
	});
	const ghostFree = $derived(
		board.smokes.length < MAX_SMOKES &&
			!board.smokes.some((s) => s[0] === SUGGESTED_SMOKE[0] && s[1] === SUGGESTED_SMOKE[1]),
	);
	const tilePx = $derived(boardPx > 0 && map ? boardPx / map.w : 14);
	// Why: a finger needs about a 24 px target; the drawn mark stays small.
	const hitR = $derived(Math.max(0.7, 14 / tilePx));

	const readoutId = "ss-readout";
	const SIDES = ["ct", "t"] as const;

	// Why: a `$derived` read after a state change is recomputed on demand, so the announcement
	// reuses the very counts the board is about to draw instead of computing them twice.
	function announce(prefix: string): void {
		live = `${prefix} ${readoutText(counts, board.smokes.length)}`.trim();
	}

	// --- loading ------------------------------------------------------------------------------
	let controller: AbortController | null = null;

	async function load(): Promise<void> {
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		failed = false;
		const release = registerLive();
		try {
			const loaded = await loadFigureData<MapsCsData>(src, shape, { signal: mine.signal });
			if (mine.signal.aborted) return;
			data = loaded;
		} catch (e) {
			if (e instanceof FigureDataError && e.kind === "abort") return;
			failed = true;
		} finally {
			release();
		}
	}

	onMount(() => {
		const m = motionState();
		motion = m;
		void load();
		return () => {
			controller?.abort();
			endCapture();
			m.dispose();
			motion = null;
		};
	});

	// --- board size (for the touch hit radius) ------------------------------------------------
	$effect(() => {
		const el = svg;
		if (!el) return;
		const measure = (): void => {
			boardPx = Math.round(el.getBoundingClientRect().width);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const release = registerLive();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => {
			ro.disconnect();
			release();
		};
	});

	// --- drag ---------------------------------------------------------------------------------
	let releaseDrag: (() => void) | null = null;

	function endCapture(): void {
		if (svg && capturedId >= 0 && svg.hasPointerCapture?.(capturedId)) {
			svg.releasePointerCapture(capturedId);
		}
		capturedId = -1;
		releaseDrag?.();
		releaseDrag = null;
		dragging = null;
	}

	function begin(
		e: PointerEvent & { currentTarget: SVGGElement },
		kind: "token" | "smoke",
		index: number,
	): void {
		if (!svg || !map) return;
		if (e.pointerType === "mouse" && e.button !== 0) return;
		e.preventDefault();
		e.currentTarget.focus({ preventScroll: true });
		origin = board;
		dragging = { kind, index };
		capturedId = e.pointerId;
		svg.setPointerCapture?.(e.pointerId);
		releaseDrag?.();
		releaseDrag = registerLive();
	}

	function tileAt(e: PointerEvent): Tile | null {
		if (!svg || !map) return null;
		const rect = svg.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		const clamp = (v: number, hi: number): number => Math.min(Math.max(Math.floor(v), 0), hi - 1);
		return [
			clamp(((e.clientY - rect.top) / rect.height) * map.h, map.h),
			clamp(((e.clientX - rect.left) / rect.width) * map.w, map.w),
		];
	}

	function drag(e: PointerEvent): void {
		if (!dragging || !map || e.pointerId !== capturedId) return;
		const at = tileAt(e);
		if (!at) return;
		board =
			dragging.kind === "token"
				? placeToken(map, board, dragging.index, at[0], at[1])
				: placeSmoke(map, board, dragging.index, at[0], at[1]);
	}

	function drop(e: PointerEvent): void {
		if (!dragging || e.pointerId !== capturedId) return;
		const d = dragging;
		const moved = origin !== board;
		endCapture();
		origin = null;
		if (!moved) return;
		announce(describe(d.kind, d.index, board, "moved to"));
	}

	function describe(kind: "token" | "smoke", index: number, b: Board, verb: string): string {
		if (kind === "token") {
			const t = b.tokens[index];
			return t ? `${tokenLabel(t).replace(" at ", ` ${verb} `)}.` : "";
		}
		const s = b.smokes[index];
		return s ? `Smoke ${index + 1} ${verb} ${tileText(s)}.` : "";
	}

	// --- keyboard -----------------------------------------------------------------------------
	function onBoardKey(e: KeyboardEvent): void {
		if (e.key === "Escape" && dragging && origin) {
			board = origin;
			origin = null;
			endCapture();
			announce("Drag cancelled.");
		}
	}

	function tokenKey(e: KeyboardEvent, i: number): void {
		if (!map) return;
		const t = board.tokens[i];
		if (!t) return;
		const d = arrowDelta(e);
		if (d) {
			e.preventDefault();
			const next = moveToken(map, board, i, d[1], d[0]);
			if (next !== board) {
				board = next;
				announce(describe("token", i, board, "moved to"));
			} else {
				announce("Blocked.");
			}
			return;
		}
		switch (e.key) {
			case "r":
			case "R": {
				e.preventDefault();
				board = turnToken(board, i, e.shiftKey ? -1 : 1);
				const nt = board.tokens[i];
				announce(
					nt ? `${tokenLabel(nt).split(" at ")[0]} now faces ${facingText(nt.facing)}.` : "",
				);
				return;
			}
			case "s":
			case "S": {
				e.preventDefault();
				placeNewSmoke([t.r, t.c]);
				return;
			}
			case "Enter":
			case " ": {
				e.preventDefault();
				live = `${whoSees(board.tokens, lines, i)} ${readoutText(counts, board.smokes.length)}`;
				return;
			}
		}
	}

	function smokeKey(e: KeyboardEvent, i: number): void {
		if (!map) return;
		const d = arrowDelta(e);
		if (d) {
			e.preventDefault();
			const next = moveSmoke(map, board, i, d[1], d[0]);
			if (next !== board) {
				board = next;
				announce(describe("smoke", i, board, "moved to"));
			} else {
				announce("Blocked.");
			}
			return;
		}
		if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			removeAt(i);
		} else if (e.key === "s" || e.key === "S") {
			e.preventDefault();
			placeNewSmoke(board.smokes[i] ?? SUGGESTED_SMOKE);
		}
	}

	function ghostKey(e: KeyboardEvent): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			placeNewSmoke(SUGGESTED_SMOKE);
		}
	}

	// --- smokes and reset ---------------------------------------------------------------------
	function placeNewSmoke(at?: Tile): void {
		if (!map) return;
		const next = addSmoke(map, board, at);
		if (next === board) {
			announce("Three smokes is the most.");
			return;
		}
		board = next;
		const n = next.smokes.length;
		announce(describe("smoke", n - 1, next, "added at"));
	}

	function removeAt(i: number): void {
		const next = removeSmoke(board, i);
		if (next === board) return;
		board = next;
		announce(`Smoke ${i + 1} removed.`);
		addButton?.focus();
	}

	function reset(): void {
		board = startBoard();
		origin = null;
		endCapture();
		announce("Reset.");
	}

	function onGhostClick(): void {
		placeNewSmoke(SUGGESTED_SMOKE);
	}

	const facingEnd = (
		t: { r: number; c: number; facing: number },
		len: number,
	): [number, number] => {
		const a = (t.facing * Math.PI) / 4;
		return [t.c + 0.5 + Math.sin(a) * len, t.r + 0.5 - Math.cos(a) * len];
	};
</script>

<div class="fig-box ss-box" data-still={motion?.paused ? "" : undefined}>
	{#if data && map}
		<div class="ss" class:ss-dragging={dragging}>
			<p class="ss-readout" id={readoutId}>
				<span>Enemy sightlines: <span class="ss-n">{counts.count}</span></span>
				{#if board.smokes.length > 0}
					<span class="ss-was">(was {counts.base} with no smoke)</span>
				{/if}
			</p>
			<!-- Why: the spec gives the free-move board role="application" (arrow keys belong to the focused token). -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<svg
				bind:this={svg}
				class="ss-board"
				viewBox={`0 0 ${map.w} ${map.h}`}
				role="application"
				aria-roledescription="smoke board"
				aria-labelledby={labelId}
				aria-describedby={readoutId}
				onpointermove={drag}
				onpointerup={drop}
				onpointercancel={drop}
				onkeydown={onBoardKey}
			>
				<defs>
					{#each SIDES as s (s)}
						<marker
							id={`ss-arrow-${s}`}
							viewBox="0 0 4 4"
							refX="3.4"
							refY="2"
							markerWidth="0.62"
							markerHeight="0.62"
							markerUnits="userSpaceOnUse"
							orient="auto"
						>
							<path class={`ss-arrow-${s}`} d="M0 0L4 2L0 4z" />
						</marker>
					{/each}
				</defs>
				{#each sites as { k, r } (k)}
					<rect
						class="ss-site"
						x={r.c0}
						y={r.r0}
						width={r.c1 - r.c0 + 1}
						height={r.r1 - r.r0 + 1}
					/>
					<text
						class="ss-site-label"
						aria-hidden="true"
						x={(r.c0 + r.c1 + 1) / 2}
						y={(r.r0 + r.r1 + 1) / 2}>{k.toUpperCase()}</text
					>
				{/each}
				<path class="ss-spawn-t" d={spawns.t} />
				<path class="ss-spawn-ct" d={spawns.ct} />
				<path class="ss-wall" d={walls} />
				<path class="ss-smoke-fill" d={covered} />
				{#each board.smokes as s, i (i)}
					<circle
						class="ss-smoke-edge"
						data-smoke-disc
						cx={s[1] + 0.5}
						cy={s[0] + 0.5}
						r={SIGHT.smokeRadius}
					/>
				{/each}
				{#if ghostFree}
					<!-- Why: mouse and touch users click anywhere in the ghost; the keyboard path is the focusable handle at the end of the board. -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<g aria-hidden="true" onclick={onGhostClick}>
						<circle
							class="ss-ghost-disc"
							data-ghost-disc
							cx={SUGGESTED_SMOKE[1] + 0.5}
							cy={SUGGESTED_SMOKE[0] + 0.5}
							r={SIGHT.smokeRadius}
						/>
						<circle
							class="ss-ghost-hit"
							cx={SUGGESTED_SMOKE[1] + 0.5}
							cy={SUGGESTED_SMOKE[0] + 0.5}
							r={SIGHT.smokeRadius}
						/>
					</g>
				{/if}
				{#each cuts as s (`${s.from}>${s.to}`)}
					<line class="ss-cut" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
				{/each}
				{#each segs as s (`${s.from}>${s.to}`)}
					<line class={`ss-line ss-line--${s.side}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
				{/each}
				{#if dotData}
					<path class="ss-dots ss-dots--blocked" d={dotPath(dotData.blocked)} />
					<path class="ss-dots ss-dots--ct" d={dotPath(dotData.ct)} />
					<path class="ss-dots ss-dots--t" d={dotPath(dotData.t)} />
					<path
						class="ss-cross"
						d={dotData.crosses
							.map(([r, c]) => `M${c + 0.15} ${r + 0.15}l0.7 0.7M${c + 0.85} ${r + 0.15}l-0.7 0.7`)
							.join("")}
					/>
				{/if}
				{#each board.tokens as t, i (`${t.side}${t.n}`)}
					{@const end = facingEnd(t, 0.95)}
					{@const start = facingEnd(t, 0.5)}
					<g
						class={`ss-tok ss-tok--${t.side}`}
						data-token
						role="button"
						tabindex="0"
						aria-roledescription="draggable token"
						aria-label={`${tokenLabel(t)}. Arrow keys move it.`}
						onpointerdown={(e) => begin(e, "token", i)}
						onkeydown={(e) => tokenKey(e, i)}
					>
						<title>{tokenLabel(t)}</title>
						<circle class="ss-hit" cx={t.c + 0.5} cy={t.r + 0.5} r={hitR} />
						<circle class="ss-halo" cx={t.c + 0.5} cy={t.r + 0.5} r="0.72" />
						<circle class="ss-ring" cx={t.c + 0.5} cy={t.r + 0.5} r="0.72" />
						<path
							class="ss-mark"
							data-shape={t.side === "ct" ? "circle" : "triangle"}
							d={markPath(t.side, t.c + 0.5, t.r + 0.5, 0.42)}
						/>
						<line class="ss-nose" x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} />
					</g>
				{/each}
				{#each board.smokes as s, i (i)}
					<g
						class="ss-smoke-handle"
						data-smoke
						role="button"
						tabindex="0"
						aria-roledescription="draggable smoke"
						aria-label={`Smoke ${i + 1} at ${tileText(s)}. Arrow keys move it, Delete removes it.`}
						onpointerdown={(e) => begin(e, "smoke", i)}
						onkeydown={(e) => smokeKey(e, i)}
						ondblclick={() => removeAt(i)}
					>
						<title>{`Smoke ${i + 1} at ${tileText(s)}`}</title>
						<circle class="ss-hit" cx={s[1] + 0.5} cy={s[0] + 0.5} r={hitR} />
						<circle class="ss-halo" cx={s[1] + 0.5} cy={s[0] + 0.5} r="0.62" />
						<circle class="ss-ring" cx={s[1] + 0.5} cy={s[0] + 0.5} r="0.62" />
						<circle class="ss-handle-mark" cx={s[1] + 0.5} cy={s[0] + 0.5} r="0.42" />
						<circle class="ss-handle-dot" cx={s[1] + 0.5} cy={s[0] + 0.5} r="0.16" />
					</g>
				{/each}
				{#if ghostFree}
					<g
						class="ss-ghost-handle"
						data-ghost
						role="button"
						tabindex="0"
						aria-label={`Suggested smoke on the ramp to the A site, ${tileText(SUGGESTED_SMOKE)}. Press Enter to drop a smoke here.`}
						onclick={onGhostClick}
						onkeydown={ghostKey}
					>
						<circle
							class="ss-hit"
							cx={SUGGESTED_SMOKE[1] + 0.5}
							cy={SUGGESTED_SMOKE[0] + 0.5}
							r={hitR}
						/>
						<circle
							class="ss-halo"
							cx={SUGGESTED_SMOKE[1] + 0.5}
							cy={SUGGESTED_SMOKE[0] + 0.5}
							r="0.62"
						/>
						<circle
							class="ss-ring"
							cx={SUGGESTED_SMOKE[1] + 0.5}
							cy={SUGGESTED_SMOKE[0] + 0.5}
							r="0.62"
						/>
						<text
							class="ss-ghost-label"
							aria-hidden="true"
							x={SUGGESTED_SMOKE[1] + 0.5}
							y={SUGGESTED_SMOKE[0] + 0.5}>?</text
						>
					</g>
				{/if}
			</svg>
			<div class="ss-controls">
				<button
					class="ss-btn"
					type="button"
					bind:this={addButton}
					disabled={board.smokes.length >= MAX_SMOKES}
					onclick={() => placeNewSmoke()}
				>
					Add smoke
				</button>
				<label class="ss-check"
					><input type="checkbox" bind:checked={showDots} /> Show sampled points</label
				>
				<button class="ss-btn" type="button" onclick={reset}>Reset</button>
			</div>
			<ul class="ss-legend">
				<li><span class="ss-ct" aria-hidden="true">●</span> CT defender (circle)</li>
				<li><span class="ss-t" aria-hidden="true">▲</span> T attacker (triangle)</li>
				<li>
					<span class="ss-sm" aria-hidden="true">◌</span> Smoke: the dashed ring; the short bar on each
					player shows where they look
				</li>
				<li>Lines point at whoever is seen. Faint dotted lines: sightlines the smoke cut.</li>
				<li class="ss-hint">
					Drag, or Tab to a token and use the arrow keys (Shift: five tiles). S adds a smoke, Delete
					removes one, R turns a token.
				</li>
			</ul>
		</div>
	{:else}
		{@render children?.()}
		{#if failed}
			<p class="ss-fail">
				Interactive version failed to load.
				<button class="ss-btn" type="button" onclick={() => void load()}>Retry</button>
			</p>
		{/if}
	{/if}
	<p class="ss-live" aria-live="polite">{live}</p>
</div>
