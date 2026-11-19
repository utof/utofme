# The site pet

A small alien ("Nib", a ringling) that lives on the edge of every page. Design and rules: `packages/specs/specs/11-pet.md`, ADR 0062 (design rules), ADR 0063 (the encrypted local store).

| Layer | File | Holds |
| --- | --- | --- |
| Saved state | `schema.ts` | the versioned Zod schema, `newPet`, `parsePetState` |
| Rules | `state.ts` | `reduce(state, action, now)`; belly, bond, growth, colour as derived functions |
| Mood | `mood.ts` | the visit's `Session`, `moodAt`, the events that wake the pet |
| Gestures | `gesture.ts` | pat / poke / carry from pointer positions |
| Food | `letters.ts` | which letters a bite takes, the alphabet, the title nibble |
| Resting place | `dock.ts` | out or tucked, on which edge, at what height |
| Storage seam | `store.ts` | `PetStore`, `decodeState`, `MIGRATIONS`, `memoryStore` |
| Local storage | `store-local.ts` | AES-GCM blob in localStorage, non-extractable key in IndexedDB |
| Look | `creature.ts` | the mesh and one pose per mood |
| View | `src/components/pet/` | `PetMount.astro` (mount + loader), `boot.ts` (switch), `start.ts` (picks the store), `view.ts` (DOM, input, drawing), `pet.css`, `sound.ts` |

Everything in this folder is pure: no DOM, no clock, no storage (the two store files receive the browser's parts as arguments). The view is the only code that touches the page.

## Change the creature

Edit `creature.ts`, and only that file:

- `buildCreature(mesh, pose)` appends triangles to a mesh with the primitives of `lib/home/objects/mesh.ts` (`box`, `cone`, `cyl`, `ico`, `ring`, `torus`). Keep it within about ±1.1 units, face towards −z, ground at y = −0.86.
- `poseFor(mood, input)` returns the pose of each mood. Every mood must look different without colour (eyes, mouth, feelers, stance).
- `CANVAS_PX` is the canvas buffer; `MOUTH_AT` is where flying letters land.
- If the head is not the top 46 % of the box, change `GESTURE.headShare` in `gesture.ts`.

`tests/unit/pet-creature.test.ts` checks every pose automatically. To look at it, render a sheet of all moods (a page that calls `buildCreature` + `drawObject` per mood) before trying it in the site.

## Add an interaction

1. If it changes what is saved: add a member to `PetAction` and a case to `reduce` in `state.ts`. No case may lower a counter or depend on how long the visitor was away (the property tests in `tests/unit/pet-state.test.ts` will say so).
2. If it changes how the pet feels: add a member to `SessionEvent` and a case to `onEvent` in `mood.ts`. Only deliberate acts may wake a sleeping pet.
3. If it needs a new pose: add the mood to `Mood`, a row to `moodAt`'s precedence and a pose to `poseFor`.
4. Wire the browser event in `view.ts`: translate it into the action and the event, nothing more.
5. Check it against the rules in spec 11 § "Not annoying": never by itself, never over text, silent unless sound is on, still when motion is paused.

A new saved field means a new schema version: bump `STATE_VERSION`, add the field to `PetStateSchema`, and add `{ from: <old>, up }` to `MIGRATIONS` in `store.ts`.

## Swap the store

Implement `PetStore` (`load`, `save`, `clear`, `subscribe`) and return it from `src/components/pet/start.ts` instead of `encryptedLocalStore(browserEnv())`. Use `decodeState` on whatever comes back, so migration and validation stay the same. The view does not change.

The home/out switch is not in the store: it is `localStorage["utofme:pet"]`, read by the loader before any pet code loads (`resolveSwitch` in `lib/flags.ts`).

## Hooks other code relies on

| Hook | Used by |
| --- | --- |
| `#pet-root`, `[data-pet-door]` | the loader (`boot.ts`), e2e |
| `#pet-root[data-ready][data-mood][data-pats][data-letters][data-visible]` | e2e |
| `[data-pet][data-dock][data-side]`, `.pet-btn`, `[data-pet-about]`, `[data-pet-home]`, `[data-pet-feed]`, `[data-pet-move]` | e2e |
| `?pet=1` / `?pet=0` | visitors, e2e (automated browsers get no pet without `?pet=1`) |
