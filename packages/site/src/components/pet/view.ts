/**
 * The pet's view: DOM, pointer and keyboard input, drawing, docking.
 *
 * Why: a thin layer. Every rule lives in `src/lib/pet/*` (reducer, mood,
 * gesture, letters, dock) and is pure; this file turns browser events into
 * those modules' inputs and draws their outputs. It asks for no animation frame
 * while the pet sleeps, never writes to the page outside its own root, and
 * reaches storage only through the {@link PetStore} it is given.
 *
 * @see packages/specs/specs/11-pet.md
 * @see packages/specs/adrs/0062-site-pet-design-rules.md
 */
import { createMesh } from "../../lib/home/objects/mesh";
import { drawObject } from "../../lib/home/objects/render";
import { isMotionPaused, MOTION_EVENT } from "../../lib/motion";
import { buildCreature, CANVAS_PX, MOUTH_AT, poseFor } from "../../lib/pet/creature";
import {
	choosePeek,
	type DockInput,
	dockBox,
	dropDock,
	OBSTACLES,
	visibleBox,
} from "../../lib/pet/dock";
import { type Box, GESTURE_IDLE, type GestureState, gestureStep } from "../../lib/pet/gesture";
import { collected, letterSlot, nibbleIndex, pickLetters } from "../../lib/pet/letters";
import {
	CHEW_MS,
	moodAt,
	nextChange,
	onEvent,
	restSession,
	type Session,
	type SessionEvent,
} from "../../lib/pet/mood";
import { newPet, type PetState } from "../../lib/pet/schema";
import {
	bellyNow,
	biteSize,
	bond,
	daysAway,
	favourite,
	growth,
	type PetAction,
	reduce,
	warmth,
} from "../../lib/pet/state";
import type { PetStore } from "../../lib/pet/store";
import { hourToTod } from "../../lib/time-of-day";
import css from "./pet.css?inline";
import { blip, purr } from "./sound";

/**
 * What the view asks of its host.
 *
 * Why: sending the pet home is the loader's business (it owns the switch and the tab).
 *
 * @see packages/site/src/components/pet/boot.ts
 */
export interface PetHooks {
	/** Move focus to the pet once it is mounted (it was called back from the tab). */
	readonly focus: boolean;
	/** The visitor sent the pet home; `viaKeyboard` asks the host to keep focus visible. */
	readonly onHome: (viaKeyboard: boolean) => void;
}

/** Minimum milliseconds between frames (~14 fps, the home objects' stepped look). */
const TICK_MS = 72;
/** The pointer counts as near within this distance of the pet's centre, px. */
const NEAR_PX = 240;
/** How long the pet stays out over content after the visitor's last act, ms. */
const LINGER_MS = 4000;
const SAVE_DELAY_MS = 300;
/** Spacing of the points sampled under the pet when it looks for a free place, px. */
const PROBE_PX = 12;
const HEART = [".#.#.", "#####", ".###.", "..#.."];
const ZED = ["####", "..#.", ".#..", "####"];
const ZED_SMALL = ["##.", ".#.", ".##"];

type Attrs = Readonly<Record<string, string>>;

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Attrs = {},
	...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
	node.append(...children);
	return node;
}

function hasOwnText(node: Element): boolean {
	for (const child of node.childNodes) {
		if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) return true;
	}
	return false;
}

function glyph(
	ctx: CanvasRenderingContext2D,
	rows: readonly string[],
	x: number,
	y: number,
	fill: string,
): void {
	ctx.fillStyle = fill;
	rows.forEach((row, dy) => {
		for (let dx = 0; dx < row.length; dx++) {
			if (row.charAt(dx) === "#") ctx.fillRect(x + dx, y + dy, 1, 1);
		}
	});
}

/**
 * Builds the pet inside `root` and starts it asleep; returns a disposer that
 * saves, removes everything it added and detaches every listener.
 *
 * Why: one function owns the pet's lifetime, so "send home" and tests can undo it completely.
 *
 * @see packages/specs/specs/11-pet.md § "Deliverables and acceptance" (P11-2)
 */
