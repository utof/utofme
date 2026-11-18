/**
 * AC1.8: the store seam, migration, and the encrypted local store's failure cases.
 *
 * Why the runtime's own WebCrypto: the store takes its `SubtleCrypto` from the
 * injected environment, so the tests run the real algorithm; IndexedDB (absent
 * in happy-dom) is a small in-memory stand-in with the calls `idbKeyVault` makes.
 *
 * @see packages/specs/specs/11-pet.md § "Encrypted local store"
 * @see packages/specs/adrs/0063-pet-encrypted-local-store.md
 */
import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { newPet, type PetState } from "../../src/lib/pet/schema";
import { reduce } from "../../src/lib/pet/state";
import { decodeState, MIGRATIONS, type Migration, memoryStore } from "../../src/lib/pet/store";
import {
	BLOB_KEY,
	type BlobStorage,
	encryptedLocalStore,
	idbKeyVault,
	type KeyDb,
	type KeyVault,
	type LocalEnv,
} from "../../src/lib/pet/store-local";
import { stateArb } from "./pet-arbitraries";

const { subtle } = globalThis.crypto;
const random = (bytes: Uint8Array<ArrayBuffer>): void => {
	globalThis.crypto.getRandomValues(bytes);
};
const PET: PetState = reduce(
	newPet(1_795_000_000_000, 99),
	{ type: "rename", name: "Zorp" },
	1_795_000_000_500,
);

function memoryStorage(): BlobStorage & { data: Map<string, string>; writes: number } {
	const data = new Map<string, string>();
	const box = {
		data,
		writes: 0,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => {
			box.writes++;
			data.set(k, v);
		},
		removeItem: (k: string) => {
			data.delete(k);
		},
	};
	return box;
}
function memoryVault(): KeyVault & { key: CryptoKey | undefined } {
	const vault: KeyVault & { key: CryptoKey | undefined } = {
		key: undefined,
		get: async () => vault.key,
		obtain: async (candidate) => {
			vault.key ??= candidate;
			return vault.key;
		},
	};
	return vault;
}
interface TestEnv {
	/** What the store is given. */
	readonly local: LocalEnv;
	readonly storage: ReturnType<typeof memoryStorage>;
	readonly vault: ReturnType<typeof memoryVault>;
}
function env(parts: Partial<LocalEnv> = {}): TestEnv {
	const storage = memoryStorage();
	const vault = memoryVault();
	return {
		local: { subtle, random, vault, storage, listen: () => () => {}, ...parts },
		storage,
		vault,
	};
}
/** Encrypts arbitrary JSON the way the store does, to plant blobs it did not write. */
async function plant(e: TestEnv, value: unknown, prefix = "p1."): Promise<void> {
	const store = encryptedLocalStore(e.local);
	await store.save(PET);
	const key = e.vault.key;
	if (!key) throw new Error("no key");
	const iv = new Uint8Array(12);
	random(iv);
	const cipher = new Uint8Array(
		await subtle.encrypt(
			{ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("utofme-pet:p1.") },
			key,
			new TextEncoder().encode(JSON.stringify(value)),
		),
	);
	e.storage.data.set(BLOB_KEY, prefix + Buffer.concat([iv, cipher]).toString("base64"));
}

describe("memoryStore", () => {
	it("round-trips, clears, and starts empty", async () => {
		const store = memoryStore();
		expect(await store.load()).toEqual({ state: null, status: "empty" });
		await store.save(PET);
		expect(await store.load()).toEqual({ state: PET, status: "ok" });
		await store.clear();
		expect((await store.load()).status).toBe("empty");
		expect(typeof store.subscribe(() => {})).toBe("function");
		expect((await memoryStore(PET).load()).state).toEqual(PET);
	});
});

