/**
 * Pure logic and public copy of figure F6, "The machine, as boxes you can poke".
 *
 * The shipped `architecture` dataset holds only geometry and labels; every sentence the reader sees
 * (one blurb per box, one flow sentence per arrow, the nine stages of "follow one training block")
 * is hand-written here in generic words: no file names, paths or transfer mechanisms, and compute
 * is named only as "a friend's RTX 2080 Ti", "a desktop GTX 1660 Ti", "my laptop" or "a small cloud
 * budget". This module also owns the geometry helpers (box edges, arrow paths, the vertical layout
 * for phones) and the keyboard rule that moves focus between connected boxes.
 *
 * Why: privacy by omission (the notes' own blurbs name private files), and the diagram's
 * behaviour (what a stage highlights, what "Receives / Sends" lists, where an arrow goes) is plain
 * data and arithmetic that belongs in a unit-tested module, not in the island.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 * @see packages/specs/adrs/0053-hand-rolled-figures.md
 */
import type { ArchitectureData } from "../article-data/architecture";

/**
 * Identifier of an edge: `<from>><to>`.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export type EdgeId = `${string}>${string}`;

/**
 * The id of an edge.
 *
 * Why: the dataset's edges have no id of their own; `from>to` is unique in the data (a unit test
 * checks it) and is the key of the copy tables.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function edgeId(e: { from: string; to: string }): EdgeId {
	return `${e.from}>${e.to}`;
}

/**
 * Position of a box centre, in the layout's own coordinates.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export interface Point {
	x: number;
	y: number;
}

/**
 * Geometry of one layout (a coordinate system plus a box size).
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export interface Layout {
	/** SVG viewBox width. */
	w: number;
	/** SVG viewBox height. */
	h: number;
	/** Box width. */
	boxW: number;
	/** Box height. */
	boxH: number;
	/** Box centres by node id. */
	pos: Readonly<Record<string, Point>>;
}

/**
 * Second coordinates for phones (< 700 px): two columns of boxes, top to bottom in flow order.
 *
 * Why: the spec keeps the vertical layout in the figure module, not in the dataset; the horizontal
 * coordinates come from the data.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export const VERTICAL_POS: Readonly<Record<string, Point>> = {
	mapc: { x: 92, y: 56 },
	prodemo: { x: 268, y: 56 },
	csmaps: { x: 92, y: 140 },
	gen: { x: 268, y: 140 },
	env: { x: 92, y: 224 },
	bots: { x: 268, y: 224 },
	train: { x: 92, y: 308 },
	league: { x: 268, y: 308 },
	ckpt: { x: 92, y: 392 },
	tour: { x: 268, y: 392 },
	elo: { x: 92, y: 476 },
	referee: { x: 268, y: 476 },
	rec: { x: 92, y: 560 },
	queue: { x: 268, y: 560 },
	v2d: { x: 92, y: 644 },
	gpus: { x: 268, y: 644 },
	v3d: { x: 92, y: 728 },
	backup: { x: 268, y: 728 },
};

/**
 * The layout for a viewport class.
 *
 * Why: `wide` uses the dataset's coordinates on its 1000 × 600 canvas with 170 × 70 boxes (the
 * boxes the data was laid out for); `narrow` uses {@link VERTICAL_POS} on 360 × 800.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function layoutFor(data: ArchitectureData, kind: "wide" | "narrow"): Layout {
	if (kind === "narrow") return { w: 360, h: 792, boxW: 152, boxH: 56, pos: VERTICAL_POS };
	const pos: Record<string, Point> = {};
	for (const n of data.nodes) pos[n.id] = { x: n.x, y: n.y };
	return { w: 1000, h: 600, boxW: 170, boxH: 70, pos };
}

/**
 * Boxes in reading order: top to bottom within a column band, then left to right.
 *
 * Why: tab order and the `<dl>` follow the same order, which is how a sighted reader scans the
 * diagram (columns of boxes, left to right).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10 (Keyboard)
 */
export function readingOrder(data: ArchitectureData): string[] {
	return [...data.nodes].sort((a, b) => a.x - b.x || a.y - b.y).map((n) => n.id);
}

