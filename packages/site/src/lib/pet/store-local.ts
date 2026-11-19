/**
 * The pet's local store: state encrypted with AES-GCM under a non-extractable
 * key that lives in IndexedDB; the ciphertext lives in localStorage.
 *
 * Why: the saved blob cannot be read or edited from the storage inspector or the
 * profile's files, and script cannot export the key. It is not secrecy from code
 * running on this origin (which can ask the browser to decrypt); ADR 0063 says
 * exactly what this buys. Everything the browser provides is injected through
 * {@link LocalEnv}, so each failure (no WebCrypto, no IndexedDB, a tampered
 * blob) is a unit test.
 *
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
 */
import type { PetState } from "./schema";
import { decodeState, type LoadResult, type PetStore } from "./store";

/**
 * localStorage key of the encrypted blob.
 *
 * Why: exported for the `storage` event filter and the tests.
 *
 * @see packages/specs/specs/11-pet.md § "Encrypted local store"
 */
export const BLOB_KEY = "utofme:pet:state";

/** Format tag: `p<n>.` + base64(iv ‖ ciphertext). Also bound into the ciphertext as additional data. */
const FORMAT = 1;
const PREFIX = `p${FORMAT}.`;
const IV_BYTES = 12;
const AAD = new TextEncoder().encode(`utofme-pet:${PREFIX}`);
const DB_NAME = "utofme-pet";
const DB_STORE = "keys";
const DB_KEY = "k1";

/**
 * Where the encryption key is kept.
 *
 * Why: two methods over IndexedDB, small enough to fake in a test.
 *
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 */
export interface KeyVault {
	/** The stored key, if any. */
	get(): Promise<CryptoKey | undefined>;
	/** Stores `candidate` unless a key is already there; returns the key that is stored. */
	obtain(candidate: CryptoKey): Promise<CryptoKey>;
}

/**
 * The slice of `Storage` the store uses.
 *
 * Why: structural, so tests pass a plain object.
 *
 * @see packages/site/tests/unit/pet-store.test.ts
 */
export interface BlobStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Everything the store needs from the browser; any part may be missing.
 *
 * Why: a missing part makes the store `unavailable` instead of throwing.
 *
 * @see packages/specs/specs/11-pet.md § "Encrypted local store"
 */
export interface LocalEnv {
	readonly subtle: SubtleCrypto | undefined;
	/** Fills the array with random bytes (`crypto.getRandomValues`). */
	readonly random: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
	readonly vault: KeyVault | undefined;
	readonly storage: BlobStorage | null;
	/** Subscribes to changes of {@link BLOB_KEY} made by other tabs. */
	readonly listen: (onChange: () => void) => () => void;
}

type KeyDbHandler = ((event: never) => unknown) | null;

interface KeyDbRequest<T> {
	readonly result: T;
	readonly error: unknown;
	onsuccess: KeyDbHandler;
	onerror: KeyDbHandler;
}

interface KeyDbStore {
	get(key: string): KeyDbRequest<unknown>;
	put(value: unknown, key: string): KeyDbRequest<unknown>;
}

interface KeyDbDatabase {
	createObjectStore(name: string): unknown;
	transaction(
		name: string,
		mode: "readonly" | "readwrite",
	): { objectStore(name: string): KeyDbStore };
	close(): void;
}

/**
 * The slice of `IDBFactory` the vault uses.
 *
 * Why: structural (the real `indexedDB` satisfies it), so a unit test can pass
 * a small in-memory stand-in; happy-dom has no IndexedDB.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBFactory/open
 */
export interface KeyDb {
	open(
		name: string,
		version: number,
	): KeyDbRequest<KeyDbDatabase> & { onupgradeneeded: KeyDbHandler };
}

function request<T>(req: KeyDbRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
	});
}

/**
 * A {@link KeyVault} over IndexedDB: database `utofme-pet`, object store `keys`.
 *
 * Why: IndexedDB can hold a `CryptoKey` object as it is (structured clone), which
 * is what lets the key stay non-extractable; localStorage only holds strings.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey
 */
export function idbKeyVault(factory: KeyDb): KeyVault {
	const open = (): Promise<KeyDbDatabase> => {
		const req = factory.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(DB_STORE);
		};
		return request(req);
	};
	const isKey = (value: unknown): value is CryptoKey =>
		typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
	return {
		async get() {
			const db = await open();
			try {
				const found = await request(
					db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY),
				);
				return isKey(found) ? found : undefined;
			} finally {
				db.close();
			}
		},
		// Why one transaction: two tabs that start together must end with the same key.
		async obtain(candidate) {
			const db = await open();
			try {
				const store = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE);
				const found = await request(store.get(DB_KEY));
				if (isKey(found)) return found;
				await request(store.put(candidate, DB_KEY));
				return candidate;
			} finally {
				db.close();
			}
		},
	};
}

