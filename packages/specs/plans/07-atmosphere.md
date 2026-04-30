# Phase 7 — Atmosphere polish — implementation plan

> **Spec:** [`packages/specs/specs/07-atmosphere.md`](../specs/07-atmosphere.md). All invariants, sub-caps, and acceptance criteria live there. This plan refines task breakdown, file shapes, TDD red-cases, and per-task exit gates.
>
> **Branch:** `phase/07-atmosphere` (already cut from `dddaaca`, the Phase 6 merge SHA).
> **Workflow:** Sonnet implementers per task; TDD red-green-refactor; one merge commit per task; `progress.md` updated at every green; final phase-close PR uses the standard merge-commit-into-main pattern (no squash, no rebase).

## Pre-flight (before T1)

Run **once** at branch start; output captured for plan-history.

```bash
cd packages/site
bun install
bun run lefthook run pre-commit         # confirm green at base SHA
bun run test                             # all vitest cases
bun x playwright test --project=chromium # all e2e cases
bun x size-limit                         # baseline: capture all entry sizes
bun run build                            # sanity
```

Record the size-limit output verbatim into the first commit of T10 ("baseline measure") so any later regression is bisectable.

---

## Task index

| # | Title | Files (impl + test) | Site-js gzip delta target | Hard-gate adjacent? |
|---|---|---|---|---|
| T1 | Custom cursor (Svelte 5 + `client:media`) | 2 + 2 | ≤ 1.5 KB | no |
| T2 | Sound toggle (Web Audio API direct) | 2 + 1 + 4 audio | ≤ 0.8 KB | no |
| T3 | Time-of-day accent shifts | 2 + 1 | 0 (inline +200 B raw) | no |
| T4 | Easter eggs (Konami + click counter) | 2 + 1 + 1 | ≤ 1 KB | no |
| T5 | Zod 4 format migration | 2 + 0 | 0 | **YES** (Zod schema — gate breach OK at phase scope, not inline-fix scope) |
| T6 | A11y + UX nit sweep | 4 + 0 | 0 | no |
| T7 | CI hygiene (deploy probe + cwd) | 2 + 0 | 0 | no |
| T8 | Visual-regression baselines | 0 impl + N PNGs | 0 | no |
| T9 | 4 ADRs (0036–0039) | 4 docs | 0 | no |
| T10 | Size-limit final entries + phase-close | 1 + commit | enforces ≤ 408.5 KB gzip | no |

Total predicted gzip delta: **≤ 3.3 KB**, well under the 2 KB ceiling — slack absorbs measurement variance. If T1+T2+T4 sum exceeds 2 KB at first measurement, **cut click-counter (T4 second half)** first; it's the lowest user-value of the four atmosphere features.

---

## T1 — Custom cursor

### Goal
Pointer-following lerped cursor for `(pointer: fine) and not (prefers-reduced-motion: reduce)` users. Component JS not downloaded on coarse-pointer devices.

### Files

- **Impl:**
  - `packages/site/src/components/CustomCursor.svelte` (new, ≤ 60 LOC).
  - `packages/site/src/layouts/_BaseLayout.astro` (modify — single line addition: `<CustomCursor client:media="(pointer: fine)" />` before `</body>`).
- **Test:**
  - `packages/site/tests/unit/cursor.test.ts` (new, vitest happy-dom).
  - `packages/site/tests/e2e/atmosphere.spec.ts` (new file in this task — extended by T2/T3/T4).

### TDD — red cases (write first, fail at start)

> **Test infrastructure constraint** (verified at plan-revision against `packages/site/playwright.config.ts:17–22`): the project ships **only** a `chromium-mobile` Playwright project (Pixel 5, `pointer: coarse` + touch). There is **no chrome-desktop project** and Phase 7 does **not** add one (CI time + workflow churn unjustified for one positive-case test). The cursor's positive-case ("renders on fine pointer") is therefore covered by **unit tests only**; the e2e layer covers only the negative ("absent on coarse pointer / reduced motion").

1. Unit (`cursor.test.ts`, vitest happy-dom):
   - `it("early-returns when prefers-reduced-motion matches", …)` — mock `window.matchMedia` to return `{ matches: true, addEventListener: vi.fn() }` for the reduced-motion query; mount component; assert no `requestAnimationFrame` call (spy on `globalThis.requestAnimationFrame`).
   - `it("schedules rAF when motion-OK and pointer:fine", …)` — opposite mock (motion-OK = `matches: false`); assert ≥ 1 rAF call.
   - `it("renders [data-cursor] in the DOM when motion-OK", …)` — covers spec acceptance #1's positive case at the unit layer.
   - happy-dom **does** ship a `matchMedia` stub returning `{ matches: false }` by default — the test installs its own mock via `vi.stubGlobal("matchMedia", …)` to flip it.