/** Where a segment from `from` to `to` leaves a box centred on `from`. */
function clip(from: Point, to: Point, boxW: number, boxH: number, pad: number): Point {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const sx = dx === 0 ? Number.POSITIVE_INFINITY : (boxW / 2 + pad) / Math.abs(dx);
	const sy = dy === 0 ? Number.POSITIVE_INFINITY : (boxH / 2 + pad) / Math.abs(dy);
	const t = Math.min(sx, sy);
	return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * An arrow ready to draw: an SVG path, a label anchor and the arrowhead direction.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export interface ArrowGeom {
	/** SVG path `d` (a line or a quadratic curve). */
	d: string;
	/** Anchor for a text label or a hit target. */
	mid: Point;
	/** Arrowhead tip. */
	tip: Point;
	/** Arrowhead direction in radians. */
	angle: number;
}

/**
 * The path of one arrow, from the edge of its source box to the edge of its target box.
 *
 * Why: arrows that have a reverse partner (training loop ↔ game, checkpoints ↔ training loop) bend
 * to opposite sides so both stay visible; everything else is straight.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function arrowGeom(
	layout: Layout,
	edge: { from: string; to: string },
	hasReverse: boolean,
): ArrowGeom | null {
	const a = layout.pos[edge.from];
	const b = layout.pos[edge.to];
	if (!a || !b) return null;
	const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
	const nx = -(b.y - a.y) / len;
	const ny = (b.x - a.x) / len;
	const bend = hasReverse ? 14 : 0;
	const ctl: Point = { x: (a.x + b.x) / 2 + nx * bend * 2, y: (a.y + b.y) / 2 + ny * bend * 2 };
	const p0 = clip(a, hasReverse ? ctl : b, layout.boxW, layout.boxH, 2);
	const p1 = clip(b, hasReverse ? ctl : a, layout.boxW, layout.boxH, 4);
	const d = hasReverse
		? `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}Q${ctl.x.toFixed(1)} ${ctl.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
		: `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}L${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
	const from = hasReverse ? ctl : p0;
	return {
		d,
		mid: hasReverse
			? { x: (p0.x + 2 * ctl.x + p1.x) / 4, y: (p0.y + 2 * ctl.y + p1.y) / 4 }
			: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
		tip: p1,
		angle: Math.atan2(p1.y - from.y, p1.x - from.x),
	};
}

/**
 * The labels of the arrows into a node, in data order.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function receives(data: ArchitectureData, id: string): string[] {
	return data.edges.filter((e) => e.to === id).map((e) => e.label);
}

/**
 * The labels of the arrows out of a node, in data order.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function sends(data: ArchitectureData, id: string): string[] {
	return data.edges.filter((e) => e.from === id).map((e) => e.label);
}

/**
 * The box a node's arrow keys lead to: among boxes joined to it by an arrow (either direction),
 * the one best aligned with the pressed direction; `null` when none points that way.
 *
 * Why: "arrows move between connected nodes" (spec P10-10) is how a keyboard user follows the data
 * rather than the page. A candidate must lie within 60° of the pressed direction.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10 (Keyboard)
 */
export function neighbourInDirection(
	data: ArchitectureData,
	layout: Layout,
	id: string,
	key: string,
): string | null {
	const dir: Record<string, Point> = {
		ArrowRight: { x: 1, y: 0 },
		ArrowLeft: { x: -1, y: 0 },
		ArrowDown: { x: 0, y: 1 },
		ArrowUp: { x: 0, y: -1 },
	};
	const d = dir[key];
	const here = layout.pos[id];
	if (!d || !here) return null;
	const linked = new Set<string>();
	for (const e of data.edges) {
		if (e.from === id) linked.add(e.to);
		if (e.to === id) linked.add(e.from);
	}
	let best: { id: string; score: number } | null = null;
	for (const other of linked) {
		const p = layout.pos[other];
		if (!p) continue;
		const dx = p.x - here.x;
		const dy = p.y - here.y;
		const len = Math.hypot(dx, dy) || 1;
		const cos = (dx * d.x + dy * d.y) / len;
		if (cos < 0.5) continue;
		const score = cos * 1000 - len;
		if (!best || score > best.score) best = { id: other, score };
	}
	return best?.id ?? null;
}

// --- public copy -------------------------------------------------------------------------------

/**
 * One blurb per box. Generic words only: no file names, paths or transfer mechanisms.
 *
 * Why: the notes' own blurbs and file lists never ship (spec P10-10, privacy). Numbers here are
 * checked against the facts in a unit test.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export const NODE_COPY: Readonly<Record<string, string>> = {
	gen: "Carves CS-like maps out of rooms and corridors: 2,048 to train on and 200 held back for testing, for each of three generations of the generator.",
	csmaps:
		"Five real CS2 maps (Dust2, Mirage, Inferno, Ancient, Anubis) traced from their radar images onto the same 28 × 28 grid. Mirage is never trained on.",
	mapc: "A compiler that reads the real maps' walkable-area files and projects them onto grids, with heights. It measures how CS-like a map is and sets the generator's knobs.",
	prodemo:
		"224 professional CS2 maps, parsed tick by tick. Their bullets, kills and timings tune the game's shot model and give me human yardsticks to compare against.",
	env: "The game itself: 5 against 5 on a 28 × 28 grid, one decision per 0.8 seconds, with a bomb, fog of war, sound, grenades, an economy and crouching. Written in JAX so thousands of games run at once.",
	bots: "Hand-written Counter-Strike playbooks (rushes, executes, splits, fakes; stacks and retakes). They see only what their team could know and act through the same controls as the agents.",
	train:
		"Self-play reinforcement learning (PPO). One network controls each player and sees only that player's view; it picks a move, a turn and an action one after another.",
	league:
		"Chooses opponents: half the games against the latest self, half against a pool of older versions, and one in five against scripted bots so old tricks are not forgotten.",
	ckpt: "The saved agents: weights, settings and logs of every run. A new block starts from the last one, and older ones fill the opponent pool.",
	tour: "Every pair of agents plays both sides on the CS maps, 8,000 rounds per pair for an A/B test. Results are tallied per pair.",
	elo: "Fits Elo ratings to the tournament, then compares seed-paired runs with a 90 % bootstrap interval. The CS maps decide; Mirage is a diagnostic.",
	referee:
		"A real CS2 server I can read and steer, for checking my game against the original. It runs about 370 bot rounds an hour. Agents cannot play in it yet.",
	rec: "Replays rounds of agents and bots with analysis switched on (what each player sees, how likely each action was, how the round looks to the value estimate) and saves them as tables.",
	v2d: "A local web app: the map, a timeline, policy and stats panels, what-if edits and heat maps over many rounds.",
	v3d: "A 3D view of the same rounds, optionally over the real CS2 map, where a person can take one player's slot against agents and bots.",
	queue:
		"Jobs wait in a first-in, first-out line per machine. A job can be paused, resumed or restarted without losing the run.",
	gpus: "Where training runs: my laptop drives everything, a desktop GTX 1660 Ti and a friend's RTX 2080 Ti do the main-line training, and a small cloud budget covers bursts.",
	backup:
		"Every fifteen minutes each active run is copied to a safe place, so a machine that freezes loses at most a quarter of an hour.",
};

/**
 * One flow sentence per arrow, keyed by {@link EdgeId}.
 *
 * Why: hovering an arrow answers "what travels here?" in one sentence (spec P10-10). The training
 * loop's sentence carries the caption's arithmetic.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export const EDGE_COPY: Readonly<Record<EdgeId, string>> = {
	"mapc>csmaps": "Grids of walkable tiles and heights compiled from the real maps.",
	"mapc>gen":
		"Measured door widths, sightlines and attacker/defender timing gaps that set the third generator's knobs.",
	"gen>env": "A bank of 2,048 generated maps, with spawns, sites and points of interest.",
	"csmaps>env": "The five real maps in the same format. Mirage is for evaluation only.",
	"prodemo>env":
		"Constants measured on professional play: shot accuracy, grenade timings, crouch accuracy.",
	"bots>env": "Scripted actions, in the same encoding the agents use.",
	"env>train":
		"Every update: 512 games × 256 steps × 10 players = 1.31 M decisions, each with its observation and reward.",
	"train>env": "The chosen action of every player, for every game.",
	"bots>league":
		"One game in five is against a pair of scripted plans, so the agent never forgets them.",
	"league>train": "Which opponent each group of games plays: the latest self or a pool member.",
	"train>ckpt": "Saved weights every few updates, plus the settings and logs of the run.",
	"ckpt>league": "Older agents join the opponent pool.",
	"ckpt>train": "A new block warm-starts from the last block's final agent.",
	"ckpt>tour": "The final agent of each run, and for Mirage the last three.",
	"tour>elo": "Score and game-count tables for every pair.",
	"prodemo>tour": "Professional yardsticks, such as when the first contact happens.",
	"ckpt>referee": "Planned: a bridge that would let a saved agent play in a real server.",
	"ckpt>rec": "The agent (or bot) that plays the recorded round.",
	"env>rec": "A detailed tick of the game with the analysis switched on.",
	"rec>v2d": "Recorded rounds as tables.",
	"rec>v3d": "The same rounds, plus live play.",
	"mapc>v3d": "The real map's surface, for the 3D backdrop.",
	"elo>queue": "A verdict (adopt, no harm, reject) that I turn into the next block's job.",
	"queue>gpus": "The job is shipped to the GPU machine.",
	"gpus>train": "GPU time for the trainer.",
	"gpus>backup": "A copy of the run, every fifteen minutes.",
	"backup>ckpt": "Restore: another machine downloads the run and training resumes exactly.",
};

/**
 * One step of "follow one training block".
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export interface Stage {
	/** Short title. */
	title: string;
	/** Two sentences at most. */
	text: string;
	/** Ids of the boxes to highlight. */
	nodes: readonly string[];
	/** Ids of the arrows to highlight. */
	edges: readonly EdgeId[];
}

