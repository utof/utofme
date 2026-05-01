# Phase 7 — Atmosphere polish (cursor, sound, time-of-day, easter eggs, hygiene sweep)

## Goal

Layer **taste-only** atmosphere onto a fully-functional site without compromising any prior phase's invariants. Concretely:

1. A pointer-following **custom cursor** for fine-pointer + motion-OK visitors.
2. A **default-off, opt-in micro-sound layer** (cmd-K open + card hover) using the Web Audio API directly — no `howler.js` library — with audio assets ≤ 40 KB total.
3. A **time-of-day accent shift** layered on top of the Phase 6 theme system: dawn / day / dusk / night accent-only deltas (no body-bg / text-color changes; contrast preserved).
4. Two **easter eggs**: a Konami-code rainbow accent toggle + a `/` (root) page click-counter with localStorage persistence.
5. A **hygiene sweep**: Zod 4 deprecated-format migration (`z.string().url()` → `z.url()`, `z.string().datetime()` → `z.iso.datetime()`); a small set of nits drawn from the post-Phase-6 backlog (#50, #58, #68, #71, #72, #73, #75, #76, #79, #80, #87) that share Phase 7's blast radius. **#66 is deliberately deferred** (see §Interfaces — gating it on a default-skip env var would not honour the issue's "no skipped tests" intent).

## Context / invariants

- Site is **Astro 6.x** on **Cloudflare Workers (Assets)**; **Svelte 5 (runes)** islands; **React 19** islands only on Sandbox-using pages (Phase 3). Phase 6 merge commit `dddaaca` is the branch base. Branch `phase/07-atmosphere` cut from there.
- Output remains `static`. **No SSR introduced in Phase 7.** No Astro Cloudflare adapter changes. New atmosphere assets are static text / audio under `public/` and small Svelte islands under `src/components/`.
- **Bun ≥ 1.2** runtime + workspaces; **Node ≥ 22.12**; TypeScript `strict` + `astro/tsconfigs/strictest`; `type-coverage --at-least 100 --strict`.
- Biome for JS/TS/JSON/JSONC/CSS; Prettier (lefthook only) for `.astro` / `.svelte`.
- **Phase 0–6 invariants carry over and remain green:**
  - All eight lefthook steps pass; all current Phase 6 vitest unit + Playwright e2e cases stay green (no count regression — exact totals re-measured at plan-write).
  - Per-route gzipped `size-limit` budgets from ADRs 0016, 0019, 0022, 0026, and the Phase 6 `feed.xml` 30 KB cap hold.
  - **Site-js cap is 420 KB *gzip*, currently measured 406.54 KB *gzip* (13 KB gzip headroom — issue utof/utofme#45).** The cap entry is `.size-limit.cjs` "site js (all routes, ex graph-vendor)" with `gzip: true`. **Phase 7's site-js delta is capped at +2 KB *gzip* (≈ ≤ 408.5 KB measured *gzip*).** Per-feature sub-caps are stated in **gzip** to match the parent entry's measurement mode:
    - Custom cursor island: ≤ 1.5 KB gzip.
    - Sound toggle + Web-Audio helper: ≤ 800 B gzip combined.
    - Click-counter island: ≤ 1 KB gzip.
    - Konami-code: inline `<script is:inline>` only, no site-js cost; ≤ 600 B *raw* inline (counts toward HTML size, not site-js).
    - Time-of-day: extends the Phase-6 head inline-script by ≤ 200 B raw; absorbed in head-size budget.
  - Sub-cap raw-byte targets are documented in the per-entry comments in `.size-limit.cjs` for human readability but the **enforcement metric is gzip across the board** — no dual-unit assertions.
  - LHCI mobile Performance ≥ 0.85 on every URL in `lighthouserc.cjs` (no new URLs added in Phase 7; no removals).
  - Axe-core zero violations on every shipped HTML route, including routes that gain the cursor / sound-toggle / click-counter / time-of-day attributes.
  - Visual-regression baselines re-record only where layout legitimately changes: footer gains a sound-toggle button (`(pointer: fine)` + `(pointer: coarse)` chrome-mobile baselines re-recorded); root `/` gains a click counter (chrome desktop + mobile baselines re-recorded); cursor itself is **excluded** from VR by `mask` selector on the cursor element so chrome desktop baselines don't flake on cursor position.
  - **Theme persistence behaviour from Phase 6 is unchanged**: `light → dark → system → light` cycle, same `utofme:theme` localStorage key, same first-paint inline script. Time-of-day is a **second** orthogonal axis stored at `[data-tod]` on `<html>`; it composes with `[data-theme]` purely via CSS specificity and never touches the Phase-6 theme machinery.
- **Library version policy** (CLAUDE.md): latest stable major is the default. **Verified at spec-write 2026-05-01:**
  - **Astro 6 `client:media="(media query)"`** is the canonical hydration directive that defers component JS download + hydration until `window.matchMedia(query).matches === true`. Verified via context7 `/withastro/docs` (`directives-reference.mdx`). This is the gate used to keep the cursor's island JS off touch / coarse-pointer devices.
  - **Zod 4 top-level format schemas** are the canonical replacements:
    - `z.string().url()` → `z.url()` (top-level, tree-shakable, uses WHATWG `new URL()` constructor, more permissive than the deprecated `.url()` method). Verified via context7 `/colinhacks/zod` (`api.mdx`).
    - `z.string().datetime()` → `z.iso.datetime()` (top-level, supports `{ offset, local, precision }` options). Verified same source.
  - **Repo's bundled Zod** is `astro/zod` re-export; `packages/site/src/content.config.ts:47, 60` already use `z.url()` successfully against the Astro-bundled Zod, confirming the runtime supports the new top-level format-schema surface. T5 implementer re-confirms `z.iso.datetime()` resolves on the Astro-bundled Zod at impl-time before migrating. **If `z.iso.datetime` is not exposed by the Astro-bundled Zod, T5 is DEFERRED — the `gh issue create -l blocked` is filed and the migration waits for an Astro upgrade.** No new `zod` dep is added in Phase 7 (would breach the hard-gate "no new dep, no version bump"). The hedge is a deferral, not an escape hatch.
  - **Web Audio API** (`AudioContext`, `decodeAudioData`, `AudioBufferSourceNode`) is a stable W3C surface (CR since 2021, baseline-supported across Chromium, Firefox, Safari ≥ 14.1) — no library wrapper used. Verified at MDN baseline.
- **Repo hygiene:** every new exported function/class added in this phase carries TSDoc with `@see <url|file>` OR `@issue <owner/repo#n>` OR a `Why:` line; `bun run check:docs` enforces.
- **Privacy:** the click-counter and sound preference write to `localStorage` only — no network calls, no analytics. The Konami-code easter egg is purely client-side. The time-of-day attribute reads `new Date().getHours()` once at first paint; **no geolocation, no timezone API, no IP lookup**. The visitor's local clock — already universally readable from any web page — is the only signal.
- **Branching:** all Phase 7 batches land on `phase/07-atmosphere` → PR → CI green → merge commit (no squash, no rebase) into `main`. Tag `phase-7` on the merge SHA.

## Non-goals

- **No `howler.js` or any third-party audio library.** Web Audio API direct, hand-rolled in ~50 LOC. Rationale: 30 KB budget for *one* dependency is unjustified for two UI sounds totalling < 5 LOC of glue logic. ADR 0037 records the trade-off.
- **No service worker / offline cache / PWA.** Out of scope.
- **No CSP nonce / inline-script hardening.** The site has no CSP header today. Phase 6 deferred this; Phase 7 does too. Adding the Konami inline script does **not** expand the inline-script footprint beyond what Phase 6 already established (theme inline scripts).
- **No analytics, no telemetry, no error tracking.** The click-counter is local-only; nothing leaves the browser.
- **No cursor-based hover effects beyond pointer follow + lerp.** Magnetic snap, particle trails, custom-shape cursors per element type — all out of scope.
- **No persisted cursor opt-out toggle in UI.** Cursor auto-disables on `(pointer: coarse)` and `(prefers-reduced-motion: reduce)`; users with neither still see it. Adding a manual hide-cursor toggle bloats the footer for marginal benefit.
- **No additional sounds beyond two seeds** (cmd-K open, card hover). The plan ships a *layer*, not a sound design system.
- **No interpolated time-of-day transitions.** Accents flip discretely at hour boundaries; reload to re-pick. Live-tick listener is wasted JS.
- **No `[data-tod]` SSR injection.** Time-of-day is set client-side at first paint — server doesn't know visitor's clock. Accept a one-frame flash at the cost of zero SSR coupling. (Same trade-off Phase 6 took for theme.)
- **No timezone heuristic.** `new Date().getHours()` returns the visitor's local hour; whether their device clock is correct is their problem.
- **No multi-page click-counter.** Only `/` (root). Other pages are not "clicky toy" surfaces.
- **No WAV / FLAC / OGG audio formats.** mp3 + webm fallback only — covers all evergreen browsers.
- **No new global islands beyond what's listed in §Interfaces.** Cursor + ClickCounter are the only new islands. SoundToggle is `.astro` (server) with an inline script handler — not a Svelte island.
- **No re-architecture of the Phase-6 inline-script ordering**; ToD extends the existing IIFE in `MetaHead.astro` rather than introducing a third inline block.
- **No Konami-code reward beyond the rainbow accent toggle.** No alert, no audio, no DOM injection. The accent toggle is reversible by re-entering the sequence; it persists for the page session only (not localStorage).
- **No Brand-tier ADR proliferation.** Phase 7 ships ≤ 4 ADRs (0036–0039). Anything else is queued as a `gh issue create -l adr-candidate`.

## Interfaces

> **Note:** code/CSS/path snippets below are *verified API surfaces* per context7 / file:line probes performed at spec-write 2026-05-01 — not implementation prescriptions. The plan refines exact form, names, and composition.

### Top-level paths added (predicted; the plan refines)

- `packages/site/src/components/CustomCursor.svelte` — **new**. Svelte 5 runes island. Renders a single absolutely-positioned `<div data-cursor>`; tracks `pointermove` events; lerps current position toward target via `requestAnimationFrame`. Early-returns from `$effect` when `matchMedia("(prefers-reduced-motion: reduce)").matches`. Mounted via `client:media="(pointer: fine)"` so component JS is **not downloaded** on touch devices.
- `packages/site/src/components/ClickCounter.svelte` — **new**. Svelte 5 runes island. Mounted on `/` only. Reads/writes localStorage `utofme:slash-clicks`. Renders an absolutely-positioned ephemeral count badge that fades out 1.2s after each click. `client:idle` (deferred until browser idle).
- `packages/site/src/components/SoundToggle.astro` — **new**. Server-rendered button in footer. `<button data-sound-toggle aria-pressed="false">…</button>`. Companion **inline `<script is:inline>`** wires a click handler that:
  1. Toggles `localStorage["utofme:sound"]` between `"on"` and `"off"`.
  2. Updates `aria-pressed`.
  3. On enable, lazily creates `AudioContext` + decodes `/audio/cmd-k.{mp3,webm}` + `/audio/hover.{mp3,webm}` once (preferred format selected via `HTMLAudioElement.canPlayType("audio/webm")` probe).
  4. Subscribes two listeners:
     - **Hover ping:** `document.addEventListener("pointerover", e => …)` filtered to elements matching `[data-sound]` — works for any element (cards, buttons) opting in via attribute. **No coupling to existing components.**
     - **Cmd-K ping:** `window.addEventListener("keydown", e => …)` filtered to `(e.metaKey || e.ctrlKey) && e.key === "k"` — pre-empts the existing CommandPalette's own keydown handler by being a sibling listener, NOT by reaching into palette internals. **No exported-symbol modification of `CommandPalette.svelte`.** If the palette's own handler proves the listeners fire in the wrong order, the plan resolves it by attaching SoundToggle's listener with `{ capture: true }`; the palette code is not touched.
  Inline-script byte budget: ≤ 800 B gzip. No site-js bundle entry created.
- `packages/site/public/audio/cmd-k.mp3` + `cmd-k.webm` + `hover.mp3` + `hover.webm` — **new, committed**. Total raw size ≤ 40 KB across all four. Each clip ≤ 200 ms. Royalty-free or CC0; provenance recorded in TSDoc on the SoundToggle script.
- `packages/site/src/components/MetaHead.astro` — **modified**. The Phase-6 head inline script (theme first-paint) is extended by ≤ 200 B raw to also set `<html data-tod="dawn|day|dusk|night">` based on `new Date().getHours()`:
  - 5 ≤ h < 8 → `dawn`
  - 8 ≤ h < 17 → `day`
  - 17 ≤ h < 20 → `dusk`
  - else → `night`
  - Hour ranges are CSS-tokenised via `--tod-hour-*` constants in `tokens.css` for traceability.
- `packages/site/src/components/KonamiListener.astro` — **new**. Pure inline `<script is:inline>` that listens for the canonical sequence (↑↑↓↓←→←→BA) on `window` and toggles `<html data-konami>` on/off. ≤ 600 B raw inline. Mounted in `_BaseLayout` once.
- `packages/site/src/styles/tokens.css` — **modified**. Adds `:root[data-tod="dawn"]`, `[data-tod="day"]`, `[data-tod="dusk"]`, `[data-tod="night"]` accent-color overrides (single CSS custom property `--accent` per ToD). Adds `:root[data-konami] { --accent: …; }` rainbow override. **No body-bg / text-color changes.** Existing dark-theme tokens unchanged. Total CSS delta ≤ 60 lines.
- `packages/site/src/layouts/_BaseLayout.astro` — **modified**. Slots `<CustomCursor client:media="(pointer: fine)" />` once globally; slots `<KonamiListener />` once globally; slots `<SoundToggle />` in footer; the Phase-6 `MetaHead` slot is unchanged at the call site (its content evolves via `MetaHead.astro` itself).
- `packages/site/src/pages/index.astro` — **modified**. Mounts `<ClickCounter client:idle />` inside the existing landing-page hero region.
- `packages/site/src/lib/webmentions-types.ts` — **modified** (T5 nit sweep, closes #68). Migrates `z.string().url()` → `z.url()` at five call-sites; no schema-shape change, no new field.
- `packages/site/src/content.config.ts` — **modified** (T5 nit sweep, closes #50). Migrates `z.string().datetime()` → `z.iso.datetime()` at two call-sites (`lastSuccessAt`, `generatedAt`); no schema-shape change, no new field.
- `packages/site/src/components/ThemeToggle.astro` — **modified** (T6 nit sweep, closes #76). `aria-live="polite"` replaced by `aria-pressed` on the button (semantic correction; `aria-pressed` reflects toggle state, `aria-live` was misapplied to a stateful trigger).
- `packages/site/src/lib/theme.ts` — **modified** (T6 nit sweep, closes #75). Extracts `THEME_STORAGE_KEY = "utofme:theme"` and `THEME_VALUES = ["light","dark","system"] as const` to module-level exports for test reuse.
- `packages/site/src/components/Webmentions.astro` — **modified** (T6 nit sweep, closes #71, #72). `LIKE_TYPES` / `REPLY_TYPES` arrays converted to `Set` for O(1) lookup; `MAX_REPLY_CHARS` / `MAX_AUTHOR_NAME` extracted as module constants.
- `packages/site/src/layouts/_NoteLayout.astro` — **modified** (T6 nit sweep, closes #73). Move `<Webmentions />` outside `<article class="h-entry">` for parity with `_WorkLayout` (h-entry should not enclose the mention render).
- `packages/site/astro.config.mjs` — **modified** (T6 nit sweep, closes #58). Sitemap filter switches from `url => !url.includes("/search")` to `url => !url.match(/\/search\/?$/)` (over-broad inclusion fix; current filter excludes any URL containing `/search` — e.g. would mis-exclude a hypothetical `/works/search-engine-design`).
- `packages/site/.size-limit.cjs` — **modified**.
  - Closes **#79** scope: the **`feed.xml` entry only** (currently `gzip: false`, brotli-measured per the issue body) — switches to `compression: false` for true raw-bytes measurement. No other existing entries are touched (verified at spec-write: only the `feed.xml` block carries the "raw bytes" comment).
  - Adds new entries (all enforced via `gzip: true` to match the parent site-js entry):
    - `cursor-island` (≤ 1.5 KB gzip; raw target ≤ 4 KB documented in entry comment).
    - `click-counter-island` (≤ 1 KB gzip; raw target ≤ 2 KB).
    - `audio-assets` total ≤ 40 KB **raw** across `dist/audio/*` (audio is binary, gzip is meaningless — `compression: false` for this entry only).
- `.github/workflows/deploy.yml` — **modified** (T7 nit sweep, closes #87). Adds a `curl --fail --silent --show-error -o /dev/null https://utof.me/feed.xml` 200-probe step **after** the Cloudflare deploy step (the probe must run post-deploy because the feed lives on the live domain).
- `.github/workflows/ci.yml` — **modified** (T7 nit sweep, closes #80). Standardises `working-directory: packages/site` for the `sync:webmentions` step.
- `packages/site/lighthouserc.cjs` — **unmodified.** No new URLs in Phase 7. No URLs removed.
- `packages/site/knip.jsonc` — **modified**. Registers `src/components/CustomCursor.svelte`, `ClickCounter.svelte`, `SoundToggle.astro`, `KonamiListener.astro` as entries. Audio files under `public/` are passively served — knip ignores `public/` by default.
- `packages/site/.dependency-cruiser.cjs` — **unmodified.** No new cross-module imports introduced.
- `packages/site/lefthook.yml` — **unmodified.** All existing precommit steps cover the new code.
- `packages/site/tests/unit/cursor.test.ts` — vitest happy-dom. Asserts the cursor component early-returns when `matchMedia("(prefers-reduced-motion: reduce)").matches` is true (mocked). Asserts no `requestAnimationFrame` calls scheduled in that branch.
- `packages/site/tests/unit/click-counter.test.ts` — vitest happy-dom + Svelte renderer. Asserts increment + persistence + display.
- `packages/site/tests/unit/sound-toggle.test.ts` — vitest happy-dom. Asserts localStorage round-trip + lazy `AudioContext` (mocked) creation gated on first opt-in.
- `packages/site/tests/unit/time-of-day.test.ts` — vitest. Pure-function assertion: `hourToTod(h)` mapping covers all 24 hours; boundary tests at 4/5/7/8/16/17/19/20/23.
- `packages/site/tests/e2e/atmosphere.spec.ts` — Playwright.
  - Cursor: chrome desktop emulating fine pointer + motion-OK → `[data-cursor]` is present and moves on `mouse.move`. chrome mobile (touch emulation) → `[data-cursor]` does **not** appear in DOM (client:media gate kept JS off).
  - Sound: click toggle → `aria-pressed="true"` + localStorage flip; Axe-clean.
  - Click counter: click 3 times on hero → counter reads "3"; reload → counter reads "3" (localStorage persistence). Reset via `localStorage.clear()`.
  - Konami: dispatch the canonical sequence → `<html>` carries `data-konami`; dispatch again → attribute removed.
  - Time-of-day: stub `Date.now()` via Playwright `page.clock.install({ time: <date> })`; assert `[data-tod]` matches expected slot.
- `packages/site/tests/e2e/microformats.spec.ts` — **NOT modified in Phase 7.** Issue **#66 is DEFERRED**, not folded: the issue's intent is "no skipped-forever tests"; gating an e2e test on `RELS_ME_PROVISIONED=1` would still ship a default-skip and fail to honour the issue. T6 leaves #66 open until the user provisions the GitHub bio rel=me link (user-only action queue, `progress.md`); a follow-up phase or one-off branch then ports the assertion to Playwright with no skip gate.

### URL routes added/changed

- **None.** No new HTML routes. No removed routes. No moved routes.

### Dependencies added

- **None at runtime.** Audio is hand-rolled. Cursor + click-counter are Svelte 5 (already installed).
- **devDependencies — none new.** Existing test stack covers everything.

### CSS deltas

- `tokens.css`: ≤ 60 lines added (4 ToD blocks + 1 konami block + 1 hour-constant block).
- `cursor.svelte` scoped CSS: ≤ 30 lines.
- `click-counter.svelte` scoped CSS: ≤ 25 lines (badge + fade keyframe).
- `sound-toggle.astro` scoped CSS: ≤ 15 lines.
- `theme-toggle.astro` scoped CSS: 0 (aria refactor only).
- Total CSS delta: ≤ 130 lines. Absorbed within existing per-route 60 KB css+html caps.

## Success criteria (falsifiable)

Each acceptance test below MUST be greppable as a Playwright case name, a Vitest `describe`/`it`, an `assert` clause in `.size-limit.cjs`, an `axe-core.run()` call, an `lhci autorun` assertion, or an LHCI URL existence in `lighthouserc.cjs`.

1. **Cursor renders on fine pointer + motion-OK** (positive case). Asserted at the **unit layer only**: vitest case `renders [data-cursor] in the DOM when motion-OK` passes; e2e infrastructure (`playwright.config.ts` ships `chromium-mobile` exclusively) does not cover this — gap explicitly accepted.
2. **Cursor JS is not downloaded on coarse pointer.** Playwright network listener on the existing `chromium-mobile` project records **zero** requests matching `/_astro/CustomCursor*.js`. (Also: `cursor absent under prefers-reduced-motion` via `page.emulateMedia`.)
3. **Sound default-off.** First-paint browser localStorage `utofme:sound` is unset; SoundToggle reads `aria-pressed="false"`. Axe-clean.
4. **Sound persistence.** Toggle on, reload — `aria-pressed="true"` again; localStorage `utofme:sound === "on"`. Toggle off, reload — back to `"off"`.
5. **`AudioContext` lazy-creation.** Playwright `page.evaluate(() => window.AudioContext === undefined || /* not yet instantiated */)` before first toggle; non-null after first toggle.
6. **Audio assets bundle size.** `bun x size-limit` audio-assets entry asserts `dist/audio/* ≤ 40 KB` raw aggregate.
7. **Cursor island bundle size.** `cursor-island` size-limit entry ≤ 4 KB raw / ≤ 1.5 KB gzip.
8. **Click-counter island bundle size.** `click-counter-island` ≤ 2 KB raw / ≤ 1 KB gzip.
9. **Site-js cap holds.** Existing `.size-limit.cjs` entry "site js (all routes, ex graph-vendor)" (gzip: true) ≤ **408.5 KB** measured (was 406.54 KB; +2 KB gzip ceiling). The audio-assets entry is enforced separately.
10. **Time-of-day mapping is total.** Vitest `hourToTod` coverage 100 %; every integer 0–23 maps to exactly one of `dawn|day|dusk|night`.
11. **Time-of-day applies before `DOMContentLoaded`.** Playwright stubs `Date.now()` via `page.clock.install({ time: <date> })`; runs `page.evaluate(() => new Promise(r => { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => r(document.documentElement.dataset.tod), { once: true }); else r(document.documentElement.dataset.tod); }))` and asserts the resolved value matches the expected slot. (Same falsifiability pattern Phase 6 used for theme first-paint.)
12. **Konami toggle.** Playwright dispatches canonical key sequence → `[data-konami]` present on `<html>`; second dispatch → removed.
13. **Click-counter persistence.** Click 3× → counter reads "3"; reload → reads "3"; `localStorage.clear()` → reads "0" on next click.
14. **Theme persistence unchanged.** All Phase-6 theme.spec.ts cases stay green; no regression.
15. **Webmentions render unchanged.** All Phase-6 mention render cases stay green; the move outside `<article class="h-entry">` (#73) is **layout-only** — visual-regression diff on `/garden/welcome/` baseline ≤ 0.1 % (re-record if intentional shift).
16. **Zod 4 migration.** `rg "z\.string\(\)\.url\(\)"` returns no matches in `packages/site/src` or `packages/site/scripts`. Same for `z\.string\(\)\.datetime\(\)`. Existing schema-validation tests stay green.
17. **Sitemap filter precision (#58).** Vitest `sitemap-filter excludes /search exactly` passes for both `/search` and `/search/`; passes-through for `/works/search-engine-design`.
18. **Theme-toggle a11y (#76).** Axe-core run on any page with the footer toggle reports zero violations and no `aria-live` warning.
19. **Webmention.astro constants extraction (#71, #72).** TypeScript compile clean; existing webmentions e2e green; no new test required (refactor-only).
20. **CI feed.xml probe (#87).** GitHub Actions workflow `.github/workflows/deploy.yml` fails the run if `curl --fail https://utof.me/feed.xml` returns non-200 post-deploy.
21. **No new lefthook step needed.** `lefthook run pre-commit` from `packages/site/` after the change still runs in ≤ existing wall-clock time +10 %.
22. **LHCI mobile Performance ≥ 0.85** on every URL in `lighthouserc.cjs` after the change.
23. **Axe-core zero violations on every shipped HTML route**, including `/`, `/works/code-1/`, `/garden/welcome/`, `/colophon/`, `/now/`, `/search`, `/uses/`, `/stats/`, `/garden/`, `/garden/graph/`.
24. **Visual-regression baselines** re-recorded only at footer (sound toggle), `/` (click counter); cursor masked from VR via `mask: [data-cursor]` selector in `playwright.config.ts`.
25. **`type-coverage --at-least 100 --strict`** passes.
26. **No `Co-Authored-By: Claude`** in any Phase 7 commit; no Claude / Anthropic / vboxuser strings in any PR / issue / commit text or in any test fixture or audio metadata.
27. **All knip / depcruise / biome checks** green per existing precommit chain.
28. **Each new exported symbol has TSDoc** with `@see` / `@issue` / `Why:` per `bun run check:docs`.

## Test plan

- **Unit (vitest, happy-dom)** — `cursor.test.ts`, `click-counter.test.ts`, `sound-toggle.test.ts`, `time-of-day.test.ts`, plus updates to existing `theme.test.ts` to cover the THEME_STORAGE_KEY extraction.
- **Integration (vitest, happy-dom)** — none new; Phase 6 integration suite covers all touched components by virtue of unchanged surface.
- **Property tests (fast-check)** — `time-of-day.test.ts` uses `fc.integer({ min: 0, max: 23 })` to assert totality of `hourToTod`. No other new property tests.
- **e2e (Playwright)** — `atmosphere.spec.ts` (cursor, sound, click-counter, konami, time-of-day); `microformats.spec.ts` updated for #66 follow-up gate.
- **Accessibility (Axe-core)** — re-runs on every changed route; no new route to add to `axe-routes.ts`.
- **Visual regression** — re-record footer + `/` baselines; cursor element masked in `playwright.config.ts`.
- **Bundle size** — three new `.size-limit.cjs` entries; site-js parent entry tightened from 420 KB → 408.5 KB gzip (ratchets the cap to current measurement +2 KB, preventing future drift).
- **Mutation (Stryker, nightly)** — adds `time-of-day.ts` (`hourToTod`) to the critical-path mutation set.

## ADRs to write

- **0036 — Custom cursor as a `client:media`-gated Svelte island, not a vanilla inline script.** Records why the gating directive is canonical (Astro 6 docs: `directives-reference.mdx`) and why a Svelte island is preferred over inline raw JS for ≥ 2 KB of pointer-tracking logic.
- **0037 — Web Audio API direct, no `howler.js`.** Records the 30-KB-vs-50-LOC trade-off; calls out browser autoplay policy compliance (`AudioContext.resume()` on first user gesture).
- **0038 — Time-of-day extends the Phase-6 head inline-script.** Records why a single composite inline IIFE beats two separate inline blocks for first-paint ordering (one HTML round-trip; one `var/let` scope; ≤ 1 KB combined raw).
- **0039 — Easter eggs in-house, no third-party libraries.** Records Konami-code listener as ≤ 600 B raw inline + click-counter as a tiny Svelte island; refuses any "fun" library (`konami-code`, `easter-egg`, etc.).

## Phase-7 deferred (queued as `gh issue create -l <label>` after merge)

- POSSE / Bridgy Fed (general-plan §6.3 "optional"). Label `phase-N`.
- JSON Feed / Atom feed (Phase 6 deferred). Label `phase-N`.
- OG-image generator (Phase 6 deferred). Label `phase-N`.
- Service-worker / PWA shell. Label `phase-N`.
- CSP nonce hardening. Label `security`.
- Dark-mode-aware images via `<picture media="(prefers-color-scheme: dark)">`. Label `phase-N`.
- Magnetic-snap cursor variants. Label `nice-to-have`.
- Persisted cursor opt-out toggle. Label `nice-to-have`.
- More UI sounds (cmd-K palette navigate / select; webmention render; theme cycle). Label `nice-to-have`.
- Live `prefers-reduced-motion` change observation in CustomCursor (mirrors #47). Label `nit`.

## Out-of-scope nits (kept open for future phases)

`gh issue list -l nit` snapshot at spec-write — only the items NOT folded into T5–T7 stay open: #44, #45, #46, #47, #48, #49, #51, #53, #54, #55, #56, #57, #59, #60, #62, #63, #64, #65, #66 (queued for Phase-7 follow-up activation), #67, #69, #70, #74, #77, #78, #81, #82, #83, #84, #85.

Plus pre-existing #23–#41 from Phases 1–4.

## Why Phase 7 ships at all

Phase 7 is opt-in per `CLAUDE.md`. The user invoked it explicitly (2026-05-01: "auto brainstorm […] new branch"). The phase value-density is intentionally **lower** than Phases 0–6: atmosphere does not move user-visible product needles. It is ship-or-cut work. The plan is sized so that cutting any one of T1–T4 (cursor, sound, time-of-day, easter eggs) leaves the other three independently mergeable; the hygiene sweep T5–T7 is independent of all four.

The phase is bounded by the +6 KB site-js delta; if measurement at plan-write reveals any one feature exceeds its sub-cap, that feature is **cut, not relaxed** — atmosphere never compromises Phase-6's headroom guarantee.
