# Review: Phase 09 spec (`packages/specs/specs/09-project-view.md`)

Reviewer: independent; did not write the spec. Date: 2026-11-03.
Spec reviewed at `origin/phase/09-project-view` @ `b56f4ec` (898 lines).
Line refs below are spec lines (`L…`) unless a path is given.

## Verdict: green-with-fixes (red as written for the 1.5-day window)

The spec is unusually well sourced. Every Astro 7 router claim I re-checked against the published
`astro@7.4.5` tarball holds (event names, fields, order, `swapBodyElement` media handling, the
reduced-motion kill switch, `priority` → `fetchpriority`). Package versions all match `npm view`.

It is not executable as written in ~1.5 days:
- **Scope.** 12 deliverables, ~20 new + 30+ modified impl files, 9 ADRs and ~60 ACs.
- **Two deliverables do nothing in production.** P9-11's switch and P9-12 both target fixture pages, and P9-3 keeps fixtures out of the deploy.
- **Duplicate work.** P9-1 is already partly done on a separate branch.
- **The critical path runs through the owner's machine.** The source media, `UTOFME_MEDIA_ROOT` and `_local/` are not in the repo, and that machine's Node can't run Astro 7.
- **The card encode size is wrong.** It is odd (720×405), so neither encoder accepts it.

Fix the BLOCKER and MAJOR items below, adopt the minimal cut (§ Minimal viable cut), and the spec is green.

## Findings

Severity order. Each item gives the issue, the evidence and a concrete fix.

### BLOCKER

**1. The critical path depends on the owner's machine, and the spec treats that as non-blocking (L73, L814, L840).**
- P9-10 (content) and P9-4 encoding need `UTOFME_MEDIA_ROOT` (L229, L621). That is the owner's code root (`RL_playground/…`, `manimce/…`, …).
- None of it is in the repo. `_local/` doesn't exist in the checkout either (`ls -a` at repo root), so the research files the spec cites (`_local/research/…`, `_local/proposals/…show-me-*.html`) can't be read by any cloud worker.
- The owner's Node 22.22.3 can't run Astro 7. `bin/astro.mjs` in the 7.4.5 tarball reads `const engines = IS_STACKBLITZ ? '>=22.22.0' : '>=22.23.4'` and only skips the check when the major is above 23.
- So "a great project view + several real projects live" can't be previewed or produced until Open question 1 is answered. Parallel workers can build every mechanism but can't produce a single real project.

**Fix:**
- Make Open question 1 a gate that must be answered before execution starts. Installing Node 22.23.4 or 24.x via fnm/volta is the clean answer.
- Workaround to record: the npm scripts run `astro` through its `#!/usr/bin/env node` shebang. `bun --bun run build` runs it under Bun instead, which reports `process.versions.node` = `26.3.0` here (Bun 1.4.4), so the check is skipped. That is an unsupported runtime for Astro, so use it only as a stop-gap.
- Schedule the content task (W7 below) on the owner's machine from hour 0. In the meantime, workers use synthetic loops: the container's ffmpeg 6.1.1 has `libsvtav1` / `libx264`, so `testsrc`-based fixtures can be encoded in CI-like environments.
- Copy every value workers need from `_local/` into the spec or plan. Most tokens and timings already are; the card-variant reference CSS and the media inventory paths are the gaps.

**2. The card/gallery frame of 720×405 can't be encoded (L245; also R-tables, `Size` in L259).**
- The height is odd, and yuv420p needs even dimensions. Measured with the container's ffmpeg 6.1.1 (SVT-AV1 1.7.0):
  - libsvtav1 fails with "Source Height must be even for YUV_420";
  - libx264 fails with "height not divisible by 2 (720x405)".
- Every card and gallery encode in P9-4/P9-10 would exit 2.

**Fix:** Use **768×432** (exact 16:9, even) or 640×360. 720×404 and 720×406 also encode, but they are not exactly 16:9. Then re-derive the codecs table:
- H.264 High@3.0 → `avc1.64001E` for ≤ 720p-class card sizes, and `avc1.64001F` at 1280×720 (both measured).
- AV1 is `av01.0.04M.08` at 720×404/406 and `av01.0.05M.08` at 1280×720 (measured `seq_level_idx` 4 and 5).

The ffprobe-derived design in L249-251 is right. Only the frame size is wrong.

### MAJOR

