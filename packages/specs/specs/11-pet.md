# Phase 11: a site pet

## Goal

Every visitor gets one small alien that lives on the edge of the screen, on every page. It can be patted on the head, fed letters from the page, picked up and moved, and it slowly records what it has eaten. It is asleep and perfectly still until the visitor touches it, it can be sent home with one control, and it costs visitors who never touch it one tiny loader.

Later, accounts will give people their own pets on a server. This phase keeps the pet on the device, encrypted at rest, behind a store interface that an account-backed store can replace.

## Context / invariants

- **Branch** `feat/pet`, cut from the catalogue-home branch and merged after it. Shared files are touched as little as possible: one mount line in `_BaseLayout.astro`, one additive export in `lib/flags.ts`, one `size-limit` entry, one `zod` line in `package.json`. Nothing under `components/home/**` or `lib/home/**` changes; the pet imports `lib/home/objects/{mesh,render}`.
- **Look**: the catalogue's (ADR 0061): ink `#24232a`, paper `#f3efe2`, hard 3 px frames, stepped animation, a chunky low-poly object on a pixelated canvas. The pet is drawn by the same software renderer as the home objects (`shadeMesh`).
- **Phase 0–10 invariants carry over**: every lefthook step green, TSDoc rule on every export, type coverage 100 %, zero Axe violations, `<ClientRouter />` site-wide, the "Pause motion" state (`lib/motion.ts`, follows `prefers-reduced-motion`), sound only when the sound toggle is on (`localStorage["utofme:sound"] === "on"`).
- **Dependency**: `zod` is declared in `packages/site/package.json` (`^4.6.6`, the version Astro already installs; no new package enters the lockfile tree) so the pet can import the tree-shakeable `zod/mini`. `astro/zod` re-exports the whole classic build: 91 KB gzip for a seven-field schema (measured), against 6.9 KB for `zod/mini`. Spec 10's "no Zod on the client" was about article islands; here the schema guards a blob that the visitor's browser hands back, so it must run on the client.
- **Privacy**: the pet stores counts and a name, never the words it was fed. Nothing is stored until the visitor first touches the pet.

## Non-goals

- **No accounts, no server, no sync.** Only the `PetStore` seam.
- **No death, illness, hunger damage, streaks, daily rewards or any stat that falls because the visitor was away.**
- **No notifications, badges, prompts, tooltips that open by themselves, or onboarding.**
- **No change to page text**: no wrapping letters in spans, no `contenteditable`, no CSS on the page's own text.
- **No new visual-regression baselines** (they cannot be rendered locally).
- **No dark-theme work.**

## The creature

**Nib**, a *ringling*: a small planet that grew a face. The visitor can rename it (1–16 characters); nothing ever asks them to.

- **Body**: one icosahedron ball. Its top is a clear dome: the head top, where patting happens.
- **Ring**: a flat ring around its waist, tilted, like a planet's. It wobbles when the pet is happy, tips when it is held, and lies level when it sleeps. This is what makes it an alien and not a blob.
- **Feelers**: two short stalks with ball tips, at the sides of the crown (the crown itself stays free). They perk up when it notices something, splay flat under a pat and droop in sleep.
- **Eyes**: two, on the front: a pale eye with a dark pupil. The pupils move (gaze). Lids are body-coloured slabs: closed for sleep, half for sleepy, a low flat line for a happy squint.
- **Mouth**: a dark slot under the eyes; it opens to eat.
- **Feet**: two small blocks, so it stands on the ground shadow.

Built only from `box`, `cone`, `cyl`, `ico`, `ring` (`lib/home/objects/mesh.ts`) in one file, `lib/pet/creature.ts`: `buildCreature(mesh, pose)`. `pose` is plain numbers (gaze x/y, lids, mouth, squash, feeler angle, ring tilt, scale, body colour), so the creature is data plus one function, and swapping the creature is a one-file change.

**What changes with its life** (all derived, all harmless):