describe("decodeState", () => {
	it("accepts the current version and rejects other shapes", () => {
		expect(decodeState(PET)).toEqual({ status: "ok", state: PET, migrated: false });
		for (const bad of [
			null,
			3,
			"x",
			[],
			{},
			{ v: "1" },
			{ v: 1 },
			{ ...PET, pats: -1 },
			{ v: -1 },
		]) {
			expect(decodeState(bad).status).toBe("reset");
		}
	});

	it("never touches a newer version", () => {
		expect(decodeState({ ...PET, v: 2, wings: true })).toEqual({
			status: "newer",
			state: null,
			migrated: false,
		});
	});

	it("ships no migrations yet: version 1 is the first", () => {
		expect(MIGRATIONS).toEqual([]);
	});

	it("upgrades an old shape through a registered step, and reports that it did", () => {
		// A pretend version 0: pats were called `strokes` and there was no dock.
		const steps: Migration[] = [
			{
				from: 0,
				up: ({ strokes, ...rest }) => ({
					...rest,
					pats: strokes,
					dock: { side: "left", y: 1 },
				}),
			},
		];
		const { dock: _dock, pats: _pats, ...old } = PET;
		const decoded = decodeState({ ...old, v: 0, strokes: 41 }, steps);
		expect(decoded.status).toBe("ok");
		expect(decoded.migrated).toBe(true);
		expect(decoded.state).toMatchObject({
			v: 1,
			pats: 41,
			dock: { side: "left", y: 1 },
			name: "Zorp",
		});
	});

	it("a step whose result does not fit the schema is a reset", () => {
		const steps: Migration[] = [{ from: 0, up: (raw) => ({ ...raw, pats: "many" }) }];
		expect(decodeState({ ...PET, v: 0 }, steps).status).toBe("reset");
	});

	it("an old version with no step, or a step that throws, is a reset", () => {
		expect(decodeState({ v: 0 }).status).toBe("reset");
		const throwing: Migration[] = [
			{
				from: 0,
				up: () => {
					throw new Error("bad data");
				},
			},
		];
		expect(decodeState({ v: 0 }, throwing).status).toBe("reset");
	});
});