2. e2e (`atmosphere.spec.ts`, chromium-mobile only):
   - `test("cursor: no JS downloaded on coarse pointer", …)` — Playwright `page.on("request", req => …)` records all requests; navigate; assert **zero** requests match `/_astro/CustomCursor*.js`. This proves `client:media="(pointer: fine)"` gates correctly.
   - `test("cursor: absent under prefers-reduced-motion", …)` — `page.emulateMedia({ reducedMotion: "reduce" })`. Even if the project were fine-pointer, reduced-motion would gate. On the existing coarse project this is a redundant assertion (already covered by gate-1), but documents intent. Implementer may merge into the JS-download case.
   - **No positive e2e case** — gap is explicitly acknowledged at spec acceptance #1: positive coverage is unit-only on the existing test infrastructure.

### Implementation outline

`CustomCursor.svelte`:

```svelte
<script lang="ts">
  /**
   * Lerped pointer-following cursor.
   *
   * Why: aesthetic-only enhancement; gated to fine-pointer devices via
   * Astro's `client:media` directive at the call site. Within the
   * component, `prefers-reduced-motion` short-circuits the rAF loop
   * (CSS Media Queries Level 5).
   *
   * @see packages/specs/specs/07-atmosphere.md § T1
   * @see packages/specs/adrs/0036-custom-cursor-island.md
   */
  let target = $state({ x: 0, y: 0 });
  let pos    = $state({ x: 0, y: 0 });
  let raf: number | undefined;

  $effect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;            // no rAF scheduled at all

    const onMove = (e: PointerEvent) => { target = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", onMove, { passive: true });

    const tick = () => {
      pos = { x: pos.x + (target.x - pos.x) * 0.18, y: pos.y + (target.y - pos.y) * 0.18 };
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  });
</script>

<div data-cursor style:transform="translate3d({pos.x}px, {pos.y}px, 0)" aria-hidden="true"></div>

<style>
  [data-cursor] {
    position: fixed; inset: 0 auto auto 0;
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 1px solid var(--accent, currentColor);
    pointer-events: none;
    will-change: transform;
    z-index: 9999;
    mix-blend-mode: difference;
  }
</style>
```

Gating in `_BaseLayout.astro`: insert before `</body>`:

```astro
<CustomCursor client:media="(pointer: fine)" />
```

### Acceptance (this task only)

- All red cases above flip green.
- `bun x size-limit --json` shows `cursor-island ≤ 1.5 KB` gzip.
- Axe-clean: `<div data-cursor>` carries `aria-hidden="true"`, no a11y violation.
- `bun run lefthook run pre-commit` green.
- One commit titled `Phase 7 T1: custom cursor (Svelte 5, client:media-gated)`.

### Rollback

Single revert of T1 commit. No data migrations, no schema changes.

---

## T2 — Sound toggle (Web Audio direct)

### Goal
Footer button toggling localStorage `utofme:sound`. On enable, lazily decode 4 audio files; subscribe sibling listeners for hover + cmd-K. Default off. No third-party library.

### Files

- **Impl:**
  - `packages/site/src/components/SoundToggle.astro` (new, ≤ 80 LOC including inline script).
  - `packages/site/src/layouts/_BaseLayout.astro` (modify — slot `<SoundToggle />` in footer next to `<HCard />`).
  - `packages/site/public/audio/cmd-k.mp3` (new — provenance: CC0 source, name + URL recorded in `SoundToggle.astro` header TSDoc).
  - `packages/site/public/audio/cmd-k.webm` (new).
  - `packages/site/public/audio/hover.mp3` (new).
  - `packages/site/public/audio/hover.webm` (new).
- **Test:**
  - `packages/site/tests/unit/sound-toggle.test.ts` (new).
  - `packages/site/tests/e2e/atmosphere.spec.ts` (extend with sound cases).

### Audio asset sourcing

Use Freesound CC0 or `kenney.nl` UI sound packs (CC0). Trim to ≤ 200 ms, normalize to −12 LUFS. Pipeline:

```bash
# example, ffmpeg
ffmpeg -i source.wav -t 0.2 -af "loudnorm=I=-12" -codec:a libmp3lame -q:a 6 cmd-k.mp3
ffmpeg -i source.wav -t 0.2 -af "loudnorm=I=-12" -codec:a libopus -b:a 32k cmd-k.webm
```

Total budget across all four files: **≤ 40 KB raw**. Verified via `du -b public/audio/` < 40960.

### TDD — red cases

1. Unit (`sound-toggle.test.ts` — happy-dom):
   - **Fixture setup (mandatory):** happy-dom does **not** define `AudioContext`. Each test installs a global mock before running the SoundToggle inline-script:
     ```ts
     const audioCtxCtor = vi.fn().mockImplementation(() => ({
       createBufferSource: () => ({ buffer: null, connect: vi.fn(), start: vi.fn() }),
       decodeAudioData: vi.fn().mockResolvedValue({}),
       destination: {},
     }));
     vi.stubGlobal("AudioContext", audioCtxCtor);
     // also stub fetch().arrayBuffer()
     ```
     Tests assert against `audioCtxCtor.mock.calls.length`.
   - `it("aria-pressed defaults to false when localStorage unset", …)` — render `SoundToggle.astro` via Astro Container API; assert button `aria-pressed === "false"`.
   - `it("toggling persists to localStorage", …)` — simulate click; assert `localStorage.getItem("utofme:sound") === "on"`.
   - `it("AudioContext is not created until first opt-in", …)` — assert `audioCtxCtor.mock.calls.length === 0` on initial render; click toggle; assert `=== 1`.
   - `it("subsequent toggle off does not destroy AudioContext", …)` — context is created once and reused (no `.close()` call expected).