/**
 * The nine stages of one training block, in order; stage 4 (index 3) is the default.
 *
 * Why: STORY § 3 ("Learning by playing yourself") describes the loop and § 5 ("Getting stronger,
 * measured honestly") the evaluation; the stages walk one block from job to Elo number and back to
 * the next job (spec P10-10). Each stage cites its STORY section in a comment.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export const STAGES: readonly Stage[] = [
	{
		// STORY § 3: the block begins as a job file
		title: "Write the job",
		text: "The last block's verdict decides what runs next. I copy its job, change three things (the name, the start point and one pool entry) and check that nothing else moved.",
		nodes: ["elo", "queue"],
		edges: ["elo>queue"],
	},
	{
		// STORY § 3: one machine at a time, first in, first out
		title: "Queue it",
		text: "The job is shipped to the GPU machine and waits its turn in a first-in, first-out line.",
		nodes: ["queue", "gpus"],
		edges: ["queue>gpus"],
	},
	{
		// STORY § 3: warm start from the previous block
		title: "Start up",
		text: "The worker starts the trainer. It loads the previous block's final agent as its starting point, builds the game, and draws its maps from the bank.",
		nodes: ["gpus", "ckpt", "gen", "env", "train"],
		edges: ["gpus>train", "ckpt>train", "gen>env"],
	},
	{
		// STORY § 3: self-play, a pool of past selves and one game in five against bots
		title: "Train",
		text: "512 games run at once for 256 steps with ten players each. Half face the latest self, half face the pool, one in five face scripted bots; then PPO updates the network.",
		nodes: ["train", "env", "league", "bots", "ckpt"],
		edges: ["env>train", "train>env", "league>train", "bots>league", "bots>env", "ckpt>league"],
	},
	{
		// STORY § 3: nothing is lost when a machine freezes
		title: "Save",
		text: "Every few updates the weights are saved, and every fifteen minutes a copy of the run goes somewhere safe. A frozen machine loses at most a quarter of an hour.",
		nodes: ["train", "ckpt", "gpus", "backup"],
		edges: ["train>ckpt", "gpus>backup", "backup>ckpt"],
	},
	{
		// STORY § 3: how long a block takes
		title: "Time",
		text: "A block is about 200 million player-decisions: roughly half an hour per seed on the fast machine, and two seeds run one after the other.",
		nodes: ["gpus", "train"],
		edges: ["gpus>train"],
	},
	{
		// STORY § 5: round-robin tournaments on the CS maps
		title: "Evaluate",
		text: "The new agent, the previous block and some references play a tournament on the CS maps, both sides of every pair, 8,000 rounds per pair.",
		nodes: ["ckpt", "tour", "prodemo"],
		edges: ["ckpt>tour", "prodemo>tour"],
	},
	{
		// STORY § 5: Elo with a 90 % interval, seed-paired
		title: "Elo number",
		text: "The results become Elo ratings. Each seed is compared with its own predecessor, and the mean difference gets a 90 % bootstrap interval: the number the notebook records.",
		nodes: ["tour", "elo"],
		edges: ["tour>elo"],
	},
	{
		// STORY § 3 and § 7: the verdict feeds the next job
		title: "Close the loop",
		text: "The verdict goes into the notebook and decides the next job: continue the line, or adopt or reject a change. Then it starts again.",
		nodes: ["elo", "queue"],
		edges: ["elo>queue"],
	},
];

/**
 * Index of the stage shown by default (stage 4, "Train").
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export const DEFAULT_STAGE = 3;

/**
 * Clamps a stage index to the nine stages.
 *
 * Why: Next and Previous stop at the ends instead of wrapping, so "9 / 9" is reachable and the
 * counter never lies.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function stageIndex(i: number): number {
	return Math.max(0, Math.min(STAGES.length - 1, Math.trunc(i)));
}

/**
 * What the readout panel shows.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export interface Readout {
	/** Heading line. */
	title: string;
	/** Body sentence. */
	text: string;
	/** "Receives: …" line, boxes only. */
	receives?: string;
	/** "Sends: …" line, boxes only. */
	sends?: string;
}