/**
 * The real browser's {@link LocalEnv}; parts that are missing or throw come back undefined.
 *
 * Why: merely touching `localStorage` or `indexedDB` can throw in locked-down contexts.
 *
 * @see packages/specs/specs/11-pet.md § "Encrypted local store"
 */
export function browserEnv(): LocalEnv {
	let storage: BlobStorage | null = null;
	let vault: KeyVault | undefined;
	try {
		storage = window.localStorage;
	} catch {
		storage = null;
	}
	try {
		if (typeof indexedDB !== "undefined") vault = idbKeyVault(indexedDB);
	} catch {
		vault = undefined;
	}
	const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
	return {
		subtle,
		random: typeof crypto !== "undefined" ? (bytes) => crypto.getRandomValues(bytes) : undefined,
		vault,
		storage,
		listen: (onChange) => {
			const onStorage = (event: StorageEvent): void => {
				if (event.key === BLOB_KEY || event.key === null) onChange();
			};
			window.addEventListener("storage", onStorage);
			return () => window.removeEventListener("storage", onStorage);
		},
	};
}

function toBase64(bytes: Uint8Array): string {
	let text = "";
	for (const byte of bytes) text += String.fromCharCode(byte);
	return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
	try {
		const raw = atob(text);
		const bytes = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/**
 * The encrypted local {@link PetStore}.
 *
 * - nothing saved → `empty` (no key is made until the first save);
 * - a blob that cannot be decrypted, parsed or validated → removed, `reset`;
 * - a blob of a newer format or schema → `newer`: kept as it is, and this store stops writing;
 * - no WebCrypto, IndexedDB or localStorage → `unavailable`: nothing is read or written.
 *
 * Why: plaintext is never written as a fallback; a pet that cannot be saved safely is not saved.
 *
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 */
export function encryptedLocalStore(env: LocalEnv): PetStore {
	const { subtle, random, vault, storage } = env;
	let key: CryptoKey | undefined;
	let frozen = false;
	let queue: Promise<void> = Promise.resolve();

	const algorithm = (iv: Uint8Array<ArrayBuffer>): AesGcmParams => ({
		name: "AES-GCM",
		iv,
		additionalData: AAD,
	});

	const drop = (): LoadResult => {
		try {
			storage?.removeItem(BLOB_KEY);
		} catch {
			// The blob stays; the next load reaches the same verdict.
		}
		return { state: null, status: "reset" };
	};

	const write = async (state: PetState): Promise<void> => {
		if (!subtle || !random || !vault || !storage || frozen) return;
		if (!key) {
			key =
				(await vault.get()) ??
				(await vault.obtain(
					await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
				));
		}
		const iv = new Uint8Array(IV_BYTES);
		random(iv);
		const data = new TextEncoder().encode(JSON.stringify(state));
		const cipher = new Uint8Array(await subtle.encrypt(algorithm(iv), key, data));
		const packed = new Uint8Array(IV_BYTES + cipher.length);
		packed.set(iv);
		packed.set(cipher, IV_BYTES);
		storage.setItem(BLOB_KEY, PREFIX + toBase64(packed));
	};

	const save = (state: PetState): Promise<void> => {
		// Why a queue: saves are async; they must land in the order they were asked for.
		queue = queue.then(() => write(state)).catch(() => {});
		return queue;
	};

	return {
		async load() {
			if (!subtle || !random || !vault || !storage) return { state: null, status: "unavailable" };
			// Why: a save still being encrypted must land before the blob is read back.
			await queue;
			let blob: string | null;
			try {
				blob = storage.getItem(BLOB_KEY);
				if (blob !== null) key = await vault.get();
			} catch {
				return { state: null, status: "unavailable" };
			}
			if (blob === null) return { state: null, status: "empty" };
			const tag = /^p(\d+)\./.exec(blob);
			if (tag && Number(tag[1]) > FORMAT) {
				frozen = true;
				return { state: null, status: "newer" };
			}
			const packed = blob.startsWith(PREFIX) ? fromBase64(blob.slice(PREFIX.length)) : null;
			if (!key || !packed || packed.length <= IV_BYTES) return drop();
			let raw: unknown;
			try {
				const plain = await subtle.decrypt(
					algorithm(packed.slice(0, IV_BYTES)),
					key,
					packed.slice(IV_BYTES),
				);
				raw = JSON.parse(new TextDecoder().decode(plain));
			} catch {
				return drop();
			}
			const decoded = decodeState(raw);
			if (decoded.status === "newer") {
				frozen = true;
				return { state: null, status: "newer" };
			}
			if (!decoded.state) return drop();
			if (decoded.migrated) await save(decoded.state);
			return { state: decoded.state, status: "ok" };
		},
		save,
		async clear() {
			if (frozen) return;
			try {
				storage?.removeItem(BLOB_KEY);
			} catch {
				// Nothing to clear in a browser that cannot store.
			}
		},
		subscribe: (onChange) => env.listen(onChange),
	};
}