2. e2e:
   - `test("sound: default off, axe-clean", …)`.
   - `test("sound: toggle persists across reload", …)`.
   - `test("sound: cmd-k keydown triggers AudioContext.resume", …)` — spy via `page.exposeFunction` + `page.addInitScript` to instrument `AudioContext.prototype.resume`.

### Implementation outline

`SoundToggle.astro`:

```astro
---
/**
 * Persistent sound toggle. Default off. Lazy-creates AudioContext on
 * first opt-in (browser autoplay policy: AudioContext may only be
 * resumed after a user gesture).
 *
 * Why hand-rolled vs howler.js: 30 KB lib for two ≤ 200 ms clips and
 * ~30 LOC of glue is unjustified. See ADR 0037.
 *
 * @see packages/specs/specs/07-atmosphere.md § T2
 * @see packages/specs/adrs/0037-web-audio-no-howler.md
 */
---
<button data-sound-toggle aria-pressed="false" aria-label="Toggle UI sounds">
  <svg aria-hidden="true" viewBox="0 0 16 16">…</svg>
</button>

<script is:inline data-astro-rerun>
  (function () {
    var KEY = "utofme:sound";
    var btn = document.querySelector("[data-sound-toggle]");
    if (!btn) return;
    var on = localStorage.getItem(KEY) === "on";
    btn.setAttribute("aria-pressed", on ? "true" : "false");

    var ctx, buffers = {}, ready;
    var fmt = (typeof Audio !== "undefined" && new Audio().canPlayType("audio/webm")) ? "webm" : "mp3";

    async function ensure() {
      if (ready) return ready;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ready = Promise.all(["cmd-k", "hover"].map(function (n) {
        return fetch("/audio/" + n + "." + fmt)
          .then(function (r) { return r.arrayBuffer(); })
          .then(function (a) { return ctx.decodeAudioData(a); })
          .then(function (b) { buffers[n] = b; });
      }));
      return ready;
    }
    function play(name) {
      if (!ctx || !buffers[name]) return;
      var s = ctx.createBufferSource();
      s.buffer = buffers[name];
      s.connect(ctx.destination);
      s.start();
    }
    btn.onclick = function () {
      on = !on;
      localStorage.setItem(KEY, on ? "on" : "off");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) ensure();
    };
    document.addEventListener("pointerover", function (e) {
      if (!on || !(e.target instanceof Element) || !e.target.closest("[data-sound]")) return;
      ensure().then(function () { play("hover"); });
    });
    window.addEventListener("keydown", function (e) {
      if (!on) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") ensure().then(function () { play("cmd-k"); });
    }, { capture: true });
    if (on) ensure();
  })();
</script>

<style>
  [data-sound-toggle] {
    background: transparent; border: 1px solid var(--border, currentColor);
    border-radius: 999px; padding: 6px;
    width: 32px; height: 32px;
    cursor: pointer;
  }
  [data-sound-toggle][aria-pressed="true"] svg { opacity: 1; }
  [data-sound-toggle][aria-pressed="false"] svg { opacity: 0.45; }
</style>
```

### Acceptance

- All red cases green.
- `du -b packages/site/public/audio/*` total ≤ 40960 bytes.
- `bun x size-limit --json` adds `audio-assets` entry green.
- Inline-script raw size measured via:
  ```bash
  bun run build
  # extract every <script is:inline> block from a representative output page,
  # strip leading whitespace, count bytes:
  python3 -c '
  import re, sys, pathlib
  html = pathlib.Path("dist/index.html").read_text()
  for m in re.finditer(r"<script[^>]*is:inline[^>]*>(.*?)</script>", html, re.S):
      body = m.group(1)
      print(len(body.encode("utf-8")), "bytes")
  '
  ```
  Implementer pastes the byte counts into the commit body. Same recipe is reused for T3 (head IIFE) and T4 (Konami listener) byte-budget verification.
- Axe-clean.
- One commit titled `Phase 7 T2: sound toggle (Web Audio API direct, default off)`.

### Risks

- **Browser autoplay policy** — calling `AudioContext.resume()` outside a user-gesture handler throws. The script defers resume to the click handler exclusively (verified pattern: MDN AudioContext / autoplay-policy article).
- **Format probe** — `canPlayType` returns `""` / `"maybe"` / `"probably"`. Truthy-check covers `"maybe"` and `"probably"`; empty is the no-webm fallback to mp3.

---