describe("encryptedLocalStore", () => {
	it("starts empty and makes no key until the first save", async () => {
		const e = env();
		const store = encryptedLocalStore(e.local);
		expect(await store.load()).toEqual({ state: null, status: "empty" });
		expect(e.vault.key).toBeUndefined();
		expect(e.storage.writes).toBe(0);
	});

	test.prop([stateArb], { numRuns: 25 })("round-trips any state", async (state) => {
		const e = env();
		await encryptedLocalStore(e.local).save(state);
		expect(await encryptedLocalStore(e.local).load()).toEqual({ state, status: "ok" });
	});

	it("the blob is not readable: no name, no JSON, a fresh IV each save", async () => {
		const e = env();
		const store = encryptedLocalStore(e.local);
		await store.save(PET);
		const first = e.storage.data.get(BLOB_KEY) ?? "";
		await store.save(PET);
		const second = e.storage.data.get(BLOB_KEY) ?? "";
		expect(first.startsWith("p1.")).toBe(true);
		expect(first).not.toContain("Zorp");
		expect(Buffer.from(first.slice(3), "base64").toString("latin1")).not.toContain("Zorp");
		expect(second).not.toBe(first);
		expect(e.vault.key?.extractable).toBe(false);
		expect(e.vault.key?.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
	});

	it("the key cannot be exported", async () => {
		const e = env();
		await encryptedLocalStore(e.local).save(PET);
		const key = e.vault.key;
		if (!key) throw new Error("no key");
		await expect(subtle.exportKey("raw", key)).rejects.toThrow();
	});

	it.each([
		[
			"a flipped byte",
			(blob: string) => {
				const bytes = Buffer.from(blob.slice(3), "base64");
				bytes[20] = (bytes[20] ?? 0) ^ 1;
				return `p1.${bytes.toString("base64")}`;
			},
		],
		["a truncated blob", (blob: string) => blob.slice(0, 30)],
		["only an IV", () => `p1.${Buffer.alloc(12).toString("base64")}`],
		["not base64", () => "p1.%%%not-base64%%%"],
		["plain JSON", () => JSON.stringify(PET)],
		["an empty string", () => ""],
		["an unknown tag", () => "q7.AAAA"],
	])("%s is a clean reset: blob removed, pet new", async (_label, tamper) => {
		const e = env();
		await encryptedLocalStore(e.local).save(PET);
		e.storage.data.set(BLOB_KEY, tamper(e.storage.data.get(BLOB_KEY) ?? ""));
		const store = encryptedLocalStore(e.local);
		expect(await store.load()).toEqual({ state: null, status: "reset" });
		expect(e.storage.data.has(BLOB_KEY)).toBe(false);
		expect((await store.load()).status).toBe("empty");
		await store.save(PET);
		expect((await encryptedLocalStore(e.local).load()).state).toEqual(PET);
	});

	it("a blob whose key is gone, or was made with another key, is a reset", async () => {
		const e = env();
		await encryptedLocalStore(e.local).save(PET);
		e.vault.key = undefined;
		expect((await encryptedLocalStore(e.local).load()).status).toBe("reset");

		const other = env();
		await encryptedLocalStore(other.local).save(PET);
		const mine = env();
		await encryptedLocalStore(mine.local).save(PET);
		mine.storage.data.set(BLOB_KEY, other.storage.data.get(BLOB_KEY) ?? "");
		expect((await encryptedLocalStore(mine.local).load()).status).toBe("reset");
	});

	it("valid ciphertext of the wrong shape is a reset", async () => {
		for (const value of [{ hello: "world" }, { ...PET, pats: -5 }, [1, 2, 3], "text", { v: 0 }]) {
			const e = env();
			await plant(e, value);
			expect((await encryptedLocalStore(e.local).load()).status).toBe("reset");
			expect(e.storage.data.has(BLOB_KEY)).toBe(false);
		}
	});

	it("a newer schema or format is left byte-identical and never overwritten", async () => {
		const bySchema = env();
		await plant(bySchema, { ...PET, v: 2, wings: true });
		const byFormat = env();
		await encryptedLocalStore(byFormat.local).save(PET);
		byFormat.storage.data.set(BLOB_KEY, "p2.c29tZXRoaW5nIG5ld2Vy");
		for (const e of [bySchema, byFormat]) {
			const before = e.storage.data.get(BLOB_KEY);
			const store = encryptedLocalStore(e.local);
			expect(await store.load()).toEqual({ state: null, status: "newer" });
			await store.save(PET);
			await store.clear();
			expect(e.storage.data.get(BLOB_KEY)).toBe(before);
		}
	});

	it("without WebCrypto, IndexedDB or storage it is unavailable and writes nothing", async () => {
		for (const missing of [{ subtle: undefined }, { vault: undefined }, { random: undefined }]) {
			const e = env(missing);
			const store = encryptedLocalStore(e.local);
			expect(await store.load()).toEqual({ state: null, status: "unavailable" });
			await store.save(PET);
			expect(e.storage.writes).toBe(0);
		}
		const noStorage = encryptedLocalStore(env({ storage: null }).local);
		expect((await noStorage.load()).status).toBe("unavailable");
		await expect(noStorage.save(PET)).resolves.toBeUndefined();
		await expect(noStorage.clear()).resolves.toBeUndefined();
	});

	it("storage or a vault that throws is unavailable, and the blob is kept", async () => {
		const e = env();
		await encryptedLocalStore(e.local).save(PET);
		const blob = e.storage.data.get(BLOB_KEY);
		const failingVault: KeyVault = {
			get: async () => {
				throw new Error("IndexedDB blocked");
			},
			obtain: async () => {
				throw new Error("IndexedDB blocked");
			},
		};
		const store = encryptedLocalStore({ ...e.local, vault: failingVault });
		expect((await store.load()).status).toBe("unavailable");
		await expect(store.save(PET)).resolves.toBeUndefined();
		expect(e.storage.data.get(BLOB_KEY)).toBe(blob);
		const throwing: BlobStorage = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
			removeItem: () => {
				throw new Error("blocked");
			},
		};
		expect((await encryptedLocalStore(env({ storage: throwing }).local).load()).status).toBe(
			"unavailable",
		);
	});

	it("saves land in order; clear removes the blob and keeps the key", async () => {
		const e = env();
		const store = encryptedLocalStore(e.local);
		const later = reduce(PET, { type: "pat", count: 5 }, 1_795_000_001_000);
		void store.save(PET);
		await store.save(later);
		expect((await encryptedLocalStore(e.local).load()).state).toEqual(later);
		const key = e.vault.key;
		await store.clear();
		expect(e.storage.data.has(BLOB_KEY)).toBe(false);
		expect(e.vault.key).toBe(key);
	});

	it("a load waits for a save that is still being encrypted", async () => {
		const e = env();
		const store = encryptedLocalStore(e.local);
		void store.save(PET);
		expect(await store.load()).toEqual({ state: PET, status: "ok" });
	});

	it("two tabs share one key and see each other's saves", async () => {
		const shared = env();
		const listeners: (() => void)[] = [];
		const tab = (): LocalEnv => ({
			...shared.local,
			listen: (fn) => {
				listeners.push(fn);
				return () => listeners.splice(listeners.indexOf(fn), 1);
			},
		});
		const a = encryptedLocalStore(tab());
		const b = encryptedLocalStore(tab());
		let heard = 0;
		const stop = b.subscribe(() => heard++);
		await a.save(PET);
		for (const fn of [...listeners]) fn();
		expect(heard).toBe(1);
		expect((await b.load()).state).toEqual(PET);
		const patted = reduce(PET, { type: "pat", count: 1 }, 1_795_000_002_000);
		await b.save(patted);
		expect((await a.load()).state).toEqual(patted);
		stop();
		expect(listeners).toHaveLength(0);
	});
});