**3. P9-1 duplicates `origin/phase/09-astro7` and misses `prettier-plugin-astro` (L52-67).**
- Commit `12d2483` on `phase/09-astro7` already does:
  - the `unified()` processor, `compressHTML: true` and the container-renderer import;
  - `astro ^7`, `@astrojs/mdx ^8`, `@astrojs/react ^7`, `@astrojs/svelte ^9`, EC `^0.44`;
  - **`prettier-plugin-astro ^0.14.1 → ^1.1.2`**, which reformats 29 files (+930/−760, mostly `.astro`).
- The spec's table doesn't list `prettier-plugin-astro` at all. `npm view` shows `0.14.1` depends on the Go `@astrojs/compiler ^2.9.1`, while `1.1.2` depends on `@astrojs/compiler-rs ^0.5.2`, the Rust compiler Astro 7 uses.
- That branch keeps `astro-pagefind ^1.8.6` (peers `astro ^2…^6`) and `vite.build.rollupOptions`. So the spec and the branch already disagree on two points.
- The second one is a silent bug on that branch:
  - Vite 8.3.5 only aliases `rollupOptions` via `rolldownOptions ??= rollupOptions`.
  - Astro 7.4.5 (`dist/core/build/vite-build-config.js`) reads only `viteConfig.build?.rolldownOptions` and always sets `rolldownOptions` itself.
  - So the `manualChunks` on that branch is effectively dropped, and `graph-vendor` stops being split out. This was derived from source, not built.
  - The spec's migration to `rolldownOptions.output.codeSplitting.groups` (L75) is correct and **required**, not optional. The group `name` does become `_astro/graph-vendor.<hash>.js`: rolldown 1.2.14 types say the name "replace[s] the `[name]` placeholder in `output.chunkFileNames`", and Astro's `chunkFileNames` is `_astro/[name].[hash].js`. That closes the spec's "Not verified" item at L894.

**Fix:**
- Add `prettier-plugin-astro ^1.1.2` to the P9-1 table with that reason.
- State that P9-1 **starts from `phase/09-astro7` @ `12d2483`** (cherry-pick or merge), not from scratch.
- Land the reformat as its own commit **before** any parallel worker branches. Otherwise every worker touching `.astro` files gets a whole-file conflict.

**4. The phase file budget is already breached, which is a CLAUDE.md FIRE trigger (L712-716).**
- L713 declares "≤ 34 modified implementation files".
- The prettier-plugin-astro reformat alone touches ~25 `.astro` files (finding 3). On top of that come the ~30 files the spec already lists.
- Several files are also missing from the list: `.github/workflows/mutation.yml` (finding 6), `src/pages/lab/datamosh.astro` (finding 7), `playwright.config.ts` (for `@perf` / `--grep-invert`, if done in config), and the e2e specs.

**Fix:** Either (a) exempt formatter-only churn from the phase budget explicitly (a refactor carve-out analogue, cite the commit), or (b) raise the cap with the reason. Also correct the new-file count: L686-692 lists **20** files, not 21 (L694).

**5. The LCP / eager-poster rule assumes row order, but the home is column-major (L124, L373, AC6.4, R4).**
- `src/pages/index.astro:12-14`: "Masonry = CSS multi-column … order flows column-major (top-to-bottom through column 1, then column 2, ...)". Desktop uses 2 columns (`index.astro:218-221`).
- So DOM cards 1 and 2 are both in column 1. The top of column 2, which is above the fold and is likely the LCP element, is DOM card ≈ ⌈n/2⌉+1, and it stays `loading=lazy`.

**Fix:**
- Make "eager" cover the first card of each column at the widest breakpoint. Column breaks depend on heights, so mark the first ⌈n/cols⌉+1 as a candidate set, or simply the first 4 DOM cards.
- Keep `fetchpriority=high` on card 1 only.
- Change R4 to "first card of each column not lazy; ≤ 1 high". AC6.4 should assert by visual position: the largest `img` intersecting the initial viewport is not lazy.

**6. `mutation.yml` keeps Node 22.12, so nightly Stryker breaks (AC1.5, L72).**
- `.github/workflows/mutation.yml:26` has `node-version: "22.12"`, and main's `f09456b` says that job needs Node for the `astro sync` subprocess.
- AC1.5 only names `ci.yml` and `deploy.yml`. Stryker is a CLAUDE.md requirement ("Run nightly in CI").

**Fix:** Change AC1.5 to "every workflow under `.github/workflows/` pins ≥ 22.23" and grep for it.