## T3 — Time-of-day accent shifts

### Goal
Discrete dawn/day/dusk/night accent override on `<html data-tod>`, set client-side at first paint by extending the Phase-6 head inline-script. Pure-CSS overrides. No body-bg / text-color delta.

### Files

- **Impl:**
  - `packages/site/src/components/MetaHead.astro` (modify — extend the IIFE).
  - `packages/site/src/styles/tokens.css` (modify — add ToD blocks).
- **Test:**
  - `packages/site/tests/unit/time-of-day.test.ts` (new — pure-function unit + fast-check totality).
  - `packages/site/tests/e2e/atmosphere.spec.ts` (extend — clock-stub case).

### TDD — red cases

1. Unit:
   - `it("hourToTod is total over 0..23")` — `fc.assert(fc.property(fc.integer({min:0,max:23}), h => ["dawn","day","dusk","night"].includes(hourToTod(h))))`.
   - Boundary cases: `expect(hourToTod(4)).toBe("night")`, `expect(hourToTod(5)).toBe("dawn")`, `expect(hourToTod(7)).toBe("dawn")`, `expect(hourToTod(8)).toBe("day")`, `expect(hourToTod(16)).toBe("day")`, `expect(hourToTod(17)).toBe("dusk")`, `expect(hourToTod(19)).toBe("dusk")`, `expect(hourToTod(20)).toBe("night")`.