/** The few IndexedDB calls `idbKeyVault` makes, over a Map. Requests succeed on the next microtask. */
function fakeIndexedDb(): KeyDb {
	const stores = new Map<string, Map<string, unknown>>();
	interface Request<T> {
		result: T;
		error: null;
		onsuccess: (() => void) | null;
		onerror: (() => void) | null;
		onupgradeneeded: (() => void) | null;
	}
	const request = <T>(result: T, upgrade = false): Request<T> => {
		const req: Request<T> = {
			result,
			error: null,
			onsuccess: null,
			onerror: null,
			onupgradeneeded: null,
		};
		queueMicrotask(() => {
			if (upgrade) req.onupgradeneeded?.();
			req.onsuccess?.();
		});
		return req;
	};
	const db = {
		createObjectStore: (name: string) => {
			stores.set(name, stores.get(name) ?? new Map());
		},
		transaction: (name: string) => ({
			objectStore: () => ({
				get: (key: string) => request(stores.get(name)?.get(key)),
				put: (value: unknown, key: string) => request(stores.get(name)?.set(key, value)),
			}),
		}),
		close: () => {},
	};
	return { open: () => request(db, stores.size === 0) };
}

describe("idbKeyVault", () => {
	it("keeps the first key: a second tab's candidate loses", async () => {
		const factory = fakeIndexedDb();
		const make = () =>
			subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
		const vaultA = idbKeyVault(factory);
		const vaultB = idbKeyVault(factory);
		expect(await vaultA.get()).toBeUndefined();
		const first = await make();
		expect(await vaultA.obtain(first)).toBe(first);
		expect(await vaultB.obtain(await make())).toBe(first);
		expect(await vaultB.get()).toBe(first);
	});

	it("works as the store's vault end to end", async () => {
		const factory = fakeIndexedDb();
		const storage = memoryStorage();
		const make = (): LocalEnv => ({
			subtle,
			random,
			vault: idbKeyVault(factory),
			storage,
			listen: () => () => {},
		});
		await encryptedLocalStore(make()).save(PET);
		expect(await encryptedLocalStore(make()).load()).toEqual({ state: PET, status: "ok" });
	});
});
