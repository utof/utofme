/**
 * The seam between the pet and wherever its state lives.
 *
 * Why: the view talks to a {@link PetStore} and nothing else, so the encrypted
 * local store can be replaced by an account-backed one without touching the pet.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 */
import { type PetState, parsePetState, STATE_VERSION } from "./schema";

/**
 * How a load ended.
 *
 * - `ok`: a saved pet. `empty`: none yet. `reset`: something was saved but could
 *   not be read; it is gone. `newer`: saved by newer code; left alone, nothing
 *   will be written. `unavailable`: this browser cannot store; nothing will be written.
 *
 * Why: the view shows one quiet line for `reset` and otherwise does not care.
 *
 * @see packages/specs/specs/11-pet.md § "Encrypted local store"
 */
export type LoadStatus = "ok" | "empty" | "reset" | "newer" | "unavailable";

/**
 * A load's outcome: the state (when there is one) and why.
 *
 * Why: `state` is `null` for every status except `ok`.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 */
export interface LoadResult {
	readonly state: PetState | null;
	readonly status: LoadStatus;
}

/**
 * Where a pet's state is kept.
 *
 * Why: four methods are all the pet needs; an account store implements the same four.
 *
 * @see packages/site/src/lib/pet/README.md
 */
export interface PetStore {
	load(): Promise<LoadResult>;
	save(state: PetState): Promise<void>;
	clear(): Promise<void>;
	/** Calls `onChange` when the saved state changed elsewhere (another tab); returns an unsubscribe. */
	subscribe(onChange: () => void): () => void;
}

/**
 * One step of a schema upgrade: turns the raw object of version `from` into version `from + 1`.
 *
 * Why: pure functions over plain objects, applied in order until the current version.
 *
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 */
export interface Migration {
	readonly from: number;
	up(raw: Readonly<Record<string, unknown>>): Record<string, unknown>;
}

/**
 * The upgrades this code knows. Empty while version 1 is the only one.
 *
 * Why: adding a version is adding a step here and bumping `STATE_VERSION`.
 *
 * @see packages/site/src/lib/pet/README.md
 */
export const MIGRATIONS: readonly Migration[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turns a decoded value into a state: migrates older versions, refuses newer
 * ones, validates the result.
 *
 * Why: shared by every store, so "what counts as a readable pet" has one answer.
 * `migrated` tells the store to write the upgraded state back.
 *
 * @see packages/specs/specs/11-pet.md § "Encrypted local store"
 */
export function decodeState(
	raw: unknown,
	migrations: readonly Migration[] = MIGRATIONS,
	version: number = STATE_VERSION,
): {
	readonly status: "ok" | "reset" | "newer";
	readonly state: PetState | null;
	readonly migrated: boolean;
} {
	if (!isRecord(raw)) return { status: "reset", state: null, migrated: false };
	let current: Record<string, unknown> = raw;
	let v = current["v"];
	if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
		return { status: "reset", state: null, migrated: false };
	}
	if (v > version) return { status: "newer", state: null, migrated: false };
	let migrated = false;
	while (v < version) {
		const step = migrations.find((m) => m.from === v);
		if (!step) return { status: "reset", state: null, migrated: false };
		try {
			current = { ...step.up(current), v: v + 1 };
		} catch {
			return { status: "reset", state: null, migrated: false };
		}
		v += 1;
		migrated = true;
	}
	const state = parsePetState(current);
	return state
		? { status: "ok", state, migrated }
		: { status: "reset", state: null, migrated: false };
}

/**
 * A store that keeps the state in memory for the life of the page.
 *
 * Why: the fallback when the browser cannot persist, and the store of the unit tests.
 *
 * @see packages/specs/specs/11-pet.md § "State and storage"
 */
export function memoryStore(initial: PetState | null = null): PetStore {
	let saved = initial;
	return {
		load: async () => ({ state: saved, status: saved ? "ok" : "empty" }),
		save: async (state) => {
			saved = state;
		},
		clear: async () => {
			saved = null;
		},
		subscribe: () => () => {},
	};
}