2. e2e:
   - `test("time-of-day applies before DOMContentLoaded", …)` — `await page.clock.install({ time: new Date("2026-05-01T06:00:00Z") })` then **`await page.clock.pauseAt(new Date("2026-05-01T06:00:00Z"))`** (Playwright's `clock.install` sets initial time but does **not** freeze it — `pauseAt` is required to keep `new Date()` from advancing during navigation). Then `await page.goto("/")`; await the promise pattern from spec acceptance #11; assert resolved value === expected ToD slot.
   - **Locale caveat & fixture:** `new Date().getHours()` returns *local* hours, which depend on the test-runner timezone. Plan locks the timezone at **per-test scope** via `test.use({ timezoneId: "UTC" })` (NOT project-level — that would affect every other e2e case). Each ToD test asserts against UTC-hour slots: `06:00Z` → `dawn`, `12:00Z` → `day`, `18:00Z` → `dusk`, `22:00Z` → `night`.

### Implementation outline

Extend the Phase-6 IIFE in `MetaHead.astro`. Current script (≤ 800 B) sets `[data-theme]`. Add:

```js
// inside same IIFE, after [data-theme] application
var h = new Date().getHours();
var tod = h < 5 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : h < 20 ? "dusk" : "night";
document.documentElement.setAttribute("data-tod", tod);
```

Net additional bytes: ~140 raw (verified by hand-count). Within ≤ 200 B cap.

`tokens.css`:

```css
:root[data-tod="dawn"]  { --accent: oklch(0.78 0.10 60); }
:root[data-tod="day"]   { --accent: oklch(0.65 0.18 250); }
:root[data-tod="dusk"]  { --accent: oklch(0.72 0.15 30); }
:root[data-tod="night"] { --accent: oklch(0.75 0.12 280); }
```

(Concrete colours TBD by user taste at impl-time; structure is what matters.)

### Acceptance

- Unit + e2e green.
- `wc -c` of the rendered MetaHead script in `dist/index.html` ≤ Phase-6 measure + 200 B.
- Axe-clean (no contrast violations on any ToD slot — Axe runs against all four via Playwright loop with `clock.install`).
- One commit titled `Phase 7 T3: time-of-day accent shifts`.

---

## T4 — Easter eggs

### Goal
Konami listener (toggle `[data-konami]` on `<html>`) + click-counter on `/` (localStorage-persisted ephemeral badge).

Two sub-tasks committed together (both small, related theme; T4a + T4b within one task commit OR split commits — implementer's call).

### Files

- **Impl:**
  - `packages/site/src/components/KonamiListener.astro` (new, ≤ 25 LOC).
  - `packages/site/src/components/ClickCounter.svelte` (new, ≤ 50 LOC).
  - `packages/site/src/layouts/_BaseLayout.astro` (modify — mount `<KonamiListener />`).
  - `packages/site/src/pages/index.astro` (modify — mount `<ClickCounter client:idle />`).
  - `packages/site/src/styles/tokens.css` (modify — add `:root[data-konami] { --accent: …; }` rainbow rule, CSS-only animated via `@property`/keyframes).
- **Test:**
  - `packages/site/tests/unit/click-counter.test.ts` (new).
  - `packages/site/tests/e2e/atmosphere.spec.ts` (extend — konami + click-counter cases).

### TDD — red cases

1. Unit (click-counter):
   - `it("starts at 0 when localStorage clear")`.
   - `it("increments and persists on click")`.
   - `it("hides badge 1.2s after last click")` — fake timers; advance 1199 ms (visible); 1201 ms (hidden).
2. e2e:
   - Konami: `await page.keyboard.press("ArrowUp"); ...` × 10; assert `[data-konami]` present. Repeat → assert removed.
   - Click counter: 3 clicks → counter "3"; reload → "3"; `localStorage.clear` via `page.evaluate` → next click → "1".

### Implementation outlines

**`KonamiListener.astro`:**

```astro
<script is:inline>
  (function () {
    var seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown",
               "ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    var i = 0;
    window.addEventListener("keydown", function (e) {
      if (e.repeat) return;                  // ignore key auto-repeat
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === seq[i]) {
        i++;
        if (i === seq.length) {
          document.documentElement.toggleAttribute("data-konami");
          i = 0;
        }
      } else {
        i = (k === seq[0]) ? 1 : 0;
      }
    });
  })();
</script>
```

Byte-count target ≤ 600 B raw.

**`ClickCounter.svelte`:**

```svelte
<script lang="ts">
  /**
   * Ephemeral click counter on `/`. Increments localStorage
   * `utofme:slash-clicks`. Badge fades 1.2 s after each click.
   *
   * @see packages/specs/specs/07-atmosphere.md § T4
   */
  // Synchronous initialization — avoids $effect timing concerns in tests.
  // typeof check guards SSR (Astro renders the component server-side first).
  const initial = typeof localStorage !== "undefined"
    ? Number(localStorage.getItem("utofme:slash-clicks") ?? 0)
    : 0;
  let n = $state(initial);
  let visible = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function bump() {
    n += 1;
    localStorage.setItem("utofme:slash-clicks", String(n));
    visible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { visible = false; }, 1200);
  }
</script>

<button class="click-zone" on:click={bump} aria-label="Click counter">
  <span class:visible aria-live="polite">{n}</span>
</button>

<style>
  .click-zone { position: relative; padding: 1rem; border: 0; background: transparent; cursor: pointer; }
  span { position: absolute; inset: 0; opacity: 0; transition: opacity 200ms; pointer-events: none; }
  span.visible { opacity: 1; }
</style>
```

### Acceptance

- All red cases green.
- `cursor-island` and `click-counter-island` size-limit entries green (≤ 1.5 KB / ≤ 1 KB gzip respectively — measured *together* for cursor; T4 measurement for ClickCounter only).
- Axe-clean on `/`.
- Konami inline-script ≤ 600 B raw verified via `wc -c`.
- One commit (or two — implementer's call) titled `Phase 7 T4: easter eggs (Konami + click counter)`.

---

## T5 — Zod 4 format migration

> **Hard-gate breach acknowledged.** This task touches Zod schemas, which trips the inline-fix gate. It is appropriate at *phase scope* per CLAUDE.md (the inline-fix gate governs nit-fix mid-phase, not deliberate phase-scoped task work). Spec §M3 confirms.

### Goal
Migrate 7 deprecated Zod-format call-sites to Zod 4 top-level format schemas. No schema-shape change. Closes #50, #68.

### Files

- **Impl:**
  - `packages/site/src/lib/webmentions-types.ts` — 5 sites (`webmentions-types.ts:30, 31, 34, 39, 40`): `z.string().url() → z.url()`.
  - `packages/site/src/content.config.ts` — 2 sites (`content.config.ts:125, 137`): `z.string().datetime() → z.iso.datetime()`.
- **Test:** existing tests cover round-trip; no new test required. T5 acceptance is "all existing tests stay green".

### Pre-flight verification (mandatory)

Implementer runs **before any edit**:

```ts
// scratch file
import { z } from "astro/zod";
console.log(typeof z.url, typeof z.iso?.datetime);
// must print: "function" "function"
```

If `z.iso?.datetime` is `undefined`, T5 is **deferred** per spec; file `gh issue create -l blocked -t "Phase 7 T5 deferred: astro/zod lacks z.iso.datetime"`. Skip remaining T5 work.

### Implementation outline

Mechanical find-and-replace. After replacement:

```bash
rg "z\.string\(\)\.url\(\)" packages/site/src packages/site/scripts
rg "z\.string\(\)\.datetime\(\)" packages/site/src packages/site/scripts
# both must return zero matches
```

### Acceptance

- `rg` checks above return zero matches.
- All existing vitest cases stay green (no count regression).
- `bun x astro check` green; `type-coverage --at-least 100 --strict` green.
- One commit titled `Phase 7 T5: Zod 4 format migration (#50, #68)`.

### Risks

- `z.url()` is **WHATWG-permissive** — `mailto:`, `tel:`, opaque-host URLs all pass. Existing `webmentions-types.ts` uses `z.string().url()` against payloads from webmention.io which always produces `http(s)://` URLs; the broader acceptance is harmless. **Closes** but does not regress.
- `z.iso.datetime()` defaults to `{ offset: false, local: false }` — strict UTC `Z`. Phase 6 build-garden-data writes timestamps via `new Date().toISOString()` which always emits `Z`. Round-trip safe.

---

## T6 — A11y + UX nit sweep

### Goal
Close internal nits #58, #71, #72, #73, #75, #76 with surgical edits.

### Files (all modify, no new files)

- `packages/site/src/lib/theme.ts` (#75 — extract `THEME_STORAGE_KEY` const).
- `packages/site/src/components/ThemeToggle.astro` (#76 — `aria-live` → `aria-pressed`; tied to existing theme handler).
- `packages/site/src/components/Webmentions.astro` (#71, #72 — Set lookups + extracted constants).
- `packages/site/src/layouts/_NoteLayout.astro` (#73 — move `<Webmentions />` outside `<article class="h-entry">`).
- `packages/site/astro.config.mjs` (#58 — sitemap filter regex).

### TDD — red cases

1. `theme.test.ts` (existing — extend):
   - Replace inline `"utofme:theme"` literals in test bodies with `import { THEME_STORAGE_KEY } from "../../src/lib/theme.ts"`.
2. `theme.spec.ts` (existing e2e — assertion change):
   - Replace any check on `aria-live` with `aria-pressed` reflecting toggle state.
3. New unit case `tests/unit/sitemap-filter.test.ts`:
   - `it("excludes /search and /search/")`, `it("does not exclude /works/search-engine-design")`.
   - Implementation imports the `filter` function exported from `astro.config.mjs` (extract to `src/lib/sitemap-filter.ts` if config doesn't permit easy import — implementer's call).
4. e2e for #73:
   - Update `microformats.spec.ts` assertion: `<Webmentions>` block is **sibling** of `<article class="h-entry">`, not descendant. Add `expect(notes-page article.h-entry mention-block)` to be `null`; `expect(notes-page > section.webmentions)` to exist.

### Implementation outline

Routine surgical edits; no architectural change. Each fix ≤ 10 LOC.

### Acceptance

- All red cases green.
- `bun run lefthook run pre-commit` green.
- Axe-clean on `/`, `/works/code-1/`, `/garden/welcome/` (Axe was already clean; assertion is "no regression").
- Six issues closed via commit-message footer: `Closes #58 #71 #72 #73 #75 #76`.
- One commit titled `Phase 7 T6: a11y + UX nit sweep (#58, #71, #72, #73, #75, #76)`.

---

## T7 — CI hygiene

### Goal
Close #80 (sync:webmentions cwd) and #87 (post-deploy feed.xml probe).

### Files

- `.github/workflows/ci.yml` (modify — `working-directory: packages/site` on the `sync:webmentions` step).
- `.github/workflows/deploy.yml` (modify — append a "smoke: feed.xml 200" step using `curl --fail --silent --show-error -o /dev/null https://utof.me/feed.xml`).

### TDD

CI changes are tested at PR-time by the workflow itself running. Validation: open the PR, watch the new probe step run on the post-deploy job; manually break it once locally (e.g. by pointing the curl at a `/404` to confirm the step does fail the run). Plan documents this as a manual smoke; no unit test feasible.

### Acceptance

- `gh pr checks <PR#>` shows the new smoke step succeeded on the deploy job.
- One commit titled `Phase 7 T7: CI hygiene (#80, #87)`.

### Risks

- The probe runs against `utof.me`, the live origin. If deploy completes but Cloudflare's edge cache hasn't warmed for `/feed.xml` within seconds, the probe may flake. Mitigation: add a 5-second `sleep` before the curl, or retry up to 3× with 2-second backoff. Pick one at impl time; document in the workflow comment.

---

## T8 — Visual-regression baselines

### Goal
Re-record baselines invalidated by T1–T4. Mask `[data-cursor]` so cursor position doesn't flake.

### Files

> **Verified at plan-revision** against `packages/site/tests/e2e/`: the only existing PNGs that capture the home page or footer are listed below. Filename convention is `<spec>-snapshots/<name>-chromium-mobile-linux.png` (single project, no `-light`/`-dark` axis except where the spec itself encodes it). There is **no** `home.spec.ts`, **no** `notes-layout.spec.ts`. #73 (Webmention move outside `<article>`) has **zero** existing visual coverage and Phase 7 does **not** add a new VR spec for it.

- **No `playwright.config.ts` global `mask` change** — Playwright's `mask` option applies per `expect(page).toHaveScreenshot(…)` call, not to project config. Each affected test that re-records its snapshot adds `{ mask: [page.locator("[data-cursor]")] }` to the call site. (Verified at plan-revision against Playwright docs: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1.)
- Re-record affected PNGs:
  - `tests/e2e/cards.spec.ts-snapshots/home-chromium-mobile-linux.png` — invalidated by SoundToggle in footer + ClickCounter on `/`.
  - `tests/e2e/cards.spec.ts-snapshots/works-chromium-mobile-linux.png` — invalidated by SoundToggle in footer.
  - `tests/e2e/landing.spec.ts-snapshots/landing-chromium-mobile-linux.png` — invalidated by SoundToggle + ClickCounter.
  - `tests/e2e/theme.spec.ts-snapshots/home-dark-chromium-mobile-linux.png` — invalidated by SoundToggle + ClickCounter (dark variant).
  - `tests/e2e/transitions.spec.ts-snapshots/transitions-home-chromium-mobile-linux.png` — invalidated if it captures footer.
  - `tests/e2e/transitions.spec.ts-snapshots/transitions-works-chromium-mobile-linux.png` — same conditional.
  - `tests/e2e/transitions.spec.ts-snapshots/transitions-search-chromium-mobile-linux.png` — same conditional (likely no footer in capture; record-or-skip per pixel diff).
- Add per-call cursor mask to **each** of the five tests above where the cursor would render. Note: on `chromium-mobile` the cursor JS is not downloaded (see T1 e2e), so `[data-cursor]` is absent and `mask` is a no-op — the mask is added defensively in case of a future desktop project addition. Implementer may decide the cursor mask is unnecessary on the current single-project setup and document the decision in the commit body.

### Procedure

```bash
cd packages/site
bun x playwright test --update-snapshots tests/e2e/cards.spec.ts tests/e2e/landing.spec.ts tests/e2e/theme.spec.ts tests/e2e/transitions.spec.ts
git diff --stat -- tests/e2e/__screenshots__/  # confirm only expected PNGs changed
git add tests/e2e/__screenshots__/ playwright.config.ts
```

### Acceptance

- Manual inspection of diff: only the listed PNGs change; pixel-diff visually corresponds to the SoundToggle / ClickCounter / Webmentions move.
- One commit titled `Phase 7 T8: visual-regression baselines for T1–T4 + #73`.

### Risk

- VR-flakes on `cards.spec` are a known carryover (issue #85 — not folded into Phase 7). The mask change shouldn't worsen this; any new flake recorded in T8 commit body for triage.

---

## T9 — ADRs (0036–0039)

Four short ADRs (Context · Decision · Alternatives · Consequences · Sources). Sequential numbering.

### ADR 0036 — Custom cursor as `client:media`-gated Svelte island

- **Decision:** Svelte 5 island, hydrated via `client:media="(pointer: fine)"`.
- **Alternatives:** (a) inline raw JS in `_BaseLayout.astro` — ≥ 60 LOC of pointer math + lerp gets unwieldy inline; loses Svelte $state ergonomics. (b) `client:visible` — fires once cursor scrolls into view, wrong semantics. (c) `client:idle` — runs on touch too, wastes bytes.
- **Sources:** [Astro docs `directives-reference.mdx` `client:media`](https://docs.astro.build/en/reference/directives-reference/#clientmedia) (verified context7 2026-05-01).

### ADR 0037 — Web Audio API direct, no `howler.js`

- **Decision:** Hand-rolled ~30 LOC IIFE in `SoundToggle.astro`'s inline script. `AudioContext` + `decodeAudioData` + `BufferSource`.
- **Alternatives:** (a) `howler.js` ≈ 30 KB minified — unjustified for two ≤ 200 ms clips. (b) `<audio>` element — simpler but `play()` has higher latency than `BufferSource.start()` (~50 ms vs ~5 ms). For "snappy" UI sounds the latency matters; plan keeps Web Audio.
- **Browser autoplay policy:** Both approaches require a user gesture. Documented in inline-script comments.
- **Sources:** [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), [MDN AudioContext autoplay policy](https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide).

### ADR 0038 — Time-of-day extends the Phase-6 head inline-script

- **Decision:** Add ≤ 200 B to the existing IIFE in `MetaHead.astro` rather than introducing a third inline `<script>` block.
- **Alternatives:** (a) Separate `<script is:inline>` for ToD — pays a second `<script>` tag's HTML overhead (~30 B parser cost) for no functional gain. (b) Defer to a Svelte island — costs site-js bundle entry; ToD must apply at first paint to avoid flash, ruling out any post-hydration approach.
- **Sources:** Phase-6 ADR 0035 (theme inline-script), self-contained.

### ADR 0039 — Easter eggs in-house

- **Decision:** Konami listener as inline `<script is:inline>` (≤ 600 B raw); click-counter as Svelte 5 island (≤ 1 KB gzip).
- **Alternatives:** `konami-code` npm package (~3 KB minified, last published 2017) — unmaintained, dependency for ≤ 25 LOC of trivial code is wrong trade-off. `easter-egg-trigger` family — same critique.
- **Sources:** [npm `konami-code` last-publish 2017](https://www.npmjs.com/package/konami-code) (verified context7 / WebFetch at impl-time).

### Files

- `packages/specs/adrs/0036-custom-cursor-island.md`
- `packages/specs/adrs/0037-web-audio-no-howler.md`
- `packages/specs/adrs/0038-time-of-day-inline-script.md`
- `packages/specs/adrs/0039-easter-eggs-in-house.md`

### Acceptance

- Four files committed.
- Each follows the Phase-6 ADR template (Context · Decision · Alternatives · Consequences · Sources).
- One commit titled `Phase 7 T9: 4 ADRs (0036 cursor · 0037 web-audio · 0038 ToD inline · 0039 easter eggs)`.

---

## T10 — Size-limit final + phase close

### Goal
Lock the new size-limit entries; verify all Phase 7 budgets hold; update `progress.md`; open PR; merge.

### Files

- `packages/site/.size-limit.cjs` —
  - **Tighten the parent site-js cap from `420 KB` → `408.5 KB`** at `.size-limit.cjs:94` (`limit: "420 KB"` → `limit: "408.5 KB"`). Ratchets the gate to (current measure 406.54 KB) + 2 KB headroom. **This is the canonical cap-number reconciliation: spec acceptance #9, spec §"Test plan", and this entry must all read `408.5 KB gzip`.**
  - Add three new entries (`cursor-island`, `click-counter-island`, `audio-assets`) per spec §Interfaces.
  - Switch `feed.xml` entry to `compression: false` per #79 (raw-bytes measurement to match the entry's documented intent).
- `/home/vboxuser/.claude/projects/-media-vboxuser-G-samsung1-0utoffiles-code-utofme/memory/progress.md` — append Phase 7 changelog entry; update "current state" header; trim obsolete pointers per CLAUDE.md hygiene.

### Acceptance

- `bun x size-limit` exits 0 with all entries within budget.
- `bun run lefthook run pre-commit` green.
- All vitest + Playwright cases green.
- Axe-clean on every shipped HTML route.
- LHCI mobile ≥ 0.85 on every URL in `lighthouserc.cjs`.
- `gh pr create` opens PR; CI green; merge commit (NOT squash, NOT rebase) into `main`; tag `phase-7` on the merge SHA; `gh pr close --delete-branch` is **skipped** (keep branch per Phase-5 precedent).
- Final commit titled `Phase 7 T10: size-limit final entries + phase close`.

### Phase exit gate

Before opening PR, manually verify:

1. `git log --oneline phase/07-atmosphere ^main` shows ≤ 12 task commits + ≤ 4 fixups.
2. `gh issue list --state closed --search "closed:>=2026-05-01"` shows: #50, #58, #68, #71, #72, #73, #75, #76, #79, #80, #87.
3. `git diff main..phase/07-atmosphere --stat` impact within reason — atmosphere phase, no architecture rewrites; impl-file count ≤ 25; total churn ≤ 1500 LoC including ADRs and tests.
4. No `Co-Authored-By: Claude` strings in any commit.
5. No mention of Claude / Anthropic / vboxuser in PR body, issue text, or any code comment.

---

## Cross-task budget watchlist

A single live numbers table to update at every task commit:

| Metric | Baseline (post-Phase-6) | Cap | After T1 | After T2 | After T3 | After T4 | After T10 |
|---|---|---|---|---|---|---|---|
| site-js gzip | 406.54 KB | 408.5 KB | TBD | TBD | TBD (no delta — inline) | TBD | TBD |
| /audio/* raw | 0 KB | 40 KB | — | TBD | — | — | TBD |
| Head inline script raw | 454 B (theme) | 800 B + 200 B | — | — | TBD | — | TBD |
| Inline-script raw (Konami) | 0 B | 600 B | — | — | — | TBD | TBD |

Implementer fills in measured values in each task's commit body. Final T10 commit pastes the full table.

---

## Implementer rotation

- **T1, T2, T4** — Sonnet (small, well-bounded surfaces).
- **T3** — Sonnet (pure-function + 2 lines of CSS / JS — easiest task).
- **T5** — Sonnet (mechanical find-replace; pre-flight verify gate ensures no surprise).
- **T6** — Sonnet (multiple files, narrow scope each).
- **T7** — Sonnet (CI YAML edits).
- **T8** — Sonnet (snapshot re-record — manual review at PR time).
- **T9** — Sonnet (Markdown only; ADR template).
- **T10** — Opus, justified per CLAUDE.md "Reviewer / hard decisions: **Opus**". Phase-exit involves accept/reject calls on measured budgets, the cap-tightening edit on `.size-limit.cjs`, and the final progress.md update — all decisions on green/red criteria, not implementation churn.

Each task dispatched via `/subagent-driven-development` with the full subagent briefing from CLAUDE.md prepended.

---

## Failure modes & rollback

- **Cursor causes layout shift / paint-storm** on slow devices → revert T1; ship Phase 7 without cursor; file as deferred.
- **Audio decode fails on Safari** → revert T2; ship Phase 7 without sound; file as deferred. (Web Audio is supported on Safari 14.1+ baseline; failure would imply a fixture mismatch, not a missing API.)
- **`z.iso.datetime` not on astro/zod** → defer T5 entirely (per spec §M3 + this plan §T5 pre-flight).
- **Visual-regression flake on T8** → record the flaky baseline as `.skip()` with an issue; do NOT regenerate baselines speculatively.

Each task is independently revertible — no cross-task state. Phase 7 cuts down to 0 tasks gracefully if every feature fails its acceptance.
