# ADR 0012 — URL state: roll your own

## Date
2026-04-26

## Status
Accepted — Phase 2

## Context

Phase 2 adds a URL-synced filter + sort bar (`FilterBar.svelte`, `client:load`) to `/` and
`/works`. Filter state — active type chip, multi-value tag set, sort order, and search
query — must round-trip through `window.location.search` so that links are shareable and
the browser back button works correctly.

Two candidate libraries were evaluated at spec-write (2026-04-26):

- **`nuqs`** — a React-hooks-based URL state library with no Svelte port as of
  2026-04-26. Confirmed React-only at https://nuqs.47ng.com/ (no Svelte adapter listed).
- **`svelte-url`** — a Svelte URL-state helper. The GitHub repository
  (https://github.com/svelte-url/svelte-url) showed no commits in > 18 months at
  spec-write, indicating abandonment. Plan task 2 carried a re-verify instruction; no
  active maintenance was found.

A further constraint governs multi-value tag encoding: filter slugs may themselves contain
commas (e.g. a tag named `"c,cpp"` is plausible). Comma-separated encoding
(`?tag=a,b,c`) therefore cannot round-trip safely for arbitrary slug values.

The actual implementation (`packages/site/src/lib/url-state.ts`) totalled 239 lines
including TSDoc, type guards, and the `subscribe` helper — more than the ~30-line estimate
in the spec, primarily because of `exactOptionalPropertyTypes` compliance and the separate
`subscribe` event-source abstraction.

Source: `packages/specs/specs/02-interactivity.md` line 42; `packages/specs/plans/02-interactivity.md` § Task 2.

## Decision

Ship a repo-local module (`packages/site/src/lib/url-state.ts`) instead of importing any
third-party URL-state library. The module exposes four exports:

- `FilterState` — the canonical interface for filter params.
- `canonicalize(state)` → `URLSearchParams` — serialises state with defaults omitted.
- `readState(url?)` → `FilterState` — parses state from a URL (or `window.location`).
- `writeState(partial)` — merges and commits via `history.replaceState`; dispatches a
  synthetic `urlstate:change` `CustomEvent` because `replaceState` does not fire `popstate`.
- `subscribe(listener)` → unsubscribe — attaches to both `popstate` and
  `urlstate:change`.

**Multi-value tag encoding: repeated key** (`?tag=a&tag=b`). `URLSearchParams.getAll("tag")`
is the canonical browser API for this pattern; it handles arbitrary slug values including
commas without ambiguity.

## Alternatives

| Option | Status | Reason |
|---|---|---|
| `nuqs` | Rejected | React-only; no Svelte adapter exists as of 2026-04-26. |
| `svelte-url` | Rejected | No commits in > 18 months at spec-write; effectively abandoned. |
| Comma-separated tag encoding (`?tag=a,b,c`) | Rejected | Slugs may contain commas; round-trip breaks for such values. `URLSearchParams.getAll` is the browser-standard path. |

## Consequences

- Zero supply-chain surface for URL state: no new npm dependency.
- `url-state.ts` is the single source of truth for encoding rules; `FilterBar.svelte`,
  the inline filter script, and any future consumer all import from this one module.
- `canonicalize` is the only place tags are sorted alphabetically, preventing the
  "caller forgets to sort tags" class of Stryker mutation survivors.
- `writeState` uses `replaceState` (not `pushState`) so filter changes do not pollute
  the browser back-stack — back-button returns to the prior *page*, not a prior filter
  combination.
- The module is fully unit-testable without DOM setup: `readState` accepts a plain URL
  string; `writeState` detects `window === undefined` and throws with a clear error
  rather than a silent no-op.
- Stryker mutation testing targets `url-state.ts` (along with `filter.ts`, `keymap.ts`,
  and the content-collection schema) per the Phase 2 spec.

## Sources

- https://nuqs.47ng.com/ (no Svelte adapter; fetched 2026-04-26)
- https://github.com/svelte-url/svelte-url (last-commit age checked 2026-04-26)
- https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/getAll (repeated-key canonical API)
- `packages/specs/specs/02-interactivity.md` lines 42–43 (no URL-state lib; repeated-key encoding)
- `packages/specs/plans/02-interactivity.md` § Task 2 + OQ#8 resolution
- `packages/specs/plans/02-interactivity.md` line 43 (general-plan lines 269–283 referenced)
