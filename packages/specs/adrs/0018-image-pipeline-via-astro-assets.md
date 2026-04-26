# ADR 0018 — Image pipeline via `astro:assets` (`<Picture>` + Sharp)

## Status

Accepted — Phase 3. **Supersedes ADR 0010** (Phase 1: cover schema-only, no `<img>`).

## Date

2026-04-26

## Context

ADR 0010 deliberately deferred any image rendering: Phase 1 captured `cover?: { src: string; alt: string }` in the schema but rendered zero `<img>` elements. The ADR explicitly stated *"Phase 3.4 must add a `<Image />` rendering pipeline"* and treated the deferral as a firm contract.

Phase 3 ships the per-work detail page (`/works/[slug]/`). The cover image now has a real render surface. The question is **which optimisation strategy** to use for responsive, multi-format delivery.

The site runs as a **Cloudflare Workers (Assets) static build** (ADR 0004). Output mode is `static`. The Cloudflare adapter is deliberately not installed (ADR 0004), so options that depend on the adapter — including `imageService: "compile"` — are unavailable. The `astro:assets` module with its default **Sharp** image service handles all optimisation at `astro build` time.

Two constraints shaped the choice:

1. **Static-only invariant (ADR 0004):** runtime image transforms (e.g. Cloudflare Images via the `cf:image` binding) require a request-time transform layer, which is incompatible with static output. The Workers Assets deployment serves pre-built files; there is no Worker code to intercept image requests.

2. **Multi-format coverage:** modern browsers support AVIF (smaller) and WebP (wider support); the HTML fallback chain `<picture> <source type="image/avif"> <source type="image/webp"> <img>` is the correct semantic. Astro's `<Image>` component emits a single format; `<Picture>` emits the full `<picture>` element with one `<source>` per requested format and an `<img>` fallback. The Phase 3 spec requires AVIF + WebP variants with the original as fallback.

## Decision

1. **Use `<Picture>` from `astro:assets`** (not `<Image>`) for the cover render in `CoverImage.astro`.
   - `formats={["avif", "webp"]}` — Sharp emits AVIF and WebP at build time; the original format (`jpg`) becomes the `<img>` fallback.
   - `widths={[320, 640, 960, 1280]}` — four responsive breakpoints, matching the `sizes="(min-width: 800px) 800px, 100vw"` hint.
   - `loading="lazy"` — cover is below the hero fold; defer decode.

2. **Sharp is the default image service** for `astro:assets` in a static build with no adapter installed. No explicit `imageService` config key is added to `astro.config.mjs`; Astro 6 auto-selects Sharp. `sharp` is added as a production dependency in `packages/site/package.json` (Task 5) so that the version is pinned and the `bun install` audit surface is explicit.

3. **Schema migration:** `cover.src` field in the `works` collection migrates from `z.string()` to the Astro `image()` helper (function-form `schema: ({ image }) => …`). This is the breaking change promised in ADR 0010 Consequences. The `image()` helper returns an `ImageMetadata` object at collection-load time; `CoverImage.astro` receives it as `src: ImageMetadata` and passes it directly to `<Picture>`.

4. **`CoverImage.astro` is the single render point** for cover images in Phase 3. It is used inside `_WorkLayout.astro` and nowhere else. No card component renders `<img>` (ADR 0010 constraint on cards is preserved; cards do not display covers).

### Empirical verification (Task 5, commit `63228d2`)

A `cover-fixture.mdx` file with `cover: { src: ../../assets/works/cover-fixture.jpg, alt: "..." }` was built. Post-build inspection confirmed:

- `dist/_astro/` contains `*.avif`, `*.webp`, and `*.jpg` variants of `cover-fixture.jpg`.
- Built HTML for `/works/cover-fixture/` contains `<picture>` with `<source type="image/avif" srcset="…">` and `<source type="image/webp" srcset="…">` before the `<img>` fallback.
- `srcset` lists 4 widths (320w, 640w, 960w, 1280w) for each format.
- `loading="lazy"` and `decoding="async"` are present on the `<img>` element.
- The source file `src/assets/works/cover-fixture.jpg` does **not** appear verbatim under `dist/` — only the `_astro/*.{avif,webp,jpg}` optimized variants exist (confirmed by `tests/e2e/image-pipeline.spec.ts` passthrough guard).

The `image-pipeline.spec.ts` Playwright suite (7 cases) runs against the built preview and all cases pass.

## Alternatives

### `<Image>` from `astro:assets` (single-format)

Rejected. `<Image>` emits one output format (or the original). To get AVIF **and** WebP with a fallback `<img>`, `<Picture>` is required. Sharp can produce both formats; the component interface is the only difference. Using `<Image>` would require a manual hand-written `<picture>` wrapper — the same cost for less correctness.

### `getImage()` programmatic transform

Rejected for this use case. `getImage()` is useful for background CSS URLs or edge cases where the full `<picture>` element shape is not desired. For a standard cover `<picture>`, `<Picture>` is the higher-level, correct abstraction per Astro docs.

### Cloudflare Images runtime binding

Rejected. Requires the Cloudflare adapter, which is explicitly not installed (ADR 0004). Introducing a runtime image-transform binding would make the site dependent on a Workers execution context, violating the static-output invariant.

### Third-party Vite image plugin (e.g. `vite-imagetools`)

Rejected. Astro 6's built-in `astro:assets` pipeline handles AVIF/WebP, responsive widths, and collection-schema integration. Adding a second image-processing layer would duplicate responsibilities and add a peer-dependency chain to manage.

## Consequences

- **ADR 0010 is superseded.** Phase 3.4 work is now complete. The `cover` field is live and renders on detail pages.
- Build-time CPU increases by the Sharp transform cost (~0.5–2 s per image for a small corpus; acceptable for a static-only build that runs in CI, not on a hot path).
- `sharp` is an explicit production dependency. It is a native addon (pre-built binaries for Linux/macOS/Windows); `bun install` resolves it from the npm registry.
- `content.config.ts` uses function-form schema (`schema: ({ image }) => …`). Existing fixtures without `cover` are unaffected. New fixtures with `cover.src` pointing at a non-existent path cause a build error at `astro check` time — the intended UX.
- Detail pages ship a `<picture>` element with AVIF as the first `<source>`. Chromium-class browsers (Playwright coverage) load AVIF; Safari / Firefox fall back to WebP; legacy browsers get JPG.
- The ADR 0010 prohibition on `<img>` in **card components** is preserved. Cards still render CSS thumbs only.

## Sources

- `packages/specs/adrs/0010-cards-no-image-pipeline-yet.md` (superseded)
- `packages/site/src/components/CoverImage.astro` (implementation)
- `packages/site/tests/e2e/image-pipeline.spec.ts` (empirical verification)
- https://docs.astro.build/en/guides/images/ (verified via context7 `/withastro/docs` 2026-04-26)
- https://docs.astro.build/en/reference/modules/astro-assets/#picture- (verified via context7 2026-04-26)
- Phase 3 Task 5 commit `63228d2` (CoverImage + cover-fixture + AVIF/WebP evidence)