/**
 * A selection in the diagram.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export type Selection = { kind: "node" | "edge"; id: string };

function list(labels: readonly string[]): string {
	return labels.length > 0 ? labels.join(", ") : "nothing";
}

/**
 * The readout for a box, an arrow or (when nothing is selected) the current stage.
 *
 * Why: one function feeds the island and the no-JS `<dl>`/`<ol>`, so both say the same words.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function readout(data: ArchitectureData, sel: Selection | null, stage: number): Readout {
	if (sel?.kind === "node") {
		const n = data.nodes.find((x) => x.id === sel.id);
		if (n)
			return {
				title: n.label,
				text: NODE_COPY[n.id] ?? "",
				receives: `Receives: ${list(receives(data, n.id))}`,
				sends: `Sends: ${list(sends(data, n.id))}`,
			};
	}
	if (sel?.kind === "edge") {
		const e = data.edges.find((x) => edgeId(x) === sel.id);
		if (e) {
			const from = data.nodes.find((x) => x.id === e.from)?.label ?? e.from;
			const to = data.nodes.find((x) => x.id === e.to)?.label ?? e.to;
			return { title: `${from} → ${to}: ${e.label}`, text: EDGE_COPY[edgeId(e)] ?? "" };
		}
	}
	const i = stageIndex(stage);
	const s = STAGES[i];
	return { title: `${i + 1}. ${s?.title ?? ""}`, text: s?.text ?? "" };
}

/**
 * Text summary of the diagram for the live description.
 *
 * Why: the SVG is a `role="group"`; this sentence is its `aria-describedby`.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function summary(data: ArchitectureData, stage: number): string {
	const i = stageIndex(stage);
	return `Diagram of ${data.nodes.length} boxes in ${data.groups.length} groups joined by ${data.edges.length} arrows. Stage ${i + 1} of ${STAGES.length}, ${STAGES[i]?.title ?? ""}, is highlighted.`;
}

/**
 * Splits a box label into at most two lines of about `max` characters, breaking at spaces.
 *
 * Why: SVG text does not wrap; the boxes are 152–170 units wide, so labels are broken by hand.
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function wrapLabel(label: string, max: number): string[] {
	if (label.length <= max) return [label];
	const words = label.split(" ");
	let best: string[] = [label];
	let bestWorst = Number.POSITIVE_INFINITY;
	for (let i = 1; i < words.length; i++) {
		const a = words.slice(0, i).join(" ");
		const b = words.slice(i).join(" ");
		const worst = Math.max(a.length, b.length);
		if (worst < bestWorst) {
			bestWorst = worst;
			best = [a, b];
		}
	}
	return best;
}

/**
 * A group's backdrop rectangle.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export interface GroupBox {
	/** Group id. */
	id: string;
	/** Group label. */
	label: string;
	/** Left edge. */
	x: number;
	/** Top edge. */
	y: number;
	/** Width. */
	w: number;
	/** Height. */
	h: number;
}