- **Colour** follows its diet: the share of vowels among recent letters slides the body along a fixed ramp, teal (consonants) → mint (default, ordinary prose) → gold → pink (vowels).
- **Size** grows with the total number of letters eaten, from 84 % to 100 % of full size, fast at first and never past the cap.

**States** (one pose each; `lib/pet/mood.ts`, highest wins):

| State | When | Reads as |
| --- | --- | --- |
| `held` | being carried | wide eyes, ring tipped, feet dangling |
| `eating` | a bite is in progress | mouth chomps once per letter |
| `patted` | a pat in the last 0.6 s | squashed, eyes squeezed shut, feelers flat |
| `full` | refused a bite in the last 1.5 s | mouth shut, pupils aside, a slow head shake |
| `happy` | 2.5 s after a pat or a bite (5 s for a favourite letter or after 3 days away) | squint, ring wobble, small hop |
| `curious` | awake, and the pointer is within 240 px, or text is selected | pupils follow, feelers up; mouth ajar if text is selected |
| `idle` | awake | blinks, breathes |
| `asleep` | everything else | eyes closed, feelers down, ring level, **no animation at all** |

There is no sulking state. Being ignored makes it sleep; that is the whole consequence.

## Interactions

### Wake

The pet is **asleep on every full page load**, and the animation loop does not run while it sleeps. Only a deliberate act wakes it: a click, tap or key press on it, or something dragged over it. Hovering never wakes it; selecting text never wakes it. Once awake it stays awake while the visitor keeps interacting with it or moves the pointer near it, and dozes off 45 s after the last such event (20 s at night, `hourToTod`), or at once when the tab is hidden.

*Why asleep by default:* a reader who came for the article sees a still figure in the corner and nothing else, on the first visit and the hundredth. The pet has to be invited.

### Pat

- **Hit area**: the head zone, the top 46 % of the pet's box plus 8 px above it. The rest is the body zone.
- **Gesture** (`lib/pet/gesture.ts`, pure): pressing the primary button (or a finger, or a pen) in the head zone is one pat. While the press is held, every further 18 px of pointer travel is another pat, so stroking back and forth pats repeatedly. A quick click on the head is therefore one pat. A press in the body zone that is released within 8 px is a **poke** (it blinks and looks at you; not a pat). A press in the body zone that moves more than 8 px, or a press in the head zone that leaves the pet's box by more than 24 px, is a **carry**, and yields no further pats.
- **Feedback**: each pat squashes the body for one step, shuts its eyes and flattens the feelers; every fourth pat of a stroke sends a pixel heart up from its head. With the sound toggle on, a pat plays a 0.25 s low purr (generated, no file), at most one every 0.3 s.
- **Touch**: the same pointer events; the pet has `touch-action: none` only while it is fully out, so a stroke does not scroll the page.
- **Keyboard**: the pet is a `<button>`; Enter or Space is one pat.
- Pats are counted. They raise **bond**, `1 − exp(−(pats + 2·meals) / 60)`, shown as three hearts in the panel. Bond never falls.

### Feed

The pet eats letters from the page. The page's own text is never touched: only copies fly.

- **With a selection**: select text anywhere on the page, then click or tap the pet, or drag the selection onto it (desktop), or press **Feed** in its panel. It eats the first **8** letters (`\p{L}`) of the selection. While text is selected and the pet is awake, it looks at the selection with its mouth ajar; that glance is the only hint. The press that feeds it is `preventDefault`ed, so the selection stays and can still be copied.
- **Without a selection**: **Feed** in the panel gives it one letter of the page's `<h1>`: the first letter it has not collected yet, else the next one in turn. This is the keyboard and phone path.
- **What flies**: for each letter, an `aria-hidden` `<span>` inside the pet's own overlay (outside `<main>`, `pointer-events: none`), in the font and colour of the source text, moving in steps from the source to the mouth. It is removed on arrival. Under paused motion nothing flies: the pet shows the eating pose for a moment.
- **Belly**: 24 letters fill it. It digests one letter every 15 minutes (6 h from full to empty), computed from timestamps. A bite takes only what fits; when nothing fits the pet refuses (`full`). An empty belly has no effect at all.
- **Alphabet**: the panel shows 26 cells, A–Z, lit once that letter has been eaten (count kept). Letters outside a–z are eaten and counted in one "other" bucket. A first-time letter gets a longer happy reaction.
- **Favourite letter**: one letter of 26, fixed by the pet's seed. The panel shows `?` until the pet has eaten it once; eating it is a 5 s `happy`.
- **Diet → colour, total → size**: see "The creature".

