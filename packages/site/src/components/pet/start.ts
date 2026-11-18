/**
 * Composition root of the pet: picks the store and mounts the view.
 *
 * Why: the one file that names a concrete store. Replacing the encrypted local
 * store with an account-backed one is a change to this file only.
 *
 * @see packages/site/src/lib/pet/README.md
 */
import { browserEnv, encryptedLocalStore } from "../../lib/pet/store-local";
import { mountPet, type PetHooks } from "./view";

/**
 * Mounts the pet into `root` with the encrypted local store; returns a disposer.
 *
 * Why: the loader's dynamic import lands here, so everything below is lazy.
 *
 * @see packages/specs/specs/11-pet.md § "Loading and budgets"
 */
export function startPet(root: HTMLElement, hooks: PetHooks): () => void {
	return mountPet(root, encryptedLocalStore(browserEnv()), hooks);
}