/**
 * Backdrop rectangles around each group's boxes in a layout.
 *
 * Why: the grouping (maps, simulation, learning, …) is part of the picture; the vertical layout
 * interleaves groups, so only the wide layout draws backdrops (callers skip the narrow one).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function groupBoxes(data: ArchitectureData, layout: Layout): GroupBox[] {
	const out: GroupBox[] = [];
	for (const g of data.groups) {
		const pts = data.nodes
			.filter((n) => n.group === g.id)
			.map((n) => layout.pos[n.id])
			.filter((p): p is Point => p !== undefined);
		if (pts.length === 0) continue;
		const pad = 8;
		const padX = 4;
		const x0 = Math.min(...pts.map((p) => p.x)) - layout.boxW / 2 - padX;
		const x1 = Math.max(...pts.map((p) => p.x)) + layout.boxW / 2 + padX;
		const y0 = Math.min(...pts.map((p) => p.y)) - layout.boxH / 2 - pad - 16;
		const y1 = Math.max(...pts.map((p) => p.y)) + layout.boxH / 2 + pad;
		out.push({ id: g.id, label: g.label, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
	}
	return out;
}

/**
 * Accessible name of an arrow.
 *
 * Why: part of the F6 module contract (spec P10-10).
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-10
 */
export function edgeName(
	data: ArchitectureData,
	e: { from: string; to: string; label: string },
): string {
	const from = data.nodes.find((n) => n.id === e.from)?.label ?? e.from;
	const to = data.nodes.find((n) => n.id === e.to)?.label ?? e.to;
	return `${e.label}: from ${from} to ${to}`;
}
