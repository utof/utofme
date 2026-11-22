# 0062 — The site pet: design rules

Status: accepted.

## Context

- The owner wants a pet on the site: everyone has one, it can be patted and fed, and later accounts will give people their own. It must be fun and must not annoy; it must be possible to turn off.
- The site is a portfolio and a long research article. Its visitors came to read. A mascot that moves, covers text or asks for attention costs the page more than it gives.
- The site already has a low-poly software renderer for the home page's objects (ADR 0061), a "Pause motion" state that follows `prefers-reduced-motion`, a sound toggle that is off by default, per-route JS budgets (ADR 0047, 0057) and `<ClientRouter />` navigation.

## Decision

A pet ("Nib", a ringling: a ball with a face, two feelers and a planet's ring) that is drawn by the home page's renderer and follows these rules. Spec 11 has the details and a test for each.

1. **Asleep until invited.** The pet is asleep on every full page load and requests no animation frame while asleep. Only a click, tap, key press or drop on it wakes it; hovering and selecting text never do. It sleeps again 45 s after the last attention (20 s at night), at once when the tab is hidden.
2. **Never on text or controls.** At rest the pet is fully out only where the page under it is empty; otherwise it is tucked past the screen edge, showing a sliver that fits the gutter (40, 28, 16 or 10 px). The space is sampled with `elementsFromPoint`: an element with text of its own, or a link, control, image, figure, table or code block, is an obstacle.
3. **It retreats by itself and comes out only when called.** A scroll or resize may tuck it further. A click, tap or focus brings it out, over content if need be; it tucks back 4 s after the visitor stops, at once on scroll, Esc or a click elsewhere.
4. **No guilt.** Mood is never stored: a page starts asleep, so absence can only produce a sleeping pet. No stored value falls with time except the belly, and an empty belly has no effect. Bond is a function of lifetime totals. There is no hunger, sadness, sickness, death, streak or reminder.
5. **It eats copies.** Feeding takes letters from the selection (or one letter of the page title): the letters are read as a string and drawn as `aria-hidden` copies inside the pet's own container. The page's DOM, the selection and the clipboard are not changed. Only counts per letter are saved, never the text.
6. **Quiet.** Sound only when the site's sound toggle is on. One polite status line reports the result of a control the visitor just used; moods are not announced.
7. **Still when motion is paused.** Under `isMotionPaused()` there is no frame loop and nothing flies; the figure changes pose when its state changes.
8. **One switch.** "Send home" next to the pet, a static tab with a 36 × 44 px hit area inset from the scrollbar to call it back, `?pet=0` / `?pet=1`. The answer is a plain localStorage key read by a loader of a few hundred bytes. A pet at home loads no pet code.
9. **Automated browsers get no pet by default** (`navigator.webdriver`), unless `?pet=1` or a stored answer says otherwise.
10. **Vanilla TypeScript, not an island.** The loader is a bundled `<script>`; the pet is one lazy module imported on `requestIdleCallback`. Its CSS ships inside that module.

Structure: pure logic in `src/lib/pet/*` (reducer, mood, gesture, letters, dock, store seam, creature), a thin DOM view in `src/components/pet/*`, storage behind `PetStore` (ADR 0063).

## Alternatives

- **Awake by default, or waking on hover.** Rejected: movement in the corner of an article that nobody asked for is the usual complaint about page mascots; hover would wake it every time the pointer goes to the scrollbar.
- **Hidden until switched on.** Rejected: nobody would find it. A still, sleeping figure is the least a visible pet can be.
- **A fixed corner with a reserved strip, or a pet in the footer.** Rejected: a strip takes reading height from every visitor on a phone; a footer pet is never seen and cannot be fed from the text.
- **Letting the visitor drop the pet anywhere.** Rejected: it would stay on text on the next page. A carried pet snaps to a side edge.
- **Wrapping the page's letters in spans so that the "real" letters fly.** Rejected: it changes the page for screen readers, selection, search and copy. Copies look the same.
- **Hunger and neglect states, streaks.** Rejected: guilt mechanics; they turn a toy into a chore and punish the reader for reading elsewhere.
- **A Svelte island with `client:idle`.** Rejected: `client:idle` islands count as first-view JS in `check:budgets`, and the island would hydrate for visitors who sent the pet home.
- **Masking the pet in the existing visual tests, or a Playwright `storageState` that sends it home.** Rejected: either edits every snapshot spec or leaves the "home" tab in the snapshots. The automation default also keeps crawlers' and link-preview screenshots clean. Cost: Lighthouse CI does not see the pet; its bytes are bounded by `check:budgets` and `size-limit` instead.

## Consequences

- Visitors who never touch the pet pay the loader, an empty container and, on idle, the lazy module that draws one still frame. Nothing is stored for them.
- On layouts without a free margin (the catalogue home, phones) the pet is a peeking sliver until clicked.
- The pet module shares `lib/home/objects/{mesh,render}` with the home page, so the bundler may split those into a chunk both load.
- A new visual baseline is not needed; `pet-*.spec.ts` opt in with `?pet=1`.
- `lib/flags.ts` gains `resolveSwitch` / `writeSwitch` (a default-on flag needs three answers); `zod` becomes a declared dev dependency so the pet can import `zod/mini`.

## Sources

- packages/specs/specs/11-pet.md
- packages/specs/adrs/0061-catalogue-home-curated-model.md
- packages/specs/adrs/0047-per-route-budgets.md
- https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- https://developer.mozilla.org/en-US/docs/Web/API/Document/elementsFromPoint
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver
- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
- https://docs.astro.build/en/guides/view-transitions/#maintaining-state
