/**
 * Composition root of the pet: picks the store and mounts the view.
 *
 * Why: the one file that names a concrete store. Replacing the encrypted local
 * store with an account-backed one is a change to this file only.
 *
 * @see packages/site/src/lib/pet/README.md
 */

import type { PetStore } from "../../lib/pet/store";
import { browserEnv, encryptedLocalStore } from "../../lib/pet/store-local";
import { mountPet, type PetHooks } from "./view";

/** One store per document: a pet sent home and called back reads what it just saved. */
let store: PetStore | undefined;

/**
 * Mounts the pet into `root` with the encrypted local store; returns a disposer.
 *
 * Why: the loader's dynamic import lands here, so everything below is lazy.
 *
 * @see packages/specs/specs/11-pet.md § "Loading and budgets"
 */
export function startPet(root: HTMLElement, hooks: PetHooks): () => void {
	store ??= encryptedLocalStore(browserEnv());
	return mountPet(root, store, hooks);
}