**7. Fixtures leak into production by three routes the guard doesn't check (L189-194, AC3.5).**
- (a) `src/pages/lab/datamosh.astro:26` calls `getCollection("works", …)` directly and isn't in the `works-collection.ts` caller list (L198). `/lab/datamosh/` therefore ships fixture cards and their GIFs (the mock dir is 15 MB) in the `UTOFME_FIXTURES=false` deploy.
- (b) P9-11's `mock-<name>` loops live in `public/loops/mock-*`. `public/` is copied to `dist/` unconditionally, so they deploy whatever the flag says.
- (c) The guard only checks `dist/works/code-1/` and `dist/index.html`. It doesn't check `/works/`, `sitemap-*.xml`, both feeds or `dist/pagefind/`.

**Fix:**
- Route `lab/datamosh.astro` through `works-collection.ts`, or explicitly accept `/lab/datamosh/` as fixture-only and exclude it from the deploy.
- Put mock loops outside `public/`, or skip them, since P9-11 is deferred (§ Minimal viable cut).
- Make the guard a script (`scripts/check-no-fixtures.ts`) with a unit test, so AC3.5 becomes falsifiable instead of a "dry run documented in the plan". The script scans all of `dist/` for any fixture slug and any `[data-fixture]`.

**8. P9-12 and P9-11's switch have no production effect this phase (L670-681, L652-668).**
- `/works/code-sandbox/` is a fixture (`src/content/works/code-sandbox.mdx`). Under P9-3 it is never built in the deploy (`deploy.yml` with `UTOFME_FIXTURES=false`).
- The mock-GIF switch only changes fixture covers, which don't deploy either.

**Fix:**
- Defer P9-12 (D11 decides *how*, not *when*) and P9-11 in full. File them as `phase-N` issues.
- Drop the "Project + demo" budget row and AC12.x, and the `sandbox-mount.tsx` and `loops-ab.astro` files.

**9. The banner upgrade runs during the morph and isn't mirrored on Back (L584-591, AC9.6).**
- In 7.4.5 `dist/transitions/router.js`, `onPageLoad()` is chained on `viewTransition.updateCallbackDone.finally(…)`, not on `finished`. So `astro:page-load`, and with it the upgrade check (step 8), fires **while** the 450 ms `hero` animation is still running. The node swap then happens inside the live `::view-transition-new(hero)`.
- Swapping two loops of different encodes mid-animation, with `currentTime` synced only approximately, risks a visible jump at a hard cut.
- On Back, the persisted node is whatever sits in the banner. After an upgrade that is the 1280 w banner encode, which `swapBodyElement` moves into the home card (`swap-functions.js:126-148`). From then on the card plays a ≤ 1 MB banner file, and nothing downgrades it.

**Fix:** Defer the upgrade. Accept a softer banner right after a morph; direct loads get the banner encode. If kept, (a) run it on `viewTransition.finished`, and (b) persist by a size-independent id, swapping back to the card encode on Back. Add an AC that the card's `currentSrc` contains `/card.` after Back.

**10. AC9.2's `activeViewTransition` assertion is vacuous (L609).**
- In `router.js`, `doPreparation` dispatches `astro:after-preparation`. `document.startViewTransition` is called only **afterwards**, in `transition()`.
- So at the moment AC9.2 samples, `document.activeViewTransition` is `null`, and `?.ready` yields `undefined`, which a test "resolves" trivially.