### Also in

- **Eyes** follow the pointer when it is within 240 px and the pet is awake.
- **Carry**: drag it by the body; on release it snaps to the nearer side edge at that height. The panel has "Move to the other side" for the keyboard.
- **Sleep** when ignored, when the tab is hidden, sooner at night.
- **Days known**: the panel says "Met on 12 Nov 2026 · 9 days together". A day counts when the visitor interacts with the pet on it. No streak, nothing resets.

### Later (cut from this phase)

- Reactions to the page it is on (the hero object, a figure, the garden graph).
- Rare events (a shooting star, a hiccup, a second ring at 26/26).
- Tastes per project (words from different works feeding different traits), a disliked letter.
- A command-palette entry ("Call the pet" / "Send it home").
- "Start over" (forget this pet) in the panel.
- More creatures to choose from; pets visiting each other (needs accounts).

## Not annoying: the rules

These are requirements, each with a test.

1. **Still until invited.** Asleep on load; no animation frame is requested while asleep, hidden, or when the tab is hidden.
2. **It never covers text or controls.** At rest the pet is either fully **out** (only where the space under it is empty) or **tucked**: slid past the screen edge so that only a sliver that fits the page's gutter shows (a feeler and one eye, peeking). `lib/pet/dock.ts` picks the widest of {out, 40, 28, 16, 10 px} whose box holds no text and no control (sampled with `elementsFromPoint` on a 12 px grid).
3. **It only retreats on its own.** After a scroll or a resize it may tuck further. It comes out only when the visitor clicks, taps or focuses it. Coming out over content is the visitor's act; it tucks back 4 s after they stop, at once on scroll, Esc (wherever the focus is) or a click elsewhere.
4. **It never takes focus, opens anything, or speaks first.** No dialog, no prompt, no tooltip without a pointer on the pet. One `role="status"` line reports the result of a control the visitor just used (a bite: "Nib ate N, I, B. Alphabet 7 of 26."; a pat: "Nib purrs.", at most once per 3 s). Nothing else is announced: mood changes, sleep and waking are silent.
5. **No guilt.** No stat falls with absence except the belly, and an empty belly changes nothing. The pet cannot die, leave, get sick or look sad. After three or more days away the first wake is a longer `happy`.
6. **No sound** unless the site's sound toggle is on.
7. **No motion when motion is paused** (`isMotionPaused()`, which follows `prefers-reduced-motion` unless the visitor chose otherwise). The pet is then a still figure whose pose changes with its state: a pat swaps to the patted pose and back, nothing flies, tucking is instant.
8. **One control sends it home, one calls it back.** Next to the pet, when the visitor is on it: a **home** button ("Send Nib home"). At home, all that remains is a 12 × 30 px static tab on the same edge ("Call the pet back"). The choice persists in `localStorage["utofme:pet"]` (`"0"` home, `"1"` out) and is set by `?pet=0` / `?pet=1` through `resolveSwitch` in `lib/flags.ts`. A pet at home loads no pet code.
9. **Small screens** (≤ 600 px): the pet is 72 px instead of 96 px, and because a phone layout has no free margin it is tucked at rest (rule 2). **Print**: hidden.
10. **Automated browsers get no pet by default** (`navigator.webdriver`): crawlers, link previews and the existing visual baselines see the page as it was. `?pet=1` or a stored choice overrides this.

**First visit**: visible, asleep, in the bottom-right corner (out where there is room, peeking where there is not). Not hidden-until-asked, because then nobody would find it; not awake, because movement nobody asked for is the thing people hate about page mascots.

