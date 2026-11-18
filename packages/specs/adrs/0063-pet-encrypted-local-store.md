# 0063 — The pet's encrypted local store behind `PetStore`

Status: accepted.

## Context

- Until accounts exist, the pet's state lives in the visitor's browser. The owner asked for "localStorage or some equivalent that is encrypted".
- Later an account-backed store must replace the local one without changes to the pet.
- The state is a toy's: a name, counters, 26 letter counts, a dock position. It contains no page text and nothing that identifies the visitor beyond a name they typed.

## Decision

**A seam.** `PetStore` (`src/lib/pet/store.ts`) has four methods: `load() → { state, status }`, `save(state)`, `clear()`, `subscribe(onChange)`. The view receives one from `src/components/pet/start.ts` and uses nothing else. `decodeState` (migrate → refuse newer → validate with the Zod schema) is shared by every store.

**The local store** (`src/lib/pet/store-local.ts`):

- **Key**: AES-GCM, 256 bit, from `crypto.subtle.generateKey` with `extractable = false` and usages `encrypt`, `decrypt`. The `CryptoKey` object is stored in IndexedDB (`utofme-pet` → `keys` → `k1`), which can hold it by structured clone; the raw key bytes never exist in script. It is created at the first save, inside one read-write transaction ("put unless present"), so two tabs that start together end with the same key.
- **Blob**: `localStorage["utofme:pet:state"] = "p1." + base64(iv ‖ ciphertext)`. The IV is 96 random bits, new for every save. The format tag is also the additional authenticated data, so a blob cannot be relabelled.
- **Plaintext**: `JSON.stringify(state)`, where `state.v` is the schema version.
- **Statuses**:
  - `empty`: no blob. No key is created.
  - `ok`: decrypted, migrated if older (and saved back), valid.
  - `reset`: the blob could not be decrypted, parsed, migrated or validated, or its key is gone. The blob is removed; the pet is new at the next touch.
  - `newer`: the format tag or the schema version is higher than this code knows (a stale tab after a deploy). The blob is left byte-identical and the store stops writing; the pet runs from memory.
  - `unavailable`: WebCrypto, IndexedDB or localStorage is missing or throws. Nothing is read or written; the pet runs from memory. Plaintext is never written as a fallback.
- **Tabs**: every change bumps `state.rev`. The `storage` event makes other tabs reload; a tab adopts the saved state when its `rev` is not lower. Last writer wins.
- **The home/out switch stays outside** (`localStorage["utofme:pet"]`, plain): the loader must read it synchronously before any pet code is downloaded, and it is a preference of the device, not of the pet.

## What this protects against, and what it does not

It protects against:

- reading or editing the saved state by opening the browser's storage inspector, or by reading the profile's localStorage files: the blob is ciphertext, and a changed byte fails authentication and resets the pet instead of being accepted;
- exporting the key from script: `exportKey` and `wrapKey` refuse a non-extractable key.

It does not protect against:

- **code running on this origin** (the site's own scripts, an injected script, a browser extension with page access, the visitor in the console): any of them can open the same IndexedDB, take the `CryptoKey` and call `decrypt` or `encrypt`, or simply read the state from the page. The key is unusable outside the browser profile, but usable by anything inside the origin;
- **someone with the whole browser profile**: the key is in the profile next to the blob;
- **replay**: an older blob written with the same key decrypts and validates, so the state can be rolled back by restoring it;
- **loss**: clearing site data, or the browser evicting IndexedDB but not localStorage (or the reverse), ends in `empty` or `reset`.

So this is tamper-evidence and casual-reading protection for a toy, which is what was asked for, plus the shape the account store needs. It is not secrecy, and nothing that needs secrecy should be added to `PetState` on the strength of it.

## Alternatives

- **Plain JSON in localStorage.** Rejected: the owner asked for encryption, and editing a counter in dev tools would be the first thing anyone tries.
- **A key derived from a constant in the bundle, or stored as raw bytes.** Rejected: readable by anyone who reads the bundle or the storage; no better than plain JSON.
- **An HMAC instead of encryption.** Rejected: it would give the same tamper-evidence, with the state readable; encryption costs the same code.
- **Blob in IndexedDB next to the key.** Rejected: localStorage gives the cross-tab `storage` event for free and a synchronous "is there a pet" check; both stores are cleared together by "clear site data".
- **A passphrase from the visitor (PBKDF2).** Rejected: a prompt for a toy, and a lost passphrase is a lost pet.
- **Falling back to plaintext when WebCrypto is missing.** Rejected: the stored format would depend on the browser, and the reader would have to accept plaintext forever.
- **`astro/zod` for validation.** Rejected: it re-exports the whole classic build (91 KB gzip for this schema, measured); `zod/mini` is 6.9 KB.

## Consequences

- An account store is one new `PetStore` and a one-line change in `start.ts`.
- A schema change is a version bump plus one `{ from, up }` migration; old blobs upgrade on load.
- A pet cannot be moved between browsers or devices until accounts exist (the key cannot leave the profile). That is intended.
- A stale tab cannot destroy a newer pet.
- `zod` is declared in `packages/site/package.json` (already in the lockfile through Astro).

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey
- https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable
- https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
- https://w3c.github.io/webcrypto/#cryptokey-interface (a `CryptoKey` can be stored by structured clone, e.g. in IndexedDB)
- https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event
- https://csrc.nist.gov/pubs/sp/800/38/d/final (GCM; 96-bit IVs)
- https://zod.dev/packages/mini
- packages/specs/specs/11-pet.md § "State and storage"