**Fix:** Capture `e.viewTransition` in an `astro:before-swap` listener and assert that `ready` resolves, and that it is a native transition (not Astro's simulated object, which lacks `types` behaviour). Do the same for every AC that samples state "when after-preparation fires": label the event precisely.

**11. Parallel work has hidden shared-file coupling (Component / file map L683-710).** These files are touched by more than one deliverable:

| File | Touched by |
|---|---|
| `src/components/Card.astro` | P9-7 (caption, frame), P9-9 (remove `transition:name`, `data-vt-*` hooks), P9-6 (LoopMedia), P9-3 (`data-fixture`), and the out-of-phase hover workers |
| `src/pages/index.astro` | P9-3 (data source), P9-6 (eager/priority props, MotionToggle in `.site-head`), P9-7 (hover arming) |
| `src/layouts/_BaseLayout.astro` | P9-1 (reformat), P9-9 (hero-morph import), P9-6 (motion bootstrap) |
| `package.json` | P9-1 (deps), P9-2, P9-4, P9-5, P9-7 (`test:perf`) scripts |
| `ci.yml` | P9-1, P9-2, P9-4 |
| `deploy.yml` | P9-1, P9-3 guard, P9-5 probe |
| `tsconfig.json`, `knip.jsonc` | P9-5 and any worker that adds a directory |
| `src/content.config.ts` | P9-3 |
| content entries | P9-10 |
| `tests/e2e/*` | the external "test worker" (L84, L770) |

**Fix:** The plan must assign each shared file a single owner (proposal in § Task split), and publish markup and data contracts up front:
- the attribute contract `[data-work-slug] > .card-figure > [data-vt-frame] + [data-cap]`;
- the `loops.json` TS type;
- the schema field names.

Other workers code against those contracts. `bun.lock` changes only in the upgrade task.

**12. AV1 software-decode cost on the owner's no-GPU Chrome is unmeasured (L445-449, Risk 11).**
- The `@perf` spec toggles only the blur. With AV1 listed first, Chrome on a no-GPU machine software-decodes every in-view loop, and 4–8 cards can be in view on a 2-column desktop.
- H.264 is usually cheaper in software.

**Fix:** Extend the `@perf` run with a codec axis: AV1-first vs H.264-first, blur on and off. Add a rule: if AV1-first raises p95 frame interval by > 4 ms over H.264-first, order the sources H.264 first for **card** size only. File size grows; the R5 order check would then become per-size.

### MINOR

**13. Not every AC is a test, despite L46.** L46 says every AC is a test/assert/grep.
- Not tests: AC3.5 ("dry run documented"), AC5.3 / AC5.4 (post-deploy / manual), AC7.7 (ADR text), AC10.4 (PR checkbox), AC11.2 (owner-gated).
- Fix: reword L46 to "or a recorded manual check", and tag those ACs `[manual]`.

**14. The flash lint is weaker than SC 2.3.1 (L261-264).**
- Whole-frame mean of YAVG (gamma-encoded luma) under-detects local flashes. SC 2.3.1's general threshold concerns flashes over ~25 % of a 10° field, so a flashbang filling 30 % of a 16:9 frame moves the mean by well under its own delta.
- 10 % of the gamma scale is also not 10 % relative luminance.
- Fix: compute per-tile luminance (e.g. 4×4 grid via `crop`+`signalstats`, or decode to raw and compute in Bun), linearise, and apply the WCAG pair rule (Δ ≥ 10 % and the darker < 0.80) per tile.

**15. Shot durations fall below the owner's intent (L236).** `duration (0.5–2.0 s)`, but the owner asked for 1–2 s hard cuts. Fix: `1.0–2.0 s`. This also caps cut-induced transitions at ≤ 1 per s.

**16. AC10.1 has no CI path.** It asserts on the `UTOFME_FIXTURES=false` build, but only `deploy.yml` builds that way. Fix: have the guard script (finding 7) also assert ≥ 6 non-fixture cards newest-first in `dist/index.html`, and run it in `deploy.yml` before `wrangler deploy`.

**17. Card link accessible name.** The `<a>` name becomes poster `alt` + title + description + meta (the Pagefind spans are `hidden`, so they're excluded). Screen readers hear it twice and at length. Fix: card-context poster `alt=""` (the title names the link), and keep `alt` on the banner and gallery. Assert the name with `getByRole('link', { name: /^<title>/ })`.

**18. `lede ?? summary` can be empty.** `writing-3-no-summary.md` has neither field, so the card would render an empty `<p class="card-cap__d">`. Fix: omit the element when both are absent, and add a container test.

**19. Stryker and fast-check coverage of the new Zod schemas is incomplete** (CLAUDE.md: "all Zod schemas").
- `src/lib/loops/manifest.ts` (`loopsManifestSchema`) isn't in the L782 `mutate` list.
- AC4.2 property-tests only the manifest, not `recipeSchema` (L752 claims both).
- Fix: add the file to `mutate`, and add a `recipeSchema` parse/safeParse property to AC4.2.

**20. Range Worker table row 1 is mislabelled (L315).** A path not under `/loops/` reaching the Worker doesn't "only happen if routing changes".
- Cloudflare's `routing/static-site-generation.mdx` diagram and the `navigation_requests` partial say this. With a `main`, `not_found_handling` set and `compatibility_date ≥ 2025-04-01` (this repo: `2026-04-01`):
  - **navigation** requests (`Sec-Fetch-Mode: navigate`) for unmatched paths get `404.html` without invoking the Worker;
  - **every other** unmatched request (fetch, subresources, curl, many crawlers) invokes the Worker and counts against the Free 100k/day.
- Fix: relabel the row. Keep the final `return env.ASSETS.fetch(request)`. Add an AC that a non-navigation request for a missing path returns 404 with the `404.html` body.
- Also note the Free plan's 10 ms CPU per invocation in ADR 0045. Slicing a ≤ 1 MB `ArrayBuffer` is well under it, but don't hash or copy the body more than once.

**21. `If-Range` against a weak ETag (L318).** RFC 9110 §13.1.5 requires a *strong* match, so a weak `W/"…"` ETag must never satisfy it. Fix: treat any weak validator as a mismatch (a 200), and add a fast-check case.

**22. Back-navigation edge.** If the home card for `<slug>` is outside the restored viewport, the mirror still names it, and the morph flies off-screen. Fix: in `before-swap`, skip the mark when the saved `scrollY` puts the card's row outside the viewport (cheap: compare against `history.state.scrollY` and an approximate offset), or accept and note it.

**23. LHCI/size-limit pinned below latest without a cited incompatibility (L40).** CLAUDE.md § Library version policy: latest stable major is the default, and fallbacks need a cited reason. "Time" is a valid reason; say so explicitly at L40.

### NIT

**24.** CLAUDE.md says "7 phases 0–6 + opt-in 7". This is phase 9. Ask the owner to update CLAUDE.md (CLAUDE.md § Repo hygiene forbids editing it unasked).

**25.** depcruise only covers `src` (`package.json` `check:depcruise`), so `scripts/` and `worker/` aren't covered. Note it in the plan, or extend.

**26.** L413 cites `card-mosh.ts:270,288` and `card-dither.ts:601-606`. Those files are being edited by other workers right now (L26), so the line refs will drift. Cite symbols, not lines.

## Verified-API table

`OK` = matches the named source as fetched or unpacked on 2026-11-03. Sources marked † were read from the published npm tarball `astro@7.4.5` (`npm pack`), whose `dist/` is the compiled form of the GitHub sources the spec cites.

| Name (spec line) | Source checked | Result |
|---|---|---|
| `astro` 7.4.5, `@astrojs/mdx` 8.1.2, `react` 7.1.2, `svelte` 9.1.2, `sitemap` 3.7.4, `rss` 4.0.19, `check` 0.9.12, EC 0.44.3, `astro-pagefind` 2.0.1, `@astrojs/markdown-remark` 7.3.5 (L56-65) | `npm view <pkg> version` (2026-11-03) | OK |
| Peers: `astro` peers `@astrojs/markdown-remark ^7.3.0`; mdx peers `astro ^7.2.10`; svelte peers `svelte ^5.43.6`, `typescript ^5.3.3 \|\| ^6`; astro-pagefind 2.0.1 peers `astro …\|\| ^7` and depends on `@pagefind/component-ui ^1.5.0` | `npm view … peerDependencies dependencies` | OK |
| `prettier-plugin-astro` (missing from L52-67) | `npm view`: 0.14.1 → `@astrojs/compiler ^2.9.1`; 1.1.2 → `@astrojs/compiler-rs ^0.5.2` | **MISSING** (finding 3) |
| Node floor `>=22.23.4`, hard fail in `bin/astro.mjs` (L71) | † `bin/astro.mjs` (`engines = IS_STACKBLITZ ? '>=22.22.0' : '>=22.23.4'`, check skipped for major > 23); `package.json` `engines.node` | OK |
| `compressHTML` default `'jsx'`, `true` allowed (L82) | † `dist/core/config/schemas/defaults.js:33`, `base.js:54` (`z.union([z.boolean(), z.literal("jsx")])`) | OK |
| `markdown.processor: unified({…})` (L79) | † `base.js:234` (`processor: z.object(…)`); used on `phase/09-astro7` `astro.config.mjs` | OK |
| `@astrojs/svelte/container-renderer` (L84) | `npm view @astrojs/svelte@9.1.2 exports` → `"./container-renderer"` | OK |
| `astro:before-preparation` fields `from,to,direction,navigationType,sourceElement,info,newDocument,signal,formData,loader`; cancelable (L552) | † `dist/transitions/events.js` `BeforeEvent` / `TransitionBeforePreparationEvent` | OK. At this event `newDocument` is the **current** `window.document` (the loader replaces it) |
| `astro:after-preparation` fires after the loader, before `startViewTransition` (L553-554) | † `events.js` `doPreparation`; `router.js` `transition()` | OK (but see finding 10 for AC9.2) |
| `astro:before-swap` fields `viewTransition, newDocument, direction, swap` (L555) | † `events.js` `TransitionBeforeSwapEvent` | OK |
| `data-astro-transition` set before `startViewTransition`; skipped when `hasUAVisualTransition` (L554, L581, L595) | † `router.js` `setAttribute(DIRECTION_ATTR, …)` then `if (supportsViewTransitions && !hasUAVisualTransition)` | OK |
| `astro:page-load` timing (L559) | † `router.js`: `viewTransition.updateCallbackDone.finally(() => { runScripts(); onPageLoad(); announce(); })` | OK as listed, but it fires **before** `finished` (finding 9) |
| `sourceElement: link` for link clicks (L552) | † `components/ClientRouter.astro:101` | OK |
| `transition:persist` → `data-astro-transition-persist`; persisted media not re-created; `moveBefore` else `appendChild` (L355, L556, L597) | † `swap-functions.js:2, 110-200` (`liveMedia`, `reifyMediaElements`) | OK |
| Reduced-motion kill switch (L596) | † `components/viewtransitions.css:56-66` | OK |
| `<Picture priority>` → `loading=eager decoding=sync fetchpriority=high` (L355) | † `dist/assets/internal.js:113-117` (`??=`, so explicit props win) | OK |
| `envField.boolean({ context:"server", access:"public", default:true })`, `astro:env/server` (L191) | † `dist/env/schema.js:54-63` (server+public allowed); `validators.js:90` (`"true"`/`"false"` only) | OK. Any other string (e.g. `0`, `FALSE`) is a build error. Not usable in `astro.config.mjs` or scripts |
| `experimental_AstroContainer` name (L93) | spec cites source; not re-checked | not re-checked |
| Vite 8 `build.rolldownOptions`; `manualChunks` object removed, function deprecated (L74) | vitejs/vite `docs/guide/migration.md`; vite 8.3.5 types | OK. `rollupOptions` is ignored under Astro 7 (finding 3) |
| Rolldown `output.codeSplitting.groups[{ name, test }]` (L75) | rolldown 1.2.14 `.d.mts` (vite 8.3.5 pins `~1.2.14`); `advancedChunks` deprecated | OK. Group name → `[name]` in `chunkFileNames` |
| astro-pagefind 2: `components/Search.astro`, `PagefindConfig.astro` → `<pagefind-config bundle-path>` + component-ui CSS (L85) | `npm pack astro-pagefind@2.0.1` (`exports "./components/*"`) | OK. `Search.astro` renders `<pagefind-searchbox>` |
| `<pagefind-input>`, `<pagefind-summary>`, `<pagefind-results>` (L86) | Pagefind repo `docs/content/docs/components/_index.md`; `@pagefind/component-ui@1.6.0` registrations | OK |
| Pagefind runtime files for the new size-limit entry (L140) | pagefind 1.6.0 strings | `pagefind.js`, `pagefind-entry.json`, `wasm.<lang>.pagefind`, `*.pf_meta`, `*.pf_index`, `*.pf_fragment`, `pagefind-worker.js`. Name them in the plan |
| `run_worker_first` boolean \| array, `*`/`!`, ≤ 100 (L306) | cloudflare-docs `static-assets/binding.mdx`; wrangler 4.85.0 `config-schema.json`, `MAX_ROUTES_RULES = 100` | OK |
| `env.ASSETS.fetch(Request\|URL\|string)`; html/not_found handling applied (L307) | `binding.mdx` | OK |
| Range → 200 not 206; workaround = `run_worker_first` + `env.ASSETS.fetch` + build 206 (L286) | `billing-and-limitations.mdx` (quoted text still present) | OK |
| `env.ASSETS.fetch` with a `Range` header | workers-shared asset-worker source: no 206 path | Returns 200 full body; the Worker must slice (the spec already does a clean GET) |
| `_headers` not applied to Worker responses (L324) | `static-assets/headers.mdx` | OK |
| `main` + TS entry bundled by wrangler (L294) | `wrangler/configuration.mdx` (bundling mode) | OK |
| `wrangler dev` range support (L334, Risk 4) | miniflare 4.20260424.0 assets worker: no 206 | Local assets also return 200; the Worker path is what's tested. OK as specced |
| Unmatched path with `main` (L315) | `routing/static-site-generation.mdx`, `navigation_requests` partial | **Row label WRONG** (finding 20) |
| Free plan: `run_worker_first` hits invoke the Worker, 429 over limit, 100k/day (L821) | `billing-and-limitations.mdx`; `limits.mdx` (Error 1027); `pricing.mdx` (10 ms CPU) | OK |
| ffmpeg `libsvtav1` `-preset -2..13`, `-crf 0..63`; `libx264 -tune stillimage -profile:v high`; `-movflags +faststart`; filters `concat`, `signalstats` (YAVG), `fps`, `scale force_original_aspect_ratio`, `crop`, `pad`, `setsar`, `format`; `ffv1` (L219, L240-248) | local ffmpeg 6.1.1 `-h encoder=…`, test encodes | OK |
| 720×405 card frame (L245) | test encode, both encoders | **WRONG**: odd height (finding 2) |
| `avc1.64001E` (High@3.0) / `avc1.64001F` (@3.1) (L250) | measured avcC `0164001e` (720×404/406), `0164001f` (1280×720) | OK |
| `av01.0.<nn>M.08` (L251) | measured av1C `81040c00` → `04` (720-wide), `81050c00` → `05` (1280×720) | OK (form). `nn` differs by size |
| Zod 4 `z.url()`, `z.coerce.date()`, `.extend()`, `.superRefine()` on a discriminated union, `z.iso.datetime()`, `.default([])` (L160-183) | zod 4.6.7 `v4/classic/*.d.ts` (astro depends on `^4.6.6`) | OK. `superRefine` isn't deprecated and returns `this` (still a `ZodDiscriminatedUnion`). `.extend()` throws on refined objects with overlapping keys (n/a here) |
| `document.activeViewTransition` Chrome 142+ (L609) | MDN BCD 8.1.8 | OK (Firefox 147, Safari 26.2) |
| `Element.moveBefore` absent in Safari (L597) | BCD: Chrome 133, Firefox 144, Safari no | OK |
| Firefox ≥ 144 same-document VT (L594) | BCD `startViewTransition` Firefox 144 | OK |
| `requestVideoFrameCallback` Chrome 83 / Firefox 132 / Safari 15.4 (L364) | BCD | OK |
| `page.emulateMedia({ reducedMotion })`, `test.use({ launchOptions: { args } })`, `--disable-software-rasterizer`, `--use-gl=disabled` (L445) | Playwright 1.64.1 types; Chromium `content_switches.cc`, `gl_switches.cc` | OK. `launchOptions` is worker-scoped: `test.use` at file/describe level |
| Playwright Chromium lacks proprietary codecs (L497, Risk 8) | `playwright.dev/docs/browsers` text vs Playwright now downloading Chrome-for-Testing builds | **UNVERIFIABLE**. AV1-first keeps AC7.5 valid either way. Add a `canPlayType` probe test so the assumption is visible |
| Safari AV1 only with hardware decode (Risk 4) | Bitmovin / Apple dev forums (third-party) | OK (H.264 fallback kept) |
| `sharp` raw output (AC7.1b), React `createRoot` (L674) | spec SKIP rule | not re-checked (AC7.1b and P9-12 deferred in the cut) |

Network note: `developers.cloudflare.com`, `rolldown.rs`, `vite.dev`, `pagefind.app`, `docs.astro.build` and `playwright.dev` were unreachable from the review environment (proxy 403). The same pages were read from their source repositories (cloudflare-docs, vitejs/vite, Pagefind/pagefind, withastro/docs) and from the published npm tarballs.

## Minimal viable cut (≈ 1.5 days, owner goal: great project view + several real projects live)

**Keep (critical path):**
1. **P9-1** from `phase/09-astro7` plus:
   - Node 22.23 in all 3 workflows;
   - `rolldownOptions` / `codeSplitting` (fall back to function `manualChunks` with `@issue`);
   - **astro-pagefind decision:** if `/search/` e2e is green on 1.8.6 under Astro 7 (the peer warning only), defer the Component UI rewrite to an issue; else do it. It is isolated (`SearchBox.astro` + `search.spec.ts`).
2. **P9-3** schema v2 + fixture flag + `works-collection.ts`, with the full-`dist` guard script (finding 7).
3. **P9-4** encode core:
   - montage / slideshow / transcode;
   - AV1 + H.264;
   - poster;
   - manifest;
   - encode-time budgets;
   - card/gallery frame at **768×432** (finding 2);
   - flash lint (whole-frame now; tile version is an issue);
   - `--check`.
   Prune can be manual.
4. **P9-5** Range Worker (small, isolated, Safari/iOS playback depends on it).
5. **P9-6** `LoopMedia` + controller + Pause motion + LCP fix (with finding 5's column-aware eager set).
6. **P9-7** CSS caption bar + zoom/reveal + gating, plus the AC7.1a token test. Blur off by default (`--caption-blur: none`) until the `@perf` run is done.
7. **P9-8** project page (Tier S, 3:1 / 16:9 banner, private label).
8. **P9-9** core morph: two names, persist, focus, Back mirror, no-VT fallback, reduced motion.
9. **P9-10** tactical-arena + **≥ 3** others required (target 5+), on the owner's machine.
10. **P9-2 reduced:**
    - delete the 13 CSS-glob entries, the pagefind-ui entry and the site-js entry from `.size-limit.cjs`;
    - `check:budgets` with **R1, R3, R4, R5, R6** + report-only total only.

**Defer (file issues):**
- P9-11 (A/B page + switch) and P9-12 (Sandpack facade): no prod effect, finding 8.
- #121 video-frame source for `?dither` / `?mosh` (flagged extras; collides with in-flight hover workers).
- Banner upgrade and zoom-settle (finding 9).
- AC7.1b pixel test and the `@perf` spec as automated tests: run once by hand and record in the ADR.
- Budgets R2/R7/R8/R9, the Δ-vs-`main` baseline and the import-graph walker's lazy bucket.
- Pagefind Component UI (conditional, above).
- ADRs: write 0043 (upgrade), 0044+0045 (loops + Worker), 0046+0050 (morph + caption), 0047 (budgets). Fold 0048/0049 into those; 0051 waits for P9-12.

This keeps every owner decision except D7's switch and D11, which both act only on fixtures.

## Proposed task split (disjoint file ownership)

**Serial first:**

**W0: Upgrade (~3–4 h, blocks all).**
- Owns: `package.json` deps, `bun.lock`, `astro.config.mjs`, all `.github/workflows/*.yml` Node pins, the prettier-plugin-astro reformat commit, `SearchBox.astro`, `search.spec.ts`, and the container-renderer test imports.
- Also adds every **script name** the phase needs to `package.json` in one commit, pointing at files that the owning workers create. Knip ignores missing entry files until they exist; if not, add them as stub files with TSDoc `@issue`.

**Then in parallel** (each worker on its own branch off W0's tip; merge into `phase/09-project-view` in this order: W1 → W2 → W3 → W4 → W5 → W6, then W7 content):

| Worker | Owns (exclusive) | Consumes (contract only) |
|---|---|---|
| **W1 Schema & fixtures** | `src/content.config.ts`, `src/lib/works.ts`, `src/lib/works-collection.ts`, `src/pages/{works/[...slug].astro, feed.xml.ts, feed/works.xml.ts, lab/datamosh.astro}`, 16 fixture frontmatters, the `env` block in `astro.config.mjs` (one hunk, after W0), `scripts/check-no-fixtures.ts`, the `deploy.yml` guard step | none |
| **W2 Encode pipeline** | `scripts/encode-loops.ts`, `scripts/lib/loops-core.ts`, `src/lib/loops/manifest.ts`, `media/recipes/` schema + one **synthetic** recipe (`testsrc`) and its committed outputs, `lefthook.yml`, the `ci.yml` `check:media` step | none; publishes the `loops.json` TS type in hour 1 |
| **W3 Range Worker** | `worker/index.ts`, `src/lib/range.ts`, `wrangler.jsonc`, `tsconfig.json` and `knip.jsonc` include lines, the `deploy.yml` probe step | none |
| **W4 Card & playback** | `LoopMedia.astro`, `src/lib/loops/controller.ts`, `src/lib/motion.ts`, `MotionToggle.astro`, `src/lib/contrast.ts`, `Card.astro`, `CoverImage.astro`, `tokens.css`, `src/pages/index.astro`, `src/pages/works/index.astro` | W1 field names, W2 manifest type, synthetic loop |
| **W5 Project page & morph** | `_WorkLayout.astro`, `ProjectMeta.astro`, `Gallery.astro`, `PrevNext.astro`, `transitions.css`, `src/lib/vt/hero-morph.ts`, `_BaseLayout.astro` | W4's `LoopMedia` props + the attribute contract (finding 11); stubs `LoopMedia` until W4 lands |
| **W6 Budgets** | `scripts/route-budgets.ts`, `scripts/lib/route-budgets-core.ts`, `route-budgets.config.ts`, `.size-limit.cjs`, the `ci.yml` `check:budgets` step, `lighthouserc.cjs` | the final `dist/` for calibration (last) |
| **W7 Content (owner's machine)** | `media/recipes/<real-slug>.json`, `public/loops/<slug>/`, `src/assets/{loops,works}/<slug>/`, `src/content/works/<slug>.mdx` | W1 + W2 merged |
| **W8 Tests/ADRs** | rewrites of `detail.spec.ts:124-140`, `transitions.spec.ts`, `filter.spec.ts` counts, visual baselines; ADR files | coordinate with the external test worker (L26) |

**Remaining coupling to manage:**
- `ci.yml` and `deploy.yml` are shared by W0, W1, W2, W3 and W6. Each adds one step, which are line-local appends; merge in order, and have the step names fixed in the plan.
- `index.astro` (W4) depends on W1's `works-collection.ts`, so W4 rebases after W1.
- The morph e2e (W5) needs W4's real card markup. W5 writes unit tests against fixtures first, then e2e after W4 merges.