export function mountPet(root: HTMLElement, store: PetStore, hooks: PetHooks): () => void {
	// ── DOM ────────────────────────────────────────────────────────────────
	const canvas = el("canvas", {
		width: String(CANVAS_PX),
		height: String(CANVAS_PX),
		"aria-hidden": "true",
	});
	const petBtn = el("button", { type: "button", class: "pet-btn" }, canvas);
	const aboutBtn = el(
		"button",
		{
			type: "button",
			"aria-expanded": "false",
			"aria-controls": "pet-panel",
			"data-pet-about": "",
		},
		"about",
	);
	const homeBtn = el("button", { type: "button", "data-pet-home": "" }, "home");
	const nameInput = el("input", {
		type: "text",
		maxlength: "16",
		autocomplete: "off",
		spellcheck: "false",
	});
	const lineDays = el("p");
	const lineBond = el("p");
	const lineBelly = el("p");
	const lineAbc = el("p");
	const grid = el("div", { class: "pet-abc", "aria-hidden": "true" });
	const cells: HTMLElement[] = [];
	for (let i = 0; i < 26; i++) {
		const cell = el("span", {}, String.fromCharCode(65 + i));
		cells.push(cell);
		grid.append(cell);
	}
	const lineFav = el("p");
	const note = el("p", { class: "pet-note", hidden: "" });
	const feedBtn = el("button", { type: "button", "data-pet-feed": "" }, "feed");
	const moveBtn = el("button", { type: "button", "data-pet-move": "" }, "move to the other side");
	const panel = el(
		"div",
		{ class: "pet-panel", id: "pet-panel", hidden: "" },
		el("label", {}, "Name", nameInput),
		lineDays,
		lineBond,
		lineBelly,
		lineAbc,
		grid,
		lineFav,
		note,
		el("div", { class: "pet-acts" }, feedBtn, moveBtn),
	);
	const pet = el(
		"div",
		{ class: "pet", "data-pet": "" },
		petBtn,
		el("div", { class: "pet-ctl" }, aboutBtn, homeBtn),
		panel,
	);
	const fx = el("div", { class: "pet-fx", "aria-hidden": "true" });
	const status = el("p", { class: "pet-sr", role: "status" });
	const style = el("style", {}, css);
	const added: readonly HTMLElement[] = [style, pet, fx, status];
	root.append(...added);

	// ── State ──────────────────────────────────────────────────────────────
	let state: PetState | null = null;
	let ready = false;
	let saveable = true;
	let session: Session = restSession();
	let gesture: GestureState = GESTURE_IDLE;
	let gestureBox: Box = { x: 0, y: 0, w: 0, h: 0 };
	let size = 96;
	let visible = 0;
	let summoned = false;
	let carried: { x: number; y: number } | null = null;
	let gazeX = 0;
	let gazeY = 0;
	let hearts: number[] = [];
	let strokePats = 0;
	let lastPurr = 0;
	let lastSaid = 0;
	let lastNear = 0;
	let raf = 0;
	let lastTick = 0;
	let moodTimer = 0;
	let saveTimer = 0;
	let lingerTimer = 0;
	let scrollTimer = 0;
	let awakeBound = false;
	let disposed = false;
	let placed = false;
	let dirty = false;

	const isOpen = (): boolean => !panel.hasAttribute("hidden");
	const tz = (): number => new Date().getTimezoneOffset();
	const night = (): boolean => hourToTod(new Date().getHours()) === "night";
	const name = (): string => state?.name ?? "Nib";
	const current = (now: number): PetState =>
		state ?? newPet(now, Math.floor(Math.random() * 2147483647), tz());

	// ── Drawing ────────────────────────────────────────────────────────────
	const draw = (now: number): void => {
		const mood = moodAt(session, now);
		root.dataset["mood"] = mood;
		const still = isMotionPaused();
		const mesh = createMesh();
		buildCreature(
			mesh,
			poseFor(mood, {
				t: still ? 0 : (now % 1_000_000) / 1000,
				gazeX,
				gazeY,
				selecting: session.selecting,
				scale: state ? growth(state) : 0.84,
				warmth: state ? warmth(state) : 0.4,
			}),
		);
		const turned = visible >= size ? 0 : pet.dataset["side"] === "left" ? -0.3 : 0.3;
		drawObject(canvas, mesh, { yaw: turned, pop: 0 });
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		if (mood === "asleep") {
			glyph(ctx, ZED, 35, 11, "#24232a");
			glyph(ctx, ZED_SMALL, 41, 6, "#24232a");
		}
		hearts = hearts.filter((born) => now - born < 900);
		for (const born of hearts) {
			const rise = still ? 2 : Math.floor((now - born) / 150);
			glyph(ctx, HEART, 22, 6 - rise, "#b5543c");
		}
	};

	/** Draws now and arranges the next draw: a frame loop while awake, one timer under paused motion, nothing asleep. */
	const kick = (): void => {
		if (disposed) return;
		const now = Date.now();
		draw(now);
		window.clearTimeout(moodTimer);
		const asleep = moodAt(session, now) === "asleep";
		bindAwake(!asleep);
		if (asleep || document.hidden) {
			cancelAnimationFrame(raf);
			raf = 0;
			return;
		}
		if (isMotionPaused()) {
			cancelAnimationFrame(raf);
			raf = 0;
			const wait = nextChange(session, now) - now;
			if (Number.isFinite(wait)) moodTimer = window.setTimeout(kick, wait + 10);
		} else if (!raf) {
			raf = requestAnimationFrame(frame);
		}
	};
	const frame = (time: number): void => {
		raf = 0;
		if (time - lastTick < TICK_MS) {
			raf = requestAnimationFrame(frame);
			return;
		}
		lastTick = time;
		kick();
	};

	const fire = (event: SessionEvent): void => {
		session = onEvent(session, event, Date.now(), night());
		kick();
	};

	/** Any deliberate act on the pet: wakes it (with a greeting) and keeps it out for a while. */
	const attend = (): void => {
		const now = Date.now();
		const wasAsleep = moodAt(session, now) === "asleep";
		if (wasAsleep) {
			session = onEvent(
				session,
				{ type: "greet", long: state !== null && daysAway(state, now) >= 3 },
				now,
				night(),
			);
			readSelection();
		} else {
			session = onEvent(session, { type: "attend" }, now, night());
		}
		pet.classList.add("is-engaged");
		window.clearTimeout(lingerTimer);
		lingerTimer = window.setTimeout(release, LINGER_MS);
		kick();
	};
	const release = (): void => {
		if (isOpen() || pet.matches(":hover, :focus-within") || carried) {
			lingerTimer = window.setTimeout(release, LINGER_MS);
			return;
		}
		pet.classList.remove("is-engaged");
		if (summoned) {
			summoned = false;
			probe(true);
		}
	};

	// ── Persistence ────────────────────────────────────────────────────────
	const flush = (): void => {
		window.clearTimeout(saveTimer);
		saveTimer = 0;
		// Why only when dirty: a page that is merely left must not rewrite (or resurrect) the saved blob.
		if (state && saveable && dirty) {
			dirty = false;
			void store.save(state);
		}
	};
	const act = (action: PetAction): void => {
		const now = Date.now();
		state = reduce(current(now), action, now, tz());
		dirty = true;
		reflect();
		window.clearTimeout(saveTimer);
		saveTimer = window.setTimeout(flush, SAVE_DELAY_MS);
	};
	const say = (text: string): void => {
		status.textContent = text;
	};

	/** Copies the state into labels, data attributes and (when open) the panel. */
	const reflect = (): void => {
		root.dataset["pats"] = String(state?.pats ?? 0);
		root.dataset["letters"] = String(state?.letters ?? 0);
		petBtn.setAttribute("aria-label", `${name()}, your pet. Pat`);
		aboutBtn.setAttribute("aria-label", `About ${name()}`);
		homeBtn.setAttribute("aria-label", `Send ${name()} home`);
		if (!isOpen()) return;
		const now = Date.now();
		const s = current(now);
		if (document.activeElement !== nameInput) nameInput.value = s.name;
		const met = new Date(s.born).toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
		lineDays.textContent = state
			? `Met on ${met} · ${s.days} ${s.days === 1 ? "day" : "days"} together`
			: "Not met yet: give it a pat.";
		const level = Math.min(3, Math.floor(bond(s) * 4));
		lineBond.textContent = `Bond ${"♥".repeat(level)}${"♡".repeat(3 - level)}`;
		lineBelly.textContent = `Belly ${Math.round(bellyNow(s, now) * 100)}%`;
		const eaten: string[] = [];
		cells.forEach((cell, i) => {
			const on = (s.alphabet[i] ?? 0) > 0;
			cell.toggleAttribute("data-on", on);
			if (on) eaten.push(String.fromCharCode(65 + i));
		});
		lineAbc.replaceChildren(
			`Alphabet ${collected(s.alphabet)} of 26`,
			el("span", { class: "pet-sr" }, eaten.length ? `: ${eaten.join(", ")}` : ""),
		);
		const fav = favourite(s);
		const found = (s.alphabet[letterSlot(fav)] ?? 0) > 0;
		lineFav.textContent = `Favourite letter: ${found ? fav.toUpperCase() : "?"}`;
	};

	// ── Docking ────────────────────────────────────────────────────────────
	const dockInput = (): DockInput => ({
		viewportW: document.documentElement.clientWidth,
		viewportH: window.innerHeight,
		size,
		side: state?.dock.side ?? "right",
		y: state?.dock.y ?? 1,
	});
	const isFree = (box: Box): boolean => {
		if (box.w <= 0) return true;
		// Why a grid of at most 12 px: nothing a visitor can read or press is narrower than that.
		const along = (start: number, length: number): number[] => {
			const steps = Math.max(1, Math.ceil(length / PROBE_PX));
			return Array.from({ length: steps + 1 }, (_, i) =>
				Math.min(start + length - 1, start + 1 + (i * (length - 2)) / steps),
			);
		};
		for (const y of along(box.y, box.h)) {
			for (const x of along(box.x, box.w)) {
				const top = document.elementsFromPoint(x, y).find((node) => !root.contains(node));
				if (!top || top === document.body || top === document.documentElement) continue;
				if (top.closest(OBSTACLES) || hasOwnText(top)) return false;
			}
		}
		return true;
	};
	const place = (stepping: boolean): void => {
		const input = dockInput();
		const box = carried ?? dockBox(input, visible);
		// Why not on the first placement: the pet must appear in place, not slide in from the corner.
		pet.classList.toggle("is-stepping", stepping && placed && !isMotionPaused());
		placed = true;
		pet.style.setProperty("--pet-size", `${size}px`);
		pet.style.setProperty("--pet-x", `${Math.round(box.x)}px`);
		pet.style.setProperty("--pet-y", `${Math.round(box.y)}px`);
		pet.dataset["side"] = input.side;
		pet.dataset["dock"] = visible >= size || carried ? "out" : "tucked";
		root.dataset["visible"] = String(Math.min(size, visible));
		if (visible < size && isOpen()) togglePanel(false);
		draw(Date.now());
	};
	/** Re-checks the space under the pet. `full` may bring it further out; otherwise it can only retreat. */
	const probe = (full: boolean): void => {
		if (disposed || carried) return;
		size = window.matchMedia("(max-width: 600px)").matches ? 72 : 96;
		const input = dockInput();
		if (summoned) {
			visible = size;
		} else {
			const chosen = choosePeek(size, (v) => isFree(visibleBox(input, v)));
			visible = full ? chosen : Math.min(visible, chosen);
		}
		place(true);
	};
	const summon = (): void => {
		if (visible >= size) return;
		summoned = true;
		visible = size;
		place(true);
	};

	// ── Feeding ────────────────────────────────────────────────────────────
	interface Source {
		readonly text: string;
		readonly x: number;
		readonly y: number;
		readonly like: Element | null;
	}
	const selected = (): Source | null => {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
		const anchor = sel.anchorNode;
		if (anchor && root.contains(anchor)) return null;
		const text = sel.toString();
		if (pickLetters(text, 1).length === 0) return null;
		const range = sel.getRangeAt(0);
		const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
		const like = anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
		return { text, x: rect.left, y: rect.top, like };
	};
	const readSelection = (): void => {
		const source = selected();
		session = onEvent(session, { type: "select", selecting: source !== null }, Date.now());
		if (source) lookAt(source.x, source.y);
	};
	/** One letter of the page title, for feeding without a selection. Reads the DOM, changes nothing. */
	const titleLetter = (): Source | null => {
		const heading = document.querySelector("h1");
		const text = heading?.textContent ?? "";
		const index = nibbleIndex(text, current(Date.now()).alphabet, state?.meals ?? 0);
		if (!heading || index < 0) return null;
		const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
		let offset = index;
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const length = node.textContent?.length ?? 0;
			if (offset < length) {
				const range = document.createRange();
				range.setStart(node, offset);
				range.setEnd(node, offset + 1);
				const rect = range.getBoundingClientRect();
				return { text: text.charAt(index), x: rect.left, y: rect.top, like: heading };
			}
			offset -= length;
		}
		return null;
	};
	const fly = (letters: readonly string[], source: Source): void => {
		if (isMotionPaused()) return;
		const target = petBtn.getBoundingClientRect();
		const tx = target.left + target.width * MOUTH_AT.x;
		const ty = target.top + target.height * MOUTH_AT.y;
		const look = source.like ? getComputedStyle(source.like) : null;
		const fontPx = Math.min(40, Math.max(14, Number.parseFloat(look?.fontSize ?? "16") || 16));
		const onScreen =
			source.x >= 0 &&
			source.x <= window.innerWidth &&
			source.y >= 0 &&
			source.y <= window.innerHeight;
		letters.forEach((letter, i) => {
			const x = onScreen ? source.x + i * fontPx * 0.62 : tx - 60 + i * 14;
			const y = onScreen ? source.y : ty - 90;
			const span = el("span", {}, letter);
			span.style.left = `${x}px`;
			span.style.top = `${y}px`;
			span.style.font = `${look?.fontWeight ?? "400"} ${fontPx}px ${look?.fontFamily ?? "monospace"}`;
			span.style.color = look?.color ?? "#24232a";
			fx.append(span);
			const flight = span.animate(
				[
					{ transform: "translate(0, 0) scale(1)" },
					{ transform: `translate(${tx - x}px, ${ty - y}px) scale(0.3)` },
				],
				{ duration: 420, delay: i * CHEW_MS, easing: "steps(7, end)", fill: "both" },
			);
			const land = (): void => {
				span.remove();
				blip(i);
			};
			flight.addEventListener("finish", land);
			flight.addEventListener("cancel", land);
		});
	};
	const feed = (source: Source | null): void => {
		attend();
		if (!source) {
			say(`${name()} found nothing to eat.`);
			return;
		}
		const now = Date.now();
		const before = current(now);
		const letters = pickLetters(source.text);
		const eaten = letters.slice(0, biteSize(before, letters, now));
		if (eaten.length === 0) {
			fire({ type: "refuse" });
			say(`${name()} is full.`);
			return;
		}
		const fav = favourite(before);
		const special = eaten.some((ch) => {
			const slot = letterSlot(ch);
			return ch.toLowerCase() === fav || (slot >= 0 && (before.alphabet[slot] ?? 0) === 0);
		});
		act({ type: "feed", letters: eaten });
		fire({ type: "bite", letters: eaten.length, special });
		fly(eaten, source);
		const after = current(now);
		say(
			`${name()} ate ${eaten.map((ch) => ch.toUpperCase()).join(", ")}. Alphabet ${collected(after.alphabet)} of 26.`,
		);
	};

	// ── Pointer on the pet ─────────────────────────────────────────────────
	const pat = (count: number): void => {
		const now = Date.now();
		attend();
		act({ type: "pat", count });
		strokePats += count;
		if (strokePats % 4 === 0 || count >= 4) hearts.push(now);
		fire({ type: "pat" });
		if (now - lastPurr > 300) {
			lastPurr = now;
			purr();
		}
		if (now - lastSaid > 3000) {
			lastSaid = now;
			say(`${name()} purrs.`);
		}
	};
	const onDown = (event: PointerEvent): void => {
		if (!ready || !event.isPrimary || event.button !== 0) return;
		// Why preventDefault: keeps the page's selection (it may be the pet's food) and stops a stroke from selecting text.
		event.preventDefault();
		if (visible < size) {
			attend();
			summon();
			return;
		}
		const food = selected();
		if (food) {
			feed(food);
			return;
		}
		const rect = petBtn.getBoundingClientRect();
		gestureBox = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
		strokePats = 0;
		petBtn.setPointerCapture(event.pointerId);
		handle({ type: "down", x: event.clientX, y: event.clientY });
	};
	const handle = (input: {
		type: "down" | "move" | "up" | "cancel";
		x: number;
		y: number;
	}): void => {
		const step = gestureStep(gesture, input, gestureBox);
		gesture = step.state;
		for (const out of step.out) {
			if (out.kind === "pat") {
				pat(out.count);
			} else if (out.kind === "poke") {
				attend();
			} else if (out.kind === "carry-start") {
				const box = dockBox(dockInput(), visible);
				carried = { x: box.x, y: box.y };
				pet.classList.add("is-carried");
				togglePanel(false);
				attend();
				fire({ type: "hold", held: true });
			} else if (out.kind === "carry-move" && carried) {
				carried = { x: carried.x + out.dx, y: carried.y + out.dy };
				place(false);
			} else if (out.kind === "carry-end" && carried) {
				const dock = dropDock(
					carried.x + size / 2,
					carried.y + size / 2,
					document.documentElement.clientWidth,
					window.innerHeight,
					size,
				);
				carried = null;
				pet.classList.remove("is-carried");
				act({ type: "dock", ...dock });
				fire({ type: "hold", held: false });
				summoned = false;
				probe(true);
			}
		}
	};
	const onMove = (event: PointerEvent): void => {
		if (gesture.phase !== "idle") handle({ type: "move", x: event.clientX, y: event.clientY });
	};
	const onUp = (event: PointerEvent): void => {
		if (gesture.phase !== "idle") {
			handle({
				type: event.type === "pointercancel" ? "cancel" : "up",
				x: event.clientX,
				y: event.clientY,
			});
		}
	};
	/** Keyboard activation (Enter / Space): one pat. Pointer clicks were handled on pointerdown. */
	const onClick = (event: MouseEvent): void => {
		if (!ready || event.detail !== 0) return;
		const food = selected();
		if (food) feed(food);
		else pat(1);
	};
	const onDragOver = (event: DragEvent): void => {
		if (!ready || !event.dataTransfer?.types.includes("text/plain")) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		if (event.type !== "dragenter") return;
		attend();
		summon();
		fire({ type: "select", selecting: true });
	};
	const onDrop = (event: DragEvent): void => {
		const text = event.dataTransfer?.getData("text/plain") ?? "";
		if (!ready || !text) return;
		event.preventDefault();
		feed({ text, x: event.clientX - 20, y: event.clientY - 30, like: null });
	};

	// ── While awake: pointer and selection ─────────────────────────────────
	const lookAt = (x: number, y: number): void => {
		const rect = petBtn.getBoundingClientRect();
		const dx = x - (rect.left + rect.width / 2);
		const dy = y - (rect.top + rect.height / 2);
		gazeX = Math.max(-1, Math.min(1, dx / 160));
		gazeY = Math.max(-1, Math.min(1, -dy / 160));
		return;
	};
	const onPointerAround = (event: PointerEvent): void => {
		const now = Date.now();
		if (now - lastNear < 100) return;
		lastNear = now;
		const rect = petBtn.getBoundingClientRect();
		const near =
			Math.hypot(
				event.clientX - (rect.left + rect.width / 2),
				event.clientY - (rect.top + rect.height / 2),
			) < NEAR_PX;
		if (near && !session.selecting) lookAt(event.clientX, event.clientY);
		if (near || session.pointerNear) {
			session = onEvent(session, { type: "near", near }, now, night());
		}
	};
	const onSelection = (): void => {
		readSelection();
	};
	function bindAwake(on: boolean): void {
		if (on === awakeBound) return;
		awakeBound = on;
		if (on) {
			window.addEventListener("pointermove", onPointerAround, { passive: true });
			document.addEventListener("selectionchange", onSelection);
		} else {
			window.removeEventListener("pointermove", onPointerAround);
			document.removeEventListener("selectionchange", onSelection);
		}
	}

	// ── Panel and controls ─────────────────────────────────────────────────
	function togglePanel(open: boolean): void {
		if (isOpen() === open) return;
		panel.hidden = !open;
		aboutBtn.setAttribute("aria-expanded", String(open));
		if (!open) return;
		panel.classList.toggle("is-below", petBtn.getBoundingClientRect().top < 330);
		reflect();
	}
	const onAbout = (): void => {
		attend();
		togglePanel(!isOpen());
	};
	const onHome = (event: MouseEvent): void => {
		hooks.onHome(event.detail === 0);
	};
	const onFeed = (): void => {
		feed(selected() ?? titleLetter());
	};
	const onMoveSide = (): void => {
		attend();
		const dock = current(Date.now()).dock;
		act({ type: "dock", side: dock.side === "right" ? "left" : "right", y: dock.y });
		probe(true);
	};
	const onRename = (): void => {
		act({ type: "rename", name: nameInput.value });
		nameInput.value = name();
		say(`Its name is ${name()}.`);
	};
	/** Keeps the page's selection alive while a panel button is pressed (it may be the food). */
	const keepSelection = (event: PointerEvent): void => {
		event.preventDefault();
	};
	/** Esc, wherever the focus is: closes the panel, else sends a called-out pet back to the edge. */
	const onKey = (event: KeyboardEvent): void => {
		if (event.key !== "Escape") return;
		if (isOpen()) {
			const inside = pet.contains(document.activeElement);
			togglePanel(false);
			if (inside) aboutBtn.focus();
		} else if (summoned) {
			summoned = false;
			probe(true);
		}
	};
	const onFocusIn = (): void => {
		if (!ready) return;
		if (visible < size) summon();
		pet.classList.add("is-engaged");
		window.clearTimeout(lingerTimer);
		lingerTimer = window.setTimeout(release, LINGER_MS);
	};

	// ── The page around the pet ────────────────────────────────────────────
	const onOutside = (event: PointerEvent): void => {
		if (event.target instanceof Node && root.contains(event.target)) return;
		togglePanel(false);
		if (summoned) {
			summoned = false;
			probe(true);
		}
	};
	const onScroll = (): void => {
		if (summoned && !isOpen()) summoned = false;
		window.clearTimeout(scrollTimer);
		scrollTimer = window.setTimeout(() => probe(false), 150);
	};
	const onResize = (): void => {
		window.clearTimeout(scrollTimer);
		scrollTimer = window.setTimeout(() => probe(false), 150);
	};
	const onPage = (): void => {
		summoned = false;
		togglePanel(false);
		probe(true);
	};
	const onVisibility = (): void => {
		if (document.hidden) {
			flush();
			fire({ type: "sleep" });
		}
	};
	const onMotion = (): void => {
		kick();
	};

	petBtn.addEventListener("pointerdown", onDown);
	petBtn.addEventListener("pointermove", onMove);
	petBtn.addEventListener("pointerup", onUp);
	petBtn.addEventListener("pointercancel", onUp);
	petBtn.addEventListener("click", onClick);
	petBtn.addEventListener("dragenter", onDragOver);
	petBtn.addEventListener("dragover", onDragOver);
	petBtn.addEventListener("drop", onDrop);
	aboutBtn.addEventListener("click", onAbout);
	homeBtn.addEventListener("click", onHome);
	feedBtn.addEventListener("pointerdown", keepSelection);
	feedBtn.addEventListener("click", onFeed);
	moveBtn.addEventListener("click", onMoveSide);
	nameInput.addEventListener("change", onRename);
	document.addEventListener("keydown", onKey);
	pet.addEventListener("focusin", onFocusIn);
	document.addEventListener("pointerdown", onOutside);
	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", onResize);
	document.addEventListener("astro:page-load", onPage);
	document.addEventListener("visibilitychange", onVisibility);
	document.addEventListener(MOTION_EVENT, onMotion);

	// ── Start: load, show asleep ───────────────────────────────────────────
	const adopt = (next: PetState | null): void => {
		if (next && (!state || next.rev >= state.rev)) {
			state = next;
			reflect();
			probe(true);
		}
	};
	const unsubscribe = store.subscribe(() => {
		void store.load().then((result) => adopt(result.state));
	});
	reflect();
	probe(true);
	void store
		.load()
		.catch(() => ({ state: null, status: "unavailable" as const }))
		.then((result) => {
			if (disposed) return;
			saveable = result.status !== "newer" && result.status !== "unavailable";
			state = result.state;
			const notes: Partial<Record<typeof result.status, string>> = {
				reset: "Its saved state could not be read, so it is new here.",
				unavailable: "This browser will not remember it after this page.",
				newer: "A newer version of this site saved it; reload to continue.",
			};
			const text = notes[result.status];
			note.hidden = !text;
			note.textContent = text ?? "";
			ready = true;
			root.dataset["ready"] = result.status;
			reflect();
			probe(true);
			if (hooks.focus) petBtn.focus();
		});

	return () => {
		disposed = true;
		flush();
		unsubscribe();
		bindAwake(false);
		cancelAnimationFrame(raf);
		for (const timer of [moodTimer, saveTimer, lingerTimer, scrollTimer])
			window.clearTimeout(timer);
		document.removeEventListener("pointerdown", onOutside);
		document.removeEventListener("keydown", onKey);
		window.removeEventListener("scroll", onScroll);
		window.removeEventListener("resize", onResize);
		document.removeEventListener("astro:page-load", onPage);
		document.removeEventListener("visibilitychange", onVisibility);
		document.removeEventListener(MOTION_EVENT, onMotion);
		for (const node of added) node.remove();
		for (const key of ["mood", "pats", "letters", "visible", "ready"]) delete root.dataset[key];
	};
}
