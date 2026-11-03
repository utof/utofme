# 0045 — `/loops/*` Range Worker

## Context
Cloudflare Workers Static Assets answer a `Range` request with `200 OK` and the full body. Safari and iOS will not play `<video>` from such a server (WebKit bug 211323). Phase 9 ships MP4 loops under `/loops/*` (spec P9-5, decision D15). Cloudflare's documented workaround is `assets.run_worker_first` plus `env.ASSETS.fetch()`, with the Worker building the `206` itself.

## Decision
Add `packages/site/worker/index.ts`, configured as `main` in `wrangler.jsonc` with `assets.run_worker_first: ["/loops/*"]`. Only `/loops/*` invokes the Worker; every other path is served by assets as before.
- The Worker fetches the asset with a clean `GET` (no `Range` or conditional headers) and buffers it (loops are ≤ 1 MB; larger than 25 MiB streams through as a `200`).
- Range logic is pure, in `src/lib/range.ts`: single range → `206` with `Content-Range`, `Content-Length`; unsatisfiable → `416` with `Content-Range: bytes */len`; none, malformed, or `If-Range` not a strong ETag match → `200`.
- **Multi-range requests get a plain `200`** (RFC 9110 §14.2 lets a server ignore `Range`); `<video>` only sends single ranges, and multipart/byteranges is not worth the code.
- `HEAD` returns the same status and headers with no body; other methods return `405`.
- The Worker sets `Cache-Control: public, max-age=31536000, immutable` itself, because `_headers` is not applied to Worker-generated responses. Files are content-hashed.
- Types are declared locally (`Env`), so no `@cloudflare/workers-types` dependency.

## Alternatives
- **R2 + custom domain.** R2 honours `Range` natively, but adds a bucket, a second hostname, CORS/CSP changes and an upload step. Overkill for a few small loops.
- **Workers Cache API in front of assets.** Does not change the assets 200-for-Range behaviour; the Worker still has to slice.
- **Cloudflare Stream.** Handles range/adaptive delivery but costs money, re-encodes the loops and loses the hand-tuned AV1/H.264 pipeline.
- **Accept 200 and rely on Chrome/Firefox.** Breaks every Safari/iOS visitor; rejected.

## Consequences
- Every `/loops/*` request invokes the Worker. On the Free plan that counts against the 100k requests/day limit (over the limit returns an error), and each invocation has a 10 ms CPU limit. Slicing a ≤ 1 MB `ArrayBuffer` is far below that; the Worker copies the body at most once.
- With `main` set and `not_found_handling` on, non-navigation requests for unmatched paths (fetch, curl, many crawlers) also invoke the Worker and count against the quota; it delegates them to `env.ASSETS.fetch(request)` unchanged, so they still get the 404 page.
- `wrangler dev` runs the Worker locally (`bun run preview:worker`); this is the manual Safari/iOS check and is not in CI.
- A post-deploy probe in `deploy.yml` checks for a `206` but is warn-only: it never fails the deploy.
- `depcruise` only covers `src/`, so `worker/` is not dependency-checked.

## Sources
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/static-assets/headers/
- https://developers.cloudflare.com/workers/platform/limits/
- https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests
- https://bugs.webkit.org/show_bug.cgi?id=211323
- packages/specs/specs/09-project-view.md § P9-5; spec review items 20, 21