## Accessibility

- The pet canvas is `aria-hidden`. Its controls are real buttons in one container, an `<aside aria-label="Site pet">` (a landmark, so nothing sits outside the page's regions) at the **end of `<body>`**, after the footer, so the pet is the last tab stop, never between the reader and the content: the pet button (`aria-label="Nib, your pet. Pat"`), **About** (opens the panel, `aria-expanded`), **Send home**.
- The panel is a plain disclosure, not a dialog: no focus trap, Esc closes it and returns focus to **About**. It holds the name field (labelled), bond, belly, the alphabet (a list with a text summary "7 of 26 letters"), **Feed**, **Move to the other side**.
- Sending the pet home moves focus to the "Call the pet back" tab; calling it back moves focus to the pet button.
- Targets are at least 24 × 24 px (WCAG 2.5.8); the pet itself is 72–96 px.
- Focus rings use the site's `--shadow-focus`. Text in the panel meets AA on paper.
- Axe is clean on `/` and `/works/tactical-arena/` with the pet out and the panel open.

## State and storage

### State (`lib/pet/schema.ts`, Zod mini, strict)

```ts
PetState = {
  v: 1,                       // schema version
  rev: int ≥ 0,               // bumps on every save; newer wins between tabs
  name: string (1–16),
  seed: int 0 … 2³¹−1,        // favourite letter
  born: ms,                   // first touch
  lastSeen: ms,               // last interaction; never decreases
  pats: int ≥ 0,
  meals: int ≥ 0,
  letters: int ≥ 0,           // total letters eaten
  alphabet: int[26] ≥ 0,      // a … z
  other: int ≥ 0,             // letters outside a–z
  diet: { vowels: number ≥ 0, consonants: number ≥ 0 },   // decaying counts
  belly: number 0 … 1,        // as of bellyAt
  bellyAt: ms,
  days: int ≥ 1,              // days with an interaction
  lastDay: int,               // local day number of the last one
  dock: { side: "left" | "right", y: number 0 … 1 },
}
```

The **home/out switch is not in the state**: the loader must read it before any pet code loads, and it is a preference of this device, not a property of the pet.

`lib/pet/state.ts` is a pure reducer: `reduce(state, action, now) → state` with actions `pat`, `feed`, `rename`, `dock`, `touch`. Time comes in as an argument. `now` earlier than `lastSeen` (a clock set back) counts as no time passed. Derived values (`bellyAt(state, now)`, `bond`, `scale`, `warmth`, `favourite`) are functions, never stored.

### Store (`lib/pet/store.ts`)

```ts
interface PetStore {
  load(): Promise<{ state: PetState | null; status: "ok" | "empty" | "reset" | "newer" | "unavailable" }>;
  save(state: PetState): Promise<void>;
  clear(): Promise<void>;
  subscribe(onChange: () => void): () => void;   // another tab saved
}
```

The view receives a `PetStore` and knows nothing else. `MemoryStore` (tests, fallback) and `EncryptedLocalStore` implement it; an account store would be a third.

### Encrypted local store (`lib/pet/store-local.ts`, ADR 0063)

- **Key**: AES-GCM 256, made with `crypto.subtle.generateKey(…, extractable = false, ["encrypt", "decrypt"])`, kept as a `CryptoKey` object in IndexedDB (`utofme-pet` / `keys` / `"k1"`).
- **Blob**: `localStorage["utofme:pet:state"] = "p1." + base64url(iv ‖ ciphertext)`; a fresh random 96-bit IV per save; the additional data binds the format tag.
- **Cases**:
  - *No WebCrypto or IndexedDB* (insecure context, some private modes): `status: "unavailable"`; the pet runs from memory for this page and nothing is written. Plaintext is never written as a fallback.
  - *Blob missing*: `"empty"` → the pet is new at first touch.
  - *Blob unreadable* (edited, truncated, wrong key, key deleted, JSON or schema failure): `"reset"` → the blob is removed and the pet starts new. One quiet line in the panel: "Nib is new here."
  - *Older version*: migrated through `MIGRATIONS` (`{ from, up }` steps, pure) and saved. *Newer version* than this code knows: `"newer"` → never overwritten; this tab runs from memory.
  - *Two tabs*: every save bumps `rev`; a `storage` event makes the other tab reload and adopt the saved state when its `rev` is not lower. Last writer wins; the worst case is a lost pat.
  - *Site data cleared*: same as "missing".
- **What it protects**: the blob cannot be read or edited by opening dev tools' storage tab or the profile's files, and the raw key cannot be exported by script. **What it does not**: any script on this origin, and the visitor in the console, can ask the browser to decrypt with that key; an old blob can be put back (no replay protection). It is tamper-evidence for a toy, and a store that already has the shape the account version needs. It is not secrecy.

## Loading and budgets

- **Everyone** gets `PetMount.astro`: an empty, `transition:persist`ed container, the home tab, and a loader that resolves the switch and, when the pet is out, imports the pet module on `requestIdleCallback` (so never in the first view's critical path). A pet at home, and an automated browser, import nothing. The pet's CSS ships inside the lazy module.
- **Budgets** (gzip; measured 2026-11-19):

| What | Limit | Measured | Checked by |
| --- | ---: | ---: | --- |
| Loader chunk, on every page | 1 KB | 0.65 KB | `size-limit` entry `pet loader (every page)` |
| Pet lazy chunk (view, rules, creature, `zod/mini`, store, CSS) | 20 KB | 17.4 KB | `size-limit` entry `pet (lazy)` |
| First-view JS of every route | unchanged limits | +1.8 KB | `check:budgets` |

The first-view cost is the loader (0.65 KB) plus two small shared chunks it imports and that only the home page loaded before: `lib/flags` (0.3 KB) and Vite's dynamic-import preload helper (0.9 KB). Platform first-view JS goes from 30.9 KB to 32.7 KB of 40 KB. The lazy chunk also pulls the shared renderer chunk (`lib/home/objects/{mesh,render}`, 1.6 KB), which the home page has already loaded.

## Deliverables and acceptance

**P11-1 · Logic** (`src/lib/pet/*`, no DOM). Unit + property tests:

- AC1.1 `PetStateSchema`: `safeParse(make(arb))` succeeds for every generated valid state; any single field pushed out of range fails; unknown keys fail; `parse` and `safeParse` agree.
- AC1.2 Reducer properties, for any state, any action list and any timestamps: every stat stays in its range; `lastSeen` never decreases; `rev`-free fields never become `NaN`; `pats`, `meals`, `letters`, `days` and alphabet counts never decrease.
- AC1.3 Absence: for any state and any gap (0 … 10 years), `mood` is `asleep` or `idle`-family, never anything else, and no stored counter is lower than before; a state "left" for a year equals the same state except belly and `lastSeen`.
- AC1.4 Belly: full → empty in exactly 6 h; a bite never overfills; a full belly refuses.
- AC1.5 Gesture: head press → 1 pat; head stroke of `d` px → `1 + floor(d / 18)` pats; body click → poke, 0 pats; body drag → carry, 0 pats; head press that leaves the box by > 24 px → carry and no pats after that; a cancelled press yields nothing.
- AC1.6 Letters: `pickLetters` returns at most 8 letters, only `\p{L}`, in order, and never changes its input; `nibble` prefers uncollected letters.
- AC1.7 Dock: the chosen peek is the widest free candidate; `y` clamps into the viewport; a drop left of centre docks left.
- AC1.8 Store: round trip through `MemoryStore` and through `EncryptedLocalStore` (with an in-test IndexedDB stand-in and WebCrypto); a flipped byte, a truncated blob, a missing key and valid JSON of the wrong shape each give `"reset"` and a removed blob; a blob with `v: 2` gives `"newer"` and is left byte-identical; a registered migration upgrades an old shape; no WebCrypto gives `"unavailable"` and writes nothing.
- AC1.9 `resolveSwitch`: `?pet=0` → off and stored `"0"`; `?pet=1` → on and stored `"1"`; no param → the stored value, else `"default"`; storage that throws does not throw.

**P11-2 · Creature and view** (`creature.ts`, `src/components/pet/*`).

- AC2.1 `buildCreature` yields a finite mesh for every state's pose and for the extremes of scale and colour; every projected vertex lies inside the canvas.
- AC2.2 e2e: with `?pet=1` the pet appears on `/` and on `/works/tactical-arena/`, asleep (`data-mood="asleep"`).
- AC2.3 e2e: a press on the head sets `data-mood="patted"` and raises `data-pats`.
- AC2.4 e2e: select a word, click the pet → `data-letters` rises by the word's letter count (≤ 8); `main.textContent` and `main.innerHTML` are byte-identical before and after; the selection is unchanged; no flying span is left behind.
- AC2.5 e2e: Send home → reload → still at home (no canvas, the tab is shown); the tab calls it back.
- AC2.6 e2e: `?pet=0` → at home; no pet chunk was requested.
- AC2.7 e2e: with reduced motion, the pet responds to a pat and no flying span is ever created.
- AC2.8 e2e: keyboard only: Tab to the pet, Enter pats, About opens the panel, Feed feeds a title letter, Esc closes, Send home works and focus lands on the tab.
- AC2.9 e2e: Axe on `/` and on the article with the pet out and the panel open: no violations.
- AC2.10 e2e: at 390 px and at 1360 px on the article, the pet's visible box at rest intersects no paragraph, heading, list item or figure of the article body, at the top of the page and after scrolling to the middle.
- AC2.11 e2e: state survives a reload (`data-pats` is the same after touching and reloading); the stored blob does not contain the pet's name in clear text; the key in IndexedDB is a non-extractable AES-GCM `CryptoKey`; a blob with one character changed is a clean reset; two tabs see each other's pats.
- AC2.12 e2e: without `?pet=1` under automation there is no pet and no tab; with `navigator.webdriver` forced to `false` the pet is there by default.
- AC2.13 e2e: the pet survives a ClientRouter navigation (same canvas node, same `data-pats`).

**P11-3 · Docs**: `src/lib/pet/README.md` (change the creature, add an interaction, swap the store); ADR 0062 (design rules) and ADR 0063 (encrypted local store).

## Existing tests the pet affects

None: under automation the pet is absent unless a spec asks for it (rule 10), and only the new `pet-*.spec.ts` files ask.

## Self-critique: the third visit

Read as a returning reader, the first draft of this design had these problems; each is fixed above.

1. *It watched me select text.* People select as they read. → The glance happens only while the pet is awake, which only the visitor can cause, and it stops with sleep.
2. *It woke when I went for the scrollbar.* → Hover never wakes it; only a click, tap, key or drop does.
3. *It sat on a figure after I scrolled.* → It re-checks the space under it after every scroll and may only retreat.
4. *I summoned it and it stayed on the text.* → It tucks back after 4 s, on scroll, on Esc, on a click elsewhere.
5. *It blinked at me through a whole article.* → It sleeps after 45 s without attention, and sleep is zero frames.
6. *I sent it home and a mascot-shaped hole kept reminding me.* → Home is a 12 px static tab in the gutter, no face, no motion.
7. *My screen reader narrated its feelings.* → Only results of controls the visitor used are announced, rate-limited.
8. *It ate my selection when I wanted to copy it.* → It eats copies; the selection and clipboard are untouched.
9. *It scolded me for being away.* → Nothing falls but the belly, and an empty belly does nothing. Away for days earns a longer greeting.
10. *It made the page heavier.* → 1 KB for everyone; the rest loads on idle and only for a pet that is out.

Left as open questions for the owner: whether the tab should also disappear completely (a "never show again" level), and whether the pet should be out by default on phones, where it can only peek.

## ADRs to write

- 0062 — the site pet: design rules (asleep by default, retreat-only docking, no guilt, automation default).
- 0063 — the pet's encrypted local store behind `PetStore`.
